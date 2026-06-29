import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Search,
  MapPin,
  Building2,
  ExternalLink,
  Sparkles,
  Loader2,
  Briefcase,
  Calendar,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { EmptyState } from "@/components/app/empty-state";
import { searchJobs, importAdzunaJob, suggestSearchQueryFromResume, type DiscoverHit } from "@/lib/discover.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/discover")({
  head: () => ({ meta: [{ title: "Discover Jobs · CareerOS" }] }),
  component: DiscoverPage,
});

const COUNTRIES = [
  { code: "in", label: "India" },
  { code: "us", label: "United States" },
  { code: "gb", label: "United Kingdom" },
  { code: "ca", label: "Canada" },
  { code: "au", label: "Australia" },
  { code: "de", label: "Germany" },
  { code: "fr", label: "France" },
  { code: "nl", label: "Netherlands" },
  { code: "sg", label: "Singapore" },
];

function formatSalary(hit: DiscoverHit) {
  if (!hit.salary_min && !hit.salary_max) return null;
  const c = hit.salary_currency ?? "";
  const fmt = (n: number) =>
    n >= 1000 ? `${Math.round(n / 1000)}k` : n.toLocaleString();
  if (hit.salary_min && hit.salary_max && hit.salary_min !== hit.salary_max) {
    return `${c} ${fmt(hit.salary_min)} – ${fmt(hit.salary_max)}`;
  }
  return `${c} ${fmt(hit.salary_min ?? hit.salary_max ?? 0)}`;
}

function formatPosted(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days < 1) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  return d.toLocaleDateString();
}

function scoreColor(score: number) {
  if (score >= 80) return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30";
  if (score >= 60) return "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30";
  if (score >= 40) return "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30";
  return "bg-muted text-muted-foreground border-border";
}

function DiscoverPage() {
  const navigate = useNavigate();
  const search = useServerFn(searchJobs);
  const importJob = useServerFn(importAdzunaJob);

  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [country, setCountry] = useState("in");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [useResume, setUseResume] = useState(true);
  const [experienceLevel, setExperienceLevel] = useState("all");
  const [jobType, setJobType] = useState("all");
  const [page, setPage] = useState(1);
  const [hits, setHits] = useState<DiscoverHit[]>([]);
  const [count, setCount] = useState(0);
  const [sources, setSources] = useState<Record<string, number>>({});
  const [ranked, setRanked] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const [imported, setImported] = useState<Record<string, string>>({});

  const getSuggestion = useServerFn(suggestSearchQueryFromResume);
  const [autoLoaded, setAutoLoaded] = useState(false);
  const [suggestedQuery, setSuggestedQuery] = useState("");
  const [autoLoading, setAutoLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setAutoLoading(true);
        const res = await getSuggestion();
        if (res.query) {
          setQuery(res.query);
          setSuggestedQuery(res.query);
          
          const data = await search({
            data: {
              query: res.query.trim(),
              location: location.trim(),
              country,
              page: 1,
              remote_only: remoteOnly,
              use_resume: useResume,
              experience_level: experienceLevel,
              job_type: jobType,
            }
          });
          setHits(data.hits);
          setCount(data.count);
          setSources(data.sources ?? {});
          setRanked(Boolean(data.ranked));
          setPage(1);
          setAutoLoaded(true);
        }
      } catch (err) {
        console.error("Failed to fetch search suggestions:", err);
      } finally {
        setAutoLoading(false);
      }
    })();
  }, []);

  const searchMut = useMutation({
    mutationFn: (vars: { page: number }) =>
      search({
        data: {
          query: query.trim(),
          location: location.trim(),
          country,
          page: vars.page,
          remote_only: remoteOnly,
          use_resume: useResume,
          experience_level: experienceLevel,
          job_type: jobType,
        },
      }),
    onSuccess: (res, vars) => {
      setHits(res.hits);
      setCount(res.count);
      setSources(res.sources ?? {});
      setRanked(Boolean(res.ranked));
      setPage(vars.page);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onSearch = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!query.trim()) {
      toast.error("Describe what you're looking for");
      return;
    }
    setAutoLoaded(false);
    searchMut.mutate({ page: 1 });
  };

  const onImport = async (hit: DiscoverHit) => {
    setImporting(hit.external_id);
    try {
      const res = await importJob({
        data: {
          external_id: hit.external_id,
          title: hit.title,
          company: hit.company || "Unknown",
          location: hit.location,
          description: hit.snippet,
          url: hit.url,
          salary_min: hit.salary_min,
          salary_max: hit.salary_max,
          salary_currency: hit.salary_currency,
          posted_at: hit.posted_at,
          source: hit.source,
        },
      });
      setImported((m) => ({ ...m, [hit.external_id]: res.id }));
      toast.success(res.deduped ? "Already in your jobs" : "Saved & parsed", {
        action: {
          label: "Open",
          onClick: () => navigate({ to: "/jobs/$jobId", params: { jobId: res.id } }),
        },
      });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setImporting(null);
    }
  };

  const sourceSummary = Object.entries(sources)
    .map(([k, v]) => `${v} ${k}`)
    .join(" · ");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Discover</h1>
        <p className="text-sm text-muted-foreground">
          Describe the role in plain English — we pull from Adzuna, Remotive, Arbeitnow, Jobicy,
          RemoteOK, WeWorkRemotely, plus any companies you follow, then rank against your resume
          with AI.
        </p>
      </header>

      <Card className="p-4">
        <form onSubmit={onSearch} className="space-y-3">
          <div className="flex flex-col gap-2 md:flex-row">
            <div className="flex-1">
              <Label htmlFor="q" className="text-xs">
                What are you looking for?
              </Label>
              <Input
                id="q"
                placeholder='e.g. "entry level data science in India, remote"'
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" className="w-full md:w-auto" disabled={searchMut.isPending}>
                {searchMut.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Search className="mr-2 h-4 w-4" />
                )}
                Search
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Checkbox
                checked={remoteOnly}
                onCheckedChange={(v) => setRemoteOnly(Boolean(v))}
              />
              Remote only
            </label>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Checkbox
                checked={useResume}
                onCheckedChange={(v) => setUseResume(Boolean(v))}
              />
              Rank with my resume
            </label>
          </div>

          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs">
                <SlidersHorizontal className="mr-2 h-3.5 w-3.5" />
                Advanced filters
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
                <div>
                  <Label htmlFor="loc" className="text-xs">
                    Location override
                  </Label>
                  <Input
                    id="loc"
                    placeholder="city or region"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">Country (Adzuna)</Label>
                  <Select value={country} onValueChange={setCountry}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNTRIES.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Experience Level</Label>
                  <Select value={experienceLevel} onValueChange={setExperienceLevel}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Experience Levels</SelectItem>
                      <SelectItem value="intern">Internship / Student</SelectItem>
                      <SelectItem value="entry">Entry-level / Junior</SelectItem>
                      <SelectItem value="mid">Mid-level</SelectItem>
                      <SelectItem value="senior">Senior / Lead</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Kind of Job</Label>
                  <Select value={jobType} onValueChange={setJobType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Job Types</SelectItem>
                      <SelectItem value="full_time">Full-time</SelectItem>
                      <SelectItem value="part_time">Part-time</SelectItem>
                      <SelectItem value="contract">Contract / Freelance</SelectItem>
                      <SelectItem value="internship">Internship</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </form>
      </Card>

      {(searchMut.isPending || autoLoading) && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {suggestedQuery && hits.length > 0 && autoLoaded && !(searchMut.isPending || autoLoading) && (
        <div className="rounded-xl border border-brand/20 bg-brand/5 p-3.5 text-sm text-brand flex items-center gap-2.5 shadow-sm">
          <Sparkles className="h-5 w-5 shrink-0 text-brand" />
          <span>We've automatically recommended these jobs based on your primary resume for <strong>"{suggestedQuery}"</strong>.</span>
        </div>
      )}

      {!(searchMut.isPending || autoLoading) && hits.length === 0 && searchMut.isSuccess && (
        <EmptyState
          icon={<Search className="h-5 w-5" />}
          title="No matches"
          description="Try a broader phrasing — the AI will infer role, seniority and location."
        />
      )}

      {!(searchMut.isPending || autoLoading) && hits.length === 0 && !searchMut.isSuccess && (
        <EmptyState
          icon={<Briefcase className="h-5 w-5" />}
          title="Search to discover roles"
          description="Multi-source listings, AI-ranked against your active resume."
        />
      )}

      {hits.length > 0 && (
        <>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Showing {hits.length} of {count.toLocaleString()} results
              {sourceSummary && <span className="ml-1">· {sourceSummary}</span>}
              {ranked && <span className="ml-1">· AI-ranked</span>}
            </span>
            <span>Page {page}</span>
          </div>

          <div className="space-y-3">
            {hits.map((hit) => {
              const salary = formatSalary(hit);
              const posted = formatPosted(hit.posted_at);
              const savedId = imported[hit.external_id];
              const isImporting = importing === hit.external_id;
              return (
                <Card key={hit.external_id} className="p-4 transition hover:shadow-md">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2">
                        {ranked && typeof hit.score === "number" && (
                          <span
                            className={`inline-flex h-7 min-w-[2.25rem] shrink-0 items-center justify-center rounded-md border px-1.5 text-xs font-semibold ${scoreColor(
                              hit.score,
                            )}`}
                            title="AI match score"
                          >
                            {hit.score}
                          </span>
                        )}
                        <h3 className="font-display text-base font-semibold leading-tight">
                          {hit.title}
                        </h3>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {hit.company && (
                          <span className="inline-flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            {hit.company}
                          </span>
                        )}
                        {hit.location && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {hit.location}
                          </span>
                        )}
                        {posted && (
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {posted}
                          </span>
                        )}
                        <Badge variant="outline" className="h-5 px-1.5 text-[10px] uppercase">
                          {hit.source}
                        </Badge>
                      </div>
                      {(salary || hit.category) && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {salary && <Badge variant="secondary">{salary}</Badge>}
                          {hit.category && <Badge variant="outline">{hit.category}</Badge>}
                        </div>
                      )}
                      {hit.reason && (
                        <p className="mt-2 text-xs italic text-muted-foreground">
                          {hit.reason}
                        </p>
                      )}
                      <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                        {hit.snippet}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col gap-2 md:w-40">
                      {savedId ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate({ to: "/jobs/$jobId", params: { jobId: savedId } })}
                        >
                          Open in Jobs
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => onImport(hit)}
                          disabled={isImporting}
                        >
                          {isImporting ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Sparkles className="mr-2 h-4 w-4" />
                          )}
                          Save & parse
                        </Button>
                      )}
                      {hit.url && (
                        <Button asChild variant="ghost" size="sm">
                          <a href={hit.url} target="_blank" rel="noreferrer">
                            <ExternalLink className="mr-2 h-4 w-4" />
                            View posting
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || searchMut.isPending}
              onClick={() => searchMut.mutate({ page: page - 1 })}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={hits.length < 20 || searchMut.isPending}
              onClick={() => searchMut.mutate({ page: page + 1 })}
            >
              Next
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
