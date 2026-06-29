// Server-only implementations of the automation actions, using the admin
// client passed in. Mirrors the logic of tailorResume / generateCoverLetter
// without the per-user-auth wrapper, since the worker runs as service role
// after the user has already authorized the action via the application row.

import { generateText } from "ai";
import { z } from "zod";
import { getGateway, MODELS, getLocalLlmConfig } from "@/lib/ai/gateway.server";
import { resumeContentSchema, type ResumeContent } from "@/lib/ai/schemas";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

const tailorSchema = z.object({
  summary: z.string().default(""),
  experience: z
    .array(z.object({ company: z.string(), title: z.string(), bullets: z.array(z.string()).default([]) }))
    .default([]),
  emphasized_skills: z.array(z.string()).default([]),
  change_log: z.array(z.string()).default([]),
});

function stripFences(text: string) {
  const t = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  return a !== -1 && b !== -1 ? t.slice(a, b + 1) : t;
}

export async function tailorForAutomation(args: {
  userId: string;
  resumeId: string;
  jobId: string;
  supabase: SupabaseLike;
}): Promise<{ version_id: string }> {
  const { data: resume } = await args.supabase
    .from("resumes")
    .select("id, title, content")
    .eq("id", args.resumeId)
    .eq("user_id", args.userId)
    .maybeSingle();
  if (!resume) throw new Error("Resume not found");

  const { data: job } = await args.supabase
    .from("jobs")
    .select("id, title, company, description, parsed")
    .eq("id", args.jobId)
    .eq("user_id", args.userId)
    .maybeSingle();
  if (!job) throw new Error("Job not found");

  const parsed = resumeContentSchema.safeParse(resume.content);
  if (!parsed.success) throw new Error("Resume content malformed");
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
        bullets: e.bullets,
      })),
    },
  });

  const gateway = getGateway();
  const { text } = await generateText({
    model: gateway(MODELS.fast),
    system:
      "You rewrite resumes for a specific job, truthfully and concisely. Output ONLY JSON.",
    prompt: `Tailor the resume to the job. Output JSON {summary, experience:[{company,title,bullets[]}], emphasized_skills[], change_log[]}.\n\n${promptBody}`,
  });

  let raw: unknown = {};
  try { raw = JSON.parse(stripFences(text)); } catch { /* noop */ }
  const result = tailorSchema.safeParse(raw);
  if (!result.success) throw new Error("Tailoring response unparseable");

  const tailored: ResumeContent = {
    ...content,
    summary: result.data.summary || content.summary,
    experience: content.experience.map((orig) => {
      const m = result.data.experience.find(
        (e) =>
          e.company.trim().toLowerCase() === orig.company.trim().toLowerCase() &&
          e.title.trim().toLowerCase() === orig.title.trim().toLowerCase(),
      );
      return m && m.bullets.length ? { ...orig, bullets: m.bullets } : orig;
    }),
  };

  const { data: version, error } = await args.supabase
    .from("resume_versions")
    .insert({
      resume_id: resume.id,
      user_id: args.userId,
      label: `Auto-tailored · ${job.company} — ${job.title}`,
      content: tailored,
      tailored_for_job_id: job.id,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await args.supabase.from("activity_events").insert({
    user_id: args.userId,
    type: "resume.auto_tailored",
    payload: { resume_id: resume.id, job_id: job.id, version_id: version.id },
  });

  return { version_id: version.id };
}

const coverSchema = z.object({
  latex: z.string().min(40),
  body_text: z.string().default(""),
});

const COVER_SYSTEM = `You are an expert career writer. Produce a moderncv (classic style, green color) LaTeX cover letter that compiles on Overleaf.
Rules:
- Complete document from \\documentclass[11pt,a4paper,roman]{moderncv} to \\end{document}.
- Use \\moderncvstyle{classic}, \\moderncvcolor{green}.
- 3-5 body paragraphs, truthful, grounded in the resume.
- Bold key terms with \\textbf{...} sparingly (3-6 total).
- Plain ASCII; escape & % $ # _ { } ~ ^ \\ in user data.
Return STRICT JSON {"latex","body_text"}.`;

export async function coverLetterForAutomation(args: {
  userId: string;
  resumeId: string;
  jobId: string;
  supabase: SupabaseLike;
}): Promise<{ cover_letter_id: string }> {
  const { data: resume } = await args.supabase
    .from("resumes")
    .select("id, title, content")
    .eq("id", args.resumeId).eq("user_id", args.userId).maybeSingle();
  if (!resume) throw new Error("Resume not found");

  const { data: job } = await args.supabase
    .from("jobs")
    .select("id, title, company, location, description, parsed")
    .eq("id", args.jobId).eq("user_id", args.userId).maybeSingle();
  if (!job) throw new Error("Job not found");

  const parsed = resumeContentSchema.safeParse(resume.content);
  if (!parsed.success) throw new Error("Resume content malformed");
  const content: ResumeContent = parsed.data;

  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  const promptBody = JSON.stringify({
    today,
    tone: "professional",
    length: "medium",
    recipient: "Hiring Manager",
    candidate: {
      contact: content.contact,
      summary: content.summary,
      skills: content.skills.slice(0, 40),
      experience: content.experience.map((e) => ({
        company: e.company, title: e.title, start: e.start, end: e.end,
        bullets: e.bullets.slice(0, 6),
      })),
      projects: content.projects.slice(0, 4),
      education: content.education.slice(0, 3),
    },
    job: {
      title: job.title, company: job.company, location: job.location,
      parsed: job.parsed,
      description: (job.description ?? "").slice(0, 5000),
    },
  });

  const gateway = getGateway();
  const { text } = await generateText({
    model: gateway(MODELS.smart),
    system: COVER_SYSTEM,
    prompt: `Write a moderncv LaTeX cover letter. Return ONLY JSON {"latex","body_text"}.\n\n${promptBody}`,
  });

  let raw: unknown = {};
  try { raw = JSON.parse(stripFences(text)); } catch { /* noop */ }
  const result = coverSchema.safeParse(raw);
  if (!result.success) throw new Error("Cover letter response unparseable");
  const latex = result.data.latex.trim();
  if (!latex.includes("\\documentclass")) throw new Error("Incomplete LaTeX");

  const { data: row, error } = await args.supabase
    .from("cover_letters")
    .insert({
      user_id: args.userId,
      resume_id: resume.id,
      job_id: job.id,
      title: `${job.company} — ${job.title}`,
      recipient: "Hiring Manager",
      company: job.company ?? "",
      role_title: job.title ?? "",
      tone: "professional",
      length: "medium",
      body_text: result.data.body_text,
      latex,
      model: getLocalLlmConfig().modelSmart,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await args.supabase.from("activity_events").insert({
    user_id: args.userId,
    type: "cover_letter.auto_generated",
    payload: { cover_letter_id: row.id, resume_id: resume.id, job_id: job.id },
  });

  return { cover_letter_id: row.id };
}
