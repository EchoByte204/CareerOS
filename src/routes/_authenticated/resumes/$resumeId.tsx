import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Sparkles, Briefcase, Save, AlertTriangle, CheckCircle2, Info, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { AiButton } from "@/components/app/ai-button";
import { ScoreRing } from "@/components/app/score-ring";
import { getResume, updateResumeContent } from "@/lib/resumes.functions";
import { listJobs } from "@/lib/jobs.functions";
import { analyzeAts } from "@/lib/ats.functions";
import { tailorResume } from "@/lib/tailor.functions";
import { resumeContentSchema, type ResumeContent, emptyResume, type AtsReport, type TailorResult } from "@/lib/ai/schemas";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/resumes/$resumeId")({
  head: () => ({ meta: [{ title: "Resume · CareerOS" }] }),
  component: ResumeDetail,
});

function ResumeDetail() {
  const { resumeId } = useParams({ from: "/_authenticated/resumes/$resumeId" });
  const fetch = useServerFn(getResume);
  const save = useServerFn(updateResumeContent);
  const fetchJobs = useServerFn(listJobs);
  const analyze = useServerFn(analyzeAts);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["resume", resumeId],
    queryFn: () => fetch({ data: { id: resumeId } }),
  });
  const { data: jobs } = useQuery({ queryKey: ["jobs"], queryFn: () => fetchJobs() });

  const [editing, setEditing] = useState<ResumeContent | null>(null);
  const [title, setTitle] = useState<string>("");
  const [selectedJob, setSelectedJob] = useState<string>("");
  const [report, setReport] = useState<AtsReport | null>(null);

  if (isLoading || !data) {
    return <div className="text-sm text-muted-foreground">Loading…</div>;
  }

  const parsed = resumeContentSchema.safeParse(data.resume.content);
  const content: ResumeContent = editing ?? (parsed.success ? parsed.data : emptyResume);
  const currentTitle = title || data.resume.title;

  const saveMut = useMutation({
    mutationFn: () =>
      save({ data: { id: resumeId, title: currentTitle, content } }),
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["resume", resumeId] });
      setEditing(null);
      setTitle("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const atsMut = useMutation({
    mutationFn: () =>
      analyze({
        data: { resume_id: resumeId, job_id: selectedJob || undefined },
      }),
    onSuccess: (res) => {
      setReport(res.analysis);
      toast.success(`ATS score: ${res.analysis.overall_score}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = (patch: Partial<ResumeContent>) => setEditing({ ...content, ...patch });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/resumes"><ArrowLeft className="mr-1 h-4 w-4" /> All resumes</Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Input
            value={currentTitle}
            onChange={(e) => setTitle(e.target.value)}
            className="border-0 bg-transparent px-0 font-display text-3xl font-semibold tracking-tight shadow-none focus-visible:ring-0"
          />
          <p className="text-sm text-muted-foreground">
            {data.versions.length} {data.versions.length === 1 ? "version" : "versions"} ·
            Updated {new Date(data.resume.updated_at).toLocaleString()}
          </p>
        </div>
        <div className="flex gap-2">
          <TailorButton resumeId={resumeId} jobs={jobs ?? []} />
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            <Save className="mr-1 h-4 w-4" /> Save
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Section title="Summary">
            <Textarea
              rows={4}
              value={content.summary}
              onChange={(e) => update({ summary: e.target.value })}
              placeholder="A 2–3 sentence professional summary."
            />
          </Section>

          <Section title="Experience">
            <div className="space-y-4">
              {content.experience.map((exp, i) => (
                <div key={i} className="rounded-xl border border-border bg-background p-4">
                  <div className="grid gap-2 md:grid-cols-2">
                    <Input
                      value={exp.title}
                      placeholder="Title"
                      onChange={(e) => {
                        const next = [...content.experience];
                        next[i] = { ...exp, title: e.target.value };
                        update({ experience: next });
                      }}
                    />
                    <Input
                      value={exp.company}
                      placeholder="Company"
                      onChange={(e) => {
                        const next = [...content.experience];
                        next[i] = { ...exp, company: e.target.value };
                        update({ experience: next });
                      }}
                    />
                    <Input
                      value={exp.start}
                      placeholder="Start (e.g. Jan 2022)"
                      onChange={(e) => {
                        const next = [...content.experience];
                        next[i] = { ...exp, start: e.target.value };
                        update({ experience: next });
                      }}
                    />
                    <Input
                      value={exp.end}
                      placeholder="End (or Present)"
                      onChange={(e) => {
                        const next = [...content.experience];
                        next[i] = { ...exp, end: e.target.value };
                        update({ experience: next });
                      }}
                    />
                  </div>
                  <Textarea
                    className="mt-2"
                    rows={Math.max(3, exp.bullets.length + 1)}
                    value={exp.bullets.join("\n")}
                    onChange={(e) => {
                      const next = [...content.experience];
                      next[i] = { ...exp, bullets: e.target.value.split("\n").map((s) => s) };
                      update({ experience: next });
                    }}
                    placeholder="One bullet per line"
                  />
                  <div className="mt-2 flex justify-end">
                    <button
                      className="text-xs text-destructive hover:underline"
                      onClick={() => {
                        update({ experience: content.experience.filter((_, j) => j !== i) });
                      }}
                    >
                      Remove role
                    </button>
                  </div>
                </div>
              ))}
              <Button
                variant="secondary"
                onClick={() =>
                  update({
                    experience: [
                      ...content.experience,
                      { company: "", title: "", location: "", start: "", end: "", bullets: [] },
                    ],
                  })
                }
              >
                + Add experience
              </Button>
            </div>
          </Section>

          <Section title="Projects">
            <div className="space-y-3">
              {content.projects.map((p, i) => (
                <div key={i} className="rounded-xl border border-border bg-background p-4 space-y-2">
                  <div className="grid gap-2 md:grid-cols-2">
                    <Input
                      value={p.name}
                      placeholder="Project name"
                      onChange={(e) => {
                        const next = [...content.projects];
                        next[i] = { ...p, name: e.target.value };
                        update({ projects: next });
                      }}
                    />
                    <Input
                      value={p.link}
                      placeholder="Link (optional)"
                      onChange={(e) => {
                        const next = [...content.projects];
                        next[i] = { ...p, link: e.target.value };
                        update({ projects: next });
                      }}
                    />
                  </div>
                  <Textarea
                    rows={2}
                    value={p.description}
                    placeholder="Short description"
                    onChange={(e) => {
                      const next = [...content.projects];
                      next[i] = { ...p, description: e.target.value };
                      update({ projects: next });
                    }}
                  />
                  <Textarea
                    rows={Math.max(2, p.bullets.length + 1)}
                    value={p.bullets.join("\n")}
                    placeholder="One bullet per line"
                    onChange={(e) => {
                      const next = [...content.projects];
                      next[i] = { ...p, bullets: e.target.value.split("\n") };
                      update({ projects: next });
                    }}
                  />
                  <div className="flex justify-end">
                    <button
                      className="text-xs text-destructive hover:underline"
                      onClick={() => update({ projects: content.projects.filter((_, j) => j !== i) })}
                    >
                      Remove project
                    </button>
                  </div>
                </div>
              ))}
              <Button
                variant="secondary"
                onClick={() =>
                  update({
                    projects: [
                      ...content.projects,
                      { name: "", description: "", bullets: [], link: "" },
                    ],
                  })
                }
              >
                + Add project
              </Button>
            </div>
          </Section>

          <Section title="Skills">
            <Textarea
              rows={2}
              value={content.skills.join(", ")}
              onChange={(e) =>
                update({
                  skills: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                })
              }
              placeholder="Comma-separated list"
            />
          </Section>


          <Section title="Education">
            <div className="space-y-3">
              {content.education.map((ed, i) => (
                <div key={i} className="grid gap-2 rounded-xl border border-border bg-background p-4 md:grid-cols-2">
                  <Input value={ed.school} placeholder="School" onChange={(e) => {
                    const next = [...content.education]; next[i] = { ...ed, school: e.target.value };
                    update({ education: next });
                  }} />
                  <Input value={ed.degree} placeholder="Degree" onChange={(e) => {
                    const next = [...content.education]; next[i] = { ...ed, degree: e.target.value };
                    update({ education: next });
                  }} />
                </div>
              ))}
              <Button
                variant="secondary"
                onClick={() => update({ education: [...content.education, { school: "", degree: "", field: "", start: "", end: "", details: "" }] })}
              >
                + Add education
              </Button>
            </div>
          </Section>
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-brand" />
              <h3 className="font-display text-lg font-semibold">ATS analysis</h3>
            </div>
            <Label className="mb-1.5 text-xs">Analyze against (optional)</Label>
            <Select value={selectedJob || "none"} onValueChange={(v) => setSelectedJob(v === "none" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="No specific job" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No specific job</SelectItem>
                {(jobs ?? []).map((j) => (
                  <SelectItem key={j.id} value={j.id}>
                    {j.title} · {j.company}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <AiButton
              className="mt-3 w-full"
              onClick={() => atsMut.mutate()}
              disabled={atsMut.isPending}
            >
              {atsMut.isPending ? "Analyzing…" : "Run ATS analysis"}
            </AiButton>
            {(jobs ?? []).length === 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                <Briefcase className="mr-1 inline h-3 w-3" />
                <Link to="/jobs" className="underline">Save a job</Link> to compare against a specific role.
              </p>
            )}

            {report && (
              <div className="mt-5 space-y-4">
                <div className="flex items-center justify-between">
                  <ScoreRing value={report.overall_score} label="overall" />
                  <div className="space-y-1 text-xs">
                    <Mini name="Keywords" value={report.breakdown.keyword_match} />
                    <Mini name="Impact" value={report.breakdown.impact} />
                    <Mini name="Clarity" value={report.breakdown.clarity} />
                    <Mini name="ATS format" value={report.breakdown.ats_formatting} />
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">{report.summary}</p>
                {report.missing_keywords.length > 0 && (
                  <div>
                    <div className="mb-1.5 text-xs uppercase tracking-wider text-muted-foreground">Missing keywords</div>
                    <div className="flex flex-wrap gap-1.5">
                      {report.missing_keywords.slice(0, 12).map((k) => (
                        <span key={k} className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">{k}</span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  {report.suggestions.map((s, i) => (
                    <details key={i} className="rounded-lg border border-border bg-background p-3 text-sm">
                      <summary className="flex cursor-pointer items-center gap-2 font-medium">
                        <SeverityIcon level={s.severity} />
                        <span>{s.title}</span>
                        <span className="ml-auto text-xs text-muted-foreground">{s.section}</span>
                      </summary>
                      <p className="mt-2 text-muted-foreground">{s.rationale}</p>
                      {s.before && (
                        <div className="mt-2 rounded bg-destructive/10 p-2 text-xs text-destructive line-through">
                          {s.before}
                        </div>
                      )}
                      {s.after && (
                        <div className="mt-1 rounded bg-success/10 p-2 text-xs text-success-foreground">
                          {s.after}
                        </div>
                      )}
                    </details>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

function Mini({ name, value }: { name: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 text-muted-foreground">{name}</span>
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-brand" style={{ width: `${value}%` }} />
      </div>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function SeverityIcon({ level }: { level: "info" | "warn" | "critical" }) {
  if (level === "critical") return <AlertTriangle className="h-4 w-4 text-destructive" />;
  if (level === "warn") return <AlertTriangle className="h-4 w-4 text-warning" />;
  if (level === "info") return <Info className="h-4 w-4 text-muted-foreground" />;
  return <CheckCircle2 className="h-4 w-4 text-success" />;
}

type JobLite = { id: string; title: string; company: string };

function TailorButton({ resumeId, jobs }: { resumeId: string; jobs: JobLite[] }) {
  const tailor = useServerFn(tailorResume);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [jobId, setJobId] = useState("");
  const [result, setResult] = useState<TailorResult | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      tailor({ data: { resume_id: resumeId, job_id: jobId, save_as_version: true } }),
    onSuccess: (res) => {
      setResult(res.result);
      qc.invalidateQueries({ queryKey: ["resume", resumeId] });
      toast.success("Tailored version saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => { setOpen(v); if (!v) { setResult(null); setJobId(""); } }}
    >
      <Button variant="secondary" onClick={() => setOpen(true)} disabled={!jobs.length}>
        <Wand2 className="mr-1 h-4 w-4" /> Tailor to job
      </Button>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Tailor this resume to a job</DialogTitle>
        </DialogHeader>
        {!result ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              AI will rewrite your summary and bullets to mirror the role&apos;s language —
              without inventing anything — and save it as a new version.
            </p>
            <div>
              <Label className="mb-1.5 text-xs">Target job</Label>
              <Select value={jobId} onValueChange={setJobId}>
                <SelectTrigger><SelectValue placeholder="Pick a saved job" /></SelectTrigger>
                <SelectContent>
                  {jobs.map((j) => (
                    <SelectItem key={j.id} value={j.id}>{j.title} · {j.company}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <section>
              <h4 className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">Rewritten summary</h4>
              <p className="rounded-lg bg-accent p-3 text-sm">{result.summary || "(unchanged)"}</p>
            </section>
            {result.change_log.length > 0 && (
              <section>
                <h4 className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">What changed</h4>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {result.change_log.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              </section>
            )}
            {result.emphasized_skills.length > 0 && (
              <section>
                <h4 className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">Emphasized skills</h4>
                <div className="flex flex-wrap gap-1.5">
                  {result.emphasized_skills.map((s) => (
                    <span key={s} className="rounded-full bg-brand-muted px-2 py-0.5 text-xs text-brand">{s}</span>
                  ))}
                </div>
              </section>
            )}
            <p className="text-xs text-muted-foreground">
              Saved as a new version. Open it from the resume history to use it for an application.
            </p>
          </div>
        )}
        <DialogFooter>
          {!result ? (
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <AiButton onClick={() => mutation.mutate()} disabled={!jobId || mutation.isPending}>
                {mutation.isPending ? "Tailoring…" : "Tailor with AI"}
              </AiButton>
            </>
          ) : (
            <Button onClick={() => setOpen(false)}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
