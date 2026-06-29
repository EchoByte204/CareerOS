// Learning recommendations: for a user's missing skills (optionally scoped to a
// target job), generate a ranked list of courses/projects/resources via the
// local LLM and persist them in public.learning_recommendations.

import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getGateway, MODELS } from "@/lib/ai/gateway.server";
import { learningRecommendationsSchema } from "@/lib/ai/schemas";

const SYSTEM = `You are a career-learning curator for a job-seeker platform.
Given a list of MISSING skills (skills the user does NOT yet have but a target
role wants), produce a concise, ranked, deduplicated learning plan.

Rules:
- For each missing skill, suggest 1-3 highly regarded resources. Mix formats: courses, hands-on projects, books, official docs, free tutorials.
- Prefer well-known, currently-available resources (e.g. official docs, freeCodeCamp, Coursera/Stanford/MIT, Frontend Masters, "Designing Data-Intensive Applications", classic Udemy bestsellers, etc.). If you are unsure a specific URL exists, leave url blank — never fabricate URLs.
- "resource_type": one of course | project | book | article | video | tutorial | certification | other.
- "level": beginner | intermediate | advanced — match the user's apparent gap.
- "duration": rough commitment ("6 hrs", "4 weeks", "2-3 weekends").
- "cost": "Free", "Paid", or a rough price ("$49"). Never invent exact prices.
- "rationale": one sentence on WHY this resource for THIS skill in THIS user's context.
- "score": 0-100, higher = more impactful for closing the gap (importance × resource quality × fit).
- Order recommendations by score descending across the whole list.
- Return ONLY a JSON object: { "recommendations": [...] }. No prose, no markdown fences.`;

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

function normalizeLearningRecommendations(raw: any): any {
  if (!raw || typeof raw !== "object") return { recommendations: [] };
  
  let list = Array.isArray(raw.recommendations) ? raw.recommendations : [];
  if (!list.length && Array.isArray(raw)) {
    list = raw;
  }
  
  const recommendations = list.map((item: any) => {
    if (!item || typeof item !== "object") return null;

    const skill = item.skill || item.name || item.skill_name || "Skill";
    
    let resource_type = item.resource_type || item.type || "course";
    const allowedTypes = ["course", "project", "book", "article", "video", "tutorial", "certification", "other"];
    if (!allowedTypes.includes(resource_type)) {
      resource_type = "course";
    }
    
    const title = item.title || "Recommended Resource";
    const provider = item.provider || item.school || item.platform || "";
    const url = item.url || item.link || "";
    const description = item.description || item.summary || "";
    
    let level = item.level || "intermediate";
    const allowedLevels = ["beginner", "intermediate", "advanced"];
    if (!allowedLevels.includes(level)) {
      level = "intermediate";
    }
    
    const duration = item.duration || item.time || "";
    const cost = item.cost || item.price || "";
    const rationale = item.rationale || item.why || "";
    const score = typeof item.score === "number" ? item.score : 60;
    
    return {
      skill,
      resource_type,
      title,
      provider,
      url,
      description,
      level,
      duration,
      cost,
      rationale,
      score,
    };
  }).filter(Boolean);
  
  return { recommendations };
}

type MissingSkillRow = {
  skill_id: string;
  importance: string;
  skill: { id: string; name: string; kind: string; category: string | null } | null;
};

export const generateLearningRecommendations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        job_id: z.string().uuid().optional(),
        replace: z.boolean().default(true),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1) Determine missing skills.
    const { data: userSkillRows, error: usErr } = await supabase
      .from("user_skills")
      .select("skill_id")
      .eq("user_id", userId);
    if (usErr) throw new Error(usErr.message);
    const userSet = new Set((userSkillRows ?? []).map((r: { skill_id: string }) => r.skill_id));

    let missing: MissingSkillRow[] = [];
    let jobTitle = "";
    let jobCompany = "";

    if (data.job_id) {
      const { data: job, error: jErr } = await supabase
        .from("jobs")
        .select("id, title, company")
        .eq("id", data.job_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (jErr) throw new Error(jErr.message);
      if (!job) throw new Error("Job not found");
      jobTitle = job.title ?? "";
      jobCompany = job.company ?? "";

      const { data: js, error: jsErr } = await supabase
        .from("job_skills")
        .select("skill_id, importance, skill:skills(id, name, kind, category)")
        .eq("job_id", data.job_id);
      if (jsErr) throw new Error(jsErr.message);
      missing = ((js as MissingSkillRow[] | null) ?? []).filter(
        (r) => !userSet.has(r.skill_id),
      );
    } else {
      // Aggregate across all of the user's jobs — rank by frequency × importance weight.
      const { data: js, error: jsErr } = await supabase
        .from("job_skills")
        .select(
          "skill_id, importance, job:jobs!inner(user_id), skill:skills(id, name, kind, category)",
        )
        .eq("job.user_id", userId);
      if (jsErr) throw new Error(jsErr.message);

      const weights: Record<string, number> = {
        core: 1,
        required: 0.8,
        preferred: 0.5,
        nice_to_have: 0.2,
      };
      const agg = new Map<string, { row: MissingSkillRow; score: number }>();
      for (const r of (js as Array<MissingSkillRow & { job: unknown }> | null) ?? []) {
        if (userSet.has(r.skill_id)) continue;
        const w = weights[r.importance] ?? 0.5;
        const ex = agg.get(r.skill_id);
        if (ex) ex.score += w;
        else agg.set(r.skill_id, { row: r, score: w });
      }
      missing = Array.from(agg.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, 12)
        .map((x) => x.row);
    }

    if (missing.length === 0) {
      return { generated: 0, skipped: true as const, reason: "No missing skills detected." };
    }

    // 2) Build LLM prompt.
    const skillLines = missing
      .map(
        (m) =>
          `- ${m.skill?.name ?? "(unknown)"} [${m.skill?.kind ?? "hard"}${
            m.skill?.category ? `/${m.skill.category}` : ""
          }] importance=${m.importance}`,
      )
      .join("\n");

    const prompt = `Target role: ${jobTitle ? `${jobTitle}${jobCompany ? ` at ${jobCompany}` : ""}` : "general career goals across the user's saved jobs"}

Missing skills:
${skillLines}

Produce a learning plan as JSON with key "recommendations". Aim for 2-3 items per skill, ordered by overall impact.`;

    const gateway = getGateway();
    let parsed: z.infer<typeof learningRecommendationsSchema> = { recommendations: [] };
    try {
      const { text: raw } = await generateText({
        model: gateway(MODELS.smart),
        system: SYSTEM,
        prompt,
      });
      const parsedJson = safeParseJson(raw);
      const normalized = normalizeLearningRecommendations(parsedJson);
      const safe = learningRecommendationsSchema.safeParse(normalized);
      if (safe.success) {
        parsed = safe.data;
      } else {
        console.error("[Learning Recs] Validation failed. Raw text:", raw, "Error:", safe.error);
      }
    } catch (e) {
      throw new Error(
        `Local LLM call failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    if (parsed.recommendations.length === 0) {
      return { generated: 0, skipped: true as const, reason: "Model returned no recommendations." };
    }

    // 3) Resolve each rec's skill name back to a canonical skill_id via the
    //    missing-skills set first (fast), then fall back to resolve_skill RPC.
    const byName = new Map<string, string>();
    for (const m of missing) {
      if (m.skill?.name) byName.set(m.skill.name.toLowerCase(), m.skill_id);
    }
    const rows: Array<{
      user_id: string;
      skill_id: string | null;
      job_id: string | null;
      resource_type: "course" | "project" | "book" | "article" | "video" | "tutorial" | "certification" | "other";
      title: string;
      provider: string | null;
      url: string | null;
      description: string | null;
      level: string | null;
      duration: string | null;
      cost: string | null;
      rationale: string | null;
      score: number;
      status: "suggested";
    }> = [];
    for (const rec of parsed.recommendations) {
      let skillId: string | null = byName.get(rec.skill.toLowerCase()) ?? null;
      if (!skillId) {
        const { data: match } = await supabase.rpc("resolve_skill", { _input: rec.skill });
        const list = (match as Array<{ skill_id: string; similarity: number }> | null) ?? [];
        if (list[0] && list[0].similarity >= 0.6) skillId = list[0].skill_id;
      }
      rows.push({
        user_id: userId,
        skill_id: skillId,
        job_id: data.job_id ?? null,
        resource_type: rec.resource_type,
        title: rec.title,
        provider: rec.provider || null,
        url: rec.url || null,
        description: rec.description || null,
        level: rec.level,
        duration: rec.duration || null,
        cost: rec.cost || null,
        rationale: rec.rationale || null,
        score: rec.score,
        status: "suggested",
      });
    }

    // 4) Optionally clear previous suggestions for this scope.
    if (data.replace) {
      let del = supabase
        .from("learning_recommendations")
        .delete()
        .eq("user_id", userId)
        .eq("status", "suggested");
      del = data.job_id ? del.eq("job_id", data.job_id) : del.is("job_id", null);
      await del;
    }

    const { error: insErr } = await supabase.from("learning_recommendations").insert(rows);
    if (insErr) throw new Error(insErr.message);

    return { generated: rows.length, skipped: false as const };
  });

export const listLearningRecommendations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        job_id: z.string().uuid().optional(),
        status: z
          .enum(["suggested", "saved", "in_progress", "completed", "dismissed"])
          .optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("learning_recommendations")
      .select(
        "id, skill_id, job_id, resource_type, title, provider, url, description, level, duration, cost, rationale, score, status, created_at, skill:skills(id, name, kind, category)",
      )
      .eq("user_id", context.userId)
      .order("score", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.job_id) q = q.eq("job_id", data.job_id);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const updateLearningRecommendation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["suggested", "saved", "in_progress", "completed", "dismissed"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("learning_recommendations")
      .update({ status: data.status })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const deleteLearningRecommendation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("learning_recommendations")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
