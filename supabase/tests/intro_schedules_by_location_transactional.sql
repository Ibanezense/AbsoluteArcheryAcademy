-- Run after applying recurring_intro_schedules_by_location.sql.
-- The transaction deliberately rolls back every fixture and toggle.
BEGIN;

DO $$
DECLARE
  v_ti record;
  v_um record;
  v_ti_template uuid;
  v_um_template uuid;
  v_disabled_template uuid;
  v_ti_session uuid;
  v_um_session uuid;
  v_disabled_session uuid;
  v_booking_count integer;
BEGIN
  SELECT id, timezone INTO v_ti
  FROM public.academy_locations WHERE code = 'tiabaya';
  SELECT id, timezone INTO v_um
  FROM public.academy_locations WHERE code = 'umacollo';

  IF v_ti.id IS NULL OR v_um.id IS NULL THEN
    RAISE EXCEPTION 'Las sedes Tiabaya y Umacollo deben existir';
  END IF;

  INSERT INTO public.weekly_session_templates (
    label, weekday, start_time, end_time, is_active, allows_intro,
    location_id, physical_capacity, regular_capacity, booking_mode
  ) VALUES
    ('TEST intro Tiabaya', 6, '08:00', '09:00', true, true, v_ti.id, 4, NULL, 'flexible')
  RETURNING id INTO v_ti_template;

  INSERT INTO public.weekly_session_templates (
    label, weekday, start_time, end_time, is_active, allows_intro,
    location_id, physical_capacity, regular_capacity, booking_mode
  ) VALUES
    ('TEST intro Umacollo', 3, '17:00', '18:00', true, true, v_um.id, 4, 2, 'fixed')
  RETURNING id INTO v_um_template;

  INSERT INTO public.weekly_session_templates (
    label, weekday, start_time, end_time, is_active, allows_intro,
    location_id, physical_capacity, regular_capacity, booking_mode
  ) VALUES
    ('TEST disabled intro', 7, '08:00', '09:00', true, false, v_ti.id, 4, NULL, 'flexible')
  RETURNING id INTO v_disabled_template;

  INSERT INTO public.sessions (start_at, end_at, status, weekly_template_id)
  VALUES (now() + interval '30 days', now() + interval '30 days 1 hour', 'scheduled', v_ti_template)
  RETURNING id INTO v_ti_session;

  INSERT INTO public.sessions (start_at, end_at, status, weekly_template_id)
  VALUES (now() + interval '31 days', now() + interval '31 days 1 hour', 'scheduled', v_um_template)
  RETURNING id INTO v_um_session;

  INSERT INTO public.sessions (start_at, end_at, status, weekly_template_id)
  VALUES (now() + interval '32 days', now() + interval '32 days 1 hour', 'scheduled', v_disabled_template)
  RETURNING id INTO v_disabled_session;

  IF NOT public.session_accepts_intro(v_ti_session) THEN
    RAISE EXCEPTION 'Tiabaya habilitada debe aceptar clases de prueba';
  END IF;
  IF NOT public.session_accepts_intro(v_um_session) THEN
    RAISE EXCEPTION 'Umacollo habilitada debe aceptar clases de prueba';
  END IF;
  IF public.session_accepts_intro(v_disabled_session) THEN
    RAISE EXCEPTION 'Una plantilla con allows_intro = false no debe aceptar pruebas';
  END IF;

  -- Disabling a template blocks new registrations without deleting or changing
  -- bookings already attached to one of its generated sessions.
  SELECT count(*) INTO v_booking_count
  FROM public.bookings WHERE session_id = v_ti_session;
  UPDATE public.weekly_session_templates
  SET allows_intro = false
  WHERE id = v_ti_template;
  IF public.session_accepts_intro(v_ti_session) THEN
    RAISE EXCEPTION 'La desactivación debe aplicarse inmediatamente a nuevas reservas';
  END IF;
  IF (SELECT count(*) FROM public.bookings WHERE session_id = v_ti_session) <> v_booking_count THEN
    RAISE EXCEPTION 'La desactivación no debe alterar reservas existentes';
  END IF;

  -- Capacity races are serialized by FOR UPDATE in both booking RPCs; the
  -- source-contract test verifies the lock precedes the resource calculation.
END;
$$;

ROLLBACK;
