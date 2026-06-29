import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { AtsProvider } from "@/lib/ats-providers.server";

// Cron endpoint — picks the stalest followed_companies and refreshes their
// cached jobs. Auth: must pass the project anon key as `apikey` header
// (matches how pg_cron is configured).
export const Route = createFileRoute("/api/public/hooks/sync-company-jobs")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey") ?? request.headers.get("x-api-key");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!expected || !apikey || apikey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const url = process.env.SUPABASE_URL!;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const admin = createClient<Database>(url, serviceKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });

        // Pull batch of companies whose cache is older than 6h (or never synced)
        const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
        const { data: companies, error } = await admin
          .from("followed_companies")
          .select("id, name, ats_provider, ats_slug, careers_url")
          .or(`last_synced_at.is.null,last_synced_at.lt.${cutoff}`)
          .order("last_synced_at", { ascending: true, nullsFirst: true })
          .limit(15);
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }
        if (!companies || companies.length === 0) {
          return Response.json({ processed: 0 });
        }

        const { syncCompanyToCache } = await import("@/lib/companies-impl.server");
        const results = await Promise.allSettled(
          companies.map((c) =>
            syncCompanyToCache({
              id: c.id,
              name: c.name,
              provider: c.ats_provider as AtsProvider,
              slug: c.ats_slug,
              careersUrl: c.careers_url ?? undefined,
            }),
          ),
        );
        const ok = results.filter((r) => r.status === "fulfilled").length;
        return Response.json({ processed: companies.length, ok });
      },
    },
  },
});
