import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Plus, Upload, Trash2 } from "lucide-react";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/app/empty-state";
import {
  listResumes,
  createResume,
  parseResumeText,
  parseResumePdf,
  deleteResume,
} from "@/lib/resumes.functions";
import { toast } from "sonner";

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the selected PDF"));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Could not read the selected PDF"));
        return;
      }
      resolve(result.split(",", 2)[1] ?? "");
    };
    reader.readAsDataURL(file);
  });
}

export const Route = createFileRoute("/_authenticated/resumes/")({
  head: () => ({ meta: [{ title: "Resumes · CareerOS" }] }),
  component: ResumesIndex,
});

function ResumesIndex() {
  const fetchList = useServerFn(listResumes);
  const create = useServerFn(createResume);
  const parseText = useServerFn(parseResumeText);
  const parsePdf = useServerFn(parseResumePdf);
  const del = useServerFn(deleteResume);
  const qc = useQueryClient();
  const navigate = useNavigate();


  const { data: resumes, isLoading } = useQuery({
    queryKey: ["resumes"],
    queryFn: () => fetchList(),
  });

  const createMut = useMutation({
    mutationFn: () => create({ data: { title: "Untitled Resume" } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resumes"] }),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resumes"] }),
  });

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("paste");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const handleImport = async () => {
    if (!title.trim()) return toast.error("Give your resume a title");
    setBusy(true);
    try {
      if (tab === "paste") {
        if (text.trim().length < 50) throw new Error("Paste at least a paragraph of resume text");
        await parseText({ data: { title, text } });
      } else {
        if (!file) throw new Error("Choose a PDF file");
        if (file.size > 6_000_000) throw new Error("PDF must be under 6 MB");
        const b64 = await fileToBase64(file);
        await parsePdf({ data: { title, filename: file.name, data_base64: b64 } });
      }
      toast.success("Resume parsed — view your profile");
      qc.invalidateQueries({ queryKey: ["resumes"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
      setOpen(false);
      setText(""); setFile(null); setTitle("");
      navigate({ to: "/profile" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };


  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Resumes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload, parse, and tailor your resumes for every role.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => createMut.mutate()} disabled={createMut.isPending}>
            <Plus className="mr-1 h-4 w-4" /> Blank
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Upload className="mr-1 h-4 w-4" /> Import
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Import a resume</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label className="mb-1.5 text-xs">Title</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. SWE — generic" />
                </div>
                <Tabs value={tab} onValueChange={setTab}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="paste">Paste text</TabsTrigger>
                    <TabsTrigger value="pdf">PDF</TabsTrigger>
                  </TabsList>
                  <TabsContent value="paste" className="mt-3">
                    <Textarea
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder="Paste your resume content here…"
                      rows={10}
                    />
                  </TabsContent>
                  <TabsContent value="pdf" className="mt-3">
                    <Input
                      type="file"
                      accept="application/pdf"
                      onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    />
                    <p className="mt-2 text-xs text-muted-foreground">PDF up to 6 MB. We extract structure with AI.</p>
                  </TabsContent>
                </Tabs>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={handleImport} disabled={busy}>{busy ? "Parsing…" : "Import & parse"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : !resumes || resumes.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-5 w-5" />}
          title="No resumes yet"
          description="Import a PDF or paste your existing resume — your copilot starts here."
          action={<Button onClick={() => setOpen(true)}><Upload className="mr-1 h-4 w-4" /> Import resume</Button>}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {resumes.map((r) => (
            <div key={r.id} className="group relative rounded-2xl border border-border bg-card p-5 shadow-soft transition hover:border-brand/50">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-brand-muted text-brand">
                <FileText className="h-4 w-4" />
              </div>
              <Link to="/resumes/$resumeId" params={{ resumeId: r.id }} className="font-display text-base font-semibold hover:underline">
                {r.title}
              </Link>
              <div className="mt-1 text-xs text-muted-foreground">
                {r.source === "upload" ? "Imported" : "Builder"} ·{" "}
                Updated {new Date(r.updated_at).toLocaleDateString()}
              </div>
              <button
                onClick={() => {
                  if (confirm("Delete this resume?")) delMut.mutate(r.id);
                }}
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
