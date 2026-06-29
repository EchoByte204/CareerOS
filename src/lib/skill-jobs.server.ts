// Server-only helpers for the skill-extraction job queue.
// Loaded via dynamic import from server functions so this never ships to
// the client bundle.

import type { extractAndStoreResumeSkills, extractAndStoreJobSkills } from "@/lib/skills.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

export async function enqueueSkillExtraction(args: {
  userId: string;
  kind: "resume" | "job";
  targetId: string;
  supabase: SupabaseLike;
}): Promise<void> {
  // Upsert resets attempts/status so a re-edit re-runs extraction.
  await args.supabase
    .from("skill_extraction_jobs")
    .upsert(
      {
        user_id: args.userId,
        kind: args.kind,
        target_id: args.targetId,
        status: "pending",
        attempts: 0,
        scheduled_at: new Date().toISOString(),
        last_error: null,
        started_at: null,
        completed_at: null,
        result: null,
      },
      { onConflict: "kind,target_id" },
    )
    .then(() => undefined, () => undefined);

  // Local fallback: if service role key is missing, trigger a client-authenticated worker immediately
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    setTimeout(async () => {
      try {
        const { data: pending } = await args.supabase
          .from("skill_extraction_jobs")
          .select("*")
          .eq("status", "pending")
          .limit(3);
          
        if (pending && pending.length > 0) {
          const skills = await import("@/lib/skills.server");
          for (const job of pending) {
            await args.supabase
              .from("skill_extraction_jobs")
              .update({ status: "processing", started_at: new Date().toISOString() })
              .eq("id", job.id);
              
            try {
              let count = 0;
              if (job.kind === "resume") {
                const { data: r } = await args.supabase
                  .from("resumes")
                  .select("id, title, content")
                  .eq("id", job.target_id)
                  .maybeSingle();
                if (r) {
                  count = await skills.extractAndStoreResumeSkills({
                    resumeId: r.id,
                    userId: args.userId,
                    title: r.title,
                    content: r.content,
                    supabase: args.supabase,
                  });
                }
              } else {
                const { data: j } = await args.supabase
                  .from("jobs")
                  .select("id, title, company, description, parsed")
                  .eq("id", job.target_id)
                  .maybeSingle();
                if (j) {
                  count = await skills.extractAndStoreJobSkills({
                    jobId: j.id,
                    userId: args.userId,
                    title: j.title,
                    company: j.company,
                    description: j.description ?? "",
                    parsed: j.parsed,
                    supabase: args.supabase,
                  });
                }
              }
              await args.supabase
                .from("skill_extraction_jobs")
                .update({
                  status: "done",
                  completed_at: new Date().toISOString(),
                  result: { count },
                  last_error: null,
                })
                .eq("id", job.id);
            } catch (err: any) {
              await args.supabase
                .from("skill_extraction_jobs")
                .update({
                  status: "failed",
                  completed_at: new Date().toISOString(),
                  last_error: err?.message || String(err),
                })
                .eq("id", job.id);
            }
          }
        }
      } catch (err) {
        console.error("Local worker run failed:", err);
      }
    }, 100);
    return;
  }

  // Trigger worker asynchronously to process the job immediately (essential in local dev where pg_cron doesn't poll)
  setTimeout(() => {
    runSkillExtractionWorker({ limit: 5 }).catch((err) => {
      console.error("[Skill Worker] Asynchronous run error:", err);
    });
  }, 100);
}

// Exponential backoff schedule: 30s, 2m, 8m, 30m.
function backoffSeconds(attempt: number): number {
  const base = 30;
  return Math.min(base * Math.pow(4, Math.max(0, attempt - 1)), 30 * 60);
}

type ClaimedJob = {
  id: string;
  user_id: string;
  kind: "resume" | "job";
  target_id: string;
  attempts: number;
  max_attempts: number;
};

export async function runSkillExtractionWorker(opts: {
  limit?: number;
} = {}): Promise<{ claimed: number; succeeded: number; retried: number; failed: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const limit = Math.max(1, Math.min(opts.limit ?? 5, 20));

  const { data: claimed, error: claimErr } = await supabaseAdmin.rpc(
    "claim_skill_extraction_jobs",
    { _limit: limit },
  );
  if (claimErr) throw new Error(`claim failed: ${claimErr.message}`);
  const jobs = (claimed ?? []) as ClaimedJob[];

  let succeeded = 0;
  let retried = 0;
  let failed = 0;

  // Lazy import the extractors — they pull in the AI gateway.
  const skills = await import("@/lib/skills.server");

  for (const job of jobs) {
    try {
      let count = 0;
      if (job.kind === "resume") {
        const { data: r, error } = await supabaseAdmin
          .from("resumes")
          .select("id, title, content, user_id")
          .eq("id", job.target_id)
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (!r) throw new Error("resume not found");
        count = await runWithExtractor(skills.extractAndStoreResumeSkills, {
          resumeId: r.id,
          userId: r.user_id,
          title: r.title,
          content: r.content,
          supabase: supabaseAdmin,
        });
      } else {
        const { data: j, error } = await supabaseAdmin
          .from("jobs")
          .select("id, title, company, description, parsed, user_id")
          .eq("id", job.target_id)
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (!j) throw new Error("job not found");
        count = await runWithExtractor(skills.extractAndStoreJobSkills, {
          jobId: j.id,
          userId: j.user_id,
          title: j.title,
          company: j.company,
          description: j.description ?? "",
          parsed: j.parsed,
          supabase: supabaseAdmin,
        });
      }

      await supabaseAdmin
        .from("skill_extraction_jobs")
        .update({
          status: "done",
          completed_at: new Date().toISOString(),
          result: { count },
          last_error: null,
        })
        .eq("id", job.id);
      succeeded += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const nextAttempt = job.attempts; // already incremented by claim
      if (nextAttempt >= job.max_attempts) {
        await supabaseAdmin
          .from("skill_extraction_jobs")
          .update({
            status: "failed",
            completed_at: new Date().toISOString(),
            last_error: message.slice(0, 2000),
          })
          .eq("id", job.id);
        failed += 1;
      } else {
        const wait = backoffSeconds(nextAttempt);
        await supabaseAdmin
          .from("skill_extraction_jobs")
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

async function runWithExtractor<T extends (...args: never[]) => Promise<number>>(
  fn: T,
  payload: Parameters<T>[0],
): Promise<number> {
  // Wrapper so TS infers cleanly when the extractor signatures diverge.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (fn as any)(payload);
}

export type _Unused = typeof extractAndStoreResumeSkills | typeof extractAndStoreJobSkills;
