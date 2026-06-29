import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ExternalLink, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getJob } from "@/lib/jobs.functions";
import { jobParsedSchema } from "@/lib/ai/schemas";

export const Route = createFileRoute("/_authenticated/jobs/$jobId")({
  head: () => ({ meta: [{ title: "Job · CareerOS" }] }),
  component: JobDetail,
});

function JobDetail() {
  const { jobId } = useParams({ from: "/_authenticated/jobs/$jobId" });
  const fetch = useServerFn(getJob);
  const { data: job, isLoading } = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => fetch({ data: { id: jobId } }),
  });

  if (isLoading || !job) return <div className="text-sm text-muted-foreground">Loading…</div>;
  const parsed = jobParsedSchema.safeParse(job.parsed);
  const p = parsed.success ? parsed.data : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link to="/jobs"><ArrowLeft className="mr-1 h-4 w-4" /> All jobs</Link>
      </Button>

      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">{job.title}</h1>
        <p className="mt-1 text-base text-muted-foreground">{job.company}</p>
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
          {job.location && (<span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {job.location}</span>)}
          {job.url && (
            <a href={job.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
              <ExternalLink className="h-3 w-3" /> Original posting
            </a>
          )}
        </div>
      </header>

      <Button asChild>
        <Link to="/resumes">Tailor a resume to this role →</Link>
      </Button>

      {p && (
        <section className="grid gap-3 md:grid-cols-2">
          {p.required_skills.length > 0 && (
            <Chips title="Required skills" items={p.required_skills} tone="brand" />
          )}
          {p.preferred_skills.length > 0 && (
            <Chips title="Preferred skills" items={p.preferred_skills} tone="muted" />
          )}
          {p.keywords.length > 0 && (
            <Chips title="ATS keywords" items={p.keywords} tone="muted" />
          )}
          {p.responsibilities.length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-5 shadow-soft md:col-span-2">
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Responsibilities</h3>
              <ul className="list-disc pl-5 text-sm">
                {p.responsibilities.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          )}
        </section>
      )}

      <section>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Full description</h3>
        <div className="whitespace-pre-wrap rounded-2xl border border-border bg-card p-5 text-sm shadow-soft">
          {job.description}
        </div>
      </section>
    </div>
  );
}

function Chips({ title, items, tone }: { title: string; items: string[]; tone: "brand" | "muted" }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</h3>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it) => (
          <span
            key={it}
            className={tone === "brand"
              ? "rounded-full bg-brand-muted px-2 py-0.5 text-xs text-brand"
              : "rounded-full bg-accent px-2 py-0.5 text-xs"}
          >
            {it}
          </span>
        ))}
      </div>
    </div>
  );
}
