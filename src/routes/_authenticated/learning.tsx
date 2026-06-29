import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  GraduationCap,
  Sparkles,
  Loader2,
  ExternalLink,
  BookOpen,
  Hammer,
  Video,
  FileText,
  Award,
  Check,
  Bookmark,
  Trash2,
  Play,
} from "lucide-react";
import { listJobs } from "@/lib/jobs.functions";
import {
  generateLearningRecommendations,
  listLearningRecommendations,
  updateLearningRecommendation,
  deleteLearningRecommendation,
} from "@/lib/learning.functions";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/learning")({
  head: () => ({ meta: [{ title: "Learning Plan · CareerOS" }] }),
  component: LearningPage,
});

const TYPE_ICON: Record<string, typeof BookOpen> = {
  course: GraduationCap,
  project: Hammer,
  book: BookOpen,
  article: FileText,
  video: Video,
  tutorial: Play,
  certification: Award,
  other: BookOpen,
};

const STATUS_TABS = [
  { key: "suggested", label: "Suggested" },
  { key: "saved", label: "Saved" },
  { key: "in_progress", label: "In progress" },
  { key: "completed", label: "Completed" },
] as const;

type StatusKey = (typeof STATUS_TABS)[number]["key"];

function LearningPage() {
  const qc = useQueryClient();
  const fetchJobs = useServerFn(listJobs);
  const fetchRecs = useServerFn(listLearningRecommendations);
  const runGenerate = useServerFn(generateLearningRecommendations);
  const runUpdate = useServerFn(updateLearningRecommendation);
  const runDelete = useServerFn(deleteLearningRecommendation);

  const [jobId, setJobId] = useState<string>("");
  const [status, setStatus] = useState<StatusKey>("suggested");

  const { data: jobs } = useQuery({ queryKey: ["jobs"], queryFn: () => fetchJobs() });
  const { data: recs, isLoading } = useQuery({
    queryKey: ["learning-recs", jobId || null, status],
    queryFn: () =>
      fetchRecs({ data: { job_id: jobId || undefined, status } }),
  });

  const generate = useMutation({
    mutationFn: () => runGenerate({ data: { job_id: jobId || undefined, replace: true } }),
    onSuccess: (res) => {
      if (res.skipped) {
        toast.message(res.reason ?? "Nothing to generate.");
      } else {
        toast.success(`Generated ${res.generated} recommendations`);
      }
      qc.invalidateQueries({ queryKey: ["learning-recs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: (v: { id: string; status: StatusKey }) => runUpdate({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["learning-recs"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => runDelete({ data: { id } }),
    onSuccess: () => {
      toast.success("Removed");
      qc.invalidateQueries({ queryKey: ["learning-recs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Learning Plan</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            AI-curated courses, projects, and resources ranked against your skill gaps.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">All saved jobs</option>
            {(jobs ?? []).map((j) => (
              <option key={j.id} value={j.id}>
                {j.title} — {j.company}
              </option>
            ))}
          </select>
          <Button size="sm" onClick={() => generate.mutate()} disabled={generate.isPending}>
            {generate.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            Generate plan
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setStatus(t.key)}
            className={
              "rounded-t-md border-b-2 px-3 py-2 text-sm transition-colors " +
              (status === t.key
                ? "border-brand text-foreground font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground")
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : !recs || recs.length === 0 ? (
        <EmptyState
          icon={<GraduationCap className="h-5 w-5" />}
          title={status === "suggested" ? "No suggestions yet" : `Nothing ${status.replace("_", " ")}`}
          description={
            status === "suggested"
              ? "Pick a target job (or leave it on All) and click Generate plan. We'll rank resources against your missing skills."
              : "Save or start a recommendation from the Suggested tab to see it here."
          }
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {recs.map((r) => {
            const Icon = TYPE_ICON[r.resource_type] ?? BookOpen;
            return (
              <li
                key={r.id}
                className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-soft"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium leading-tight">{r.title}</span>
                        {r.url && (
                          <a
                            href={r.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-muted-foreground hover:text-brand"
                            aria-label="Open resource"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        {r.provider && <span>{r.provider}</span>}
                        {r.skill?.name && (
                          <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                            {r.skill.name}
                          </Badge>
                        )}
                        {r.level && (
                          <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                            {r.level}
                          </Badge>
                        )}
                        {r.duration && <span>· {r.duration}</span>}
                        {r.cost && <span>· {r.cost}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-display text-lg font-semibold tabular-nums">
                      {Math.round(Number(r.score))}
                    </div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      impact
                    </div>
                  </div>
                </div>
                {r.description && (
                  <p className="text-sm text-muted-foreground line-clamp-3">{r.description}</p>
                )}
                {r.rationale && (
                  <div className="rounded-md border border-brand/20 bg-brand/5 px-3 py-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Why: </span>
                    {r.rationale}
                  </div>
                )}
                <div className="mt-auto flex flex-wrap gap-1.5">
                  {status !== "saved" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => update.mutate({ id: r.id, status: "saved" })}
                    >
                      <Bookmark className="mr-1.5 h-3.5 w-3.5" /> Save
                    </Button>
                  )}
                  {status !== "in_progress" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => update.mutate({ id: r.id, status: "in_progress" })}
                    >
                      <Play className="mr-1.5 h-3.5 w-3.5" /> Start
                    </Button>
                  )}
                  {status !== "completed" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => update.mutate({ id: r.id, status: "completed" })}
                    >
                      <Check className="mr-1.5 h-3.5 w-3.5" /> Done
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto text-muted-foreground"
                    onClick={() => remove.mutate(r.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
