// Skill graph: normalize free-text skills from resumes & jobs into canonical
// entities (public.skills) with aliases and weighted relationships
// (public.skill_edges). Stores user-scoped extractions in public.user_skills
// and public.job_skills with confidence + evidence.

import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
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

type ExtractMode = "resume" | "job";

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

async function callExtractor(
  text: string,
  mode: ExtractMode,
  hint?: string,
): Promise<SkillExtraction> {
  const gateway = getGateway();
  try {
    const { text: raw } = await generateText({
      model: gateway(MODELS.fast),
      system: EXTRACT_SYSTEM,
      prompt: `Source type: ${mode === "resume" ? "RESUME" : "JOB DESCRIPTION"}${
        hint ? `\nContext: ${hint}` : ""
      }\n\nText:\n---\n${text.slice(0, 40_000)}\n---\n\nReturn JSON only.`,
    });
    const parsed = skillExtractionSchema.safeParse(safeParseJson(raw));
    if (parsed.success) return parsed.data;
  } catch {
    // local LLM offline / unreachable — fall through to empty result
  }
  return { skills: [] };
}

// Resolve a free-text skill name to a canonical skill id.
// Strategy: (1) DB resolve_skill RPC (exact slug → alias → trigram fuzzy),
//           (2) if no match, create a new canonical skill via service-role.
async function resolveOrCreateSkill(
  rawName: string,
  kind: string,
  category: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: { supabase: any },
): Promise<{ id: string; created: boolean } | null> {
  const name = rawName.trim();
  if (!name) return null;

  const { data: matches } = await context.supabase.rpc("resolve_skill", { _input: name });
  const list = (matches as Array<{ skill_id: string; similarity: number }> | null) ?? [];
  const best = list[0];
  if (best && best.similarity >= 0.6) {
    return { id: best.skill_id, created: false };
  }

  // Need to create — RLS blocks anonymous writes, use the admin client.
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
    .insert({
      slug,
      name,
      kind: kind as never,
      category: category || null,
    })
    .select("id")
    .single();
  if (error || !row) return null;

  // Also record the original spelling as an alias if it differs from canonical name.
  const normalized = name.toLowerCase().trim();
  if (normalized !== slug) {
    await supabaseAdmin
      .from("skill_aliases")
      .insert({ skill_id: row.id, alias: name, alias_normalized: normalized })
      .then(() => undefined, () => undefined);
  }
  return { id: row.id, created: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public server functions
// ─────────────────────────────────────────────────────────────────────────────

export const listCanonicalSkills = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ query: z.string().trim().max(120).optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("skills")
      .select("id, slug, name, kind, category")
      .order("name", { ascending: true })
      .limit(200);
    if (data.query) q = q.ilike("name", `%${data.query}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// Manual re-extraction triggers — enqueue jobs onto the durable queue.
// The worker picks them up; the UI polls listSkillExtractionJobs for status.

export const extractResumeSkills = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ resume_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: resume, error } = await context.supabase
      .from("resumes")
      .select("id")
      .eq("id", data.resume_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!resume) throw new Error("Resume not found");

    const { enqueueSkillExtraction } = await import("@/lib/skill-jobs.server");
    await enqueueSkillExtraction({
      userId: context.userId,
      kind: "resume",
      targetId: resume.id,
      supabase: context.supabase,
    });
    return { queued: true as const, target_id: resume.id };
  });

export const extractJobSkills = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ job_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: job, error } = await context.supabase
      .from("jobs")
      .select("id")
      .eq("id", data.job_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!job) throw new Error("Job not found");

    const { enqueueSkillExtraction } = await import("@/lib/skill-jobs.server");
    await enqueueSkillExtraction({
      userId: context.userId,
      kind: "job",
      targetId: job.id,
      supabase: context.supabase,
    });
    return { queued: true as const, target_id: job.id };
  });

export const listSkillExtractionJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Trigger worker synchronously to clear out any pending jobs for local dev environments
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const { data: pending } = await context.supabase
          .from("skill_extraction_jobs")
          .select("*")
          .eq("status", "pending")
          .limit(3);
          
        if (pending && pending.length > 0) {
          const skills = await import("@/lib/skills.server");
          for (const job of pending) {
            await context.supabase
              .from("skill_extraction_jobs")
              .update({ status: "processing", started_at: new Date().toISOString() })
              .eq("id", job.id);
              
            try {
              let count = 0;
              if (job.kind === "resume") {
                const { data: r } = await context.supabase
                  .from("resumes")
                  .select("id, title, content")
                  .eq("id", job.target_id)
                  .maybeSingle();
                if (r) {
                  count = await skills.extractAndStoreResumeSkills({
                    resumeId: r.id,
                    userId: context.userId,
                    title: r.title,
                    content: r.content,
                    supabase: context.supabase,
                  });
                }
              } else {
                const { data: j } = await context.supabase
                  .from("jobs")
                  .select("id, title, company, description, parsed")
                  .eq("id", job.target_id)
                  .maybeSingle();
                if (j) {
                  count = await skills.extractAndStoreJobSkills({
                    jobId: j.id,
                    userId: context.userId,
                    title: j.title,
                    company: j.company,
                    description: j.description ?? "",
                    parsed: j.parsed,
                    supabase: context.supabase,
                  });
                }
              }
              await context.supabase
                .from("skill_extraction_jobs")
                .update({
                  status: "done",
                  completed_at: new Date().toISOString(),
                  result: { count },
                  last_error: null,
                })
                .eq("id", job.id);
            } catch (err: any) {
              await context.supabase
                .from("skill_extraction_jobs")
                .update({
                  status: "failed",
                  completed_at: new Date().toISOString(),
                  last_error: err?.message || String(err),
                })
                .eq("id", job.id);
            }
          }
        }
      } catch (err) {
        console.error("Local worker GET poll run failed:", err);
      }
    } else {
      try {
        const { runSkillExtractionWorker } = await import("@/lib/skill-jobs.server");
        const res = await runSkillExtractionWorker({ limit: 5 });
        console.log("[Skill Worker] Synchronous run complete:", res);
      } catch (err) {
        console.error("[Skill Worker] Synchronous run error:", err);
      }
    }

    const { data, error } = await context.supabase
      .from("skill_extraction_jobs")
      .select("id, kind, target_id, status, attempts, max_attempts, scheduled_at, started_at, completed_at, last_error, result, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });



export const getUserSkillGraph = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: rows, error } = await context.supabase
      .from("user_skills")
      .select(
        "id, skill_id, proficiency, years_experience, confidence, evidence, source, skill:skills(id, slug, name, kind, category)",
      )
      .eq("user_id", context.userId)
      .order("confidence", { ascending: false });
    if (error) throw new Error(error.message);

    const skillIds = (rows ?? []).map((r) => r.skill_id);
    let edges: Array<{ from_skill: string; to_skill: string; edge_type: string; weight: number }> = [];
    if (skillIds.length) {
      const { data: edgeRows } = await context.supabase
        .from("skill_edges")
        .select("from_skill, to_skill, edge_type, weight")
        .or(
          `from_skill.in.(${skillIds.join(",")}),to_skill.in.(${skillIds.join(",")})`,
        );
      edges = edgeRows ?? [];
    }

    return { nodes: rows ?? [], edges };
  });

export const getSkillGap = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ job_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // Validate job ownership (RLS will also block, but explicit error is nicer).
    const { data: job, error: jErr } = await context.supabase
      .from("jobs")
      .select("id, title, company")
      .eq("id", data.job_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (jErr) throw new Error(jErr.message);
    if (!job) throw new Error("Job not found");

    const { data: jobSkillRows, error: jsErr } = await context.supabase
      .from("job_skills")
      .select("skill_id, importance, confidence, evidence, skill:skills(id, slug, name, kind, category)")
      .eq("job_id", data.job_id);
    if (jsErr) throw new Error(jsErr.message);

    const { data: userSkillRows, error: usErr } = await context.supabase
      .from("user_skills")
      .select("skill_id, proficiency, confidence")
      .eq("user_id", context.userId);
    if (usErr) throw new Error(usErr.message);

    const userSet = new Set((userSkillRows ?? []).map((r) => r.skill_id));
    const have: typeof jobSkillRows = [];
    const missing: typeof jobSkillRows = [];
    for (const row of jobSkillRows ?? []) {
      (userSet.has(row.skill_id) ? have : missing).push(row);
    }

    // Score: weighted by importance (core=1, required=0.8, preferred=0.5, nice=0.2)
    const weights: Record<string, number> = {
      core: 1,
      required: 0.8,
      preferred: 0.5,
      nice_to_have: 0.2,
    };
    let total = 0;
    let earned = 0;
    for (const row of jobSkillRows ?? []) {
      const w = weights[row.importance as string] ?? 0.5;
      total += w;
      if (userSet.has(row.skill_id)) earned += w;
    }
    const coverage = total > 0 ? Math.round((earned / total) * 100) : 0;

    // Bridging suggestions: for each missing skill, find related/prereq skills the user has.
    const missingIds = missing.map((m) => m.skill_id);
    let bridges: Array<{
      missing_skill_id: string;
      via_skill_id: string;
      edge_type: string;
      weight: number;
    }> = [];
    if (missingIds.length && userSet.size) {
      const userIds = Array.from(userSet);
      const { data: edgeRows } = await context.supabase
        .from("skill_edges")
        .select("from_skill, to_skill, edge_type, weight")
        .in("to_skill", missingIds)
        .in("from_skill", userIds);
      bridges = (edgeRows ?? []).map((e) => ({
        missing_skill_id: e.to_skill,
        via_skill_id: e.from_skill,
        edge_type: e.edge_type,
        weight: e.weight,
      }));
    }

    return {
      job: { id: job.id, title: job.title, company: job.company },
      coverage,
      have,
      missing,
      bridges,
    };
  });
