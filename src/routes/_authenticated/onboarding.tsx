import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { getProfile, updateProfile } from "@/lib/profiles.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({ meta: [{ title: "Welcome · CareerOS" }] }),
  component: OnboardingPage,
});

function OnboardingPage() {
  const router = useRouter();
  const fetchProfile = useServerFn(getProfile);
  const save = useServerFn(updateProfile);
  const qc = useQueryClient();

  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: () => fetchProfile(),
  });

  const [displayName, setDisplayName] = useState("");
  const [headline, setHeadline] = useState("");
  const [seniority, setSeniority] = useState<string>("mid");
  const [location, setLocation] = useState("");
  const [roleInput, setRoleInput] = useState("");
  const [roles, setRoles] = useState<string[]>([]);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name ?? "");
      setHeadline(profile.headline ?? "");
      setSeniority(profile.seniority ?? "mid");
      setLocation(profile.location ?? "");
      setRoles(profile.target_roles ?? []);
    }
  }, [profile]);

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          display_name: displayName,
          headline,
          seniority: seniority as
            | "intern"
            | "entry"
            | "mid"
            | "senior"
            | "staff"
            | "principal"
            | "exec",
          location,
          target_roles: roles,
          mark_onboarded: true,
        },
      }),
    onSuccess: () => {
      toast.success("You're all set.");
      qc.invalidateQueries({ queryKey: ["profile"] });
      router.navigate({ to: "/dashboard" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addRole = () => {
    const v = roleInput.trim();
    if (!v) return;
    if (roles.includes(v) || roles.length >= 8) return;
    setRoles([...roles, v]);
    setRoleInput("");
  };

  return (
    <div className="mx-auto -mt-2 max-w-2xl">
      <div className="mb-8 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[image:var(--gradient-brand)] text-brand-foreground">
          <Sparkles className="h-4 w-4" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Welcome to CareerOS
          </h1>
          <p className="text-sm text-muted-foreground">
            A few details so your copilot can personalize everything.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label className="mb-1.5 text-xs">Your name</Label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Maya Chen" />
          </div>
          <div>
            <Label className="mb-1.5 text-xs">Seniority</Label>
            <Select value={seniority} onValueChange={setSeniority}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[
                  ["intern", "Intern"],
                  ["entry", "Entry / Junior"],
                  ["mid", "Mid-level"],
                  ["senior", "Senior"],
                  ["staff", "Staff"],
                  ["principal", "Principal"],
                  ["exec", "Executive"],
                ].map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label className="mb-1.5 text-xs">Headline</Label>
            <Input
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              placeholder="Senior Backend Engineer focused on distributed systems"
            />
          </div>
          <div className="md:col-span-2">
            <Label className="mb-1.5 text-xs">Location</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="San Francisco, CA" />
          </div>
          <div className="md:col-span-2">
            <Label className="mb-1.5 text-xs">Target roles</Label>
            <div className="flex gap-2">
              <Input
                value={roleInput}
                onChange={(e) => setRoleInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addRole();
                  }
                }}
                placeholder="e.g. Senior Software Engineer"
              />
              <Button type="button" variant="secondary" onClick={addRole}>Add</Button>
            </div>
            {roles.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {roles.map((r) => (
                  <span
                    key={r}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-accent px-2.5 py-0.5 text-xs"
                  >
                    {r}
                    <button
                      type="button"
                      onClick={() => setRoles(roles.filter((x) => x !== r))}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="mt-6 flex justify-end">
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !displayName.trim()}
          >
            {mutation.isPending ? "Saving…" : "Continue"}
          </Button>
        </div>
      </div>
    </div>
  );
}
