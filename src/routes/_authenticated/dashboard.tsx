import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight,
  FileText,
  Briefcase,
  Target,
  Sparkles,
  X,
  RefreshCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AiButton } from "@/components/app/ai-button";
import { EmptyState } from "@/components/app/empty-state";
import { ScoreRing } from "@/components/app/score-ring";
import { getProfile } from "@/lib/profiles.functions";
import {
  dashboardStats,
  generateRecommendations,
  listRecommendations,
  dismissRecommendation,
} from "@/lib/copilot.functions";
import { topJobMatches } from "@/lib/matches.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard · CareerOS" }] }),
  component: Dashboard,
});

function Dashboard() {
  const fetchProfile = useServerFn(getProfile);
  const fetchStats = useServerFn(dashboardStats);
  const fetchRecs = useServerFn(listRecommendations);
  const generate = useServerFn(generateRecommendations);
  const dismiss = useServerFn(dismissRecommendation);
  const fetchMatches = useServerFn(topJobMatches);
  const qc = useQueryClient();

  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => fetchProfile() });
  const { data: stats } = useQuery({ queryKey: ["dashboard-stats"], queryFn: () => fetchStats() });
  const { data: recs } = useQuery({ queryKey: ["recommendations"], queryFn: () => fetchRecs() });
  const { data: matches } = useQuery({ queryKey: ["top-matches"], queryFn: () => fetchMatches() });

  const genMut = useMutation({
    mutationFn: () => generate(),
    onSuccess: () => {
      toast.success("Copilot refreshed your recommendations.");
      qc.invalidateQueries({ queryKey: ["recommendations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dismissMut = useMutation({
    mutationFn: (id: string) => dismiss({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recommendations"] }),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Welcome{profile?.display_name ? `, ${profile.display_name.split(" ")[0]}` : ""}.
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your career copilot is watching your progress and surfacing the highest-leverage actions.
          </p>
        </div>
        <AiButton onClick={() => genMut.mutate()} disabled={genMut.isPending}>
          {genMut.isPending ? "Thinking…" : recs?.length ? "Refresh insights" : "Generate insights"}
        </AiButton>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard icon={<FileText className="h-4 w-4" />} label="Resumes" value={stats?.resumeCount ?? 0} to="/resumes" />
        <StatCard icon={<Briefcase className="h-4 w-4" />} label="Saved jobs" value={stats?.jobCount ?? 0} to="/jobs" />
        <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <Target className="h-4 w-4" /> Avg ATS score
          </div>
          {stats?.avgAts != null ? (
            <ScoreRing value={stats.avgAts} size={72} thickness={6} />
          ) : (
            <div className="text-sm text-muted-foreground">Run an ATS analysis to see your score.</div>
          )}
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <Sparkles className="h-4 w-4" /> Live recommendations
          </div>
          <div className="font-display text-3xl font-semibold">{recs?.length ?? 0}</div>
          <div className="text-xs text-muted-foreground">From your copilot</div>
        </div>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold">Recommended next actions</h2>
          {recs && recs.length > 0 && (
            <button
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => genMut.mutate()}
            >
              <RefreshCcw className="h-3 w-3" /> Refresh
            </button>
          )}
        </div>
        {!recs || recs.length === 0 ? (
          <EmptyState
            icon={<Sparkles className="h-5 w-5" />}
            title="Your copilot is ready"
            description={
              stats?.resumeCount === 0
                ? "Start by uploading a resume — your copilot uses it to personalize everything else."
                : "Click 'Generate insights' to get ranked next actions tailored to your profile, resumes, and jobs."
            }
            action={
              stats?.resumeCount === 0 ? (
                <Button asChild>
                  <Link to="/resumes">Add a resume <ArrowRight className="ml-1 h-4 w-4" /></Link>
                </Button>
              ) : (
                <AiButton onClick={() => genMut.mutate()} disabled={genMut.isPending}>
                  Generate insights
                </AiButton>
              )
            }
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {recs.map((r) => {
              const action = (r.action as { label?: string; path?: string } | null) ?? {};
              return (
                <div key={r.id} className="group relative rounded-2xl border border-border bg-card p-5 shadow-soft transition hover:border-brand/50">
                  <button
                    onClick={() => dismissMut.mutate(r.id)}
                    className="absolute right-3 top-3 rounded p-1 text-muted-foreground opacity-0 transition hover:bg-accent group-hover:opacity-100"
                    aria-label="Dismiss"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="inline-flex h-6 items-center rounded-full bg-brand-muted px-2 text-[11px] font-medium uppercase tracking-wide text-brand">
                      {r.kind.replace(/_/g, " ")}
                    </span>
                    <span className="text-xs text-muted-foreground">Score {Math.round(Number(r.score))}</span>
                  </div>
                  <h3 className="font-display text-base font-semibold leading-snug">{r.title}</h3>
                  {r.body && <p className="mt-1 text-sm text-muted-foreground">{r.body}</p>}
                  <div className="mt-4">
                    <Button asChild size="sm" variant="secondary">
                      <Link to={(action.path as "/dashboard") ?? "/dashboard"}>
                        {action.label ?? "Open"} <ArrowRight className="ml-1 h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {matches && matches.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold">Top job matches</h2>
            <Link to="/jobs" className="text-xs text-muted-foreground hover:text-foreground">
              View all
            </Link>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {matches.slice(0, 4).map((m) => (
              <Link
                key={m.id}
                to="/jobs/$jobId"
                params={{ jobId: m.id }}
                className="group rounded-2xl border border-border bg-card p-4 shadow-soft transition hover:border-brand/50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{m.title}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {m.company}{m.location ? ` · ${m.location}` : ""}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-display text-xl font-semibold text-brand">{m.score}%</div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {m.matched}/{m.total} skills
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}



      <section>
        <h2 className="mb-3 font-display text-xl font-semibold">Recent activity</h2>
        {!stats?.recentActivity || stats.recentActivity.length === 0 ? (
          <EmptyState
            title="No activity yet"
            description="Add a resume or save a job to start a timeline."
          />
        ) : (
          <ol className="space-y-2 rounded-2xl border border-border bg-card p-2 shadow-soft">
            {stats.recentActivity.map((e, i) => (
              <li
                key={i}
                className="flex items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-accent"
              >
                <span className="font-medium">{prettyEvent(e.type)}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(e.created_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  to,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  to: string;
}) {
  return (
    <Link
      to={to as "/resumes"}
      className="rounded-2xl border border-border bg-card p-5 shadow-soft transition hover:border-brand/50"
    >
      <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </div>
      <div className="font-display text-3xl font-semibold">{value}</div>
      <div className="mt-1 text-xs text-brand">Open <ArrowRight className="ml-0.5 inline h-3 w-3" /></div>
    </Link>
  );
}

function prettyEvent(t: string) {
  switch (t) {
    case "resume.parsed": return "Resume parsed";
    case "ats.analyzed": return "ATS analysis completed";
    case "job.saved": return "Job saved";
    default: return t;
  }
}
