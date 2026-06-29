import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { gatewayChatCompletion } from "@/lib/ai/gateway.server";
import { emptyResume, resumeContentSchema, type ResumeContent } from "@/lib/ai/schemas";

const PARSE_SYSTEM = `You are an expert resume parser. Extract a structured resume from the text provided.
Rules:
- Preserve the candidate's exact wording in bullets; do not invent content.
- Normalize dates to "MMM YYYY" or "YYYY" when possible; use "Present" for current.
- Return ONLY a single JSON object. No prose, no markdown fences.
- Required top-level keys: contact, summary, experience, education, projects, skills.
- contact: { name, email, phone, location, links: [{label,url}] }
- experience[]: { company, title, location, start, end, bullets: string[] }
- education[]: { school, degree, field, start, end, details }
- projects[]: { name, description, bullets: string[], link }
- skills: string[]
- If a field is unknown, use an empty string or empty array. Never omit a key.`;

async function llmParseResume(rawText: string): Promise<ResumeContent> {
  const prompt = `Parse this resume into the JSON schema described in the system message.\n\nRESUME TEXT:\n---\n${rawText}\n---`;

  // Try twice: first attempt forces JSON mode; second attempt re-asks if invalid.
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await gatewayChatCompletion({
      messages: [
        { role: "system", content: PARSE_SYSTEM },
        {
          role: "user",
          content:
            attempt === 0
              ? prompt
              : `${prompt}\n\nYour previous response was not valid JSON matching the schema. Return ONLY the JSON object now.`,
        },
      ],
      temperature: 0.1,
      response_format: { type: "json_object" },
    });
    const text = res.choices?.[0]?.message?.content ?? "";
    const parsed = safeParseJson(text);
    const check = resumeContentSchema.safeParse(parsed);
    if (check.success) return check.data;
  }
  throw new Error(
    "The local LLM did not return a valid resume JSON. Check that LOCAL_LLM_MODEL is an instruction-tuned model and the server is reachable.",
  );
}

export const listResumes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("resumes")
      .select("id, title, is_primary, source, created_at, updated_at, parsed_at")
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getResume = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("resumes")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Resume not found");

    const { data: versions, error: vErr } = await context.supabase
      .from("resume_versions")
      .select("id, label, created_at, tailored_for_job_id, parent_version_id")
      .eq("resume_id", row.id)
      .order("created_at", { ascending: false });
    if (vErr) throw new Error(vErr.message);

    return { resume: row, versions: versions ?? [] };
  });

export const createResume = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        title: z.string().trim().min(1).max(120).default("Untitled Resume"),
        content: resumeContentSchema.optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("resumes")
      .insert({
        user_id: context.userId,
        title: data.title,
        source: "builder",
        content: (data.content ?? emptyResume) as any,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateResumeContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        title: z.string().trim().min(1).max(120).optional(),
        content: resumeContentSchema,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {
      content: data.content as any,
    };
    if (data.title) patch.title = data.title;
    const { data: row, error } = await context.supabase
      .from("resumes")
      .update(patch as any)
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteResume = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("resumes")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Parse pasted resume text into structured content.
export const parseResumeText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        title: z.string().trim().min(1).max(120).default("Imported Resume"),
        text: z.string().trim().min(50).max(60_000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const finalContent = await llmParseResume(data.text);

    const hasPrimary = await userHasPrimary(context.supabase, context.userId);

    const { data: row, error } = await context.supabase
      .from("resumes")
      .insert({
        user_id: context.userId,
        title: data.title,
        source: "upload",
        parsed_at: new Date().toISOString(),
        content: finalContent as any,
        is_primary: !hasPrimary,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    await context.supabase.from("activity_events").insert({
      user_id: context.userId,
      type: "resume.parsed",
      payload: { resume_id: row.id, title: row.title },
    });

    try {
      const { enqueueSkillExtraction } = await import("@/lib/skill-jobs.server");
      await enqueueSkillExtraction({
        userId: context.userId,
        kind: "resume",
        targetId: row.id,
        supabase: context.supabase,
      });
    } catch {
      // queueing must never block the resume save
    }

    return row;
  });


// Parse uploaded PDF (base64). Local LLMs typically can't ingest PDF parts,
// so we extract the text first with `unpdf` and then send plain text to the
// model — same prompt shape as parseResumeText.
export const parseResumePdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        title: z.string().trim().min(1).max(120).default("Uploaded Resume"),
        filename: z.string().trim().min(1).max(200),
        data_base64: z.string().min(50).max(8_000_000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const bytes = Uint8Array.from(atob(data.data_base64), (c) => c.charCodeAt(0));
    const pdf = await getDocumentProxy(bytes);
    const { text: extracted } = await extractText(pdf, { mergePages: true });
    const pdfText = (Array.isArray(extracted) ? extracted.join("\n") : extracted)
      .trim()
      .slice(0, 60_000);

    if (pdfText.length < 50) {
      throw new Error(
        "Couldn't read text from this PDF (it may be scanned images). Try pasting the resume text instead.",
      );
    }

    const finalContent: ResumeContent = await llmParseResume(pdfText);

    const hasPrimary = await userHasPrimary(context.supabase, context.userId);

    const { data: row, error } = await context.supabase
      .from("resumes")
      .insert({
        user_id: context.userId,
        title: data.title,
        source: "upload",
        parsed_at: new Date().toISOString(),
        content: finalContent as any,
        is_primary: !hasPrimary,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);


    await context.supabase.from("activity_events").insert({
      user_id: context.userId,
      type: "resume.parsed",
      payload: { resume_id: row.id, source: "pdf", filename: data.filename },
    });

    try {
      const { enqueueSkillExtraction } = await import("@/lib/skill-jobs.server");
      await enqueueSkillExtraction({
        userId: context.userId,
        kind: "resume",
        targetId: row.id,
        supabase: context.supabase,
      });
    } catch {
      // queueing must never block the resume save
    }

    return row;
  });

async function userHasPrimary(
  supabase: { from: (t: string) => any },
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("resumes")
    .select("id")
    .eq("user_id", userId)
    .eq("is_primary", true)
    .limit(1);
  return Array.isArray(data) && data.length > 0;
}

/**
 * Returns the user's canonical profile (primary resume content). Falls back to
 * the most recently parsed resume if none is marked primary. Used by /profile
 * and any feature that needs the user's canonical career data.
 */
export const getProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: rows, error } = await context.supabase
      .from("resumes")
      .select("id, title, is_primary, content, parsed_at, updated_at, source")
      .eq("user_id", context.userId)
      .order("is_primary", { ascending: false })
      .order("parsed_at", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    const list = rows ?? [];
    const primary = list[0] ?? null;
    const parsed = primary ? resumeContentSchema.safeParse(primary.content) : null;
    return {
      hasResume: !!primary,
      resumeId: primary?.id ?? null,
      title: primary?.title ?? null,
      isPrimary: primary?.is_primary ?? false,
      updatedAt: primary?.updated_at ?? null,
      source: primary?.source ?? null,
      content: parsed && parsed.success ? parsed.data : emptyResume,
      resumes: list.map((r) => ({
        id: r.id,
        title: r.title,
        is_primary: r.is_primary,
      })),
    };
  });

export const setPrimaryResume = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error: e1 } = await context.supabase
      .from("resumes")
      .update({ is_primary: false })
      .eq("user_id", context.userId);
    if (e1) throw new Error(e1.message);
    const { error: e2 } = await context.supabase
      .from("resumes")
      .update({ is_primary: true })
      .eq("user_id", context.userId)
      .eq("id", data.id);
    if (e2) throw new Error(e2.message);
    return { ok: true };
  });


function safeParseJson(text: string): unknown {
  // Strip ```json fences and locate the first {...} block.
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
