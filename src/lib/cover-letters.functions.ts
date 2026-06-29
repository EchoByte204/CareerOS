import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getGateway, MODELS, getLocalLlmConfig } from "@/lib/ai/gateway.server";
import { resumeContentSchema, type ResumeContent } from "@/lib/ai/schemas";

const SYSTEM = `You are an expert career writer. You write tailored cover letters for the moderncv LaTeX template.

You will be given:
- a candidate's structured resume
- a target job (title, company, location, description, parsed requirements)
- a tone (professional | warm | direct) and length (short ~180w | medium ~280w | long ~380w)

Your job is to produce a LaTeX cover letter that compiles in Overleaf using the moderncv "classic" style, green color, exactly mirroring the structure of this REFERENCE template:

\\documentclass[11pt,a4paper,roman]{moderncv}
\\usepackage[english]{babel}
\\usepackage[utf8]{inputenc}
\\usepackage[scale=0.75]{geometry}
\\moderncvstyle{classic}
\\moderncvcolor{green}
\\name{<First>}{<Last>}
\\address{<City, Region>}{}{}
\\phone[mobile]{<phone>}
\\email{<email>}
\\begin{document}
\\recipient{<Recipient>}{<Company>}
\\date{<Today's date e.g. June 26, 2026>}
\\opening{Dear <Recipient>,}
\\closing{Sincerely,}
\\makelettertitle

<3-5 BODY PARAGRAPHS — see rules below>

\\vspace{0.5cm}
\\makeletterclosing
\\end{document}

Body rules:
- Open with the role and company by name, and a one-line hook tied to the candidate's strongest match.
- 2-3 middle paragraphs grounding claims in real resume bullets/projects. Use \\textbf{...} to bold the most important company names, titles, project names, or technologies — sparingly (3-6 total).
- Close with a polite, specific call to action.
- Be 100% truthful — never invent companies, titles, dates, metrics, or skills.
- Mirror the JD's terminology only when it accurately describes the candidate's work.
- Plain ASCII quotes/dashes. No markdown. No \\section, no itemize. No comments.

Output rules:
- Return STRICT JSON: {"latex": "<full .tex source>", "body_text": "<the body paragraphs only, no LaTeX commands, blank-line separated>"}
- The latex field MUST be a complete, compilable document starting with \\documentclass and ending with \\end{document}.
- Escape special LaTeX chars in user data: & % $ # _ { } ~ ^ \\.`;

function stripFences(text: string) {
  const t = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  return a !== -1 && b !== -1 ? t.slice(a, b + 1) : t;
}

const outSchema = z.object({
  latex: z.string().min(40),
  body_text: z.string().default(""),
});

export const listCoverLetters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("cover_letters")
      .select("id, title, company, role_title, tone, length, job_id, resume_id, created_at, updated_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getCoverLetter = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("cover_letters")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Cover letter not found");
    return row;
  });

export const deleteCoverLetter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("cover_letters")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const generateCoverLetter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        resume_id: z.string().uuid(),
        job_id: z.string().uuid(),
        tone: z.enum(["professional", "warm", "direct"]).default("professional"),
        length: z.enum(["short", "medium", "long"]).default("medium"),
        recipient: z.string().trim().max(120).default("Hiring Manager"),
        extra_notes: z.string().trim().max(2000).optional(),
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
      .select("id, title, company, location, description, parsed")
      .eq("id", data.job_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (jErr) throw new Error(jErr.message);
    if (!job) throw new Error("Job not found");

    const parsed = resumeContentSchema.safeParse(resume.content);
    if (!parsed.success) throw new Error("Resume content is malformed");
    const content: ResumeContent = parsed.data;

    const today = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const promptBody = JSON.stringify({
      today,
      tone: data.tone,
      length: data.length,
      recipient: data.recipient,
      extra_notes: data.extra_notes ?? "",
      candidate: {
        contact: content.contact,
        summary: content.summary,
        skills: content.skills.slice(0, 40),
        experience: content.experience.map((e) => ({
          company: e.company,
          title: e.title,
          start: e.start,
          end: e.end,
          bullets: e.bullets.slice(0, 6),
        })),
        projects: content.projects.slice(0, 4).map((p) => ({
          name: p.name,
          description: p.description,
          bullets: p.bullets.slice(0, 4),
        })),
        education: content.education.slice(0, 3),
      },
      job: {
        title: job.title,
        company: job.company,
        location: job.location,
        parsed: job.parsed,
        description: (job.description ?? "").slice(0, 5000),
      },
    });

    const gateway = getGateway();
    const { text } = await generateText({
      model: gateway(MODELS.smart),
      system: SYSTEM,
      prompt: `Write a moderncv LaTeX cover letter using the input below. Return ONLY JSON {"latex","body_text"}.\n\nINPUT:\n${promptBody}`,
    });

    const jsonText = stripFences(text);
    let raw: unknown = {};
    try { raw = JSON.parse(jsonText); } catch { /* fall through */ }
    const normalized = normalizeCoverLetter(raw);
    const result = outSchema.safeParse(normalized);
    if (!result.success) {
      console.error("[Cover Letter] Validation failed. Raw text:", text, "Error:", result.error);
      throw new Error("AI returned an unparseable cover letter format. Please retry.");
    }

    let latex = result.data.latex.trim();
    if (!latex.includes("\\documentclass")) {
      throw new Error("AI did not return a full LaTeX document");
    }

    const { data: row, error: insErr } = await context.supabase
      .from("cover_letters")
      .insert({
        user_id: context.userId,
        resume_id: resume.id,
        job_id: job.id,
        title: `${job.company} — ${job.title}`,
        recipient: data.recipient,
        company: job.company ?? "",
        role_title: job.title ?? "",
        tone: data.tone,
        length: data.length,
        body_text: result.data.body_text,
        latex,
        model: getLocalLlmConfig().modelSmart,
      })
      .select()
      .single();
    if (insErr) throw new Error(insErr.message);

    await context.supabase.from("activity_events").insert({
      user_id: context.userId,
      type: "cover_letter.generated",
      payload: { cover_letter_id: row.id, resume_id: resume.id, job_id: job.id },
    });

    return row;
  });

function normalizeCoverLetter(raw: any): any {
  if (!raw || typeof raw !== "object") return {};
  const latex = raw.latex || raw.latex_code || raw.code || raw.document || "";
  const body_text = raw.body_text || raw.bodyText || raw.text || raw.body || "";
  return { latex, body_text };
}
