
CREATE OR REPLACE FUNCTION public.resolve_skill(_input TEXT)
RETURNS TABLE (skill_id UUID, similarity REAL)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
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
