import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listAutomationJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Trigger worker asynchronously to run right away in background (essential in local dev where pg_cron doesn't poll)
    import("@/lib/automation-jobs.server").then(({ runAutomationWorker }) => {
      runAutomationWorker({ limit: 5 }).catch((err) => {
        console.error("[Automation Worker] GET poll run error:", err);
      });
    }).catch(() => {});

    const { data, error } = await context.supabase
      .from("automation_jobs")
      .select(
        "id, application_id, job_id, resume_id, kind, status, attempts, max_attempts, scheduled_at, started_at, completed_at, last_error, result, created_at, jobs(title, company)",
      )
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const retryAutomationJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("automation_jobs")
      .update({
        status: "pending",
        attempts: 0,
        scheduled_at: new Date().toISOString(),
        started_at: null,
        completed_at: null,
        last_error: null,
      } as never)
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Aggregate queue health (admin only).
export const queueHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    async function counts(table: "skill_extraction_jobs" | "automation_jobs") {
      const out: Record<string, number> = { pending: 0, processing: 0, done: 0, failed: 0 };
      for (const status of Object.keys(out)) {
        const { count } = await supabaseAdmin
          .from(table)
          .select("id", { count: "exact", head: true })
          .eq("status", status);
        out[status] = count ?? 0;
      }
      return out;
    }

    const [skills, automation] = await Promise.all([
      counts("skill_extraction_jobs"),
      counts("automation_jobs"),
    ]);

    const { data: recentFailures } = await supabaseAdmin
      .from("automation_jobs")
      .select("id, kind, last_error, attempts, completed_at, user_id")
      .eq("status", "failed")
      .order("completed_at", { ascending: false })
      .limit(10);

    const { data: recentSkillFailures } = await supabaseAdmin
      .from("skill_extraction_jobs")
      .select("id, kind, last_error, attempts, completed_at, user_id")
      .eq("status", "failed")
      .order("completed_at", { ascending: false })
      .limit(10);

    return {
      skills,
      automation,
      recentFailures: recentFailures ?? [],
      recentSkillFailures: recentSkillFailures ?? [],
    };
  });

// First-user-claims-admin (no-op if an admin already exists).
// Uses the service-role admin client because EXECUTE on claim_admin_if_none
// is revoked from `authenticated` (SECURITY DEFINER hardening). The caller
// is validated server-side via requireSupabaseAuth, and the verified user id
// is passed explicitly to the SQL function.
export const claimAdminIfNone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("claim_admin_if_none", {
      _caller: context.userId,
    });
    if (error) throw new Error(error.message);
    return { isAdmin: !!data };
  });

export const isCurrentUserAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    return { isAdmin: !!data };
  });
