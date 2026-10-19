-- Explicit, reversible identity confirmations. Names and phone numbers are never auto-linked.
CREATE TABLE IF NOT EXISTS public.intro_student_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intro_client_id uuid NOT NULL REFERENCES public.intro_clients(id),
  student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  student_name_at_confirmation text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  confirmed_by uuid NOT NULL REFERENCES auth.users(id),
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id),
  CHECK ((revoked_at IS NULL) = (revoked_by IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS intro_student_conversions_intro_active ON public.intro_student_conversions(intro_client_id) WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS intro_student_conversions_student_active ON public.intro_student_conversions(student_id) WHERE revoked_at IS NULL;
CREATE TABLE IF NOT EXISTS public.intro_student_conversion_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversion_id uuid NOT NULL REFERENCES public.intro_student_conversions(id),
  action text NOT NULL CHECK (action IN ('confirmed', 'revoked')),
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  happened_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL
);
ALTER TABLE public.intro_student_conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intro_student_conversion_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS intro_conversion_admin_read ON public.intro_student_conversions;
CREATE POLICY intro_conversion_admin_read ON public.intro_student_conversions FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL AND public.is_admin_user());
DROP POLICY IF EXISTS intro_conversion_events_admin_read ON public.intro_student_conversion_events;
CREATE POLICY intro_conversion_events_admin_read ON public.intro_student_conversion_events FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL AND public.is_admin_user());
REVOKE ALL ON public.intro_student_conversions, public.intro_student_conversion_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.intro_student_conversions, public.intro_student_conversion_events TO authenticated;

CREATE OR REPLACE FUNCTION public.confirm_intro_student_conversion(p_intro_client_id uuid, p_student_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_trial date; v_membership date; v_existing public.intro_student_conversions; v_id uuid; v_today date := (now() AT TIME ZONE 'America/Lima')::date;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_user() THEN RAISE EXCEPTION 'Solo administradores' USING ERRCODE = '42501'; END IF;
  -- Parent row locks serialize confirmations even when neither link exists yet.
  PERFORM 1 FROM public.intro_clients WHERE id = p_intro_client_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Persona de prueba inexistente'; END IF;
  PERFORM 1 FROM public.students WHERE id = p_student_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Alumno inexistente'; END IF;
  SELECT min((s.start_at AT TIME ZONE 'America/Lima')::date) INTO v_trial FROM public.bookings b JOIN public.sessions s ON s.id = b.session_id WHERE b.intro_client_id = p_intro_client_id AND b.status = 'attended';
  SELECT min(start_date) INTO v_membership FROM public.student_memberships WHERE student_id = p_student_id AND membership_origin = 'paid' AND status NOT IN ('draft', 'cancelled');
  IF v_trial IS NULL OR v_trial > v_today THEN RAISE EXCEPTION 'Se requiere una prueba asistida'; END IF;
  IF v_membership IS NULL OR v_membership < v_trial OR v_membership > v_today THEN RAISE EXCEPTION 'La primera membresía debe comenzar desde la prueba hasta hoy'; END IF;
  SELECT * INTO v_existing FROM public.intro_student_conversions WHERE intro_client_id = p_intro_client_id AND revoked_at IS NULL;
  IF FOUND THEN
    IF v_existing.student_id = p_student_id THEN RETURN v_existing.id; END IF;
    RAISE EXCEPTION 'La persona de prueba ya tiene un vínculo. Revísalo antes de corregirlo.' USING ERRCODE = '23505';
  END IF;
  INSERT INTO public.intro_student_conversions(intro_client_id, student_id, student_name_at_confirmation, confirmed_by)
  SELECT p_intro_client_id, id, full_name, auth.uid() FROM public.students WHERE id=p_student_id RETURNING id INTO v_id;
  INSERT INTO public.intro_student_conversion_events(conversion_id, action, actor_id, version) VALUES (v_id, 'confirmed', auth.uid(), 1);
  RETURN v_id;
END $$;
CREATE OR REPLACE FUNCTION public.revoke_intro_student_conversion(p_conversion_id uuid, p_expected_version integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_version integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_user() THEN RAISE EXCEPTION 'Solo administradores' USING ERRCODE = '42501'; END IF;
  UPDATE public.intro_student_conversions SET revoked_at = now(), revoked_by = auth.uid(), version = version + 1 WHERE id = p_conversion_id AND revoked_at IS NULL AND version = p_expected_version RETURNING version INTO v_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'El vínculo cambió. Actualiza antes de corregirlo.' USING ERRCODE = '40001'; END IF;
  INSERT INTO public.intro_student_conversion_events(conversion_id, action, actor_id, version) VALUES (p_conversion_id, 'revoked', auth.uid(), v_version);
END $$;
REVOKE ALL ON FUNCTION public.confirm_intro_student_conversion(uuid, uuid), public.revoke_intro_student_conversion(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_intro_student_conversion(uuid, uuid), public.revoke_intro_student_conversion(uuid, integer) TO authenticated;
