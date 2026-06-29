import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Briefcase, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/app/empty-state";
import { listJobs, createJob, deleteJob } from "@/lib/jobs.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/jobs/")({
  head: () => ({ meta: [{ title: "Jobs · CareerOS" }] }),
  component: JobsIndex,
});

function JobsIndex() {
  const fetchList = useServerFn(listJobs);
  const create = useServerFn(createJob);
  const del = useServerFn(deleteJob);
  const qc = useQueryClient();

  const { data: jobs, isLoading } = useQuery({ queryKey: ["jobs"], queryFn: () => fetchList() });

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [location, setLocation] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const handleCreate = async () => {
    setBusy(true);
    try {
      await create({
        data: {
          title: title.trim(),
          company: company.trim(),
          location: location.trim() || undefined,
          url: url.trim() || undefined,
          description: description.trim(),
        },
      });
      toast.success("Job saved & parsed");
      qc.invalidateQueries({ queryKey: ["jobs"] });
      setOpen(false);
      setTitle(""); setCompany(""); setLocation(""); setUrl(""); setDescription("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs"] }),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Jobs</h1>
          <p className="mt-1 text-sm text-muted-foreground">Save JDs to tailor your resume against them.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-1 h-4 w-4" /> Add job</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Save a job description</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid gap-2 md:grid-cols-2">
                <div>
                  <Label className="mb-1.5 text-xs">Title</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Senior Software Engineer" />
                </div>
                <div>
                  <Label className="mb-1.5 text-xs">Company</Label>
                  <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Stripe" />
                </div>
                <div>
                  <Label className="mb-1.5 text-xs">Location</Label>
                  <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Remote · US" />
                </div>
                <div>
                  <Label className="mb-1.5 text-xs">URL</Label>
                  <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
                </div>
              </div>
              <div>
                <Label className="mb-1.5 text-xs">Job description</Label>
                <Textarea rows={10} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Paste the full JD here…" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button
                onClick={handleCreate}
                disabled={busy || !title.trim() || !company.trim() || description.trim().length < 50}
              >
                {busy ? "Parsing…" : "Save & parse"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : !jobs || jobs.length === 0 ? (
        <EmptyState
          icon={<Briefcase className="h-5 w-5" />}
          title="No jobs saved"
          description="Paste a job description to tailor your resume and run ATS analysis against it."
          action={<Button onClick={() => setOpen(true)}><Plus className="mr-1 h-4 w-4" /> Add a job</Button>}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {jobs.map((j) => (
            <div key={j.id} className="group relative rounded-2xl border border-border bg-card p-5 shadow-soft transition hover:border-brand/50">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-brand-muted text-brand">
                <Briefcase className="h-4 w-4" />
              </div>
              <Link to="/jobs/$jobId" params={{ jobId: j.id }} className="font-display text-base font-semibold hover:underline">
                {j.title}
              </Link>
              <div className="mt-1 text-sm text-muted-foreground">{j.company}{j.location ? ` · ${j.location}` : ""}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Saved {new Date(j.created_at).toLocaleDateString()}
              </div>
              <button
                onClick={() => { if (confirm("Remove this job?")) delMut.mutate(j.id); }}
                className="absolute right-3 top-3 rounded p-1 text-muted-foreground opacity-0 transition hover:bg-accent hover:text-destructive group-hover:opacity-100"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
