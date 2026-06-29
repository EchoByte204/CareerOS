import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  User2,
  Mail,
  Phone,
  MapPin,
  Link as LinkIcon,
  Briefcase,
  GraduationCap,
  FolderGit2,
  Sparkles,
  Pencil,
  Upload,
  Star,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/app/empty-state";
import { getProfile, setPrimaryResume } from "@/lib/resumes.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "Profile · CareerOS" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const fetchProfile = useServerFn(getProfile);
  const setPrimary = useServerFn(setPrimaryResume);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["profile"],
    queryFn: () => fetchProfile(),
  });

  const primaryMut = useMutation({
    mutationFn: (id: string) => setPrimary({ data: { id } }),
    onSuccess: () => {
      toast.success("Primary resume updated");
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["resumes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !data) {
    return <div className="text-sm text-muted-foreground">Loading…</div>;
  }

  if (!data.hasResume) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState
          icon={<User2 className="h-5 w-5" />}
          title="Your profile is empty"
          description="Import or paste a resume — every other feature (tailoring, ATS, cover letters, applications) reads from your profile."
          action={
            <Button asChild>
              <Link to="/resumes">
                <Upload className="mr-1 h-4 w-4" /> Import a resume
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  const c = data.content;
  const initials = (c.contact.name || "?")
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[image:var(--gradient-brand)] text-brand-foreground font-display text-xl font-semibold">
              {initials}
            </div>
            <div>
              <h1 className="font-display text-3xl font-semibold tracking-tight">
                {c.contact.name || "Unnamed candidate"}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Sourced from <span className="font-medium text-foreground">{data.title}</span>
                {data.isPrimary && (
                  <Badge variant="secondary" className="ml-2 gap-1">
                    <Star className="h-3 w-3" /> Primary
                  </Badge>
                )}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="secondary">
              <Link to="/resumes/$resumeId" params={{ resumeId: data.resumeId! }}>
                <Pencil className="mr-1 h-4 w-4" /> Edit
              </Link>
            </Button>
            <Button asChild>
              <Link to="/resumes">
                <Upload className="mr-1 h-4 w-4" /> Import new
              </Link>
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-2 text-sm sm:grid-cols-2">
          {c.contact.email && (
            <ContactRow icon={<Mail className="h-4 w-4" />}>{c.contact.email}</ContactRow>
          )}
          {c.contact.phone && (
            <ContactRow icon={<Phone className="h-4 w-4" />}>{c.contact.phone}</ContactRow>
          )}
          {c.contact.location && (
            <ContactRow icon={<MapPin className="h-4 w-4" />}>{c.contact.location}</ContactRow>
          )}
          {c.contact.links.map((l, i) => (
            <ContactRow key={i} icon={<LinkIcon className="h-4 w-4" />}>
              <a
                href={l.url}
                target="_blank"
                rel="noreferrer"
                className="text-brand hover:underline"
              >
                {l.label || l.url}
              </a>
            </ContactRow>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {c.summary && (
            <Card icon={<Sparkles className="h-4 w-4" />} title="Summary">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                {c.summary}
              </p>
            </Card>
          )}

          <Card
            icon={<Briefcase className="h-4 w-4" />}
            title="Experience"
            count={c.experience.length}
          >
            {c.experience.length === 0 ? (
              <Empty>No experience extracted.</Empty>
            ) : (
              <ol className="space-y-5">
                {c.experience.map((e, i) => (
                  <li key={i} className="relative border-l-2 border-border pl-4">
                    <div className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-brand" />
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div>
                        <div className="font-display text-base font-semibold">
                          {e.title || "Role"}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {e.company}
                          {e.location ? ` · ${e.location}` : ""}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground tabular-nums">
                        {[e.start, e.end].filter(Boolean).join(" — ") || ""}
                      </div>
                    </div>
                    {e.bullets.length > 0 && (
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground/90">
                        {e.bullets.map((b, j) => (
                          <li key={j}>{b}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card
            icon={<FolderGit2 className="h-4 w-4" />}
            title="Projects"
            count={c.projects.length}
          >
            {c.projects.length === 0 ? (
              <Empty>No projects extracted.</Empty>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {c.projects.map((p, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-border bg-background p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-display text-sm font-semibold">
                        {p.name || "Untitled"}
                      </h3>
                      {p.link && (
                        <a
                          href={p.link}
                          target="_blank"
                          rel="noreferrer"
                          className="text-muted-foreground hover:text-brand"
                          aria-label="Open project link"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                    {p.description && (
                      <p className="mt-1 text-xs text-muted-foreground">{p.description}</p>
                    )}
                    {p.bullets.length > 0 && (
                      <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-foreground/90">
                        {p.bullets.map((b, j) => (
                          <li key={j}>{b}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card
            icon={<GraduationCap className="h-4 w-4" />}
            title="Education"
            count={c.education.length}
          >
            {c.education.length === 0 ? (
              <Empty>No education extracted.</Empty>
            ) : (
              <ul className="space-y-3">
                {c.education.map((ed, i) => (
                  <li key={i} className="rounded-lg border border-border bg-background p-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div className="font-medium">{ed.school || "School"}</div>
                      <div className="text-xs text-muted-foreground tabular-nums">
                        {[ed.start, ed.end].filter(Boolean).join(" — ")}
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {[ed.degree, ed.field].filter(Boolean).join(" · ")}
                    </div>
                    {ed.details && (
                      <p className="mt-1 text-xs text-muted-foreground">{ed.details}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <aside className="space-y-6">
          <Card
            icon={<Sparkles className="h-4 w-4" />}
            title="Technical skills"
            count={c.skills.length}
          >
            {c.skills.length === 0 ? (
              <Empty>No skills extracted.</Empty>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {c.skills.map((s) => (
                  <span
                    key={s}
                    className="rounded-full bg-brand-muted px-2.5 py-1 text-xs font-medium text-brand"
                  >
                    {s}
                  </span>
                ))}
              </div>
            )}
          </Card>

          <Card title="All resumes" count={data.resumes.length}>
            <ul className="space-y-1.5 text-sm">
              {data.resumes.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2">
                  <Link
                    to="/resumes/$resumeId"
                    params={{ resumeId: r.id }}
                    className="truncate hover:underline"
                  >
                    {r.title}
                  </Link>
                  {r.is_primary ? (
                    <Badge variant="secondary" className="shrink-0 gap-1">
                      <Star className="h-3 w-3" /> Primary
                    </Badge>
                  ) : (
                    <button
                      onClick={() => primaryMut.mutate(r.id)}
                      disabled={primaryMut.isPending}
                      className="text-xs text-muted-foreground hover:text-brand hover:underline"
                    >
                      Make primary
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </Card>

          <div className="rounded-2xl border border-dashed border-border bg-card/40 p-4 text-xs text-muted-foreground">
            Your <span className="font-medium text-foreground">primary resume</span> is the
            source of truth. Tailoring, ATS analysis, cover letters and applications all read
            from here.
          </div>
        </aside>
      </div>
    </div>
  );
}

function Card({
  icon,
  title,
  count,
  children,
}: {
  icon?: React.ReactNode;
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <div className="mb-3 flex items-center gap-2">
        {icon && <span className="text-brand">{icon}</span>}
        <h2 className="font-display text-base font-semibold">{title}</h2>
        {typeof count === "number" && (
          <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground tabular-nums">
            {count}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function ContactRow({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 text-muted-foreground">
      <span className="text-brand">{icon}</span>
      <span className="truncate text-foreground/90">{children}</span>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}
