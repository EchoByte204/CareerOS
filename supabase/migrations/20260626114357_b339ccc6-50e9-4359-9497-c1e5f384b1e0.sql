ALTER TYPE public.job_source ADD VALUE IF NOT EXISTS 'adzuna';

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS external_id TEXT,
  ADD COLUMN IF NOT EXISTS external_url TEXT,
  ADD COLUMN IF NOT EXISTS salary_min NUMERIC,
  ADD COLUMN IF NOT EXISTS salary_max NUMERIC,
  ADD COLUMN IF NOT EXISTS salary_currency TEXT,
  ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS jobs_user_source_external_idx
  ON public.jobs(user_id, source, external_id)
  WHERE external_id IS NOT NULL;