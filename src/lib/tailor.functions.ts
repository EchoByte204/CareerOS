import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getGateway, MODELS } from "@/lib/ai/gateway.server";
import {
  resumeContentSchema,
  tailorResultSchema,
  type ResumeContent,
} from "@/lib/ai/schemas";

const TAILOR_SYSTEM = `You are a senior resume coach and recruiter.
You rewrite resumes to maximize signal for a specific job posting while remaining 100% truthful.
Rules:
- Never invent companies, titles, dates, metrics, or tools the candidate hasn't used.
- Keep bullets in past tense, action-led, and quantified where the original implies a number.
- Mirror the job's terminology when it accurately describes the candidate's existing work.
- Keep each bullet under 240 characters.
- Return ONLY a JSON object matching the requested schema.`;

export const tailorResume = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        resume_id: z.string().uuid(),
        job_id: z.string().uuid(),
        save_as_version: z.boolean().default(true),
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

    const { data: job, error: jErr } = await context.supabase
      .from("jobs")
      .select("id, title, company, description, parsed")
      .eq("id", data.job_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (jErr) throw new Error(jErr.message);
    if (!job) throw new Error("Job not found");

    const parsed = resumeContentSchema.safeParse(resume.content);
    if (!parsed.success) throw new Error("Resume content is malformed");
    const content: ResumeContent = parsed.data;

    const promptBody = JSON.stringify({
      job: {
        title: job.title,
        company: job.company,
        parsed: job.parsed,
        description: (job.description ?? "").slice(0, 6000),
      },
      resume: {
        summary: content.summary,
        skills: content.skills,
        experience: content.experience.map((e) => ({
          company: e.company,
          title: e.title,
          start: e.start,
          end: e.end,
          bullets: e.bullets,
        })),
      },
    });

    const gateway = getGateway();
    const { text } = await generateText({
      model: gateway(MODELS.fast),
      system: TAILOR_SYSTEM,
      prompt: `Tailor the resume to the job below. Output ONLY JSON: {summary, experience:[{company,title,bullets[]}], emphasized_skills[], change_log[]}.
- experience must keep the same order and (company,title) identity as the input.
- change_log is a short list of human-readable edits you made (max 8 items).

INPUT:\n${promptBody}`,
    });

    const jsonText = stripFences(text);
    let raw: unknown = {};
    try { raw = JSON.parse(jsonText); } catch { /* fall through */ }
    const result = tailorResultSchema.safeParse(raw);
    if (!result.success) throw new Error("AI returned an unparseable tailoring response");

    // Merge tailored fields back onto the resume content, preserving everything else.
    const tailoredContent: ResumeContent = {
      ...content,
      summary: result.data.summary || content.summary,
      experience: content.experience.map((orig) => {
        const match = result.data.experience.find(
          (e) =>
            e.company.trim().toLowerCase() === orig.company.trim().toLowerCase() &&
            e.title.trim().toLowerCase() === orig.title.trim().toLowerCase(),
        );
        if (!match) return orig;
        return { ...orig, bullets: match.bullets.length ? match.bullets : orig.bullets };
      }),
    };

    let versionId: string | null = null;
    if (data.save_as_version) {
      const { data: version, error: vErr } = await context.supabase
        .from("resume_versions")
        .insert({
          resume_id: resume.id,
          user_id: context.userId,
          label: `Tailored · ${job.company} — ${job.title}`,
          content: tailoredContent as never,
          tailored_for_job_id: job.id,
        })
        .select("id")
        .single();
      if (vErr) throw new Error(vErr.message);
      versionId = version.id;

      await context.supabase.from("activity_events").insert({
        user_id: context.userId,
        type: "resume.tailored",
        payload: { resume_id: resume.id, job_id: job.id, version_id: versionId },
      });
    }

    return {
      version_id: versionId,
      content: tailoredContent,
      result: result.data,
    };
  });

function stripFences(text: string) {
  const t = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  return a !== -1 && b !== -1 ? t.slice(a, b + 1) : t;
}
