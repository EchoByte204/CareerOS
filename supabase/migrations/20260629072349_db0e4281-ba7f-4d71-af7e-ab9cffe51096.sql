
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TABLE IF NOT EXISTS public.automation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  resume_id UUID NOT NULL REFERENCES public.resumes(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('tailor','cover_letter')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done','failed')),
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_error TEXT,
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (application_id, kind)
);

CREATE INDEX IF NOT EXISTS automation_jobs_pending_idx
  ON public.automation_jobs (status, scheduled_at) WHERE status = 'pending';

GRANT SELECT ON public.automation_jobs TO authenticated;
GRANT ALL ON public.automation_jobs TO service_role;
ALTER TABLE public.automation_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their own automation jobs"
  ON public.automation_jobs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS automation_jobs_updated_at ON public.automation_jobs;
CREATE TRIGGER automation_jobs_updated_at
  BEFORE UPDATE ON public.automation_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.claim_automation_jobs(_limit INT DEFAULT 3)
RETURNS SETOF public.automation_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT id FROM public.automation_jobs
    WHERE status = 'pending' AND scheduled_at <= now()
    ORDER BY scheduled_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT _limit
  )
  UPDATE public.automation_jobs aj
  SET status = 'processing',
      attempts = aj.attempts + 1,
      started_at = now(),
      updated_at = now()
  FROM picked WHERE aj.id = picked.id
  RETURNING aj.*;
END $$;
REVOKE EXECUTE ON FUNCTION public.claim_automation_jobs(INT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_admin_if_none()
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE existing INT; caller UUID := auth.uid();
BEGIN
  IF caller IS NULL THEN RETURN FALSE; END IF;
  SELECT COUNT(*) INTO existing FROM public.user_roles WHERE role = 'admin';
  IF existing > 0 THEN
    RETURN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = caller AND role = 'admin');
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (caller, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  RETURN TRUE;
END $$;
REVOKE EXECUTE ON FUNCTION public.claim_admin_if_none() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_admin_if_none() TO authenticated;
