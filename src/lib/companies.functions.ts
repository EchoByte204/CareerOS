import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AtsProvider } from "@/lib/ats-providers.server";

// ---------- list followed companies for current user
export const listFollowedCompanies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("followed_companies")
      .select("id, name, ats_provider, ats_slug, careers_url, last_synced_at, last_job_count, last_error, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ---------- add a company (auto-detect ATS, or accept explicit provider/slug)
const addInput = z.object({
  name: z.string().trim().min(1).max(120),
  hint_slug: z.string().trim().max(80).optional(),
  careers_url: z.string().trim().max(500).optional(),
  provider: z.enum(["greenhouse", "lever", "ashby", "html", "auto"]).optional().default("auto"),
});

export const addFollowedCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => addInput.parse(d))
  .handler(async ({ data, context }) => {
    const { detectAts } = await import("@/lib/ats-providers.server");
    let provider: AtsProvider;
    let slug: string;

    if (data.provider && data.provider !== "auto") {
      provider = data.provider;
      slug = (data.hint_slug || data.name).toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
      if (provider === "html" && !data.careers_url) {
        throw new Error("HTML fallback needs a careers URL");
      }
    } else {
      const detected = await detectAts(data.name, data.hint_slug);
      if (!detected) {
        if (data.careers_url) {
          provider = "html";
          slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 80) || "company";
        } else {
          throw new Error(
            "Couldn't find this company on Greenhouse, Lever or Ashby. Add a careers URL to use the best-effort HTML fallback.",
          );
        }
      } else {
        provider = detected.provider;
        slug = detected.slug;
      }
    }

    const { data: row, error } = await context.supabase
      .from("followed_companies")
      .upsert(
        {
          user_id: context.userId,
          name: data.name,
          ats_provider: provider,
          ats_slug: slug,
          careers_url: data.careers_url ?? null,
        },
        { onConflict: "user_id,ats_provider,ats_slug" },
      )
      .select("id, name, ats_provider, ats_slug, careers_url, last_synced_at, last_job_count")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

// ---------- remove
export const removeFollowedCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("followed_companies")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- sync one company now (used by "Sync" button and by the cron worker)
export const syncFollowedCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: comp, error } = await context.supabase
      .from("followed_companies")
      .select("id, name, ats_provider, ats_slug, careers_url")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!comp) throw new Error("Not found");

    const { syncCompanyToCache } = await import("@/lib/companies-impl.server");
    const res = await syncCompanyToCache({
      id: comp.id,
      name: comp.name,
      provider: comp.ats_provider as AtsProvider,
      slug: comp.ats_slug,
      careersUrl: comp.careers_url ?? undefined,
    });
    return res;
  });
