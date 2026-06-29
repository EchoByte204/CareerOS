import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const APP_STATUSES = [
  "saved",
  "applied",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
] as const;
export type AppStatus = (typeof APP_STATUSES)[number];

export const listApplications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("applications")
      .select(
        "id, status, applied_at, notes, created_at, updated_at, job_id, resume_version_id, jobs(id, title, company, location)",
      )
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      id: string;
      status: AppStatus;
      applied_at: string | null;
      notes: string | null;
      created_at: string;
      updated_at: string;
      job_id: string;
      resume_version_id: string | null;
      jobs: { id: string; title: string; company: string; location: string | null } | null;
    }>;
  });

export const createApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        job_id: z.string().uuid(),
        status: z.enum(APP_STATUSES).default("saved"),
        resume_version_id: z.string().uuid().nullish(),
        notes: z.string().max(2000).nullish(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("applications")
      .insert({
        user_id: context.userId,
        job_id: data.job_id,
        status: data.status,
        resume_version_id: data.resume_version_id ?? null,
        notes: data.notes ?? null,
        applied_at: data.status === "applied" ? new Date().toISOString() : null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(APP_STATUSES).optional(),
        notes: z.string().max(2000).nullish(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    // Snapshot previous status to detect transitions to "applied".
    const { data: prev } = await context.supabase
      .from("applications")
      .select("status, job_id, resume_version_id")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();

    const patch: Record<string, unknown> = {};
    if (data.status) {
      patch.status = data.status;
      if (data.status === "applied") patch.applied_at = new Date().toISOString();
    }
    if (data.notes !== undefined) patch.notes = data.notes;
    const { data: row, error } = await context.supabase
      .from("applications")
      .update(patch as never)
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .select()
      .single();
    if (error) throw new Error(error.message);

    // Fire automation when transitioning into "applied".
    if (
      data.status === "applied" &&
      prev?.status !== "applied" &&
      row?.job_id
    ) {
      try {
        // Pick the user's primary resume (or first available).
        const { data: primary } = await context.supabase
          .from("resumes")
          .select("id, is_primary, created_at")
          .eq("user_id", context.userId)
          .order("is_primary", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (primary?.id) {
          const { enqueueApplicationAutomation } = await import(
            "@/lib/automation-jobs.server"
          );
          await enqueueApplicationAutomation({
            userId: context.userId,
            applicationId: row.id,
            jobId: row.job_id,
            resumeId: primary.id,
            supabase: context.supabase,
          });
        }
      } catch {
        // Never block the status update on automation enqueue failure.
      }
    }

    return row;
  });

export const deleteApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("applications")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
