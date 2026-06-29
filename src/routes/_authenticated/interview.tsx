import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  MessagesSquare, Send, Sparkles, RefreshCcw, Mic, MicOff, Volume2, VolumeX, Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/app/empty-state";
import { AiButton } from "@/components/app/ai-button";
import { listJobs, getJob } from "@/lib/jobs.functions";
import { listResumes, getResume } from "@/lib/resumes.functions";
import { resumeContentSchema } from "@/lib/ai/schemas";
import { useVoiceInterview } from "@/hooks/use-voice-interview";

export const Route = createFileRoute("/_authenticated/interview")({
  head: () => ({ meta: [{ title: "Interview prep · CareerOS" }] }),
  component: InterviewPage,
});

type Mode = "behavioral" | "technical" | "mixed";

function InterviewPage() {
  const fetchJobs = useServerFn(listJobs);
  const fetchResumes = useServerFn(listResumes);
  const fetchJob = useServerFn(getJob);
  const fetchResume = useServerFn(getResume);

  const { data: jobs } = useQuery({ queryKey: ["jobs"], queryFn: () => fetchJobs() });
  const { data: resumes } = useQuery({ queryKey: ["resumes"], queryFn: () => fetchResumes() });

  const [jobId, setJobId] = useState<string>("");
  const [resumeId, setResumeId] = useState<string>("");
  const [mode, setMode] = useState<Mode>("mixed");
  const [started, setStarted] = useState(false);

  const { data: job } = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => fetchJob({ data: { id: jobId } }),
    enabled: !!jobId,
  });
  const { data: resume } = useQuery({
    queryKey: ["resume", resumeId],
    queryFn: () => fetchResume({ data: { id: resumeId } }),
    enabled: !!resumeId,
  });

  const resumeSummary = useMemo(() => {
    if (!resume) return "";
    const parsed = resumeContentSchema.safeParse(resume.resume.content);
    if (!parsed.success) return "";
    const c = parsed.data;
    return [
      c.summary,
      "Top skills: " + c.skills.slice(0, 20).join(", "),
      "Recent roles: " +
        c.experience.slice(0, 3).map((e) => `${e.title} @ ${e.company}`).join("; "),
    ].filter(Boolean).join("\n");
  }, [resume]);

  const chatContext = useMemo(
    () => ({
      mode,
      job_title: job?.title,
      company: job?.company,
      job_description: job?.description?.slice(0, 6000),
      resume_summary: resumeSummary,
    }),
    [mode, job, resumeSummary],
  );

  const { messages, sendMessage, status, setMessages, error } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat/interview",
      prepareSendMessagesRequest: ({ messages }) => ({
        body: { messages, context: chatContext },
      }),
    }),
  });

  const [input, setInput] = useState("");
  const [voiceOn, setVoiceOn] = useState(false);
  const sending = status === "submitted" || status === "streaming";
  const voice = useVoiceInterview();
  const spokenIdsRef = useRef<Set<string>>(new Set());

  // Auto-speak new assistant messages when voice mode is on and streaming has settled.
  useEffect(() => {
    if (!voiceOn) return;
    if (sending) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return;
    if (spokenIdsRef.current.has(last.id)) return;
    const text = last.parts
      .map((p) => (p.type === "text" ? p.text : ""))
      .join(" ")
      .replace(/[*_`#>]/g, "")
      .trim();
    if (!text) return;
    spokenIdsRef.current.add(last.id);
    void voice.speak(text);
  }, [messages, sending, voiceOn, voice]);

  const onSend = () => {
    const text = input.trim();
    if (!text || sending) return;
    sendMessage({ text });
    setInput("");
  };

  const onMicDown = async () => {
    if (sending || voice.state === "transcribing") return;
    voice.stopSpeaking();
    await voice.startRecording();
  };
  const onMicUp = async () => {
    if (voice.state !== "recording") return;
    const text = await voice.stopAndTranscribe();
    if (text) sendMessage({ text });
  };

  const startSession = () => {
    setMessages([]);
    setStarted(true);
    sendMessage({
      text: `Please begin the mock interview. Start with one warmup question${
        job ? ` for the ${job.title} role at ${job.company}` : ""
      }.`,
    });
  };

  if (!started) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <h1 className="font-display text-3xl font-semibold tracking-tight">Interview prep</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Run a realistic mock interview with feedback after every answer.
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label className="mb-1.5 text-xs">Target job (optional)</Label>
              <Select value={jobId || "none"} onValueChange={(v) => setJobId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Generic interview" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Generic interview</SelectItem>
                  {(jobs ?? []).map((j) => (
                    <SelectItem key={j.id} value={j.id}>{j.title} · {j.company}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 text-xs">Use resume context (optional)</Label>
              <Select value={resumeId || "none"} onValueChange={(v) => setResumeId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="No resume" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No resume</SelectItem>
                  {(resumes ?? []).map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label className="mb-1.5 text-xs">Interview mode</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="behavioral">Behavioral</SelectItem>
                  <SelectItem value="technical">Technical</SelectItem>
                  <SelectItem value="mixed">Mixed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-5 flex justify-end">
            <AiButton onClick={startSession}>
              <Sparkles className="mr-1 h-4 w-4" /> Start mock interview
            </AiButton>
          </div>
        </div>

        {!jobs?.length && (
          <p className="mt-3 text-xs text-muted-foreground">
            Tip: save a job description to get questions tailored to that role.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-3xl flex-col">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-semibold truncate">
            {job ? `${job.title} · ${job.company}` : "Mock interview"}
          </h1>
          <p className="text-xs text-muted-foreground capitalize">
            {mode} mode
            {voice.state !== "idle" && voice.state !== "error" && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium">
                {voice.state === "recording" && <><Mic className="h-3 w-3" /> Listening…</>}
                {voice.state === "transcribing" && <>Transcribing…</>}
                {voice.state === "speaking" && <><Volume2 className="h-3 w-3" /> Speaking…</>}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            {voiceOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">Voice</span>
            <Switch
              checked={voiceOn}
              onCheckedChange={(v) => {
                setVoiceOn(v);
                if (!v) voice.stopSpeaking();
              }}
            />
          </label>
          <Button variant="ghost" size="sm" onClick={() => { setStarted(false); setMessages([]); voice.stopSpeaking(); spokenIdsRef.current.clear(); }}>
            <RefreshCcw className="mr-1 h-3.5 w-3.5" /> New session
          </Button>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-soft">
        {messages.length === 0 && (
          <EmptyState
            icon={<MessagesSquare className="h-5 w-5" />}
            title="Starting your session…"
            description="The first question will appear in a moment."
          />
        )}
        {messages.map((m: UIMessage) => (
          <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                m.role === "user"
                  ? "max-w-[80%] rounded-2xl rounded-br-sm bg-brand px-4 py-2.5 text-sm text-brand-foreground"
                  : "max-w-[85%] rounded-2xl rounded-bl-sm bg-accent px-4 py-3 text-sm"
              }
            >
              {m.parts.map((p, i) =>
                p.type === "text" ? (
                  <p key={i} className="whitespace-pre-wrap leading-relaxed">{p.text}</p>
                ) : null,
              )}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm bg-accent px-4 py-3 text-sm text-muted-foreground">
              <span className="inline-flex gap-1">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:120ms]" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:240ms]" />
              </span>
            </div>
          </div>
        )}
        {error && (
          <div className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error.message}
          </div>
        )}
        {voice.error && (
          <div className="flex items-center justify-between rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <span>Voice: {voice.error}</span>
            <button className="underline" onClick={voice.clearError}>dismiss</button>
          </div>
        )}
      </div>

      <div className="mt-3 flex items-end gap-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          rows={2}
          placeholder={voice.state === "recording" ? "Listening… release to send" : "Type your answer, or hold the mic to speak…"}
          disabled={sending || voice.state === "recording" || voice.state === "transcribing"}
        />
        <Button
          variant={voice.state === "recording" ? "destructive" : "secondary"}
          size="icon"
          onMouseDown={onMicDown}
          onMouseUp={onMicUp}
          onMouseLeave={() => { if (voice.state === "recording") void onMicUp(); }}
          onTouchStart={(e) => { e.preventDefault(); void onMicDown(); }}
          onTouchEnd={(e) => { e.preventDefault(); void onMicUp(); }}
          disabled={sending || voice.state === "transcribing"}
          title="Hold to speak"
          aria-label="Hold to speak"
        >
          {voice.state === "recording"
            ? <Square className="h-4 w-4" />
            : voice.state === "transcribing"
              ? <MicOff className="h-4 w-4 animate-pulse" />
              : <Mic className="h-4 w-4" />}
        </Button>
        <Button onClick={onSend} disabled={sending || !input.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
