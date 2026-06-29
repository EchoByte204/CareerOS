import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo, useEffect, useRef } from "react";
import { Target, Sparkles, Loader2, Network, TrendingUp, AlertCircle, Clock, CheckCircle2, XCircle } from "lucide-react";
import { listResumes } from "@/lib/resumes.functions";
import { listJobs } from "@/lib/jobs.functions";
import {
  extractResumeSkills,
  extractJobSkills,
  getUserSkillGraph,
  getSkillGap,
  listSkillExtractionJobs,
} from "@/lib/skills.functions";
import { EmptyState } from "@/components/app/empty-state";
import { ScoreRing } from "@/components/app/score-ring";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/skills")({
  head: () => ({ meta: [{ title: "Skills · CareerOS" }] }),
  component: SkillsPage,
});

const KIND_COLORS: Record<string, string> = {
  language: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
  framework: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20",
  tool: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
  hard: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
  soft: "bg-pink-500/10 text-pink-700 dark:text-pink-300 border-pink-500/20",
  domain: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20",
  certification: "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/20",
};

const IMPORTANCE_RANK: Record<string, number> = {
  core: 4,
  required: 3,
  preferred: 2,
  nice_to_have: 1,
};

function SkillsPage() {
  const qc = useQueryClient();
  const fetchResumes = useServerFn(listResumes);
  const fetchJobs = useServerFn(listJobs);
  const fetchGraph = useServerFn(getUserSkillGraph);
  const fetchGap = useServerFn(getSkillGap);
  const runExtractResume = useServerFn(extractResumeSkills);
  const runExtractJob = useServerFn(extractJobSkills);
  const fetchJobsQueue = useServerFn(listSkillExtractionJobs);

  const { data: resumes } = useQuery({ queryKey: ["resumes"], queryFn: () => fetchResumes() });
  const { data: jobs } = useQuery({ queryKey: ["jobs"], queryFn: () => fetchJobs() });
  const { data: graph, isLoading: graphLoading } = useQuery({
    queryKey: ["skill-graph"],
    queryFn: () => fetchGraph(),
  });
  const { data: extractionJobs } = useQuery({
    queryKey: ["skill-jobs"],
    queryFn: () => fetchJobsQueue(),
    // Poll while anything is in-flight so the user sees state changes live.
    refetchInterval: (q) => {
      const rows = (q.state.data ?? []) as Array<{ status: string }>;
      const inFlight = rows.some((r) => r.status === "pending" || r.status === "processing");
      return inFlight ? 4000 : false;
    },
  });

  const [targetJob, setTargetJob] = useState<string>("");
  const { data: gap, isFetching: gapLoading } = useQuery({
    queryKey: ["skill-gap", targetJob],
    queryFn: () => fetchGap({ data: { job_id: targetJob } }),
    enabled: !!targetJob,
  });

  const extractResume = useMutation({
    mutationFn: (resume_id: string) => runExtractResume({ data: { resume_id } }),
    onSuccess: () => {
      toast.success("Queued — skills will appear shortly");
      qc.invalidateQueries({ queryKey: ["skill-jobs"] });
      qc.invalidateQueries({ queryKey: ["skill-graph"] });
      qc.invalidateQueries({ queryKey: ["skill-gap"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const extractJob = useMutation({
    mutationFn: (job_id: string) => runExtractJob({ data: { job_id } }),
    onSuccess: () => {
      toast.success("Queued — job skills will appear shortly");
      qc.invalidateQueries({ queryKey: ["skill-jobs"] });
      qc.invalidateQueries({ queryKey: ["skill-gap"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const nodes = graph?.nodes ?? [];
  const byCategory = useMemo(() => {
    const map = new Map<string, typeof nodes>();
    for (const n of nodes) {
      const key = n.skill?.category || n.skill?.kind || "other";
      const arr = map.get(key) ?? [];
      arr.push(n);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [nodes]);

  // When a job transitions to done, refresh the graph and any open gap view.
  const lastDoneAtRef = useRef<string>("");
  useEffect(() => {
    const newestDone = (extractionJobs ?? [])
      .filter((j) => j.status === "done" && j.completed_at)
      .map((j) => j.completed_at as string)
      .sort()
      .pop();
    if (newestDone && newestDone !== lastDoneAtRef.current) {
      lastDoneAtRef.current = newestDone;
      qc.invalidateQueries({ queryKey: ["skill-graph"] });
      qc.invalidateQueries({ queryKey: ["skill-gap"] });
    }
  }, [extractionJobs, qc]);

  const pendingCount = (extractionJobs ?? []).filter(
    (j) => j.status === "pending" || j.status === "processing",
  ).length;
  const failedJobs = (extractionJobs ?? []).filter((j) => j.status === "failed");
  const recentDone = (extractionJobs ?? []).filter((j) => j.status === "done").slice(0, 3);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Skill Graph</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Canonical skills, normalized from your resumes and target jobs — with gap analysis and bridging suggestions.
          </p>
        </div>
        <div className="flex gap-2">
          {(resumes ?? []).slice(0, 1).map((r) => (
            <Button
              key={r.id}
              size="sm"
              variant="outline"
              disabled={extractResume.isPending}
              onClick={() => extractResume.mutate(r.id)}
            >
              {extractResume.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              Extract from "{r.title}"
            </Button>
          ))}
        </div>
      </div>

      {/* Extraction queue status */}
      {(extractionJobs?.length ?? 0) > 0 && (
        <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-brand" />
              <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Extraction queue
              </h2>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {pendingCount > 0 && (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {pendingCount} in flight
                </span>
              )}
              {recentDone.length > 0 && (
                <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {recentDone.length} done
                </span>
              )}
              {failedJobs.length > 0 && (
                <span className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
                  <XCircle className="h-3.5 w-3.5" />
                  {failedJobs.length} failed
                </span>
              )}
            </div>
          </div>
          <ul className="divide-y divide-border text-sm">
            {(extractionJobs ?? []).slice(0, 6).map((j) => (
              <li key={j.id} className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                    {j.kind}
                  </Badge>
                  <span className="font-mono text-xs text-muted-foreground">
                    {j.target_id.slice(0, 8)}
                  </span>
                  {j.last_error && j.status !== "done" && (
                    <span className="line-clamp-1 max-w-[280px] text-xs text-muted-foreground">
                      · {j.last_error}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {j.attempts > 0 && (
                    <span className="text-muted-foreground">
                      try {j.attempts}/{j.max_attempts}
                    </span>
                  )}
                  <StatusPill status={j.status} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-brand" />
            <h2 className="font-display text-lg font-semibold">Gap analysis</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={targetJob}
              onChange={(e) => setTargetJob(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Pick a target job…</option>
              {(jobs ?? []).map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title} — {j.company}
                </option>
              ))}
            </select>
            {targetJob && (
              <Button
                size="sm"
                variant="outline"
                disabled={extractJob.isPending}
                onClick={() => extractJob.mutate(targetJob)}
              >
                {extractJob.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                Re-extract skills
              </Button>
            )}
          </div>
        </div>

        {!targetJob ? (
          <EmptyState
            icon={<Target className="h-5 w-5" />}
            title="Select a job to see your coverage"
            description="We compare your canonical skills against the job's required and preferred skills, weighted by importance."
          />
        ) : gapLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Crunching coverage…
          </div>
        ) : !gap ? null : gap.have.length + gap.missing.length === 0 ? (
          <div className="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 text-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 text-amber-600" />
            <div>
              <div className="font-medium">No skills extracted for this job yet.</div>
              <div className="text-muted-foreground">
                Click "Re-extract skills" above to normalize this job description into canonical skills.
              </div>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-[auto_1fr]">
            <div className="flex flex-col items-center gap-2">
              <ScoreRing value={gap.coverage} size={120} />
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Coverage</div>
            </div>
            <div className="space-y-5">
              <div>
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                  You have ({gap.have.length})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {gap.have
                    .slice()
                    .sort((a, b) => (IMPORTANCE_RANK[b.importance] ?? 0) - (IMPORTANCE_RANK[a.importance] ?? 0))
                    .map((s) => (
                      <SkillChip
                        key={s.skill_id}
                        name={s.skill?.name ?? ""}
                        kind={s.skill?.kind ?? "hard"}
                        suffix={s.importance === "core" || s.importance === "required" ? "★" : undefined}
                      />
                    ))}
                  {!gap.have.length && <span className="text-xs text-muted-foreground">None yet.</span>}
                </div>
              </div>
              <div>
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <AlertCircle className="h-4 w-4 text-rose-500" />
                  You're missing ({gap.missing.length})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {gap.missing
                    .slice()
                    .sort((a, b) => (IMPORTANCE_RANK[b.importance] ?? 0) - (IMPORTANCE_RANK[a.importance] ?? 0))
                    .map((s) => (
                      <SkillChip
                        key={s.skill_id}
                        name={s.skill?.name ?? ""}
                        kind={s.skill?.kind ?? "hard"}
                        muted
                        suffix={s.importance === "core" || s.importance === "required" ? "★" : undefined}
                      />
                    ))}
                  {!gap.missing.length && (
                    <span className="text-xs text-muted-foreground">Nothing — you cover this role.</span>
                  )}
                </div>
              </div>

              {gap.bridges.length > 0 && (
                <div className="rounded-lg border border-brand/20 bg-brand/5 p-3">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <Network className="h-4 w-4 text-brand" />
                    Bridging paths
                  </div>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {gap.bridges.slice(0, 6).map((b, i) => {
                      const from = nodes.find((n) => n.skill_id === b.via_skill_id)?.skill?.name;
                      const to = gap.missing.find((m) => m.skill_id === b.missing_skill_id)?.skill?.name;
                      if (!from || !to) return null;
                      return (
                        <li key={i}>
                          <span className="font-medium text-foreground">{from}</span>
                          <span className="mx-1.5">→</span>
                          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                            {b.edge_type.replace(/_/g, " ")}
                          </span>
                          <span className="mx-1.5">→</span>
                          <span className="font-medium text-foreground">{to}</span>
                          <span className="ml-2 text-[10px]">w={b.weight.toFixed(2)}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Your canonical skills */}
      <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Network className="h-5 w-5 text-brand" />
            <h2 className="font-display text-lg font-semibold">Your skill graph</h2>
            {!!nodes.length && (
              <Badge variant="outline" className="ml-1">
                {nodes.length} skills · {graph?.edges.length ?? 0} edges
              </Badge>
            )}
          </div>
        </div>

        {graphLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading graph…
          </div>
        ) : !nodes.length ? (
          <EmptyState
            icon={<Sparkles className="h-5 w-5" />}
            title="No canonical skills yet"
            description="Click 'Extract from …' above to normalize a resume's skills into the graph."
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {byCategory.map(([cat, list]) => (
              <div key={cat} className="rounded-lg border border-border/60 bg-background/40 p-3">
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {cat}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {list.map((n) => (
                    <SkillChip
                      key={n.id}
                      name={n.skill?.name ?? ""}
                      kind={n.skill?.kind ?? "hard"}
                      title={`confidence ${(n.confidence * 100).toFixed(0)}%${
                        n.proficiency ? ` · ${n.proficiency}` : ""
                      }${n.evidence ? `\n${n.evidence}` : ""}`}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SkillChip({
  name,
  kind,
  muted,
  suffix,
  title,
}: {
  name: string;
  kind: string;
  muted?: boolean;
  suffix?: string;
  title?: string;
}) {
  const cls = KIND_COLORS[kind] ?? KIND_COLORS.hard;
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
        muted ? "border-dashed opacity-70" : ""
      } ${cls}`}
    >
      {name}
      {suffix && <span className="opacity-70">{suffix}</span>}
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-muted text-muted-foreground",
    processing: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20",
    done: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20",
    failed: "bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/20",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${styles[status] ?? styles.pending}`}>
      {status}
    </span>
  );
}
