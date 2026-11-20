BEGIN;

-- An enrollment can precede the first paid membership. The conversion report
-- continues to count only links with a qualifying first membership.
CREATE OR REPLACE FUNCTION public.link_attended_intro_student(p_booking_id uuid, p_student_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_client_id uuid;
  v_name text;
  v_existing public.intro_student_conversions;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Solo administradores' USING ERRCODE = '42501';
  END IF;
  SELECT b.intro_client_id INTO v_client_id
  FROM public.bookings b JOIN public.sessions s ON s.id = b.session_id
  WHERE b.id = p_booking_id AND b.status = 'attended' AND s.start_at <= now()
  FOR UPDATE OF b;
  IF v_client_id IS NULL THEN RAISE EXCEPTION 'Se requiere una prueba asistida'; END IF;
  PERFORM 1 FROM public.intro_clients WHERE id = v_client_id FOR UPDATE;
  SELECT full_name INTO v_name FROM public.students WHERE id = p_student_id FOR UPDATE;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Alumno inexistente'; END IF;

  SELECT * INTO v_existing FROM public.intro_student_conversions
  WHERE intro_client_id = v_client_id AND revoked_at IS NULL;
  IF FOUND THEN
    IF v_existing.student_id = p_student_id THEN RETURN v_existing.id; END IF;
    RAISE EXCEPTION 'Esta persona ya tiene una ficha vinculada' USING ERRCODE = '23505';
  END IF;
  IF EXISTS (SELECT 1 FROM public.intro_student_conversions WHERE student_id = p_student_id AND revoked_at IS NULL) THEN
    RAISE EXCEPTION 'El alumno ya está vinculado a otra persona de prueba' USING ERRCODE = '23505';
  END IF;
  INSERT INTO public.intro_student_conversions(intro_client_id, student_id, student_name_at_confirmation, confirmed_by)
  VALUES (v_client_id, p_student_id, v_name, auth.uid()) RETURNING id INTO v_id;
  INSERT INTO public.intro_student_conversion_events(conversion_id, action, actor_id, version)
  VALUES (v_id, 'confirmed', auth.uid(), 1);
  RETURN v_id;
END
$$;

REVOKE ALL ON FUNCTION public.link_attended_intro_student(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_attended_intro_student(uuid, uuid) TO authenticated;

COMMIT;
