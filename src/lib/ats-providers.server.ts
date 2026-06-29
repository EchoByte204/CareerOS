// Fetchers for company ATS boards. All endpoints are free + keyless.
// Each fetcher returns a normalized job array. Best-effort; never throws —
// returns [] on any failure so one bad slug doesn't break a sync batch.

export type AtsProvider = "greenhouse" | "lever" | "ashby" | "html";

export type AtsJob = {
  external_id: string;
  title: string;
  location: string;
  department: string;
  url: string;
  snippet: string;
  posted_at: string | null;
};

async function fetchJson(url: string, ms = 8000): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "CareerOS/1.0 (+jobs)" },
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

async function fetchText(url: string, ms = 8000): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "CareerOS/1.0 (+jobs)" },
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`${r.status}`);
    return await r.text();
  } finally {
    clearTimeout(t);
  }
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

// --------- Greenhouse: https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true
export async function fetchGreenhouse(slug: string): Promise<AtsJob[]> {
  try {
    const json = (await fetchJson(
      `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`,
    )) as { jobs?: Array<Record<string, unknown>> };
    const jobs = Array.isArray(json.jobs) ? json.jobs : [];
    return jobs.map((j) => {
      const offices = Array.isArray(j.offices)
        ? (j.offices as Array<{ name?: string }>).map((o) => o.name).filter(Boolean).join(", ")
        : "";
      const dept = Array.isArray(j.departments)
        ? (j.departments as Array<{ name?: string }>).map((d) => d.name).filter(Boolean).join(", ")
        : "";
      const location = (j.location as { name?: string } | undefined)?.name ?? offices ?? "";
      return {
        external_id: String(j.id ?? ""),
        title: String(j.title ?? ""),
        location,
        department: dept,
        url: String(j.absolute_url ?? ""),
        snippet: stripHtml(String(j.content ?? "")).slice(0, 500),
        posted_at: typeof j.updated_at === "string" ? j.updated_at : null,
      };
    }).filter((j) => j.external_id && j.title);
  } catch {
    return [];
  }
}

// --------- Lever: https://api.lever.co/v0/postings/{slug}?mode=json
export async function fetchLever(slug: string): Promise<AtsJob[]> {
  try {
    const json = (await fetchJson(
      `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`,
    )) as Array<Record<string, unknown>>;
    const jobs = Array.isArray(json) ? json : [];
    return jobs.map((j) => {
      const cats = (j.categories as { location?: string; team?: string; department?: string } | undefined) ?? {};
      return {
        external_id: String(j.id ?? ""),
        title: String(j.text ?? ""),
        location: String(cats.location ?? ""),
        department: String(cats.team ?? cats.department ?? ""),
        url: String(j.hostedUrl ?? j.applyUrl ?? ""),
        snippet: stripHtml(String(j.descriptionPlain ?? j.description ?? "")).slice(0, 500),
        posted_at:
          typeof j.createdAt === "number"
            ? new Date(j.createdAt).toISOString()
            : null,
      };
    }).filter((j) => j.external_id && j.title);
  } catch {
    return [];
  }
}

// --------- Ashby: https://api.ashbyhq.com/posting-api/job-board/{slug}
export async function fetchAshby(slug: string): Promise<AtsJob[]> {
  try {
    const json = (await fetchJson(
      `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}?includeCompensation=false`,
    )) as { jobs?: Array<Record<string, unknown>> };
    const jobs = Array.isArray(json.jobs) ? json.jobs : [];
    return jobs.map((j) => ({
      external_id: String(j.id ?? ""),
      title: String(j.title ?? ""),
      location: String(j.locationName ?? j.location ?? ""),
      department: String(j.departmentName ?? j.department ?? ""),
      url: String(j.jobUrl ?? j.applyUrl ?? ""),
      snippet: stripHtml(String(j.descriptionHtml ?? j.descriptionPlain ?? "")).slice(0, 500),
      posted_at: typeof j.publishedDate === "string" ? j.publishedDate : null,
    })).filter((j) => j.external_id && j.title);
  } catch {
    return [];
  }
}

// --------- HTML fallback: best-effort link extraction
// Pulls anchor tags whose text/href hint at a job posting, plus JSON-LD JobPosting blocks.
export async function fetchHtmlCareersPage(url: string): Promise<AtsJob[]> {
  try {
    const html = await fetchText(url);
    const out = new Map<string, AtsJob>();
    const base = new URL(url);

    // JSON-LD JobPosting
    const jsonLdRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let m: RegExpExecArray | null;
    while ((m = jsonLdRe.exec(html)) !== null) {
      try {
        const parsed = JSON.parse(m[1]);
        const arr = Array.isArray(parsed) ? parsed : [parsed];
        for (const node of arr) {
          if (!node || typeof node !== "object") continue;
          const type = node["@type"];
          if (type !== "JobPosting" && !(Array.isArray(type) && type.includes("JobPosting"))) continue;
          const id = String(node.identifier?.value ?? node.url ?? node.title ?? "");
          if (!id) continue;
          const linkRaw = String(node.url ?? "");
          const link = linkRaw ? new URL(linkRaw, base).toString() : "";
          out.set(id, {
            external_id: id.slice(0, 200),
            title: String(node.title ?? "").slice(0, 200),
            location: stripHtml(
              typeof node.jobLocation === "object"
                ? JSON.stringify(node.jobLocation).replace(/[{}"]/g, " ")
                : String(node.jobLocation ?? ""),
            ).slice(0, 120),
            department: String(node.industry ?? ""),
            url: link,
            snippet: stripHtml(String(node.description ?? "")).slice(0, 500),
            posted_at: typeof node.datePosted === "string" ? node.datePosted : null,
          });
        }
      } catch {
        // ignore bad JSON-LD blocks
      }
    }

    // Anchor heuristic — links that point at /jobs/ or /careers/ paths
    if (out.size === 0) {
      const aRe = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
      let am: RegExpExecArray | null;
      while ((am = aRe.exec(html)) !== null) {
        const href = am[1];
        const text = stripHtml(am[2]);
        if (!href || !text || text.length < 4 || text.length > 120) continue;
        if (!/\/(jobs?|careers?|positions?|openings?|roles?)\//i.test(href)) continue;
        let abs: string;
        try { abs = new URL(href, base).toString(); } catch { continue; }
        if (out.has(abs)) continue;
        out.set(abs, {
          external_id: abs.slice(0, 200),
          title: text,
          location: "",
          department: "",
          url: abs,
          snippet: "",
          posted_at: null,
        });
        if (out.size > 80) break;
      }
    }

    return Array.from(out.values());
  } catch {
    return [];
  }
}

// --------- ATS detection
// Try each provider in turn against a slug guessed from the company name.
export async function detectAts(
  name: string,
  hint?: string,
): Promise<{ provider: AtsProvider; slug: string } | null> {
  const candidates: string[] = [];
  if (hint) candidates.push(hint.toLowerCase().trim());
  const norm = name.toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
  if (norm) candidates.push(norm);
  const hyphen = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  if (hyphen && !candidates.includes(hyphen)) candidates.push(hyphen);

  for (const slug of candidates) {
    if (!slug) continue;
    // Greenhouse
    try {
      const r = await fetch(
        `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}`,
        { headers: { Accept: "application/json", "User-Agent": "CareerOS/1.0" } },
      );
      if (r.ok) return { provider: "greenhouse", slug };
    } catch { /* try next */ }
    // Lever
    try {
      const r = await fetch(
        `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json&limit=1`,
        { headers: { Accept: "application/json", "User-Agent": "CareerOS/1.0" } },
      );
      if (r.ok) {
        const j = await r.json().catch(() => null);
        if (Array.isArray(j)) return { provider: "lever", slug };
      }
    } catch { /* try next */ }
    // Ashby
    try {
      const r = await fetch(
        `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}`,
        { headers: { Accept: "application/json", "User-Agent": "CareerOS/1.0" } },
      );
      if (r.ok) {
        const j = (await r.json().catch(() => null)) as { jobs?: unknown } | null;
        if (j && Array.isArray(j.jobs)) return { provider: "ashby", slug };
      }
    } catch { /* try next */ }
  }
  return null;
}

export async function fetchAtsJobs(provider: AtsProvider, slug: string, careersUrl?: string): Promise<AtsJob[]> {
  switch (provider) {
    case "greenhouse": return fetchGreenhouse(slug);
    case "lever": return fetchLever(slug);
    case "ashby": return fetchAshby(slug);
    case "html": return careersUrl ? fetchHtmlCareersPage(careersUrl) : [];
  }
}
