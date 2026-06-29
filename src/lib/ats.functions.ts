import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getGateway, MODELS } from "@/lib/ai/gateway.server";
import { atsReportSchema, resumeContentSchema } from "@/lib/ai/schemas";

const SYSTEM = `You are a senior tech recruiter and ATS expert. Given a candidate's structured resume and a job description, produce a rigorous ATS-style analysis as JSON.
Scoring rubric (0–100 each):
- keyword_match: coverage of role-critical keywords from the JD
- impact: presence of measurable, outcome-driven bullets (numbers, %, $, scale)
- clarity: concise, strong action verbs, no jargon walls, consistent tense
- ats_formatting: standard sections, no images/columns implied, parseable headings
overall_score = weighted average (40% keyword_match, 30% impact, 20% clarity, 10% ats_formatting), rounded.
Return ONLY JSON with these fields:
{ overall_score, breakdown{keyword_match,impact,clarity,ats_formatting}, matched_keywords[], missing_keywords[], suggestions[]{section,title,rationale,before,after,severity}, summary }
severity ∈ "info" | "warn" | "critical". Provide 4–8 concrete, actionable suggestions. "before" should quote the candidate's exact bullet when applicable; "after" is your improved version. summary is 2–3 sentences.`;

export const analyzeAts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        resume_id: z.string().uuid(),
        job_id: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: resume, error: rErr } = await context.supabase
      .from("resumes")
      .select("id, title, content")
      .eq("id", data.resume_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (rErr) throw new Error(rErr.message);
    if (!resume) throw new Error("Resume not found");

    const resumeContent = resumeContentSchema.safeParse(resume.content);
    const resumeJson = resumeContent.success ? resumeContent.data : resume.content;

    let jobBlock = "No specific job provided. Analyze against general ATS best practices for the candidate's target seniority and skills.";
    if (data.job_id) {
      const { data: job, error: jErr } = await context.supabase
        .from("jobs")
        .select("id, title, company, description, parsed")
        .eq("id", data.job_id)
        .eq("user_id", context.userId)
        .maybeSingle();
      if (jErr) throw new Error(jErr.message);
      if (job) {
        jobBlock = `Job title: ${job.title} at ${job.company}\nParsed requirements: ${JSON.stringify(job.parsed)}\nFull description:\n${job.description}`;
      }
    }

    const gateway = getGateway();
    const { text } = await generateText({
      model: gateway(MODELS.fast),
      system: SYSTEM,
      prompt: `RESUME (JSON):\n${JSON.stringify(resumeJson)}\n\nJOB:\n${jobBlock}\n\nReturn JSON only.`,
    });

    const parsed = safeParseJson(text);
    const safe = atsReportSchema.safeParse(parsed);
    if (!safe.success) {
      throw new Error("AI returned an unexpected analysis format. Please retry.");
    }

    const { data: row, error } = await context.supabase
      .from("ats_reports")
      .insert({
        user_id: context.userId,
        resume_id: resume.id,
        job_id: data.job_id ?? null,
        overall_score: safe.data.overall_score,
        breakdown: safe.data.breakdown as any,
        suggestions: safe.data.suggestions as any,
        model: MODELS.fast,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    await context.supabase.from("activity_events").insert({
      user_id: context.userId,
      type: "ats.analyzed",
      payload: {
        report_id: row.id,
        resume_id: resume.id,
        job_id: data.job_id ?? null,
        score: safe.data.overall_score,
      },
    });

    return { report: row, analysis: safe.data };
  });

export const listAtsReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ resume_id: z.string().uuid().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("ats_reports")
      .select("id, overall_score, created_at, resume_id, job_id")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (data.resume_id) q = q.eq("resume_id", data.resume_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
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
