
CREATE TYPE public.learning_resource_type AS ENUM ('course','project','book','article','video','tutorial','certification','other');
CREATE TYPE public.learning_status AS ENUM ('suggested','saved','in_progress','completed','dismissed');

CREATE TABLE public.learning_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_id UUID REFERENCES public.skills(id) ON DELETE SET NULL,
  job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  resource_type public.learning_resource_type NOT NULL DEFAULT 'course',
  title TEXT NOT NULL,
  provider TEXT,
  url TEXT,
  description TEXT,
  level TEXT,
  duration TEXT,
  cost TEXT,
  rationale TEXT,
  score NUMERIC(5,2) NOT NULL DEFAULT 50,
  status public.learning_status NOT NULL DEFAULT 'suggested',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX learning_recs_user_idx ON public.learning_recommendations(user_id, status, score DESC);
CREATE INDEX learning_recs_skill_idx ON public.learning_recommendations(user_id, skill_id);
CREATE INDEX learning_recs_job_idx ON public.learning_recommendations(user_id, job_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.learning_recommendations TO authenticated;
GRANT ALL ON public.learning_recommendations TO service_role;

ALTER TABLE public.learning_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own learning recs"
  ON public.learning_recommendations FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_learning_recs_updated_at
  BEFORE UPDATE ON public.learning_recommendations
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
