import { createFileRoute, Link } from "@tanstack/react-router";
import { Sparkles, FileText, Target, Briefcase, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CareerOS — AI Career Operating System" },
      { name: "description", content: "Tailor resumes, ace ATS, prep interviews, and get proactive career advice in one intelligent workspace." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[image:var(--gradient-brand)] text-brand-foreground">
            <Sparkles className="h-4 w-4" />
          </div>
          <span className="font-display text-lg font-semibold">CareerOS</span>
        </div>
        <nav className="flex items-center gap-3">
          <Link to="/auth" className="text-sm text-muted-foreground hover:text-foreground">
            Sign in
          </Link>
          <Link
            to="/auth"
            className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3.5 py-1.5 text-sm font-medium text-background transition hover:opacity-90"
          >
            Get started <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </nav>
      </header>

      <section className="mx-auto w-full max-w-6xl px-6 pb-16 pt-12 md:pt-20">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            <Sparkles className="mr-1.5 h-3 w-3 text-brand" /> Your AI career operating system
          </span>
          <h1 className="mt-6 font-display text-5xl font-semibold leading-[1.05] tracking-tight md:text-6xl">
            Land the role,{" "}
            <span className="text-gradient-brand">not just the interview.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-muted-foreground md:text-lg">
            CareerOS reads your resume, studies the job, and rewrites every bullet to match — then preps you for the interview. It's a recruiter, coach, and resume expert in one workspace.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/auth"
              className="inline-flex h-11 items-center justify-center rounded-lg bg-foreground px-6 text-sm font-medium text-background shadow-soft transition hover:opacity-90"
            >
              Start free
            </Link>
            <a
              href="#features"
              className="inline-flex h-11 items-center justify-center rounded-lg border border-border bg-card px-6 text-sm font-medium hover:bg-accent"
            >
              See features
            </a>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto grid w-full max-w-6xl gap-4 px-6 pb-24 md:grid-cols-3">
        {[
          {
            icon: FileText,
            title: "Resume OS",
            body: "Upload a PDF or paste your resume. We parse it, score it against any JD, and rewrite weak bullets with measurable impact.",
          },
          {
            icon: Briefcase,
            title: "ATS Analysis",
            body: "Real keyword coverage, formatting checks, and impact scoring with rationale — not just a vibes-based grade.",
          },
          {
            icon: Target,
            title: "Career Copilot",
            body: "A dashboard of ranked next actions, personalized to your profile, resumes, and the roles you actually want.",
          },
        ].map((f) => (
          <div key={f.title} className="rounded-2xl border border-border bg-card p-6 shadow-soft">
            <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand-muted text-brand">
              <f.icon className="h-5 w-5" />
            </div>
            <h3 className="font-display text-lg font-semibold">{f.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
          </div>
        ))}
      </section>

      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} CareerOS
      </footer>
    </div>
  );
}
