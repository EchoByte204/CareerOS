import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, FileText, Loader2, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/app/empty-state";
import { listResumes } from "@/lib/resumes.functions";
import { listJobs } from "@/lib/jobs.functions";
import {
  generateCoverLetter,
  listCoverLetters,
  getCoverLetter,
  deleteCoverLetter,
} from "@/lib/cover-letters.functions";

export const Route = createFileRoute("/_authenticated/cover-letters")({
  component: CoverLettersPage,
});

function CoverLettersPage() {
  const qc = useQueryClient();
  const listResumesFn = useServerFn(listResumes);
  const listJobsFn = useServerFn(listJobs);
  const listFn = useServerFn(listCoverLetters);
  const getFn = useServerFn(getCoverLetter);
  const genFn = useServerFn(generateCoverLetter);
  const delFn = useServerFn(deleteCoverLetter);

  const resumes = useQuery({ queryKey: ["resumes"], queryFn: () => listResumesFn({}) });
  const jobs = useQuery({ queryKey: ["jobs"], queryFn: () => listJobsFn({}) });
  const letters = useQuery({ queryKey: ["cover-letters"], queryFn: () => listFn({}) });

  const [resumeId, setResumeId] = useState<string>("");
  const [jobId, setJobId] = useState<string>("");
  const [tone, setTone] = useState<"professional" | "warm" | "direct">("professional");
  const [length, setLength] = useState<"short" | "medium" | "long">("medium");
  const [recipient, setRecipient] = useState("Hiring Manager");
  const [notes, setNotes] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = useQuery({
    queryKey: ["cover-letter", selectedId],
    queryFn: () => getFn({ data: { id: selectedId! } }),
    enabled: !!selectedId,
  });

  const generate = useMutation({
    mutationFn: () =>
      genFn({
        data: {
          resume_id: resumeId,
          job_id: jobId,
          tone,
          length,
          recipient,
          extra_notes: notes || undefined,
        },
      }),
    onSuccess: (row) => {
      toast.success("Cover letter generated");
      setSelectedId(row.id);
      qc.invalidateQueries({ queryKey: ["cover-letters"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      setSelectedId(null);
      qc.invalidateQueries({ queryKey: ["cover-letters"] });
      toast.success("Deleted");
    },
  });

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const canGenerate = !!resumeId && !!jobId && !generate.isPending;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Cover Letters</h1>
        <p className="text-sm text-muted-foreground">
          Generate a tailored cover letter as ready-to-paste Overleaf LaTeX (moderncv classic, green).
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Generate</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Resume</Label>
              <Select value={resumeId} onValueChange={setResumeId}>
                <SelectTrigger><SelectValue placeholder="Select a resume" /></SelectTrigger>
                <SelectContent>
                  {(resumes.data ?? []).map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Job</Label>
              <Select value={jobId} onValueChange={setJobId}>
                <SelectTrigger><SelectValue placeholder="Select a job" /></SelectTrigger>
                <SelectContent>
                  {(jobs.data ?? []).map((j) => (
                    <SelectItem key={j.id} value={j.id}>
                      {j.company} — {j.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tone</Label>
                <Select value={tone} onValueChange={(v) => setTone(v as typeof tone)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="professional">Professional</SelectItem>
                    <SelectItem value="warm">Warm</SelectItem>
                    <SelectItem value="direct">Direct</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Length</Label>
                <Select value={length} onValueChange={(v) => setLength(v as typeof length)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="short">Short (~180w)</SelectItem>
                    <SelectItem value="medium">Medium (~280w)</SelectItem>
                    <SelectItem value="long">Long (~380w)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Recipient</Label>
              <Input value={recipient} onChange={(e) => setRecipient(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Textarea
                rows={3}
                placeholder="e.g. emphasize backend experience, mention referral from X"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <Button className="w-full" disabled={!canGenerate} onClick={() => generate.mutate()}>
              {generate.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generating…</>
              ) : (
                <><Sparkles className="mr-2 h-4 w-4" />Generate LaTeX</>
              )}
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {selected.data ? (
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
                <div>
                  <CardTitle className="text-base">{selected.data.title}</CardTitle>
                  <div className="mt-1 flex gap-1.5">
                    <Badge variant="secondary">{selected.data.tone}</Badge>
                    <Badge variant="secondary">{selected.data.length}</Badge>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => copy(selected.data!.latex)}>
                    <Copy className="mr-1.5 h-4 w-4" />Copy LaTeX
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => remove.mutate(selected.data!.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <p className="mb-2 text-xs text-muted-foreground">
                  Paste this into a new Overleaf project (compiler: pdfLaTeX). Requires the
                  <code className="mx-1">moderncv</code> package, which Overleaf includes by default.
                </p>
                <pre className="max-h-[560px] overflow-auto rounded-md border bg-muted/40 p-3 text-xs leading-relaxed">
                  <code>{selected.data.latex}</code>
                </pre>
                {selected.data.body_text ? (
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer text-muted-foreground">Plain text body</summary>
                    <pre className="mt-2 whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-xs">
                      {selected.data.body_text}
                    </pre>
                  </details>
                ) : null}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-10">
                <EmptyState
                  icon={<FileText className="h-5 w-5" />}
                  title="No cover letter selected"
                  description="Pick a resume and job, then click Generate. The result appears here as LaTeX you can paste into Overleaf."
                />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">History</CardTitle>
            </CardHeader>
            <CardContent>
              {letters.data && letters.data.length > 0 ? (
                <ul className="divide-y">
                  {letters.data.map((l) => (
                    <li key={l.id}>
                      <button
                        className="flex w-full items-center justify-between py-2.5 text-left text-sm hover:bg-accent/40"
                        onClick={() => setSelectedId(l.id)}
                      >
                        <span>
                          <span className="font-medium">{l.title}</span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {l.tone} · {l.length}
                          </span>
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(l.created_at).toLocaleDateString()}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No cover letters yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
