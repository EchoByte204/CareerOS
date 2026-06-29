
CREATE EXTENSION IF NOT EXISTS pg_trgm;

DO $$ BEGIN CREATE TYPE public.skill_kind AS ENUM ('hard','soft','tool','language','framework','domain','certification'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.skill_edge_type AS ENUM ('related','parent_of','prerequisite_of','alternative_to'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.proficiency_level AS ENUM ('beginner','intermediate','advanced','expert'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.skill_importance AS ENUM ('nice_to_have','preferred','required','core'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  kind public.skill_kind NOT NULL DEFAULT 'hard',
  category TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.skills TO anon, authenticated;
GRANT ALL ON public.skills TO service_role;
ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "skills readable by all" ON public.skills FOR SELECT USING (true);
CREATE TRIGGER skills_set_updated_at BEFORE UPDATE ON public.skills FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE INDEX skills_name_trgm_idx ON public.skills USING gin (lower(name) gin_trgm_ops);

CREATE TABLE public.skill_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  alias_normalized TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (alias_normalized)
);
GRANT SELECT ON public.skill_aliases TO anon, authenticated;
GRANT ALL ON public.skill_aliases TO service_role;
ALTER TABLE public.skill_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aliases readable by all" ON public.skill_aliases FOR SELECT USING (true);
CREATE INDEX skill_aliases_skill_idx ON public.skill_aliases(skill_id);
CREATE INDEX skill_aliases_norm_trgm_idx ON public.skill_aliases USING gin (alias_normalized gin_trgm_ops);

CREATE TABLE public.skill_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_skill UUID NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  to_skill UUID NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  edge_type public.skill_edge_type NOT NULL DEFAULT 'related',
  weight REAL NOT NULL DEFAULT 0.5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (from_skill, to_skill, edge_type),
  CHECK (from_skill <> to_skill),
  CHECK (weight >= 0 AND weight <= 1)
);
GRANT SELECT ON public.skill_edges TO anon, authenticated;
GRANT ALL ON public.skill_edges TO service_role;
ALTER TABLE public.skill_edges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "edges readable by all" ON public.skill_edges FOR SELECT USING (true);
CREATE INDEX skill_edges_from_idx ON public.skill_edges(from_skill);
CREATE INDEX skill_edges_to_idx ON public.skill_edges(to_skill);

CREATE TABLE public.user_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  resume_id UUID REFERENCES public.resumes(id) ON DELETE SET NULL,
  proficiency public.proficiency_level,
  years_experience NUMERIC(4,1),
  confidence REAL NOT NULL DEFAULT 0.5,
  evidence TEXT,
  source TEXT NOT NULL DEFAULT 'resume',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, skill_id),
  CHECK (confidence >= 0 AND confidence <= 1)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_skills TO authenticated;
GRANT ALL ON public.user_skills TO service_role;
ALTER TABLE public.user_skills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_skills owner all" ON public.user_skills FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER user_skills_set_updated_at BEFORE UPDATE ON public.user_skills FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE INDEX user_skills_user_idx ON public.user_skills(user_id);
CREATE INDEX user_skills_skill_idx ON public.user_skills(skill_id);

CREATE TABLE public.job_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  importance public.skill_importance NOT NULL DEFAULT 'preferred',
  confidence REAL NOT NULL DEFAULT 0.5,
  evidence TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, skill_id),
  CHECK (confidence >= 0 AND confidence <= 1)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_skills TO authenticated;
GRANT ALL ON public.job_skills TO service_role;
ALTER TABLE public.job_skills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "job_skills via owning job" ON public.job_skills FOR ALL
  USING (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_skills.job_id AND j.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_skills.job_id AND j.user_id = auth.uid()));
CREATE INDEX job_skills_job_idx ON public.job_skills(job_id);
CREATE INDEX job_skills_skill_idx ON public.job_skills(skill_id);

CREATE OR REPLACE FUNCTION public.resolve_skill(_input TEXT)
RETURNS TABLE (skill_id UUID, similarity REAL)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  norm TEXT := lower(trim(_input));
BEGIN
  RETURN QUERY SELECT s.id, 1.0::REAL FROM public.skills s WHERE s.slug = norm LIMIT 1;
  IF FOUND THEN RETURN; END IF;
  RETURN QUERY SELECT a.skill_id, 1.0::REAL FROM public.skill_aliases a WHERE a.alias_normalized = norm LIMIT 1;
  IF FOUND THEN RETURN; END IF;
  RETURN QUERY
    SELECT s.id, similarity(lower(s.name), norm) AS sim
    FROM public.skills s
    WHERE lower(s.name) % norm
    ORDER BY sim DESC
    LIMIT 1;
END $$;
GRANT EXECUTE ON FUNCTION public.resolve_skill(TEXT) TO authenticated, anon, service_role;

-- Seed a starter taxonomy so the graph is useful from day one
INSERT INTO public.skills (slug, name, kind, category) VALUES
  ('javascript','JavaScript','language','programming'),
  ('typescript','TypeScript','language','programming'),
  ('python','Python','language','programming'),
  ('go','Go','language','programming'),
  ('java','Java','language','programming'),
  ('sql','SQL','language','data'),
  ('react','React','framework','frontend'),
  ('nextjs','Next.js','framework','frontend'),
  ('nodejs','Node.js','framework','backend'),
  ('express','Express.js','framework','backend'),
  ('fastapi','FastAPI','framework','backend'),
  ('django','Django','framework','backend'),
  ('postgres','PostgreSQL','tool','database'),
  ('mongodb','MongoDB','tool','database'),
  ('redis','Redis','tool','database'),
  ('docker','Docker','tool','devops'),
  ('kubernetes','Kubernetes','tool','devops'),
  ('aws','AWS','tool','cloud'),
  ('gcp','Google Cloud','tool','cloud'),
  ('azure','Azure','tool','cloud'),
  ('git','Git','tool','devops'),
  ('graphql','GraphQL','framework','api'),
  ('rest-api','REST APIs','domain','api'),
  ('tailwind-css','Tailwind CSS','framework','frontend'),
  ('html','HTML','language','frontend'),
  ('css','CSS','language','frontend'),
  ('machine-learning','Machine Learning','domain','ai'),
  ('deep-learning','Deep Learning','domain','ai'),
  ('llm','Large Language Models','domain','ai'),
  ('pytorch','PyTorch','framework','ai'),
  ('tensorflow','TensorFlow','framework','ai'),
  ('communication','Communication','soft','interpersonal'),
  ('leadership','Leadership','soft','interpersonal'),
  ('problem-solving','Problem Solving','soft','cognitive'),
  ('agile','Agile','domain','process'),
  ('scrum','Scrum','domain','process')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.skill_aliases (skill_id, alias, alias_normalized)
SELECT id, a, lower(a) FROM (VALUES
  ('javascript','js'),('javascript','ecmascript'),
  ('typescript','ts'),
  ('python','py'),
  ('nodejs','node'),('nodejs','node js'),
  ('react','react.js'),('react','reactjs'),
  ('nextjs','next'),('nextjs','next js'),
  ('postgres','postgresql'),('postgres','psql'),
  ('aws','amazon web services'),
  ('gcp','google cloud platform'),
  ('kubernetes','k8s'),
  ('machine-learning','ml'),
  ('deep-learning','dl'),
  ('llm','llms'),('llm','large language model'),
  ('rest-api','rest'),('rest-api','restful apis'),
  ('tailwind-css','tailwind'),
  ('graphql','gql')
) AS v(slug,a)
JOIN public.skills s ON s.slug = v.slug
ON CONFLICT (alias_normalized) DO NOTHING;

INSERT INTO public.skill_edges (from_skill, to_skill, edge_type, weight)
SELECT a.id, b.id, et::public.skill_edge_type, w FROM (VALUES
  ('typescript','javascript','parent_of',0.95),
  ('react','javascript','prerequisite_of',0.9),
  ('react','typescript','related',0.8),
  ('nextjs','react','prerequisite_of',0.95),
  ('express','nodejs','prerequisite_of',0.9),
  ('fastapi','python','prerequisite_of',0.9),
  ('django','python','prerequisite_of',0.9),
  ('pytorch','python','prerequisite_of',0.85),
  ('tensorflow','python','prerequisite_of',0.85),
  ('deep-learning','machine-learning','parent_of',0.9),
  ('llm','deep-learning','parent_of',0.85),
  ('kubernetes','docker','prerequisite_of',0.8),
  ('postgres','sql','prerequisite_of',0.9),
  ('mongodb','postgres','alternative_to',0.6),
  ('gcp','aws','alternative_to',0.7),
  ('azure','aws','alternative_to',0.7),
  ('tailwind-css','css','prerequisite_of',0.8),
  ('scrum','agile','parent_of',0.85)
) AS v(from_slug,to_slug,et,w)
JOIN public.skills a ON a.slug = v.from_slug
JOIN public.skills b ON b.slug = v.to_slug
ON CONFLICT (from_skill, to_skill, edge_type) DO NOTHING;
