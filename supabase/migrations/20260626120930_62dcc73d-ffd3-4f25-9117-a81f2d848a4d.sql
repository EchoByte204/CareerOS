
CREATE TYPE public.skill_job_kind AS ENUM ('resume', 'job');
CREATE TYPE public.skill_job_status AS ENUM ('pending', 'processing', 'done', 'failed');

CREATE TABLE public.skill_extraction_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind public.skill_job_kind NOT NULL,
  target_id UUID NOT NULL,
  status public.skill_job_status NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 4,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_error TEXT,
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (kind, target_id)
);

CREATE INDEX skill_jobs_claim_idx
  ON public.skill_extraction_jobs (scheduled_at)
  WHERE status = 'pending';

CREATE INDEX skill_jobs_user_idx
  ON public.skill_extraction_jobs (user_id, created_at DESC);

GRANT SELECT ON public.skill_extraction_jobs TO authenticated;
GRANT ALL ON public.skill_extraction_jobs TO service_role;

ALTER TABLE public.skill_extraction_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own extraction jobs"
  ON public.skill_extraction_jobs
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER skill_extraction_jobs_set_updated_at
  BEFORE UPDATE ON public.skill_extraction_jobs
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Atomic claim helper: pull up to _limit pending jobs whose scheduled_at <= now(),
-- mark them processing, and return them. SKIP LOCKED makes it safe for
-- concurrent workers. Service-role only.
CREATE OR REPLACE FUNCTION public.claim_skill_extraction_jobs(_limit INT)
RETURNS SETOF public.skill_extraction_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT id
    FROM public.skill_extraction_jobs
    WHERE status = 'pending' AND scheduled_at <= now()
    ORDER BY scheduled_at ASC
    LIMIT GREATEST(_limit, 1)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.skill_extraction_jobs j
     SET status = 'processing',
         started_at = now(),
         attempts = j.attempts + 1,
         updated_at = now()
    FROM picked
   WHERE j.id = picked.id
  RETURNING j.*;
END $$;

REVOKE EXECUTE ON FUNCTION public.claim_skill_extraction_jobs(INT) FROM PUBLIC, anon, authenticated;
