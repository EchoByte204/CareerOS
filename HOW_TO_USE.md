# CareerOS — How To Use

A complete, end-to-end guide to running and using **CareerOS**, the AI Career Operating System built in this project. It covers everything that has been shipped, the prerequisites to run it, configuration, and a feature-by-feature walkthrough.

---

## 1. What is CareerOS?

CareerOS is a production-style "AI Career Operating System" that combines:

- **Resume OS** — upload, parse, edit, version, tailor, and ATS-analyze resumes.
- **Job Discovery & Tracking** — search jobs (Adzuna), save JDs, manage applications in a Kanban pipeline.
- **AI Interview Coach** — streaming text-based mock interviews **plus voice mode** (push-to-talk, local Whisper STT + local TTS).
- **Skill Graph** — canonical skills auto-extracted from resumes/JDs with relationships and gap analysis, drained by a durable background queue.
- **Learning Plans** — ranked courses, projects, books, videos, and certifications per missing skill.
- **Cover Letter Generator** — resume + JD → tailored, Overleaf-ready LaTeX (`moderncv` classic/green) saved per user.
- **Automation Engine** — moving a job into "Applied" automatically tailors your resume and drafts a cover letter in the background.
- **Job Match Scoring** — weighted score of your skill graph against each saved JD, surfaced on the dashboard.
- **Career Copilot Dashboard** — proactive recommendations and KPIs.
- **Admin Console** — queue health, failed jobs, retries, first-user-claims-admin.

All AI inference runs against a **local LLM** (Ollama / LM Studio / llama.cpp / vLLM) via an OpenAI-compatible endpoint — nothing is sent to a hosted model provider.

---

## 2. Tech Stack

| Layer | Tech |
|---|---|
| Framework | TanStack Start v1 (React 19, SSR, file-based routes) |
| Build | Vite 7 |
| Runtime target | Cloudflare Worker (edge) |
| Styling | Tailwind CSS v4 (semantic tokens, dark mode) + shadcn/ui |
| Backend | Lovable Cloud (Supabase: Postgres + Auth + Storage + RLS + pg_cron + pg_net + pg_trgm) |
| LLM | Local OpenAI-compatible API (Vercel AI SDK + `@ai-sdk/openai-compatible`) |
| STT (voice) | Local Whisper (whisper.cpp / faster-whisper) — OpenAI-compatible |
| TTS (voice) | Local Piper / Kokoro / openedai-speech — OpenAI-compatible |
| PDF parsing | `unpdf` (Worker-safe) |
| Job feed | Adzuna API |
| Auth | Email/password + Google OAuth |

---

## 3. Prerequisites

Before running the app you need:

1. **Node.js 20+** and **Bun** (package manager used by the project).
2. **A local LLM server** exposing an OpenAI-compatible `/v1/chat/completions` endpoint. Any of:
   - **Ollama** — `ollama run qwen2.5:7b` (recommended) or `llama3.1:8b`
   - **LM Studio** — start the local server on port 1234
   - **llama.cpp server** — port 8080
   - **vLLM** — port 8000
3. **(Optional) Local Whisper STT + Local TTS** — only needed for voice interview mode.
4. **(Optional) Adzuna API credentials** for job discovery — already configured as Cloud secrets (`ADZUNA_APP_ID`, `ADZUNA_APP_KEY`).
5. **Lovable Cloud** project — already provisioned. All Supabase plumbing (DB, RLS, storage bucket `resumes`, triggers, pg_cron jobs) is set up via migrations.

You do **not** need any hosted LLM API key.

---

## 4. Configuration

The app reads configuration from `.env`. Defaults work for Ollama on localhost.

```bash
# Cloud (auto-generated, do not edit)
SUPABASE_URL=...
SUPABASE_PUBLISHABLE_KEY=...
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...

# Local LLM (override per your setup)
LOCAL_LLM_BASE_URL=http://127.0.0.1:11434/v1   # Ollama default — prefer 127.0.0.1 over localhost on Windows
LOCAL_LLM_MODEL=qwen2.5:7b
LOCAL_LLM_MODEL_SMART=qwen2.5:7b               # optional; bigger model for ATS/tailoring
# LOCAL_LLM_API_KEY=local                       # optional; most servers ignore

# Voice interview (optional — only required for /interview voice mode)
LOCAL_STT_BASE_URL=http://127.0.0.1:8080/v1    # whisper.cpp server default
LOCAL_STT_MODEL=whisper-1
LOCAL_TTS_BASE_URL=http://127.0.0.1:8000/v1    # Piper / openedai-speech default
LOCAL_TTS_MODEL=tts-1
LOCAL_TTS_VOICE=alloy
```

See `.env.example` for ports of other local servers.

> **Important:** when running on Cloudflare Workers/edge, `localhost` is not reachable from the deployed Worker. To use a local LLM in production, expose your local server via a tunnel (Cloudflare Tunnel, ngrok, tailscale-funnel) and set `LOCAL_LLM_BASE_URL` to that public URL. For local development this is not needed — `bun run dev` runs the server on your machine.

---

## 5. Running the app

```bash
bun install
bun run dev
```

The dev server starts on `http://localhost:8080` (Vite). Open it in a browser.

Make sure your local LLM is running before invoking any AI feature:

```bash
# Ollama example
ollama pull qwen2.5:7b
ollama serve         # starts http://localhost:11434
```

---

## 6. Project Structure

```
src/
├─ routes/                          # File-based routes (TanStack Start)
│  ├─ __root.tsx                    # Root shell, fonts, toaster, error boundary
│  ├─ index.tsx                     # Public landing page
│  ├─ auth.tsx                      # Sign in / sign up (email + Google)
│  ├─ _authenticated/               # Gated subtree (redirects to /auth if signed out)
│  │  ├─ route.tsx                  # Auth gate + AppShell (sidebar + topbar)
│  │  ├─ onboarding.tsx             # First-time profile wizard
│  │  ├─ dashboard.tsx              # Career Copilot — recs, KPIs, top job matches
│  │  ├─ resumes/index.tsx          # Resume list + upload
│  │  ├─ resumes/$resumeId.tsx      # Resume detail / builder / ATS / tailor
│  │  ├─ jobs/index.tsx             # Saved JDs
│  │  ├─ jobs/$jobId.tsx            # JD detail
│  │  ├─ discover.tsx               # Adzuna job search
│  │  ├─ applications.tsx           # Kanban pipeline (auto-tailor on Applied)
│  │  ├─ interview.tsx              # Streaming AI interview coach + voice mode
│  │  ├─ skills.tsx                 # Skill graph + gap analysis
│  │  ├─ learning.tsx               # AI learning recommendations
│  │  ├─ cover-letters.tsx          # AI cover letter generator (LaTeX / moderncv)
│  │  ├─ admin.tsx                  # Queue health + role-gated dashboard
│  │  └─ settings.tsx               # Profile + sign out
│  └─ api/
│     ├─ chat.interview.ts                          # Streaming chat (interview)
│     ├─ voice.transcribe.ts                        # WAV → Whisper STT proxy
│     ├─ voice.tts.ts                               # Text → local TTS proxy
│     └─ public/hooks/
│        ├─ process-skill-jobs.ts                   # Skill extraction worker
│        └─ process-automation-jobs.ts              # Auto-tailor / cover-letter worker
│
├─ lib/
│  ├─ ai/
│  │  ├─ gateway.server.ts          # Local LLM client (OpenAI-compatible)
│  │  └─ schemas.ts                 # Zod schemas (resume, JD, ATS, tailor, skills, learning, cover letter)
│  ├─ profiles.functions.ts         # Profile CRUD
│  ├─ resumes.functions.ts          # Upload, parse (unpdf + JSON-mode LLM), versions
│  ├─ jobs.functions.ts             # Paste/URL JD intake + parsing
│  ├─ discover.functions.ts         # Adzuna search + import
│  ├─ ats.functions.ts              # ATS analysis (score + suggestions)
│  ├─ tailor.functions.ts           # Resume tailoring against a JD
│  ├─ applications.functions.ts     # Kanban CRUD + enqueue on "Applied"
│  ├─ copilot.functions.ts          # Proactive recommendations engine
│  ├─ matches.functions.ts          # Weighted job-match scoring
│  ├─ skills.functions.ts           # Skill graph queries + gap
│  ├─ skills.server.ts              # Skill extraction helpers (server-only)
│  ├─ skill-jobs.server.ts          # Skill extraction queue runner
│  ├─ automation-jobs.server.ts     # Automation queue runner (claim + retry)
│  ├─ automation-impl.server.ts     # Tailor + LaTeX cover letter implementations
│  ├─ automation.functions.ts       # Admin queries, claim_admin, isAdmin
│  ├─ learning.functions.ts         # Learning recs generation + persistence
│  └─ cover-letters.functions.ts    # Cover letter LaTeX generation + history
│
├─ hooks/
│  └─ use-voice-interview.ts        # Mic capture (16kHz WAV) + TTS playback
│
├─ components/
│  ├─ app/                          # App-specific UI (AppShell, ScoreRing, AiButton, EmptyState, TailorButton)
│  └─ ui/                           # shadcn/ui primitives
│
├─ integrations/supabase/           # Generated Supabase clients (do not edit)
└─ styles.css                       # Tailwind v4 + design tokens
```

---

## 7. Database Schema (overview)

All tables live in `public`, are RLS-protected to `auth.uid()`, and have explicit GRANTs.

- `profiles` — display name, headline, target roles, locations, seniority, onboarded_at.
- `user_roles` + `app_role` enum + `has_role()` security-definer fn (EXECUTE locked to service_role only).
- `resumes` / `resume_versions` — structured `content_jsonb`, file_path in storage.
- `jobs` — title, company, description, parsed `jd_jsonb`, `external_id`, `external_url`, `salary_*`, `job_source` enum.
- `applications` — kanban status (saved/applied/interview/offer/rejected/withdrawn), linked resume_version.
- `ats_reports` — `(resume_version, job)` keyed scores + suggestions.
- `interview_sessions` — transcript + scorecard.
- `recommendations` — copilot inbox.
- `activity_events` — timeline / analytics.
- **Skill graph**: `skills`, `skill_aliases`, `skill_edges`, `user_skills`, `job_skills` (+ `resolve_skill()` trigram-based fuzzy resolver, seeded skills + edges).
- `skill_extraction_jobs` — durable background queue with `claim_skill_extraction_jobs()` (FOR UPDATE SKIP LOCKED), retries, exponential backoff.
- `automation_jobs` — durable queue for auto-tailor + auto-cover-letter on application status changes (max 3 attempts, exponential backoff). Claimed via `claim_automation_jobs()`.
- `learning_recommendations` — per-user ranked plan items (status: suggested/saved/in_progress/completed).
- `cover_letters` — per-user generated cover letters (metadata, body text, full LaTeX source).

Storage bucket: `resumes` (private, user-scoped).

`pg_cron` runs every minute and POSTs to:
- `/api/public/hooks/process-skill-jobs` — drains skill-extraction queue.
- `/api/public/hooks/process-automation-jobs` — drains automation queue.

Both worker endpoints require the Supabase publishable key in an `apikey` header.

---

## 8. Feature Walkthrough

### 8.1 Sign in / Sign up

Route: `/auth`

- **Email + password** — standard Supabase flow. Anonymous sign-ups disabled.
- **Google OAuth** — pre-configured via Cloud. Redirects back to the app origin.
- After first sign-in, a profile row is auto-created by the `handle_new_user` trigger.

### 8.2 Onboarding

Route: `/onboarding` (auto-redirect on first sign-in)

Collect: display name, headline, target roles, locations, seniority. Sets `profiles.onboarded_at` so the gate stops redirecting.

### 8.3 Dashboard (Career Copilot)

Route: `/dashboard`

- KPIs: resumes, saved jobs, applications, average ATS score.
- **Top job matches** widget — weighted score of your `user_skills` vs each saved JD's `job_skills` (Required=3, Preferred=2, Nice-to-have=1) with skill coverage %.
- **Proactive recommendations** generated by the local LLM, combining profile + resumes + saved jobs + activity events.
- Dismissable cards; recompute on demand.

### 8.4 Resume OS

Routes: `/resumes`, `/resumes/$resumeId`

1. **Upload** a PDF — stored in the `resumes` bucket (user-scoped path).
2. **Parsing pipeline**:
   - `unpdf` extracts text on the edge.
   - The local LLM converts text → structured resume JSON via Zod schema (`resumeContentSchema`), with **forced JSON mode** (`response_format: { type: "json_object" }`) + a corrective retry pass.
3. **Builder** — edit structured fields with a live preview.
4. **Versions** — duplicate, label, revert.
5. **ATS analysis** — pick a JD → produces `overall` score + `breakdown` (keywords / impact / clarity / ats_formatting) + section-level suggestions.
6. **Tailor** — `TailorButton` opens a dialog and streams rewritten summary + bullets aligned to the JD.
7. After save, a **skill extraction job is enqueued** (see 8.10).

### 8.5 Jobs

Routes: `/jobs`, `/jobs/$jobId`

- Paste a JD (text or URL) — the local LLM parses it into structured requirements (`jobDescriptionSchema`).
- Each saved JD enqueues a skill-extraction job.

### 8.6 Discover (Adzuna)

Route: `/discover`

- Search by query + country + remote-only.
- One-click **Save & parse** imports a result into `jobs` (dedup by `external_id`) and triggers JD parsing + skill extraction.

### 8.7 Applications (Kanban) + Automation

Route: `/applications`

Columns: **Saved → Applied → Interview → Offer → Rejected / Withdrawn**. Drag-and-update; each card links back to its job and (optionally) the tailored resume version used.

**Automation on "Applied"**: when a card transitions into `applied`, two background jobs are enqueued into `automation_jobs`:

1. **Auto-tailor** — picks your primary resume and rewrites summary + bullets for the JD; saves a new `resume_versions` row labelled `Tailored — <company>`.
2. **Auto-cover-letter** — generates a `moderncv`-classic LaTeX cover letter for that resume + JD; saves a `cover_letters` row.

Both run via `/api/public/hooks/process-automation-jobs` (cron, 1-minute cadence), claim atomically with `FOR UPDATE SKIP LOCKED`, and retry up to 3 times with exponential backoff. Failures surface in the Admin queue (8.14).

### 8.8 Interview Coach

Route: `/interview`

- Powered by `useChat` (Vercel AI SDK) hitting `/api/chat.interview`.
- Streams from the local LLM acting as an interviewer persona.
- Behavioral or technical mode; STAR-style follow-ups and feedback inline.

#### Voice Interview Mode — shipped (v1)

A voice layer on top of the existing text interview chat — fully local, no hosted speech APIs.

**Flow**

1. Toggle **Voice** on `/interview` → browser prompts for mic permission.
2. **Capture** — `useVoiceInterview` records mic via Web Audio API, downsampled to **16 kHz mono PCM**, encoded as WAV per utterance. v1 = push-to-talk (`onMouseDown` / `onMouseUp` on the mic button).
3. **STT** — WAV is POSTed (multipart) to `/api/voice.transcribe` → local **Whisper** server at `LOCAL_STT_BASE_URL` via OpenAI-compatible `/v1/audio/transcriptions`. Returns transcript text.
4. **LLM** — transcript is fed into the existing `/api/chat.interview` route. Tokens stream back as today.
5. **TTS** — assistant text is POSTed to `/api/voice.tts` → local engine (`LOCAL_TTS_BASE_URL`, e.g. Piper / openedai-speech) via `/v1/audio/speech`. Audio streams back and plays through an `AudioContext`.
6. **State pill** — UI shows **Listening / Transcribing / Thinking / Speaking** with cancellable playback.

**Components shipped**

- **Env**: `LOCAL_STT_BASE_URL`, `LOCAL_STT_MODEL`, `LOCAL_TTS_BASE_URL`, `LOCAL_TTS_MODEL`, `LOCAL_TTS_VOICE`.
- **Server routes**: `src/routes/api/voice.transcribe.ts`, `src/routes/api/voice.tts.ts`.
- **Client hook** `src/hooks/use-voice-interview.ts` — WebAudio capture, downsample + WAV encoder, `speak()` / `stopSpeaking()` playback queue.
- **UI** on `/interview` — voice toggle, push-to-talk mic, status indicators.

**Latency budget (local, CPU)**

| Stage | Time |
|---|---|
| Mic stop → STT done (5 s clip, `small.en`) | 300–800 ms |
| First LLM token | 200–600 ms |
| First TTS audio chunk | 200–500 ms |
| **Total time-to-first-audio** | **~1–2 s** (conversational) |

**Planned (v2)**

- VAD auto-segmentation (RMS + ~600 ms trailing silence).
- Barge-in (cancel TTS when mic detects speech).
- Audio persistence to a private `interviews` storage bucket; transcript playback.
- Interviewer voice picker per role.

### 8.9 Skill Graph

Route: `/skills`

- **Coverage ring**: % of required skills covered for a target JD, weighted by importance.
- **Have / Missing chips** with proficiency.
- **Bridging paths**: e.g. *React → JavaScript → TypeScript* using `skill_edges`.
- **Extraction queue panel**: live status of background skill-extraction jobs; auto-invalidates graph/gap data when jobs finish.

### 8.10 Background Skill Extraction (queue)

- On every resume/JD save, `enqueueSkillExtraction(...)` inserts a row in `skill_extraction_jobs`.
- A worker route (`/api/public/hooks/process-skill-jobs`) claims jobs atomically (`FOR UPDATE SKIP LOCKED`), calls the local LLM to extract skills, normalizes via `resolve_skill()` (trigram fuzzy match against `skills` + `skill_aliases`), and writes to `user_skills` / `job_skills`.
- Retries up to 4 times with exponential backoff.
- Triggered by `pg_cron` every minute, plus manual trigger from the Skills page.

### 8.11 Learning Recommendations

Route: `/learning`

- Pick a target job (or "All saved jobs").
- Click **Generate plan** — the local LLM produces ranked items: courses, projects, books, videos, certifications.
- Each item carries provider, level, duration, cost, rationale, and 0–100 impact score.
- Persisted in `learning_recommendations`; dedupe-replaced per scope on regeneration.
- Move items through **Suggested → Saved → In progress → Completed**, or delete.

### 8.12 Cover Letters

Route: `/cover-letters`

- Pick a **resume** + **job**, choose **tone** (professional / enthusiastic / concise / warm) and **length** (short / medium / long).
- The local LLM generates a complete, compilable **LaTeX document** based on the `moderncv` classic (green) template — header, body, closing, signature.
- One-click **Copy LaTeX** → paste into Overleaf and compile to PDF.
- All generations persist in `cover_letters` (history per user); previous letters remain accessible.
- Also generated automatically when an application moves to "Applied" (see 8.7).

### 8.13 Settings

Route: `/settings`

Edit profile, sign out, danger zone.

### 8.14 Admin Console

Route: `/admin` (visible in the sidebar only to users with the `admin` role)

- **Claim admin** — first-user-claims-admin button. Backed by `claim_admin_if_none(_caller uuid)` which is `SECURITY DEFINER`, EXECUTE granted **only to `service_role`**, and called from a server function that validates the caller via `requireSupabaseAuth`.
- **Queue health** — counts of pending / processing / failed jobs in both `skill_extraction_jobs` and `automation_jobs`.
- **Recent failures** — last 10 failed rows from each queue with last error message.
- **Retry** — re-schedule a failed job (resets `status='pending'`, `scheduled_at=now()`).

---

## 9. AI Layer Details

- **Client**: `src/lib/ai/gateway.server.ts` builds an OpenAI-compatible client via `createOpenAICompatible` from `@ai-sdk/openai-compatible`, plus a raw `gatewayChatCompletion()` helper for forced JSON mode.
- **Default model**: `LOCAL_LLM_MODEL` (e.g. `qwen2.5:7b`).
- **Smart model**: `LOCAL_LLM_MODEL_SMART` used for ATS deep analysis & tailoring; falls back to the default.
- **Structured outputs**: parsing uses `gatewayChatCompletion` with `response_format: { type: "json_object" }` + Zod validation; scoring/tailoring uses `generateObject`. Schemas in `src/lib/ai/schemas.ts`:
  - `resumeContentSchema`, `jobDescriptionSchema`, `atsReportSchema`, `tailorResultSchema`, `skillExtractionSchema`, `learningRecommendationsSchema`, `recommendationSchema`, cover-letter LaTeX prompt.
- **Streaming**: interview chat uses `streamText` + AI SDK `useChat`.
- **Resume parser**: 2-attempt retry loop with a corrective prompt; throws a clear error on failure instead of saving an empty resume; temperature 0.1 for determinism.

> If your local model is small (≤7B), it may struggle with strict JSON schemas. Prefer `qwen2.5:7b-instruct` or larger; set `LOCAL_LLM_MODEL_SMART` to a 14B+ model for tailoring.

---

## 10. Security

- **RLS** enabled on every user table; policies scoped to `auth.uid()`.
- **GRANTs** present for `authenticated` and `service_role` on every public table.
- `has_role()`, `handle_new_user()`, and `claim_admin_if_none()` are `SECURITY DEFINER` with EXECUTE revoked from `PUBLIC`/`anon`/`authenticated`. They are callable only via triggers or the service role, with caller identity validated server-side.
- Resume files are private and storage-pathed by user id.
- `/api/public/*` is the only auth-bypassing route prefix; both worker endpoints (skill-jobs, automation-jobs) are gated by the Supabase publishable key in an `apikey` header and are idempotent.
- Admin role is enforced via `has_role(uid, 'admin')` in policies and server-side checks — never stored on the profile row.

---

## 11. Daily Usage — Recommended Flow

1. **Sign in** → finish **onboarding** (target roles + seniority).
2. **Upload a resume** → wait for parsing → review the structured builder.
3. **Discover** a few roles via Adzuna, or **paste a JD** under Jobs.
4. Open a JD → run **ATS analysis** → review section suggestions.
5. Click **Tailor** → accept/reject streamed rewrites → save as a new resume version.
6. Move the role into **Applications → Applied** — auto-tailor + auto-cover-letter run in the background.
7. Open **Skills** → check coverage + missing skills.
8. Open **Learning** → generate a plan for that target → mark items in progress.
9. Open **Cover Letters** → review the auto-generated letter, or pick another resume + JD → copy the LaTeX into Overleaf → export PDF.
10. Open **Interview** → run a mock against the saved JD. Toggle **Voice** if your STT/TTS servers are running.
11. Return to **Dashboard** for the Copilot's next-best-actions and top job matches.
12. (Admins) visit **/admin** to check queue health.

---

## 12. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| AI calls hang or `fetch failed` | Local LLM not running, wrong port, or IPv6 resolution | Start Ollama / LM Studio; use `127.0.0.1` not `localhost`; `curl $LOCAL_LLM_BASE_URL/models` |
| Resume parsed as empty / "failed to parse" | Model isn't instruction-tuned or returned prose | Switch to `qwen2.5:7b-instruct`, `llama3.1:8b`, or `mistral:7b-instruct`; check `LOCAL_LLM_MODEL` matches a pulled model |
| `Maximum call stack size exceeded` on upload | Old client build pre-fix | Hard refresh — base64 conversion now uses `FileReader` |
| `Failed to resolve import` after edits | Missing file or package | Create the file or `bun add <pkg>` before importing |
| Empty dashboard / no recommendations | No resumes/jobs yet, or LLM JSON output invalid | Add at least one resume + one job; try a larger model |
| Skill graph stays empty | Worker hasn't drained queue | Open Skills → "Run now", or check `pg_cron` job logs |
| Applied automation didn't run | Worker hasn't drained queue or LLM unreachable | Open `/admin` → check Automation queue → retry; ensure local LLM is up |
| Voice mode errors with "transcribe failed" | `LOCAL_STT_BASE_URL` not set or Whisper server down | Start `whisper.cpp` server and set the env var; restart `bun run dev` |
| Voice plays no audio | `LOCAL_TTS_BASE_URL` not set or TTS server down | Start Piper / openedai-speech; set env; refresh |
| Adzuna returns nothing | Missing/invalid `ADZUNA_APP_ID`/`ADZUNA_APP_KEY` | Re-add the secrets via Backend |
| `Unauthorized: No authorization header provided` | Bearer middleware missing | Confirm `src/start.ts` registers a Supabase bearer `functionMiddleware` |
| PDF parse returns garbage | Scanned/image PDF (no text layer) | Use a text-based PDF, or OCR before upload |
| Supabase realtime "ws not found" warning | Harmless Node SSR warning | Ignore — falls back fine |

---

## 13. Roadmap (not yet shipped)

- Voice interview **v2** — VAD auto-segmentation, barge-in, audio persistence, voice picker.
- Daily job-match digest (pg_cron + email).
- Resume builder polish — full live structured editor with PDF export.
- Browser extension hook (`/api/public/extension/*`) to one-click save JDs from any job site.

---

That's the whole system. Start your local LLM, run `bun run dev`, sign in, and walk the flow in section 11.
