import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Building2,
  Plus,
  RefreshCw,
  Trash2,
  Loader2,
  ExternalLink,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/app/empty-state";
import {
  listFollowedCompanies,
  addFollowedCompany,
  removeFollowedCompany,
  syncFollowedCompany,
} from "@/lib/companies.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/companies")({
  head: () => ({ meta: [{ title: "Followed Companies · CareerOS" }] }),
  component: CompaniesPage,
});

function formatAgo(iso: string | null) {
  if (!iso) return "never synced";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function CompaniesPage() {
  const list = useServerFn(listFollowedCompanies);
  const add = useServerFn(addFollowedCompany);
  const remove = useServerFn(removeFollowedCompany);
  const sync = useServerFn(syncFollowedCompany);
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [hint, setHint] = useState("");
  const [careersUrl, setCareersUrl] = useState("");
  const [syncing, setSyncing] = useState<string | null>(null);

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ["followed-companies"],
    queryFn: () => list(),
  });

  const addMut = useMutation({
    mutationFn: () =>
      add({
        data: {
          name: name.trim(),
          hint_slug: hint.trim() || undefined,
          careers_url: careersUrl.trim() || undefined,
        },
      }),
    onSuccess: (row) => {
      toast.success(`Following ${row.name} via ${row.ats_provider}`);
      setName("");
      setHint("");
      setCareersUrl("");
      qc.invalidateQueries({ queryKey: ["followed-companies"] });
      // kick off first sync
      sync({ data: { id: row.id } })
        .then(() => qc.invalidateQueries({ queryKey: ["followed-companies"] }))
        .catch(() => undefined);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onSync = async (id: string) => {
    setSyncing(id);
    try {
      const res = await sync({ data: { id } });
      if (res.error) toast.error(res.error);
      else toast.success(`Synced ${res.count} jobs`);
      qc.invalidateQueries({ queryKey: ["followed-companies"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSyncing(null);
    }
  };

  const onRemove = async (id: string) => {
    try {
      await remove({ data: { id } });
      qc.invalidateQueries({ queryKey: ["followed-companies"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Followed companies</h1>
        <p className="text-sm text-muted-foreground">
          We pull job postings straight from each company's career page via Greenhouse, Lever and
          Ashby (auto-detected). They appear in Discover alongside other sources.
        </p>
      </header>

      <Card className="p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return toast.error("Company name required");
            addMut.mutate();
          }}
          className="space-y-3"
        >
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <Label htmlFor="name" className="text-xs">Company name</Label>
              <Input id="name" placeholder="Stripe" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="hint" className="text-xs">Board slug (optional)</Label>
              <Input
                id="hint"
                placeholder="stripe"
                value={hint}
                onChange={(e) => setHint(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="careers" className="text-xs">Careers URL (HTML fallback)</Label>
              <Input
                id="careers"
                placeholder="https://example.com/careers"
                value={careersUrl}
                onChange={(e) => setCareersUrl(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              We try Greenhouse → Lever → Ashby. URL is used only if none match.
            </p>
            <Button type="submit" disabled={addMut.isPending}>
              {addMut.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Follow
            </Button>
          </div>
        </form>
      </Card>

      {isLoading && (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && companies.length === 0 && (
        <EmptyState
          icon={<Building2 className="h-5 w-5" />}
          title="No companies yet"
          description="Add a company above — try Stripe, Linear, Notion, or Razorpay."
        />
      )}

      {companies.length > 0 && (
        <div className="space-y-2">
          {companies.map((c) => (
            <Card key={c.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-base font-semibold">{c.name}</h3>
                    <Badge variant="outline" className="text-[10px] uppercase">
                      {c.ats_provider}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{c.ats_slug}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{c.last_job_count} jobs</span>
                    <span>· synced {formatAgo(c.last_synced_at)}</span>
                    {c.careers_url && (
                      <a
                        href={c.careers_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 hover:text-foreground"
                      >
                        <ExternalLink className="h-3 w-3" />
                        careers page
                      </a>
                    )}
                  </div>
                  {c.last_error && (
                    <p className="mt-2 inline-flex items-center gap-1 text-xs text-destructive">
                      <AlertCircle className="h-3 w-3" />
                      {c.last_error}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={syncing === c.id}
                    onClick={() => onSync(c.id)}
                  >
                    {syncing === c.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => onRemove(c.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
