// Server-only skill extraction helpers. Loaded via dynamic import from
// resume/job server functions so the auto-extraction logic lives in one
// place and never ships to the client bundle.

import { generateText } from "ai";
import { getGateway, MODELS } from "@/lib/ai/gateway.server";
import { skillExtractionSchema, type SkillExtraction } from "@/lib/ai/schemas";

const EXTRACT_SYSTEM = `You are a skills-extraction engine for a career platform.
Given resume or job-description text, list the distinct professional skills it mentions.

Rules:
- Use the canonical, widely-recognized name (e.g. "JavaScript" not "Java Script", "PostgreSQL" not "Postgres DB", "Kubernetes" not "k8s").
- One entry per skill. Do NOT split a single concept ("React") into two ("ReactJS", "React.js").
- "kind": one of hard, soft, tool, language, framework, domain, certification.
- "category": short bucket like "frontend", "backend", "data", "devops", "cloud", "ai", "interpersonal".
- "importance" (jobs only): nice_to_have | preferred | required | core. For resumes always use "preferred".
- "proficiency" (resumes only): beginner | intermediate | advanced | expert, else null.
- "years_experience": number if clearly stated, else null.
- "confidence": 0..1 — how sure you are this skill is genuinely demonstrated/required.
- "evidence": one short quote (<= 200 chars) from the source supporting this skill.
- Return ONLY a JSON object: { "skills": [...] }. No prose, no markdown fences.`;

type Mode = "resume" | "job";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

function safeParseJson(text: string): unknown {
  const stripped = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1) return {};
  try {
    return JSON.parse(stripped.slice(start, end + 1));
  } catch {
    return {};
  }
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function callExtractor(text: string, mode: Mode, hint?: string): Promise<SkillExtraction> {
  try {
    const gateway = getGateway();
    const { text: raw } = await generateText({
      model: gateway(MODELS.fast),
      system: EXTRACT_SYSTEM,
      prompt: `Source type: ${mode === "resume" ? "RESUME" : "JOB DESCRIPTION"}${
        hint ? `\nContext: ${hint}` : ""
      }\n\nText:\n---\n${text.slice(0, 40_000)}\n---\n\nReturn JSON only.`,
    });
    const parsedJson = safeParseJson(raw);
    const normalized = normalizeSkillExtraction(parsedJson);
    const parsed = skillExtractionSchema.safeParse(normalized);
    if (parsed.success) return parsed.data;
    else console.error("[Skills Extractor] Zod safeParse failed. Raw:", raw, "Error:", parsed.error);
  } catch (e) {
    console.error("[Skills Extractor] Failed to run/parse:", e);
  }
  return { skills: [] };
}

async function resolveOrCreateSkill(
  rawName: string,
  kind: string,
  category: string,
  supabase: SupabaseLike,
): Promise<string | null> {
  const name = rawName.trim();
  if (!name) return null;

  const { data: matches } = await supabase.rpc("resolve_skill", { _input: name });
  const list = (matches as Array<{ skill_id: string; similarity: number }> | null) ?? [];
  const best = list[0];
  if (best && best.similarity >= 0.6) return best.skill_id;

  // Local fallback: if service role key is missing, try inserting with user client or skip creation
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const baseSlug = slugify(name) || `skill-${Math.random().toString(36).slice(2, 8)}`;
      const { data: row, error } = await supabase
        .from("skills")
        .insert({ slug: baseSlug, name, kind: kind as never, category: category || null })
        .select("id")
        .maybeSingle();
      if (!error && row) return row.id;
    } catch {
      // ignore insert failure
    }
    return null;
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const baseSlug = slugify(name) || `skill-${Math.random().toString(36).slice(2, 8)}`;
  let slug = baseSlug;
  for (let i = 2; i < 10; i++) {
    const { data: existing } = await supabaseAdmin
      .from("skills")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!existing) break;
    slug = `${baseSlug}-${i}`;
  }
  const { data: row, error } = await supabaseAdmin
    .from("skills")
    .insert({ slug, name, kind: kind as never, category: category || null })
    .select("id")
    .single();
  if (error || !row) return null;

  const normalized = name.toLowerCase().trim();
  if (normalized !== slug) {
    await supabaseAdmin
      .from("skill_aliases")
      .insert({ skill_id: row.id, alias: name, alias_normalized: normalized })
      .then(() => undefined, () => undefined);
  }
  return row.id;
}

export async function extractAndStoreResumeSkills(args: {
  resumeId: string;
  userId: string;
  title: string;
  content: unknown;
  supabase: SupabaseLike;
}): Promise<number> {
  const blob = JSON.stringify(args.content ?? {}, null, 0).slice(0, 40_000);
  if (blob.length < 30) return 0;
  const extraction = await callExtractor(blob, "resume", `Resume titled "${args.title}"`);

  let count = 0;
  for (const s of extraction.skills) {
    const skillId = await resolveOrCreateSkill(s.name, s.kind, s.category, args.supabase);
    if (!skillId) continue;
    const { error } = await args.supabase.from("user_skills").upsert(
      {
        user_id: args.userId,
        skill_id: skillId,
        resume_id: args.resumeId,
        proficiency: s.proficiency,
        years_experience: s.years_experience,
        confidence: s.confidence,
        evidence: s.evidence || null,
        source: "resume",
      },
      { onConflict: "user_id,skill_id" },
    );
    if (!error) count += 1;
  }

  if (count > 0) {
    await args.supabase.from("activity_events").insert({
      user_id: args.userId,
      type: "skills.extracted",
      payload: { resume_id: args.resumeId, count, auto: true },
    });
  }
  return count;
}

export async function extractAndStoreJobSkills(args: {
  jobId: string;
  userId: string;
  title: string;
  company: string;
  description: string;
  parsed?: unknown;
  supabase: SupabaseLike;
}): Promise<number> {
  const blob = [
    `Title: ${args.title}`,
    `Company: ${args.company}`,
    "",
    args.description ?? "",
    "",
    args.parsed ? `Parsed:\n${JSON.stringify(args.parsed)}` : "",
  ].join("\n");
  if (blob.trim().length < 30) return 0;

  const extraction = await callExtractor(blob, "job", `${args.title} @ ${args.company}`);

  let count = 0;
  for (const s of extraction.skills) {
    const skillId = await resolveOrCreateSkill(s.name, s.kind, s.category, args.supabase);
    if (!skillId) continue;
    const { error } = await args.supabase.from("job_skills").upsert(
      {
        job_id: args.jobId,
        skill_id: skillId,
        importance: s.importance,
        confidence: s.confidence,
        evidence: s.evidence || null,
      },
      { onConflict: "job_id,skill_id" },
    );
    if (!error) count += 1;
  }
  return count;
}

function normalizeSkillExtraction(raw: any): any {
  if (!raw || typeof raw !== "object") return { skills: [] };
  
  let list = Array.isArray(raw.skills) ? raw.skills : [];
  if (!list.length && Array.isArray(raw)) {
    list = raw;
  }
  
  const skills = list.map((item: any) => {
    if (!item || typeof item !== "object") return null;
    
    const name = item.name || item.skill || item.title || "";
    if (!name) return null;
    
    let kind = item.kind || item.type || "hard";
    const allowedKinds = ["hard", "soft", "tool", "language", "framework", "domain", "certification"];
    if (!allowedKinds.includes(kind)) {
      kind = "hard";
    }
    
    const category = item.category || item.group || "";
    
    let importance = item.importance || item.priority || "preferred";
    const allowedImportances = ["nice_to_have", "preferred", "required", "core"];
    if (!allowedImportances.includes(importance)) {
      importance = "preferred";
    }
    
    let proficiency = item.proficiency || item.level || null;
    const allowedProficiencies = ["beginner", "intermediate", "advanced", "expert"];
    if (proficiency && !allowedProficiencies.includes(proficiency)) {
      proficiency = null;
    }
    
    let years_experience = item.years_experience !== undefined ? item.years_experience :
                           item.years !== undefined ? item.years : null;
    if (typeof years_experience === "string") {
      years_experience = parseFloat(years_experience);
    }
    if (typeof years_experience !== "number" || isNaN(years_experience)) {
      years_experience = null;
    }
    
    const confidence = typeof item.confidence === "number" ? item.confidence : 0.6;
    const evidence = item.evidence || item.quote || "";
    
    return {
      name,
      kind,
      category,
      importance,
      proficiency,
      years_experience,
      confidence,
      evidence,
    };
  }).filter(Boolean);
  
  return { skills };
}
