import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getGateway, MODELS } from "@/lib/ai/gateway.server";
import { jobParsedSchema } from "@/lib/ai/schemas";

export const listJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("jobs")
      .select("id, title, company, location, source, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getJob = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("jobs")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Job not found");
    return row;
  });

const SYSTEM = `Extract structured fields from a job description.
Return ONLY a JSON object with keys:
- required_skills (string[]): hard requirements explicitly stated
- preferred_skills (string[]): nice-to-haves
- responsibilities (string[]): main duties (short bullets, max 8)
- keywords (string[]): ATS keywords/phrases recruiters would search for (10–20 items)
- seniority (string): one of intern, entry, mid, senior, staff, principal, exec
- summary (string): 1–2 sentence plain-English description of the role`;

export const createJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        title: z.string().trim().min(1).max(200),
        company: z.string().trim().min(1).max(200),
        location: z.string().trim().max(200).optional(),
        url: z.string().trim().max(500).optional(),
        description: z.string().trim().min(50).max(40_000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const gateway = getGateway();
    const { text } = await generateText({
      model: gateway(MODELS.fast),
      system: SYSTEM,
      prompt: `Job title: ${data.title}\nCompany: ${data.company}\n\nDescription:\n${data.description}\n\nReturn JSON only.`,
    });
    const parsed = safeParseJson(text);
    const normalized = normalizeJobParsed(parsed);
    const safe = jobParsedSchema.safeParse(normalized);
    const parsedJson = safe.success ? safe.data : null;

    const { data: row, error } = await context.supabase
      .from("jobs")
      .insert({
        user_id: context.userId,
        title: data.title,
        company: data.company,
        location: data.location ?? null,
        url: data.url ?? null,
        description: data.description,
        source: "paste",
        parsed: (parsedJson ?? {}) as any,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    await context.supabase.from("activity_events").insert({
      user_id: context.userId,
      type: "job.saved",
      payload: { job_id: row.id, company: row.company, title: row.title },
    });

    try {
      const { enqueueSkillExtraction } = await import("@/lib/skill-jobs.server");
      await enqueueSkillExtraction({
        userId: context.userId,
        kind: "job",
        targetId: row.id,
        supabase: context.supabase,
      });
    } catch {
      // queueing must never block the job save
    }

    return row;
  });

export const deleteJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("jobs")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
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

export function normalizeJobParsed(raw: any): any {
  if (!raw || typeof raw !== "object") return {};
  
  const required_skills = Array.isArray(raw.required_skills) ? raw.required_skills : 
                          Array.isArray(raw.requiredSkills) ? raw.requiredSkills : 
                          Array.isArray(raw.skills) ? raw.skills : [];
                          
  const preferred_skills = Array.isArray(raw.preferred_skills) ? raw.preferred_skills : 
                           Array.isArray(raw.preferredSkills) ? raw.preferredSkills : 
                           Array.isArray(raw.nice_to_have) ? raw.nice_to_have : [];
                           
  const responsibilities = Array.isArray(raw.responsibilities) ? raw.responsibilities : 
                           Array.isArray(raw.responsibility) ? raw.responsibility : 
                           Array.isArray(raw.duties) ? raw.duties : [];
                           
  const keywords = Array.isArray(raw.keywords) ? raw.keywords : 
                   Array.isArray(raw.keyword) ? raw.keyword : 
                   Array.isArray(raw.ats_keywords) ? raw.ats_keywords : [];
                   
  const seniority = String(raw.seniority || raw.level || raw.experience_level || "");
  const summary = String(raw.summary || raw.description || raw.role_summary || "");
  
  return {
    required_skills,
    preferred_skills,
    responsibilities,
    keywords,
    seniority,
    summary,
  };
}
