import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Briefcase, Plus, ExternalLink, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/app/empty-state";
import {
  APP_STATUSES,
  type AppStatus,
  listApplications,
  createApplication,
  updateApplication,
  deleteApplication,
} from "@/lib/applications.functions";
import { listJobs } from "@/lib/jobs.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/applications")({
  head: () => ({ meta: [{ title: "Applications · CareerOS" }] }),
  component: ApplicationsPage,
});

const STATUS_LABEL: Record<AppStatus, string> = {
  saved: "Saved",
  applied: "Applied",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

const STATUS_TONE: Record<AppStatus, string> = {
  saved: "bg-muted text-foreground",
  applied: "bg-brand-muted text-brand",
  interview: "bg-warning/15 text-warning-foreground",
  offer: "bg-success/15 text-success-foreground",
  rejected: "bg-destructive/10 text-destructive",
  withdrawn: "bg-muted text-muted-foreground",
};

function ApplicationsPage() {
  const fetchList = useServerFn(listApplications);
  const fetchJobs = useServerFn(listJobs);
  const create = useServerFn(createApplication);
  const update = useServerFn(updateApplication);
  const del = useServerFn(deleteApplication);
  const qc = useQueryClient();

  const { data: apps, isLoading } = useQuery({
    queryKey: ["applications"],
    queryFn: () => fetchList(),
  });
  const { data: jobs } = useQuery({ queryKey: ["jobs"], queryFn: () => fetchJobs() });

  const [open, setOpen] = useState(false);
  const [jobId, setJobId] = useState("");
  const [status, setStatus] = useState<AppStatus>("saved");
  const [notes, setNotes] = useState("");

  const createMut = useMutation({
    mutationFn: () => create({ data: { job_id: jobId, status, notes: notes || null } }),
    onSuccess: () => {
      toast.success("Application tracked");
      qc.invalidateQueries({ queryKey: ["applications"] });
      setOpen(false); setJobId(""); setNotes(""); setStatus("saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: (p: { id: string; status: AppStatus }) => update({ data: p }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["applications"] }),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["applications"] }),
  });

  type AppRow = NonNullable<typeof apps>[number];
  const grouped: Record<AppStatus, AppRow[]> = {
    saved: [], applied: [], interview: [], offer: [], rejected: [], withdrawn: [],
  };
  (apps ?? []).forEach((a) => grouped[a.status].push(a));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Applications</h1>
          <p className="mt-1 text-sm text-muted-foreground">Track every role from saved to offer.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button disabled={!jobs?.length}><Plus className="mr-1 h-4 w-4" /> Track a job</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Track a new application</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-xs">Job</label>
                <Select value={jobId} onValueChange={setJobId}>
                  <SelectTrigger><SelectValue placeholder="Pick a saved job" /></SelectTrigger>
                  <SelectContent>
                    {(jobs ?? []).map((j) => (
                      <SelectItem key={j.id} value={j.id}>{j.title} · {j.company}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs">Status</label>
                <Select value={status} onValueChange={(v) => setStatus(v as AppStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {APP_STATUSES.map((s) => (<SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs">Notes (optional)</label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => createMut.mutate()} disabled={!jobId || createMut.isPending}>
                {createMut.isPending ? "Saving…" : "Track"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {!jobs?.length ? (
        <EmptyState
          icon={<Briefcase className="h-5 w-5" />}
          title="Save a job first"
          description="Applications track real job listings. Add a JD on the Jobs page to get started."
          action={<Button asChild><Link to="/jobs">Open Jobs</Link></Button>}
        />
      ) : isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : !apps?.length ? (
        <EmptyState
          icon={<Briefcase className="h-5 w-5" />}
          title="No applications yet"
          description="Track a saved job to begin your pipeline."
          action={<Button onClick={() => setOpen(true)}><Plus className="mr-1 h-4 w-4" /> Track a job</Button>}
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          {APP_STATUSES.map((s) => (
            <div key={s} className="flex min-h-40 flex-col rounded-2xl border border-border bg-card p-3 shadow-soft">
              <div className="mb-2 flex items-center justify-between px-1">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[s]}`}>
                  {STATUS_LABEL[s]}
                </span>
                <span className="text-xs text-muted-foreground">{grouped[s].length}</span>
              </div>
              <div className="flex flex-1 flex-col gap-2">
                {grouped[s].map((a) => (
                  <div key={a.id} className="group relative rounded-xl border border-border bg-background p-3">
                    <button
                      onClick={() => { if (confirm("Remove from tracker?")) delMut.mutate(a.id); }}
                      className="absolute right-2 top-2 rounded p-1 text-muted-foreground opacity-0 transition hover:bg-accent hover:text-destructive group-hover:opacity-100"
                      aria-label="Remove"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    <Link
                      to="/jobs/$jobId"
                      params={{ jobId: a.job_id }}
                      className="block pr-5 text-sm font-medium hover:underline"
                    >
                      {a.jobs?.title ?? "Job"}
                    </Link>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {a.jobs?.company}{a.jobs?.location ? ` · ${a.jobs.location}` : ""}
                    </div>
                    <div className="mt-3 flex items-center gap-1.5">
                      <Select
                        value={a.status}
                        onValueChange={(v) => updateMut.mutate({ id: a.id, status: v as AppStatus })}
                      >
                        <SelectTrigger className="h-7 px-2 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {APP_STATUSES.map((x) => (<SelectItem key={x} value={x}>{STATUS_LABEL[x]}</SelectItem>))}
                        </SelectContent>
                      </Select>
                      <Link
                        to="/jobs/$jobId"
                        params={{ jobId: a.job_id }}
                        className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                        aria-label="Open job"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
