import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getGateway, MODELS } from "@/lib/ai/gateway.server";
import { recommendationsSchema } from "@/lib/ai/schemas";

const SYSTEM = `You are a proactive career coach inside CareerOS. Given a snapshot of the user's profile, resumes, saved jobs, recent activity, and ATS scores, produce up to 5 high-leverage next actions.
Each recommendation must:
- Be specific and personalized (reference actual resume titles, companies, scores when relevant).
- Have a clear single next action (a button the user can click).
- Avoid generic "build a great resume" advice.
- score (0–100): higher = more urgent / higher leverage.
Allowed kinds: improve_resume, tailor_resume, add_job, interview_prep, learn_skill, complete_profile.
action_path examples: "/dashboard", "/resumes", "/resumes/<id>", "/jobs", "/jobs/<id>", "/skills", "/settings".
Return ONLY JSON: { recommendations: [...] }`;

export const generateRecommendations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = context.userId;
    const [{ data: profile }, { data: resumes }, { data: jobs }, { data: ats }, { data: events }] =
      await Promise.all([
        context.supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
        context.supabase
          .from("resumes")
          .select("id, title, source, updated_at")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false })
          .limit(10),
        context.supabase
          .from("jobs")
          .select("id, title, company, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(10),
        context.supabase
          .from("ats_reports")
          .select("id, overall_score, created_at, resume_id, job_id")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(10),
        context.supabase
          .from("activity_events")
          .select("type, payload, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(25),
      ]);

    const snapshot = {
      profile: profile
        ? {
            display_name: profile.display_name,
            headline: profile.headline,
            target_roles: profile.target_roles,
            target_locations: profile.target_locations,
            seniority: profile.seniority,
            onboarded: !!profile.onboarded_at,
          }
        : null,
      resumes_count: resumes?.length ?? 0,
      resumes: resumes ?? [],
      jobs_count: jobs?.length ?? 0,
      jobs: jobs ?? [],
      recent_ats: ats ?? [],
      recent_activity: events ?? [],
    };

    const gateway = getGateway();
    const { text } = await generateText({
      model: gateway(MODELS.fast),
      system: SYSTEM,
      prompt: `User snapshot (JSON):\n${JSON.stringify(snapshot, null, 2)}\n\nReturn JSON only.`,
    });
    const parsed = safeParseJson(text);
    const normalized = normalizeRecommendations(parsed);
    const safe = recommendationsSchema.safeParse(normalized);
    if (!safe.success) {
      console.error("[Copilot Recs] Validation failed. Raw text:", text, "Error:", safe.error);
      throw new Error("Recommendations format unexpected. Please retry.");
    }

    // Replace previous active recommendations.
    await context.supabase
      .from("recommendations")
      .delete()
      .eq("user_id", userId)
      .is("dismissed_at", null);

    if (safe.data.recommendations.length) {
      const rows = safe.data.recommendations.map((r) => ({
        user_id: userId,
        kind: r.kind,
        title: r.title,
        body: r.body,
        score: r.score,
        action: { label: r.action_label, path: r.action_path } as any,
      }));
      const { error } = await context.supabase.from("recommendations").insert(rows);
      if (error) throw new Error(error.message);
    }

    return { count: safe.data.recommendations.length };
  });

export const listRecommendations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("recommendations")
      .select("*")
      .eq("user_id", context.userId)
      .is("dismissed_at", null)
      .order("score", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const dismissRecommendation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("recommendations")
      .update({ dismissed_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const dashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = context.userId;
    const [{ count: resumeCount }, { count: jobCount }, { data: lastAts }, { data: recentActivity }] =
      await Promise.all([
        context.supabase
          .from("resumes")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId),
        context.supabase
          .from("jobs")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId),
        context.supabase
          .from("ats_reports")
          .select("overall_score, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(10),
        context.supabase
          .from("activity_events")
          .select("type, payload, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(15),
      ]);

    const avgAts =
      lastAts && lastAts.length
        ? Math.round(lastAts.reduce((s, r) => s + (r.overall_score ?? 0), 0) / lastAts.length)
        : null;

    return {
      resumeCount: resumeCount ?? 0,
      jobCount: jobCount ?? 0,
      avgAts,
      atsTrend: (lastAts ?? []).reverse(),
      recentActivity: recentActivity ?? [],
    };
  });

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

function normalizeRecommendations(raw: any): any {
  if (!raw || typeof raw !== "object") return { recommendations: [] };
  
  let list = Array.isArray(raw.recommendations) ? raw.recommendations : [];
  if (!list.length && Array.isArray(raw)) {
    list = raw;
  }
  
  const recommendations = list.map((item: any) => {
    if (!item || typeof item !== "object") return null;

    const kind = item.kind || item.action || "improve_resume";
    const body = item.body || item.description || "";
    // Generate human-friendly title from the kind if missing
    const title = item.title || (typeof kind === "string" ? kind.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "New Insight");
    const score = typeof item.score === "number" ? item.score : 50;
    const action_label = item.action_label || item.label || "Open";
    const action_path = item.action_path || item.path || "/dashboard";
    
    return {
      kind,
      title,
      body,
      score,
      action_label,
      action_path,
    };
  }).filter(Boolean);
  
  return { recommendations };
}
