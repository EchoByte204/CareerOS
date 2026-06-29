import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getGateway, MODELS } from "@/lib/ai/gateway.server";
import { jobParsedSchema } from "@/lib/ai/schemas";
import { normalizeJobParsed } from "./jobs.functions";

const ADZUNA_BASE = "https://api.adzuna.com/v1/api/jobs";
const REMOTIVE_URL = "https://remotive.com/api/remote-jobs";
const ARBEITNOW_URL = "https://arbeitnow.com/api/job-board-api";
const JOBICY_URL = "https://jobicy.com/api/v2/remote-jobs";
const REMOTEOK_URL = "https://remoteok.com/api";
const WWR_CATEGORIES = [
  "remote-programming-jobs",
  "remote-design-jobs",
  "remote-devops-sysadmin-jobs",
  "remote-product-jobs",
];

const adzunaResultSchema = z.object({
  id: z.union([z.string(), z.number()]).transform((v) => String(v)),
  title: z.string().default(""),
  company: z.object({ display_name: z.string().default("") }).optional(),
  location: z.object({ display_name: z.string().default("") }).optional(),
  description: z.string().default(""),
  redirect_url: z.string().optional(),
  salary_min: z.number().nullable().optional(),
  salary_max: z.number().nullable().optional(),
  created: z.string().optional(),
  category: z.object({ label: z.string().default("") }).optional(),
});

export type DiscoverHit = {
  external_id: string;
  title: string;
  company: string;
  location: string;
  snippet: string;
  url: string;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  posted_at: string | null;
  category: string;
  source: "adzuna" | "remotive" | "arbeitnow" | "jobicy" | "remoteok" | "weworkremotely" | "company";
  // For company-board hits, the ATS provider (greenhouse/lever/ashby/html)
  provider_detail?: string;
  // LLM ranking
  score?: number;
  reason?: string;
};


export type DiscoverIntent = {
  role: string;
  seniority: "" | "intern" | "entry" | "mid" | "senior" | "staff" | "principal";
  location: string;
  country: string;
  remote: boolean;
  skills: string[];
};

// ---------- fetch with timeout ----------
async function fetchJson(url: string, ms = 7000): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`${url} ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

// ---------- intent parsing ----------
const INTENT_SYSTEM = `Parse a job-search query into JSON.
Return ONLY a JSON object with keys:
- role (string): the role/keywords to search (e.g. "data scientist", "frontend engineer")
- seniority (string): one of "" | "intern" | "entry" | "mid" | "senior" | "staff" | "principal"
- location (string): city or region the user mentioned, else ""
- country (string): 2-letter ISO code if a country is named, else ""
- remote (boolean): true if user wants remote
- skills (string[]): up to 6 specific skills/tech mentioned`;

async function parseQueryIntent(rawQuery: string, fallbackCountry: string): Promise<DiscoverIntent> {
  const fallback: DiscoverIntent = {
    role: rawQuery,
    seniority: "",
    location: "",
    country: fallbackCountry,
    remote: false,
    skills: [],
  };
  try {
    const gateway = getGateway();
    const { text } = await generateText({
      model: gateway(MODELS.fast),
      system: INTENT_SYSTEM,
      prompt: `Query: ${rawQuery}\nReturn JSON only.`,
      temperature: 0.1,
    });
    const parsed = safeParseJson(text) as any;
    const skills = Array.isArray(parsed.skills) ? parsed.skills :
                   Array.isArray(parsed.required_skills) ? parsed.required_skills :
                   Array.isArray(parsed.tech) ? parsed.tech : [];
    const seniority = parsed.seniority || parsed.level || "";
    return {
      role: (parsed.role || rawQuery).toString().slice(0, 200),
      seniority: (["intern", "entry", "mid", "senior", "staff", "principal"].includes(seniority) ? seniority : "") as DiscoverIntent["seniority"],
      location: (parsed.location || "").toString().slice(0, 100),
      country: ((parsed.country || fallbackCountry).toString().toLowerCase().slice(0, 2) ||
        fallbackCountry) as string,
      remote: Boolean(parsed.remote || parsed.is_remote),
      skills: skills.slice(0, 6).map(String),
    };
  } catch {
    return fallback;
  }
}

// ---------- provider fetchers ----------
async function fetchAdzuna(
  intent: DiscoverIntent,
  location: string,
  country: string,
  page: number,
  jobType?: string,
): Promise<DiscoverHit[]> {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  if (!appId || !appKey) return [];
  const currency = country === "gb" ? "GBP" : country === "us" ? "USD" : country.toUpperCase();
  const params = new URLSearchParams({
    app_id: appId,
    app_key: appKey,
    results_per_page: "20",
    what: intent.role,
    "content-type": "application/json",
  });
  if (location) params.set("where", location);
  if (jobType === "full_time") params.set("full_time", "1");
  if (jobType === "part_time") params.set("part_time", "1");
  if (jobType === "contract") params.set("contract_type", "contract");
  const url = `${ADZUNA_BASE}/${country}/search/${page}?${params.toString()}`;
  const json = (await fetchJson(url)) as { results?: unknown[]; count?: number };
  const results = Array.isArray(json.results) ? json.results : [];
  const out: DiscoverHit[] = [];
  for (const r of results) {
    const p = adzunaResultSchema.safeParse(r);
    if (!p.success) continue;
    const d = p.data;
    out.push({
      external_id: `adzuna:${d.id}`,
      title: d.title,
      company: d.company?.display_name ?? "",
      location: d.location?.display_name ?? "",
      snippet: d.description.slice(0, 400),
      url: d.redirect_url ?? "",
      salary_min: d.salary_min ?? null,
      salary_max: d.salary_max ?? null,
      salary_currency: d.salary_min || d.salary_max ? currency : null,
      posted_at: d.created ?? null,
      category: d.category?.label ?? "",
      source: "adzuna",
    });
  }
  return out;
}

async function fetchRemotive(intent: DiscoverIntent): Promise<DiscoverHit[]> {
  const params = new URLSearchParams({ search: intent.role, limit: "30" });
  const url = `${REMOTIVE_URL}?${params.toString()}`;
  const json = (await fetchJson(url)) as { jobs?: Array<Record<string, unknown>> };
  const jobs = Array.isArray(json.jobs) ? json.jobs : [];
  return jobs.slice(0, 30).map((j) => {
    const desc = String(j.description ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return {
      external_id: `remotive:${String(j.id ?? j.url ?? Math.random())}`,
      title: String(j.title ?? ""),
      company: String(j.company_name ?? ""),
      location: String(j.candidate_required_location ?? "Remote"),
      snippet: desc.slice(0, 400),
      url: String(j.url ?? ""),
      salary_min: null,
      salary_max: null,
      salary_currency: null,
      posted_at: typeof j.publication_date === "string" ? j.publication_date : null,
      category: String(j.category ?? ""),
      source: "remotive" as const,
    };
  });
}

async function fetchArbeitnow(intent: DiscoverIntent): Promise<DiscoverHit[]> {
  const json = (await fetchJson(ARBEITNOW_URL)) as { data?: Array<Record<string, unknown>> };
  const all = Array.isArray(json.data) ? json.data : [];
  const q = intent.role.toLowerCase();
  const tokens = q.split(/\s+/).filter((t) => t.length > 2);
  const filtered = all.filter((j) => {
    const hay = `${j.title ?? ""} ${j.description ?? ""} ${(j.tags as string[] | undefined)?.join(" ") ?? ""}`.toLowerCase();
    return tokens.length === 0 || tokens.some((t) => hay.includes(t));
  });
  return filtered.slice(0, 25).map((j) => {
    const desc = String(j.description ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return {
      external_id: `arbeitnow:${String(j.slug ?? j.url ?? Math.random())}`,
      title: String(j.title ?? ""),
      company: String(j.company_name ?? ""),
      location: String(j.location ?? (j.remote ? "Remote" : "")),
      snippet: desc.slice(0, 400),
      url: String(j.url ?? ""),
      salary_min: null,
      salary_max: null,
      salary_currency: null,
      posted_at: typeof j.created_at === "number"
        ? new Date(j.created_at * 1000).toISOString()
        : typeof j.created_at === "string" ? j.created_at : null,
      category: Array.isArray(j.tags) ? (j.tags as string[]).slice(0, 2).join(", ") : "",
      source: "arbeitnow" as const,
    };
  });
}

// ---------- Jobicy (free, JSON) ----------
async function fetchJobicy(intent: DiscoverIntent): Promise<DiscoverHit[]> {
  const params = new URLSearchParams({ count: "30" });
  if (intent.role) params.set("tag", intent.role);
  const url = `${JOBICY_URL}?${params.toString()}`;
  const json = (await fetchJson(url)) as { jobs?: Array<Record<string, unknown>> };
  const jobs = Array.isArray(json.jobs) ? json.jobs : [];
  return jobs.slice(0, 30).map((j) => {
    const desc = String(j.jobExcerpt ?? j.jobDescription ?? "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return {
      external_id: `jobicy:${String(j.id ?? j.url ?? Math.random())}`,
      title: String(j.jobTitle ?? ""),
      company: String(j.companyName ?? ""),
      location: String(j.jobGeo ?? "Remote"),
      snippet: desc.slice(0, 400),
      url: String(j.url ?? ""),
      salary_min: typeof j.annualSalaryMin === "number" ? j.annualSalaryMin : null,
      salary_max: typeof j.annualSalaryMax === "number" ? j.annualSalaryMax : null,
      salary_currency: typeof j.salaryCurrency === "string" ? j.salaryCurrency : null,
      posted_at: typeof j.pubDate === "string" ? j.pubDate : null,
      category: String(j.jobIndustry ?? ""),
      source: "jobicy" as const,
    };
  });
}

// ---------- RemoteOK (free, JSON, needs a UA) ----------
async function fetchRemoteOk(intent: DiscoverIntent): Promise<DiscoverHit[]> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 7000);
  try {
    const r = await fetch(REMOTEOK_URL, {
      headers: {
        Accept: "application/json",
        "User-Agent": "CareerOS/1.0 (+jobs)",
      },
      signal: ctrl.signal,
    });
    if (!r.ok) return [];
    const arr = (await r.json()) as unknown;
    if (!Array.isArray(arr)) return [];
    // First element is metadata
    const jobs = arr.slice(1).filter((j) => j && typeof j === "object") as Array<Record<string, unknown>>;
    const q = intent.role.toLowerCase();
    const tokens = q.split(/\s+/).filter((t2) => t2.length > 2);
    const filtered = jobs.filter((j) => {
      const hay = `${j.position ?? ""} ${j.tags ?? ""} ${j.description ?? ""}`.toLowerCase();
      return tokens.length === 0 || tokens.some((tok) => hay.includes(tok));
    });
    return filtered.slice(0, 25).map((j) => {
      const desc = String(j.description ?? "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return {
        external_id: `remoteok:${String(j.id ?? j.slug ?? Math.random())}`,
        title: String(j.position ?? ""),
        company: String(j.company ?? ""),
        location: String(j.location ?? "Remote"),
        snippet: desc.slice(0, 400),
        url: String(j.url ?? j.apply_url ?? ""),
        salary_min: typeof j.salary_min === "number" ? j.salary_min : null,
        salary_max: typeof j.salary_max === "number" ? j.salary_max : null,
        salary_currency: "USD",
        posted_at: typeof j.date === "string" ? j.date : null,
        category: Array.isArray(j.tags) ? (j.tags as string[]).slice(0, 2).join(", ") : "",
        source: "remoteok" as const,
      };
    });
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}

// ---------- WeWorkRemotely (free, RSS) ----------
async function fetchWeWorkRemotely(intent: DiscoverIntent): Promise<DiscoverHit[]> {
  const q = intent.role.toLowerCase();
  const tokens = q.split(/\s+/).filter((t2) => t2.length > 2);
  // Fetch up to 2 categories in parallel
  const cats = WWR_CATEGORIES.slice(0, 2);
  const results = await Promise.allSettled(
    cats.map(async (cat) => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 6000);
      try {
        const r = await fetch(`https://weworkremotely.com/categories/${cat}/jobs.rss`, {
          headers: { "User-Agent": "CareerOS/1.0 (+jobs)" },
          signal: ctrl.signal,
        });
        if (!r.ok) return [];
        return parseWwrRss(await r.text());
      } catch {
        return [];
      } finally {
        clearTimeout(t);
      }
    }),
  );
  const all: DiscoverHit[] = [];
  for (const r of results) if (r.status === "fulfilled") all.push(...r.value);
  if (tokens.length === 0) return all.slice(0, 25);
  return all
    .filter((h) => {
      const hay = `${h.title} ${h.snippet}`.toLowerCase();
      return tokens.some((tok) => hay.includes(tok));
    })
    .slice(0, 25);
}

function parseWwrRss(xml: string): DiscoverHit[] {
  const items: DiscoverHit[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];
    const pick = (tag: string) => {
      const re = new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`);
      const mm = re.exec(block);
      return mm ? mm[1].trim() : "";
    };
    const titleRaw = pick("title");
    // WWR titles are like "Company: Senior Engineer"
    const [companyPart, ...rest] = titleRaw.split(":");
    const titleText = (rest.length > 0 ? rest.join(":") : titleRaw).trim();
    const company = rest.length > 0 ? companyPart.trim() : "";
    const link = pick("link");
    const desc = pick("description").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const region = pick("region");
    const pubDate = pick("pubDate");
    if (!titleText || !link) continue;
    items.push({
      external_id: `weworkremotely:${link}`,
      title: titleText,
      company,
      location: region || "Remote",
      snippet: desc.slice(0, 400),
      url: link,
      salary_min: null,
      salary_max: null,
      salary_currency: null,
      posted_at: pubDate || null,
      category: "",
      source: "weworkremotely" as const,
    });
  }
  return items;
}

// ---------- Followed-company hits (from shared cache, filtered to user's followed list)
async function fetchFollowedCompanyHits(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  userId: string,
  intent: DiscoverIntent,
): Promise<DiscoverHit[]> {
  try {
    const { data: followed } = await supabase
      .from("followed_companies")
      .select("ats_provider, ats_slug")
      .eq("user_id", userId);
    const list = (followed ?? []) as Array<{ ats_provider: string; ats_slug: string }>;
    if (list.length === 0) return [];

    // Build OR filter — supabase .or doesn't combine well with multi-column tuples,
    // so we query by slug list then re-filter by provider in JS.
    const slugs = Array.from(new Set(list.map((f) => f.ats_slug)));
    const { data: jobs } = await supabase
      .from("company_jobs")
      .select("ats_provider, ats_slug, external_id, company_name, title, location, department, url, snippet, posted_at")
      .in("ats_slug", slugs)
      .order("posted_at", { ascending: false, nullsFirst: false })
      .limit(200);
    const allowedKey = new Set(list.map((f) => `${f.ats_provider}::${f.ats_slug}`));
    const filtered = (jobs ?? []).filter((j) =>
      allowedKey.has(`${j.ats_provider}::${j.ats_slug}`),
    );
    const q = intent.role.toLowerCase();
    const tokens = q.split(/\s+/).filter((t) => t.length > 2);
    const matched = tokens.length === 0
      ? filtered
      : filtered.filter((j) => {
          const hay = `${j.title} ${j.department ?? ""} ${j.snippet ?? ""}`.toLowerCase();
          return tokens.some((t) => hay.includes(t));
        });
    return matched.slice(0, 40).map((j) => ({
      external_id: `company:${j.ats_provider}:${j.ats_slug}:${j.external_id}`,
      title: j.title,
      company: j.company_name,
      location: j.location ?? "",
      snippet: j.snippet ?? "",
      url: j.url,
      salary_min: null,
      salary_max: null,
      salary_currency: null,
      posted_at: j.posted_at,
      category: j.department ?? "",
      source: "company" as const,
      provider_detail: j.ats_provider,
    }));
  } catch {
    return [];
  }
}


type ResumeSnapshot = {
  summary: string;
  skills: string[];
  recent_roles: Array<{ title: string; company: string }>;
  years_experience: number;
  seniority: DiscoverIntent["seniority"];
  domains: string[];
};

const SENIORITY_ORDER: Record<string, number> = {
  intern: 0,
  entry: 1,
  mid: 2,
  senior: 3,
  staff: 4,
  principal: 5,
};

function inferSeniorityFromYears(years: number): DiscoverIntent["seniority"] {
  if (years <= 0.5) return "intern";
  if (years < 2) return "entry";
  if (years < 5) return "mid";
  if (years < 9) return "senior";
  if (years < 13) return "staff";
  return "principal";
}

function estimateYears(
  experience: Array<{ start_date?: string; end_date?: string }>,
): number {
  let months = 0;
  for (const e of experience) {
    const s = e.start_date ? Date.parse(e.start_date) : NaN;
    const en = e.end_date && !/present|current/i.test(e.end_date)
      ? Date.parse(e.end_date)
      : Date.now();
    if (!isFinite(s) || !isFinite(en) || en < s) continue;
    months += (en - s) / (1000 * 60 * 60 * 24 * 30.44);
  }
  return Math.round((months / 12) * 10) / 10;
}

function inferDomains(roles: Array<{ title?: string }>, summary: string): string[] {
  const hay = `${roles.map((r) => r.title ?? "").join(" ")} ${summary}`.toLowerCase();
  const map: Array<[string, RegExp]> = [
    ["data science", /\b(data scien|ml|machine learning|nlp|deep learning)\b/],
    ["data engineering", /\b(data engineer|etl|pipeline|spark|airflow)\b/],
    ["frontend", /\b(frontend|front[- ]end|react|vue|angular|ui engineer)\b/],
    ["backend", /\b(backend|back[- ]end|api|microservice|node|django|rails|spring)\b/],
    ["fullstack", /\b(full[- ]?stack)\b/],
    ["devops", /\b(devops|sre|platform|kubernetes|terraform)\b/],
    ["mobile", /\b(ios|android|react native|flutter|swift|kotlin)\b/],
    ["security", /\b(security|infosec|pentest|appsec)\b/],
    ["product", /\b(product manager|product owner)\b/],
    ["design", /\b(designer|ux|ui designer)\b/],
  ];
  const out: string[] = [];
  for (const [name, re] of map) if (re.test(hay)) out.push(name);
  return out.slice(0, 3);
}

async function loadResumeSnapshot(
  supabase: any,
  userId: string,
): Promise<ResumeSnapshot | null> {
  const { data, error } = await supabase
    .from("resumes")
    .select("content, is_primary, updated_at")
    .eq("user_id", userId)
    .order("is_primary", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const content = (data as any).content as
    | {
        summary?: string;
        skills?: string[];
        experience?: Array<{
          title?: string;
          company?: string;
          start?: string;
          end?: string;
        }>;
      }
    | undefined;
  if (!content) return null;
  const experience = content.experience ?? [];
  const mappedExperience = experience.map((e) => ({
    title: e.title ?? "",
    company: e.company ?? "",
    start_date: e.start ?? "",
    end_date: e.end ?? "",
  }));
  const years = estimateYears(mappedExperience);
  const recent = mappedExperience.slice(0, 3).map((e) => ({
    title: e.title,
    company: e.company,
  }));
  return {
    summary: (content.summary ?? "").slice(0, 500),
    skills: Array.isArray(content.skills) ? content.skills.slice(0, 40) : [],
    recent_roles: recent,
    years_experience: years,
    seniority: inferSeniorityFromYears(years),
    domains: inferDomains(recent, content.summary ?? ""),
  };
}

// ---------- deterministic scorer (fallback + LLM prior) ----------
function normSkill(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9+.#]+/g, " ").trim();
}

function deterministicScore(
  hit: DiscoverHit,
  intent: DiscoverIntent,
  resume: ResumeSnapshot | null,
): { score: number; reason: string; matched: string[] } {
  const hay = `${hit.title} ${hit.snippet}`.toLowerCase();
  const resumeSkills = (resume?.skills ?? []).map(normSkill).filter(Boolean);
  const intentSkills = intent.skills.map(normSkill).filter(Boolean);

  const matched: string[] = [];
  for (const sk of resumeSkills) {
    if (sk.length < 2) continue;
    const re = new RegExp(`\\b${sk.replace(/[.+*?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(hay)) matched.push(sk);
  }
  const matchedUniq = Array.from(new Set(matched)).slice(0, 6);
  // Skill overlap: 0..55 (saturates around 6 matches)
  const skillScore = Math.min(55, matchedUniq.length * 10);

  // Seniority: 0..20 — penalize distance
  let seniorityScore = 10;
  let seniorityNote = "";
  const wanted = intent.seniority || resume?.seniority || "";
  if (wanted && resume?.seniority) {
    const a = SENIORITY_ORDER[wanted] ?? 2;
    const b = SENIORITY_ORDER[resume.seniority] ?? 2;
    const diff = Math.abs(a - b);
    seniorityScore = Math.max(0, 20 - diff * 8);
    if (diff >= 2) seniorityNote = ` seniority gap (${resume.seniority}→${wanted})`;
  }
  // Title hint for seniority
  if (intent.seniority === "entry" && /\b(senior|staff|principal|lead)\b/i.test(hit.title)) {
    seniorityScore = Math.max(0, seniorityScore - 10);
  }
  if (intent.seniority === "senior" && /\b(intern|junior|entry)\b/i.test(hit.title)) {
    seniorityScore = Math.max(0, seniorityScore - 10);
  }

  // Domain: 0..15
  const domains = resume?.domains ?? [];
  let domainScore = domains.length === 0 ? 8 : 0;
  let domainHit = "";
  for (const d of domains) {
    if (hay.includes(d)) {
      domainScore = 15;
      domainHit = d;
      break;
    }
  }

  // Location / remote: 0..10
  let locScore = 5;
  const locHay = `${hit.location} ${hit.snippet}`.toLowerCase();
  if (intent.remote && (/remote/.test(locHay) || hit.source === "remotive")) locScore = 10;
  else if (intent.location && locHay.includes(intent.location.toLowerCase())) locScore = 10;
  else if (intent.country && intent.country !== "us") {
    // crude country hint
    if (locHay.includes(intent.country)) locScore = 8;
  }

  const score = Math.max(0, Math.min(100, skillScore + seniorityScore + domainScore + locScore));

  // Reason
  const parts: string[] = [];
  if (matchedUniq.length > 0) {
    parts.push(`matches ${matchedUniq.slice(0, 3).join(", ")}`);
  } else if (intentSkills.length > 0) {
    parts.push(`no clear overlap with ${intentSkills.slice(0, 2).join(", ")}`);
  } else {
    parts.push("limited resume signal");
  }
  if (domainHit) parts.push(`${domainHit} domain`);
  if (seniorityNote) parts.push(seniorityNote.trim());
  const reason = parts.join("; ").slice(0, 140);

  return { score, reason, matched: matchedUniq };
}

const RANK_SYSTEM = `You re-rank job postings for a candidate. You are given a candidate snapshot, the search intent, and per-job priors (deterministic score + matched skills).
For EACH job return:
- id: the exact id provided
- score: integer 0-100. Weight = 55 skill overlap, 20 seniority alignment, 15 domain alignment, 10 location/remote. Adjust the prior up/down only when the snippet reveals clearly stronger or weaker evidence.
- reason: ONE concrete sentence (<=14 words). MUST name 1-2 specific matched skills OR the specific mismatch (e.g. "requires 5y, you have 1y"; "Java stack, your resume is Python"). NEVER generic ("good fit", "decent match").
Apply SOFT filters: never drop a job for mismatch; just lower the score.
Output JSON only: {"ranked":[{"id":"...","score":85,"reason":"..."}]}`;

async function rankHits(
  hits: DiscoverHit[],
  intent: DiscoverIntent,
  resume: ResumeSnapshot | null,
): Promise<Map<string, { score: number; reason: string }>> {
  const out = new Map<string, { score: number; reason: string }>();
  if (hits.length === 0) return out;

  // 1. Deterministic priors for every hit (always available)
  const priors = new Map<string, { score: number; reason: string; matched: string[] }>();
  for (const h of hits) priors.set(h.external_id, deterministicScore(h, intent, resume));

  // 2. LLM re-rank with priors as anchor
  try {
    // Sort hits by prior score descending to find the top candidates
    const sortedHits = [...hits].sort((a, b) => {
      const scoreA = priors.get(a.external_id)?.score ?? 0;
      const scoreB = priors.get(b.external_id)?.score ?? 0;
      return scoreB - scoreA;
    });

    // Only send the top 15 candidates to the LLM to prevent local LLM context limits / slowness
    const topHits = sortedHits.slice(0, 15);

    const compact = topHits.map((h) => {
      const p = priors.get(h.external_id)!;
      return {
        id: h.external_id,
        title: h.title,
        company: h.company,
        location: h.location,
        snippet: h.snippet.slice(0, 220),
        prior_score: p.score,
        matched_skills: p.matched,
      };
    });
    const candidate = resume
      ? {
          summary: resume.summary,
          skills: resume.skills.slice(0, 25),
          recent_roles: resume.recent_roles,
          years_experience: resume.years_experience,
          seniority: resume.seniority,
          domains: resume.domains,
        }
      : { note: "no resume on file" };
    const gateway = getGateway();
    const { text } = await generateText({
      model: gateway(MODELS.smart),
      system: RANK_SYSTEM,
      prompt: `Intent: ${JSON.stringify(intent)}
Candidate: ${JSON.stringify(candidate)}
Jobs: ${JSON.stringify(compact)}
Return JSON only.`,
      temperature: 0.2,
    });
    const parsed = safeParseJson(text) as { ranked?: Array<{ id: string; score: number; reason: string }> };
    for (const r of parsed.ranked ?? []) {
      if (typeof r.id !== "string") continue;
      const score = Math.max(0, Math.min(100, Number(r.score) || 0));
      const reason = String(r.reason ?? "").trim().slice(0, 160);
      if (reason) out.set(r.id, { score, reason });
    }
  } catch {
    // LLM ranking is best-effort
  }

  // 3. Fill in any hits the LLM skipped with deterministic priors
  for (const h of hits) {
    if (!out.has(h.external_id)) {
      const p = priors.get(h.external_id)!;
      out.set(h.external_id, { score: p.score, reason: p.reason });
    }
  }
  return out;
}

// ---------- dedupe ----------
function dedupeKey(h: DiscoverHit) {
  return `${h.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}::${h.company
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()}`;
}

// ---------- main search ----------
export const searchJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        query: z.string().trim().min(1).max(200),
        location: z.string().trim().max(200).optional().default(""),
        country: z.string().trim().length(2).optional().default("in"),
        page: z.number().int().min(1).max(20).optional().default(1),
        remote_only: z.boolean().optional().default(false),
        use_resume: z.boolean().optional().default(true),
        experience_level: z.enum(["all", "intern", "entry", "mid", "senior"]).optional().default("all"),
        job_type: z.enum(["all", "full_time", "part_time", "contract", "internship"]).optional().default("all"),
      })
      .parse(d),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      hits: DiscoverHit[];
      count: number;
      intent: DiscoverIntent;
      sources: Record<string, number>;
      ranked: boolean;
    }> => {
      // 1. Parse intent (LLM, best-effort)
      const intent = await parseQueryIntent(data.query, data.country);
      
      // Override or inject experience level / job type into intent
      if (data.experience_level && data.experience_level !== "all") {
        intent.seniority = data.experience_level as any;
        const expTerm = data.experience_level === "entry" ? "junior" : 
                       data.experience_level === "senior" ? "senior" : 
                       data.experience_level === "intern" ? "internship" : 
                       data.experience_level === "mid" ? "mid" : "";
        if (expTerm && !intent.role.toLowerCase().includes(expTerm)) {
          intent.role = `${intent.role} ${expTerm}`;
        }
      }
      
      if (data.job_type && data.job_type !== "all") {
        if (data.job_type === "internship" && !intent.role.toLowerCase().includes("intern")) {
          intent.role = `${intent.role} intern`;
        }
      }

      const country = (intent.country || data.country || "in").toLowerCase();
      const location = data.location || intent.location;
      const wantRemote = data.remote_only || intent.remote;

      // 2. Fan out
      const tasks: Array<Promise<DiscoverHit[]>> = [fetchAdzuna(intent, location, country, data.page, data.job_type)];
      if (data.page === 1) {
        tasks.push(fetchRemotive(intent));
        tasks.push(fetchArbeitnow(intent));
        tasks.push(fetchJobicy(intent));
        tasks.push(fetchRemoteOk(intent));
        tasks.push(fetchWeWorkRemotely(intent));
        tasks.push(
          fetchFollowedCompanyHits(
            context.supabase as unknown as import("@supabase/supabase-js").SupabaseClient,
            context.userId,
            intent,
          ),
        );
      }
      const settled = await Promise.allSettled(tasks);
      let merged: DiscoverHit[] = [];
      const sources: Record<string, number> = {};
      for (const r of settled) {
        if (r.status === "fulfilled") {
          for (const h of r.value) {
            sources[h.source] = (sources[h.source] ?? 0) + 1;
          }
          merged = merged.concat(r.value);
        }
      }

      // 3. Remote filter
      if (wantRemote) {
        merged = merged.filter(
          (h) =>
            h.source === "remotive" ||
            /remote/i.test(h.location) ||
            /remote/i.test(h.title) ||
            /remote/i.test(h.snippet),
        );
      }

      // 3.5. Post-fetch filter/boost based on experience level and job type
      if (data.experience_level && data.experience_level !== "all") {
        const level = data.experience_level;
        merged = merged.map(h => {
          const title = h.title.toLowerCase();
          const snippet = (h.snippet || "").toLowerCase();
          let matchScoreBoost = 0;
          
          if (level === "intern" && (title.includes("intern") || snippet.includes("internship"))) {
            matchScoreBoost = 20;
          } else if (level === "entry" && (title.includes("junior") || title.includes("entry") || title.includes("associate") || title.includes("fresh"))) {
            matchScoreBoost = 20;
          } else if (level === "senior" && (title.includes("senior") || title.includes("lead") || title.includes("principal") || title.includes("sr") || title.includes("manager"))) {
            matchScoreBoost = 20;
          }
          
          // Penalize strong mismatches
          if (level === "entry" && (title.includes("senior") || title.includes("lead") || title.includes("architect") || title.includes("principal"))) {
            matchScoreBoost = -30;
          } else if (level === "senior" && (title.includes("junior") || title.includes("intern"))) {
            matchScoreBoost = -30;
          }
          
          return { ...h, score: (h.score ?? 50) + matchScoreBoost };
        });
      }
      
      if (data.job_type && data.job_type !== "all") {
        const type = data.job_type;
        merged = merged.filter(h => {
          const title = h.title.toLowerCase();
          const snippet = (h.snippet || "").toLowerCase();
          
          if (type === "contract") {
            return title.includes("contract") || title.includes("freelance") || snippet.includes("contract") || snippet.includes("freelance");
          } else if (type === "internship") {
            return title.includes("intern") || snippet.includes("internship");
          } else if (type === "part_time") {
            return title.includes("part-time") || title.includes("part time") || snippet.includes("part time") || snippet.includes("part-time");
          }
          return true;
        });
      }

      // 4. Dedupe
      const seen = new Set<string>();
      merged = merged.filter((h) => {
        const k = dedupeKey(h);
        if (!h.title || !h.company) return true;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });

      // 5. Rank with LLM against active resume
      const resume = data.use_resume
        ? await loadResumeSnapshot(
            context.supabase as never,
            context.userId,
          ).catch(() => null)
        : null;

      const ranks = await rankHits(merged, intent, resume);
      let ranked = false;
      if (ranks.size > 0) {
        ranked = true;
        merged = merged.map((h) => {
          const r = ranks.get(h.external_id);
          return r ? { ...h, score: r.score, reason: r.reason } : { ...h, score: 0 };
        });
        merged.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
      }

      return {
        hits: merged.slice(0, 40),
        count: merged.length,
        intent,
        sources,
        ranked,
      };
    },
  );

// ---------- import (extended to all sources) ----------
const importInputSchema = z.object({
  external_id: z.string().min(1).max(200),
  title: z.string().min(1).max(200),
  company: z.string().min(1).max(200),
  location: z.string().max(200).optional().default(""),
  description: z.string().min(20).max(40_000),
  url: z.string().max(500).optional().default(""),
  salary_min: z.number().nullable().optional(),
  salary_max: z.number().nullable().optional(),
  salary_currency: z.string().max(10).nullable().optional(),
  posted_at: z.string().max(40).nullable().optional(),
  source: z
    .enum(["adzuna", "remotive", "arbeitnow", "jobicy", "remoteok", "weworkremotely", "company"])
    .optional()
    .default("adzuna"),
});

const PARSE_SYSTEM = `Extract structured fields from a job description.
Return ONLY a JSON object with keys:
- required_skills (string[]): hard requirements explicitly stated
- preferred_skills (string[]): nice-to-haves
- responsibilities (string[]): main duties (short bullets, max 8)
- keywords (string[]): ATS keywords/phrases recruiters would search for (10–20 items)
- seniority (string): one of intern, entry, mid, senior, staff, principal, exec
- summary (string): 1–2 sentence plain-English description of the role`;

export const importAdzunaJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => importInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    // DB source enum is "adzuna" | "api" | "paste" | "url" — map providers to "api".
    const dbSource: "adzuna" | "api" = data.source === "adzuna" ? "adzuna" : "api";
    const { data: existing } = await context.supabase
      .from("jobs")
      .select("id")
      .eq("user_id", context.userId)
      .eq("source", dbSource)
      .eq("external_id", data.external_id)
      .maybeSingle();
    if (existing) return { id: existing.id, deduped: true };

    let parsedJson: unknown = {};
    try {
      const gateway = getGateway();
      const { text } = await generateText({
        model: gateway(MODELS.fast),
        system: PARSE_SYSTEM,
        prompt: `Job title: ${data.title}\nCompany: ${data.company}\n\nDescription:\n${data.description}\n\nReturn JSON only.`,
      });
      const parsed = safeParseJson(text);
      const normalized = normalizeJobParsed(parsed);
      const safe = jobParsedSchema.safeParse(normalized);
      if (safe.success) parsedJson = safe.data;
    } catch {
      // ignore
    }

    const { data: row, error } = await context.supabase
      .from("jobs")
      .insert({
        user_id: context.userId,
        title: data.title,
        company: data.company,
        location: data.location || null,
        url: data.url || null,
        description: data.description,
        source: dbSource,
        external_id: data.external_id,
        external_url: data.url || null,
        salary_min: data.salary_min ?? null,
        salary_max: data.salary_max ?? null,
        salary_currency: data.salary_currency ?? null,
        posted_at: data.posted_at ?? null,
        parsed: parsedJson as never,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await context.supabase.from("activity_events").insert({
      user_id: context.userId,
      type: "job.saved",
      payload: { job_id: row.id, company: data.company, title: data.title, source: data.source },
    });

    try {
      const { enqueueSkillExtraction } = await import("@/lib/skill-jobs.server");
      await enqueueSkillExtraction({
        userId: context.userId,
        kind: "job",
        targetId: row.id,
        supabase: context.supabase,
      });
    } catch {
      // queueing must never block import
    }

    return { id: row.id, deduped: false };
  });

export const suggestSearchQueryFromResume = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: resume, error } = await context.supabase
      .from("resumes")
      .select("content")
      .eq("user_id", context.userId)
      .order("is_primary", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !resume || !resume.content) {
      return { query: "" };
    }

    const content = resume.content as any;
    const summary = content.summary || "";
    const skills = Array.isArray(content.skills) ? content.skills.slice(0, 10).join(", ") : "";
    const experience = Array.isArray(content.experience) 
      ? content.experience.slice(0, 2).map((e: any) => `${e.title} at ${e.company}`).join("; ")
      : "";

    if (!summary && !skills && !experience) {
      return { query: "" };
    }

    const gateway = getGateway();
    try {
      const { text } = await generateText({
        model: gateway(MODELS.fast),
        system: `You are a career assistant. Generate a single, short job search query (2-4 words) that describes the user's primary target role based on their resume profile (e.g. "Frontend Developer", "Machine Learning Engineer", "Sales Executive"). Return ONLY the query string. No formatting, no quotes.`,
        prompt: `Resume summary: ${summary}\nExperience: ${experience}\nSkills: ${skills}`,
      });
      return { query: text.trim().replace(/^['"]|['"]$/g, "") };
    } catch {
      return { query: "" };
    }
  });

function safeParseJson(text: string): unknown {
  const stripped = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1) return {};
  try {
    return JSON.parse(stripped.slice(start, end + 1));
  } catch {
    return {};
  }
}
