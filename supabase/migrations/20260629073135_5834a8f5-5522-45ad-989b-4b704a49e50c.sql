DROP FUNCTION IF EXISTS public.claim_admin_if_none();

CREATE OR REPLACE FUNCTION public.claim_admin_if_none(_caller uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE existing INT;
BEGIN
  IF _caller IS NULL THEN RETURN FALSE; END IF;
  SELECT COUNT(*) INTO existing FROM public.user_roles WHERE role = 'admin';
  IF existing > 0 THEN
    RETURN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _caller AND role = 'admin');
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (_caller, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  RETURN TRUE;
END $function$;

REVOKE EXECUTE ON FUNCTION public.claim_admin_if_none(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_admin_if_none(uuid) TO service_role;