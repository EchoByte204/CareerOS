CREATE TABLE public.cover_letters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resume_id UUID REFERENCES public.resumes(id) ON DELETE SET NULL,
  job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT 'Cover Letter',
  recipient TEXT NOT NULL DEFAULT 'Hiring Manager',
  company TEXT NOT NULL DEFAULT '',
  role_title TEXT NOT NULL DEFAULT '',
  tone TEXT NOT NULL DEFAULT 'professional',
  length TEXT NOT NULL DEFAULT 'medium',
  body_text TEXT NOT NULL DEFAULT '',
  latex TEXT NOT NULL DEFAULT '',
  model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cover_letters TO authenticated;
GRANT ALL ON public.cover_letters TO service_role;

ALTER TABLE public.cover_letters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own cover letters"
ON public.cover_letters FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX cover_letters_user_idx ON public.cover_letters(user_id, created_at DESC);
CREATE INDEX cover_letters_job_idx ON public.cover_letters(job_id);

CREATE TRIGGER cover_letters_set_updated_at
BEFORE UPDATE ON public.cover_letters
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();