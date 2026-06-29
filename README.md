# CareerOS

> An AI-powered **Career Operating System** — Resume Builder, ATS Analysis, Job Discovery, Skill Graph, Learning Plans, Cover Letters, and an AI Interview Coach (text **and voice**) — running entirely on your **local LLM**.

Built to compete with products like Simplify, but private-first: every AI call (parsing, scoring, tailoring, interview chat, STT, TTS) hits an **OpenAI-compatible endpoint on your own machine** — Ollama / LM Studio / llama.cpp / vLLM. No hosted model provider, no data leaves your network.

---

## ✨ Features

- 📄 **Resume OS** — upload PDF → text-extract (`unpdf`) → JSON-mode LLM parse → structured builder with versions.
- 🎯 **ATS Analysis** — weighted score (keywords / impact / clarity / formatting) + section-level rewrite suggestions.
- ✍️ **Resume Tailoring** — streams a rewritten summary + bullets aligned to any JD.
- 🔍 **Job Discovery** — Adzuna search with one-click save & auto-parse.
- 📋 **Pipeline (Kanban)** — Saved → Applied → Interview → Offer → Rejected. Moving to **Applied** auto-tailors your resume + drafts a cover letter in the background.
- 💌 **Cover Letter Generator** — generates Overleaf-ready **LaTeX (`moderncv` classic/green)** from resume + JD.
- 🧠 **Skill Graph** — canonical skills auto-extracted from resumes + JDs via a durable background queue (`pg_cron`, `FOR UPDATE SKIP LOCKED`, retries). Trigram fuzzy resolver, edges for bridging paths, weighted coverage rings.
- 📊 **Job Match Scoring** — weighted score of your `user_skills` vs each JD's `job_skills`, surfaced on the dashboard.
- 📚 **Learning Plans** — LLM-curated courses, projects, books, videos, certifications per missing skill.
- 🎙️ **Interview Coach** — streaming text chat **+ voice mode** (push-to-talk, local Whisper STT, local Piper/Kokoro TTS).
- 🧭 **Career Copilot Dashboard** — proactive next-best-actions based on your activity.
- 🛡️ **Admin Console** — queue health, failed-job retries, first-user-claims-admin, role-gated nav.

---

## 🏗️ Stack

| Layer | Tech |
|---|---|
| Framework | TanStack Start v1 (React 19, SSR, file-based routes) |
| Build | Vite 7 |
| Runtime | Cloudflare Worker (edge) |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Backend | Lovable Cloud (Supabase: Postgres + Auth + Storage + RLS + pg_cron + pg_net + pg_trgm) |
| LLM | Local, OpenAI-compatible (`@ai-sdk/openai-compatible`) |
| STT / TTS | Local Whisper + Piper / Kokoro / openedai-speech |
| PDF | `unpdf` (Worker-safe) |
| Jobs feed | Adzuna API |
| Auth | Email/password + Google OAuth |

---

## 🚀 Quickstart

### 1. Prerequisites

- **Node 20+** and **[Bun](https://bun.sh)**
- A local LLM server (recommended: **Ollama** with `qwen2.5:7b` or `llama3.1:8b`)
- *(Optional, voice only)* Whisper STT + Piper/Kokoro TTS exposed on OpenAI-compatible endpoints

### 2. Start your local LLM

```bash
ollama pull qwen2.5:7b
ollama serve              # http://127.0.0.1:11434
```

### 3. Install & run

```bash
bun install
bun run dev               # http://localhost:8080
```

### 4. Configure (`.env`)

```bash
LOCAL_LLM_BASE_URL=http://127.0.0.1:11434/v1
LOCAL_LLM_MODEL=qwen2.5:7b
LOCAL_LLM_MODEL_SMART=qwen2.5:7b

# Voice (optional)
LOCAL_STT_BASE_URL=http://127.0.0.1:8080/v1
LOCAL_STT_MODEL=whisper-1
LOCAL_TTS_BASE_URL=http://127.0.0.1:8000/v1
LOCAL_TTS_MODEL=tts-1
LOCAL_TTS_VOICE=alloy
```

> Prefer `127.0.0.1` over `localhost` — Node sometimes resolves `localhost` to IPv6 (`::1`), which Ollama doesn't bind to.

Supabase URL + publishable key, plus Adzuna keys, are auto-provisioned by Lovable Cloud — no manual setup needed.

### 5. First sign-in

1. Open `http://localhost:8080` → sign up (email or Google).
2. Complete **onboarding** (roles, seniority, locations).
3. Upload a resume on `/resumes`.
4. (Optional) Visit `/admin` and click **Claim admin** to unlock the admin dashboard for your account.

---

## 📂 Project layout (top level)

```
src/
├─ routes/                  # File-based routes
│  ├─ _authenticated/       # Auth-gated subtree (ssr:false, redirect to /auth)
│  └─ api/
│     ├─ chat.interview.ts
│     ├─ voice.transcribe.ts
│     ├─ voice.tts.ts
│     └─ public/hooks/      # Cron-driven background workers
├─ lib/
│  ├─ ai/                   # Local LLM client + Zod schemas
│  ├─ *.functions.ts        # createServerFn RPCs (client-safe imports)
│  └─ *.server.ts           # Server-only helpers (admin client, queues)
├─ hooks/use-voice-interview.ts
├─ components/{app,ui}/
└─ integrations/supabase/   # Auto-generated; do not edit
```

Full tour in **[HOW_TO_USE.md](./HOW_TO_USE.md)**.

---

## 🔁 Background workers

Two durable queues drained by `pg_cron` every minute via `pg_net` → `/api/public/hooks/*` (auth-gated by Supabase publishable key in an `apikey` header):

| Queue | Triggered by | Work |
|---|---|---|
| `skill_extraction_jobs` | Resume / JD save | Extract canonical skills via local LLM, resolve via `resolve_skill()` trigram, upsert into `user_skills` / `job_skills` |
| `automation_jobs` | Application → "Applied" | Auto-tailor resume + auto-draft LaTeX cover letter |

Both use `FOR UPDATE SKIP LOCKED` for atomic claim, exponential backoff retries, and surface failures in **/admin**.

---

## 🔐 Security

- RLS enabled on every user table, policies scoped to `auth.uid()`.
- Explicit `GRANT`s for `authenticated` + `service_role` on every public table.
- `SECURITY DEFINER` functions (`has_role`, `handle_new_user`, `claim_admin_if_none`) have EXECUTE revoked from `PUBLIC`/`anon`/`authenticated` and are callable only via triggers or the service role with caller identity passed explicitly.
- Roles stored in a separate `user_roles` table — never on profiles.
- Private storage bucket (`resumes`), user-scoped paths.

---

## 🗺️ Roadmap

- Voice interview **v2** — VAD, barge-in, audio persistence, voice picker.
- Daily job-match digest (email).
- Live structured resume editor + PDF export.
- Browser extension to one-click save JDs from any site.

---

## 📖 Docs

- [HOW_TO_USE.md](./HOW_TO_USE.md) — full feature walkthrough, schema, troubleshooting.
- [.lovable/plan.md](./.lovable/plan.md) — architectural plan.
- [.env.example](./.env.example) — every config knob.

---

## 📝 License

Private project. All rights reserved.
