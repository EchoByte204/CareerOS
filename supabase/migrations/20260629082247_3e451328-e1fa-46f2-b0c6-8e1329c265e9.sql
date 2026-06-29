
-- Followed companies (per-user)
CREATE TABLE public.followed_companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  ats_provider TEXT NOT NULL CHECK (ats_provider IN ('greenhouse','lever','ashby','html')),
  ats_slug TEXT NOT NULL,
  careers_url TEXT,
  last_synced_at TIMESTAMPTZ,
  last_job_count INT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, ats_provider, ats_slug)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.followed_companies TO authenticated;
GRANT ALL ON public.followed_companies TO service_role;
ALTER TABLE public.followed_companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own followed companies" ON public.followed_companies
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_followed_companies_updated
  BEFORE UPDATE ON public.followed_companies
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_followed_companies_user ON public.followed_companies(user_id);
CREATE INDEX idx_followed_companies_stale ON public.followed_companies(last_synced_at NULLS FIRST);

-- Shared cache of jobs pulled from company ATS boards
CREATE TABLE public.company_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ats_provider TEXT NOT NULL,
  ats_slug TEXT NOT NULL,
  external_id TEXT NOT NULL,
  company_name TEXT NOT NULL,
  title TEXT NOT NULL,
  location TEXT,
  department TEXT,
  url TEXT NOT NULL,
  snippet TEXT,
  posted_at TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ats_provider, ats_slug, external_id)
);
GRANT SELECT ON public.company_jobs TO authenticated;
GRANT ALL ON public.company_jobs TO service_role;
ALTER TABLE public.company_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read company_jobs" ON public.company_jobs
  FOR SELECT TO authenticated USING (true);
CREATE INDEX idx_company_jobs_slug ON public.company_jobs(ats_provider, ats_slug);
CREATE INDEX idx_company_jobs_fetched ON public.company_jobs(fetched_at DESC);
