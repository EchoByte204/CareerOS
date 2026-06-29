// Server-only worker for application automation jobs (tailor + cover letter).
// Loaded via dynamic import from the public cron route so it never ships to
// the client bundle.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

export async function enqueueApplicationAutomation(args: {
  userId: string;
  applicationId: string;
  jobId: string;
  resumeId: string;
  supabase: SupabaseLike;
}): Promise<void> {
  const base = {
    user_id: args.userId,
    application_id: args.applicationId,
    job_id: args.jobId,
    resume_id: args.resumeId,
    status: "pending" as const,
    attempts: 0,
    scheduled_at: new Date().toISOString(),
    last_error: null,
    started_at: null,
    completed_at: null,
    result: null,
  };
  await args.supabase
    .from("automation_jobs")
    .upsert(
      [
        { ...base, kind: "tailor" },
        { ...base, kind: "cover_letter" },
      ],
      { onConflict: "application_id,kind" },
    )
    .then(() => undefined, () => undefined);

  // Trigger worker asynchronously to run right away in background (essential in local dev where pg_cron doesn't poll)
  setTimeout(() => {
    runAutomationWorker({ limit: 5 }).catch((err) => {
      console.error("[Automation Worker] Asynchronous run error:", err);
    });
  }, 100);
}

function backoffSeconds(attempt: number): number {
  return Math.min(60 * Math.pow(3, Math.max(0, attempt - 1)), 30 * 60);
}

type ClaimedJob = {
  id: string;
  user_id: string;
  application_id: string;
  job_id: string;
  resume_id: string;
  kind: "tailor" | "cover_letter";
  attempts: number;
  max_attempts: number;
};

export async function runAutomationWorker(opts: { limit?: number } = {}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const limit = Math.max(1, Math.min(opts.limit ?? 3, 10));

  const { data: claimed, error } = await supabaseAdmin.rpc(
    "claim_automation_jobs",
    { _limit: limit },
  );
  if (error) throw new Error(`claim failed: ${error.message}`);
  const jobs = (claimed ?? []) as ClaimedJob[];

  let succeeded = 0;
  let retried = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      const result =
        job.kind === "tailor"
          ? await runTailor(job, supabaseAdmin)
          : await runCoverLetter(job, supabaseAdmin);

      await supabaseAdmin
        .from("automation_jobs")
        .update({
          status: "done",
          completed_at: new Date().toISOString(),
          result,
          last_error: null,
        })
        .eq("id", job.id);
      succeeded += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (job.attempts >= job.max_attempts) {
        await supabaseAdmin
          .from("automation_jobs")
          .update({
            status: "failed",
            completed_at: new Date().toISOString(),
            last_error: message.slice(0, 2000),
          })
          .eq("id", job.id);
        failed += 1;
      } else {
        const wait = backoffSeconds(job.attempts);
        await supabaseAdmin
          .from("automation_jobs")
          .update({
            status: "pending",
            scheduled_at: new Date(Date.now() + wait * 1000).toISOString(),
            last_error: message.slice(0, 2000),
            started_at: null,
          })
          .eq("id", job.id);
        retried += 1;
      }
    }
  }

  return { claimed: jobs.length, succeeded, retried, failed };
}

async function runTailor(job: ClaimedJob, sb: SupabaseLike) {
  const { tailorForAutomation } = await import("@/lib/automation-impl.server");
  return await tailorForAutomation({
    userId: job.user_id,
    resumeId: job.resume_id,
    jobId: job.job_id,
    supabase: sb,
  });
}

async function runCoverLetter(job: ClaimedJob, sb: SupabaseLike) {
  const { coverLetterForAutomation } = await import("@/lib/automation-impl.server");
  return await coverLetterForAutomation({
    userId: job.user_id,
    resumeId: job.resume_id,
    jobId: job.job_id,
    supabase: sb,
  });
}
