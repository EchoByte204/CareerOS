// Server-only worker that fetches a company's ATS board and writes to the
// shared `company_jobs` cache. Used by the sync button and the cron route.

import { fetchAtsJobs, type AtsProvider } from "@/lib/ats-providers.server";

export async function syncCompanyToCache(opts: {
  id: string;
  name: string;
  provider: AtsProvider;
  slug: string;
  careersUrl?: string;
}): Promise<{ count: number; error?: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  let jobs;
  try {
    jobs = await fetchAtsJobs(opts.provider, opts.slug, opts.careersUrl);
  } catch (e) {
    const msg = (e as Error).message.slice(0, 200);
    await supabaseAdmin
      .from("followed_companies")
      .update({ last_synced_at: new Date().toISOString(), last_error: msg })
      .eq("id", opts.id);
    return { count: 0, error: msg };
  }

  if (jobs.length > 0) {
    const rows = jobs.map((j) => ({
      ats_provider: opts.provider,
      ats_slug: opts.slug,
      external_id: j.external_id,
      company_name: opts.name,
      title: j.title,
      location: j.location || null,
      department: j.department || null,
      url: j.url,
      snippet: j.snippet || null,
      posted_at: j.posted_at,
      fetched_at: new Date().toISOString(),
    }));
    // Upsert in chunks to avoid payload limits
    const chunkSize = 100;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const { error } = await supabaseAdmin
        .from("company_jobs")
        .upsert(chunk, { onConflict: "ats_provider,ats_slug,external_id" });
      if (error) {
        await supabaseAdmin
          .from("followed_companies")
          .update({ last_synced_at: new Date().toISOString(), last_error: error.message.slice(0, 200) })
          .eq("id", opts.id);
        return { count: 0, error: error.message };
      }
    }
  }

  await supabaseAdmin
    .from("followed_companies")
    .update({
      last_synced_at: new Date().toISOString(),
      last_job_count: jobs.length,
      last_error: null,
    })
    .eq("id", opts.id);

  return { count: jobs.length };
}
