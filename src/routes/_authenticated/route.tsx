import { createFileRoute, Outlet, redirect, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app/app-shell";

// Integration-managed gate: ssr off because Supabase session lives in localStorage.
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user } = Route.useRouteContext();
  const [displayName, setDisplayName] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
      setDisplayName(data?.display_name ?? null);
    })();
  }, [user.id]);

  // Soft nudge to onboarding if profile not yet set up — handled via banner inside Dashboard,
  // but we also redirect first-time users straight to onboarding.
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("profiles").select("onboarded_at").eq("id", user.id).maybeSingle();
      if (data && !data.onboarded_at && !window.location.pathname.startsWith("/onboarding")) {
        window.location.replace("/onboarding");
      }
    })();
  }, [user.id]);

  return (
    <AppShell user={{ email: user.email, display_name: displayName }}>
      <Outlet />
    </AppShell>
  );
}

// Suppress unused import warning in some toolchains
export const _Link = Link;
