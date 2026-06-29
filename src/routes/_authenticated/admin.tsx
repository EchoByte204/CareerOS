import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck, RefreshCcw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/app/empty-state";
import { toast } from "sonner";
import {
  queueHealth,
  claimAdminIfNone,
  isCurrentUserAdmin,
  listAutomationJobs,
  retryAutomationJob,
} from "@/lib/automation.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin · CareerOS" }] }),
  component: AdminPage,
});

function AdminPage() {
  const fetchAdmin = useServerFn(isCurrentUserAdmin);
  const claim = useServerFn(claimAdminIfNone);
  const fetchHealth = useServerFn(queueHealth);
  const fetchJobs = useServerFn(listAutomationJobs);
  const retry = useServerFn(retryAutomationJob);
  const qc = useQueryClient();

  const { data: admin } = useQuery({
    queryKey: ["is-admin"],
    queryFn: () => fetchAdmin(),
  });

  const claimMut = useMutation({
    mutationFn: () => claim(),
    onSuccess: (r) => {
      if (r.isAdmin) {
        toast.success("You're now admin.");
        qc.invalidateQueries({ queryKey: ["is-admin"] });
      } else {
        toast.error("An admin already exists. Ask them to grant you access.");
      }
    },
  });

  const { data: health, isLoading: hLoading, refetch } = useQuery({
    queryKey: ["queue-health"],
    queryFn: () => fetchHealth(),
    enabled: !!admin?.isAdmin,
    refetchInterval: 10_000,
  });

  const { data: jobs } = useQuery({
    queryKey: ["automation-jobs"],
    queryFn: () => fetchJobs(),
    enabled: !!admin?.isAdmin,
    refetchInterval: 10_000,
  });

  const retryMut = useMutation({
    mutationFn: (id: string) => retry({ data: { id } }),
    onSuccess: () => {
      toast.success("Re-queued.");
      qc.invalidateQueries({ queryKey: ["automation-jobs"] });
      qc.invalidateQueries({ queryKey: ["queue-health"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (admin && !admin.isAdmin) {
    return (
      <div className="mx-auto max-w-2xl">
        <EmptyState
          icon={<ShieldCheck className="h-5 w-5" />}
          title="Admin access required"
          description="If no admin has been set yet, you can claim the role for this workspace."
          action={
            <Button onClick={() => claimMut.mutate()} disabled={claimMut.isPending}>
              {claimMut.isPending ? "Checking…" : "Claim admin"}
            </Button>
          }
        />
        <p className="mt-3 text-center text-xs text-muted-foreground">
          <Link to="/dashboard" className="underline">Back to dashboard</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Admin</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Queue health, automation jobs, and recent failures.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => refetch()}>
          <RefreshCcw className="mr-1 h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {hLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : !health ? null : (
        <div className="grid gap-4 md:grid-cols-2">
          <QueueCard title="Automation jobs" counts={health.automation} />
          <QueueCard title="Skill extraction" counts={health.skills} />
        </div>
      )}

      <section>
        <h2 className="mb-3 font-display text-xl font-semibold">Recent automation jobs</h2>
        {!jobs?.length ? (
          <EmptyState title="No automation jobs yet" description="They appear when applications move to Applied." />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Job</th>
                  <th className="px-3 py-2">Kind</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Attempts</th>
                  <th className="px-3 py-2">Updated</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <div className="font-medium">{j.jobs?.title ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{j.jobs?.company}</div>
                    </td>
                    <td className="px-3 py-2 capitalize">{j.kind.replace(/_/g, " ")}</td>
                    <td className="px-3 py-2">
                      <span className={statusTone(j.status)}>{j.status}</span>
                      {j.last_error && (
                        <div className="mt-1 line-clamp-2 text-xs text-destructive">{j.last_error}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">{j.attempts}/{j.max_attempts}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {new Date(j.completed_at ?? j.started_at ?? j.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {j.status === "failed" && (
                        <Button size="sm" variant="ghost" onClick={() => retryMut.mutate(j.id)}>
                          Retry
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {!!health?.recentSkillFailures?.length && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 font-display text-xl font-semibold">
            <AlertTriangle className="h-4 w-4 text-warning" /> Recent skill extraction failures
          </h2>
          <ul className="space-y-2">
            {health.recentSkillFailures.map((f) => (
              <li key={f.id} className="rounded-xl border border-border bg-card p-3 text-sm shadow-soft">
                <div className="flex justify-between">
                  <span className="font-medium capitalize">{f.kind}</span>
                  <span className="text-xs text-muted-foreground">
                    {f.completed_at ? new Date(f.completed_at).toLocaleString() : ""}
                  </span>
                </div>
                <div className="mt-1 text-xs text-destructive">{f.last_error}</div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function QueueCard({ title, counts }: { title: string; counts: Record<string, number> }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <div className="mb-3 text-sm font-medium">{title}</div>
      <div className="grid grid-cols-4 gap-3 text-center">
        {(["pending", "processing", "done", "failed"] as const).map((k) => (
          <div key={k}>
            <div className="font-display text-2xl font-semibold">{counts[k] ?? 0}</div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{k}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function statusTone(s: string) {
  const base = "rounded-full px-2 py-0.5 text-[11px] font-medium ";
  switch (s) {
    case "done": return base + "bg-success/15 text-success-foreground";
    case "failed": return base + "bg-destructive/10 text-destructive";
    case "processing": return base + "bg-brand-muted text-brand";
    default: return base + "bg-muted text-muted-foreground";
  }
}
