import { createFileRoute } from "@tanstack/react-router";

// pg_cron hits this every minute with the anon key in the `apikey` header.
// The endpoint is mounted under /api/public/* so the edge does not gate it,
// but we still verify the anon key matches what we expect.
export const Route = createFileRoute("/api/public/hooks/process-skill-jobs")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        const presented = request.headers.get("apikey") ?? "";
        if (!expected || presented !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }

        let limit = 5;
        try {
          const body = (await request.json()) as { limit?: number } | null;
          if (body && typeof body.limit === "number") {
            limit = Math.max(1, Math.min(body.limit, 20));
          }
        } catch {
          // empty body is fine
        }

        try {
          const { runSkillExtractionWorker } = await import("@/lib/skill-jobs.server");
          const result = await runSkillExtractionWorker({ limit });
          return new Response(JSON.stringify({ ok: true, ...result }), {
            headers: { "content-type": "application/json" },
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return new Response(JSON.stringify({ ok: false, error: message }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
