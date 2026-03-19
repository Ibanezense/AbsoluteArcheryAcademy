-- ============================================================================
-- Fix: book_session for future memberships
-- Proposito: Permitir a los alumnos con membresias futuras reservar clases
-- siempre y cuando la sesion ocurra dentro del periodo de la membresia.
-- ============================================================================

DROP FUNCTION IF EXISTS public.book_session(uuid);
DROP FUNCTION IF EXISTS public.book_session(uuid, uuid);

CREATE OR REPLACE FUNCTION public.book_session(
  p_session uuid,
  p_student_id uuid DEFAULT NULL
)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_student_id uuid;
  v_student public.students;
  v_session public.sessions;
  v_booking public.bookings;
  v_membership public.student_memberships;
  v_availability jsonb;
  v_bow_usage_type text;
  v_balance_after integer;
BEGIN
  v_actor_id := auth.uid();

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  v_student_id := public.resolve_accessible_student_id(p_student_id);

  SELECT *
  INTO v_student
  FROM public.students
  WHERE id = v_student_id;

  IF v_student IS NULL THEN
    RAISE EXCEPTION 'Alumno no encontrado';
  END IF;

  IF COALESCE(v_student.is_active, true) = false THEN
    RAISE EXCEPTION 'El alumno esta inactivo';
  END IF;

  IF v_student.current_distance_m IS NULL THEN
    RAISE EXCEPTION 'El alumno no tiene distancia configurada';
  END IF;

  -- 1. Primero, obtener la sesion para saber la fecha
  SELECT *
  INTO v_session
  FROM public.sessions
  WHERE id = p_session
  FOR UPDATE;

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Sesion no encontrada';
  END IF;

  IF v_session.status <> 'scheduled' THEN
    RAISE EXCEPTION 'La sesion no esta disponible';
  END IF;

  IF v_session.start_at <= now() THEN
    RAISE EXCEPTION 'No puedes reservar una clase pasada';
  END IF;

  -- 2. Buscar membresia activa *que aplique para la fecha de la sesion*
  SELECT *
  INTO v_membership
  FROM public.student_memberships sm
  WHERE sm.student_id = v_student_id
    AND sm.status = 'active'
    AND COALESCE(sm.classes_remaining, 0) > 0
    AND sm.start_date <= (v_session.start_at AT TIME ZONE 'UTC')::date
    AND (
      sm.end_date IS NULL
      OR sm.end_date >= (v_session.start_at AT TIME ZONE 'UTC')::date
    )
  ORDER BY sm.start_date DESC, sm.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_membership IS NULL THEN
    RAISE EXCEPTION 'El alumno no tiene una membresia activa con clases disponibles para la fecha de esta sesion';
  END IF;

  -- 3. Otras verificaciones
  IF EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.session_id = p_session
      AND b.student_id = v_student_id
      AND b.status = 'reserved'
  ) THEN
    RAISE EXCEPTION 'El alumno ya reservo esta sesion';
  END IF;

  v_bow_usage_type := CASE
    WHEN COALESCE(v_student.has_own_bow, false) THEN 'own'
    WHEN COALESCE(v_student.assigned_bow, false) THEN 'assigned'
    ELSE 'shared_inventory'
  END;

  v_availability := public.check_session_availability_v3(
    p_session,
    v_student_id
  );

  IF (v_availability->>'available')::boolean = false THEN
    RAISE EXCEPTION '%', v_availability->>'message';
  END IF;

  INSERT INTO public.bookings (
    user_id,
    student_id,
    booked_by_profile_id,
    active_membership_id,
    session_id,
    status,
    distance_m,
    group_type,
    bow_usage_type,
    bow_poundage,
    created_at,
    updated_at
  )
  VALUES (
    COALESCE(v_student.self_profile_id, v_actor_id),
    v_student_id,
    v_actor_id,
    v_membership.id,
    p_session,
    'reserved',
    v_student.current_distance_m,
    (
      CASE
        WHEN v_bow_usage_type = 'own' THEN 'ownbow'
        WHEN v_bow_usage_type = 'assigned' THEN 'assigned'
        ELSE NULL
      END
    )::public.group_type,
    v_bow_usage_type,
    v_student.bow_poundage,
    now(),
    now()
  )
  RETURNING * INTO v_booking;

  UPDATE public.student_memberships
  SET
    classes_used = classes_used + 1,
    classes_remaining = classes_remaining - 1,
    updated_at = now()
  WHERE id = v_membership.id
  RETURNING classes_remaining INTO v_balance_after;

  INSERT INTO public.student_credit_ledger (
    student_id,
    student_membership_id,
    booking_id,
    movement_type,
    delta,
    balance_after,
    reason,
    performed_by_profile_id,
    created_at
  )
  VALUES (
    v_student_id,
    v_membership.id,
    v_booking.id,
    'booking_reserved',
    -1,
    v_balance_after,
    'Reserva realizada desde la app',
    v_actor_id,
    now()
  );

  RETURN v_booking;
END;
$$;

GRANT EXECUTE ON FUNCTION public.book_session(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.book_session(uuid, uuid) IS
  'Reserva una sesion para el alumno, descontando el credito de la membresia activa que cobra vigencia el dia de la clase.';

-- ============================================================================
-- Fix: admin_book_session for future memberships
-- Proposito: Permitir a los administradores reservar clases para alumnos 
-- con membresias futuras.
-- ============================================================================

DROP FUNCTION IF EXISTS public.admin_book_session(uuid, uuid);
DROP FUNCTION IF EXISTS public.admin_book_session(uuid, uuid, text, boolean);
CREATE OR REPLACE FUNCTION public.admin_book_session(
  p_session_id uuid,
  p_student_id uuid,
  p_admin_notes text DEFAULT NULL,
  p_force boolean DEFAULT false
)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_student public.students;
  v_session public.sessions;
  v_booking public.bookings;
  v_membership public.student_memberships;
  v_availability jsonb;
  v_bow_usage_type text;
  v_balance_after integer;
BEGIN
  v_actor_id := auth.uid();

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT *
  INTO v_student
  FROM public.students
  WHERE id = p_student_id;

  IF v_student IS NULL THEN
    RAISE EXCEPTION 'Alumno no encontrado';
  END IF;

  IF COALESCE(v_student.is_active, true) = false THEN
    RAISE EXCEPTION 'El alumno esta inactivo';
  END IF;

  IF v_student.current_distance_m IS NULL THEN
    RAISE EXCEPTION 'El alumno no tiene distancia configurada';
  END IF;

  SELECT *
  INTO v_session
  FROM public.sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Sesion no encontrada';
  END IF;

  IF v_session.status <> 'scheduled' THEN
    RAISE EXCEPTION 'La sesion no esta disponible';
  END IF;

  IF v_session.start_at <= now() THEN
    RAISE EXCEPTION 'No puedes reservar una clase pasada';
  END IF;

  SELECT *
  INTO v_membership
  FROM public.student_memberships sm
  WHERE sm.student_id = p_student_id
    AND sm.status = 'active'
    AND COALESCE(sm.classes_remaining, 0) > 0
    AND sm.start_date <= (v_session.start_at AT TIME ZONE 'UTC')::date
    AND (
      sm.end_date IS NULL
      OR sm.end_date >= (v_session.start_at AT TIME ZONE 'UTC')::date
    )
  ORDER BY sm.start_date DESC, sm.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_membership IS NULL THEN
    RAISE EXCEPTION 'El alumno no tiene una membresia activa con clases disponibles para la fecha de esta sesion';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.session_id = p_session_id
      AND b.student_id = p_student_id
      AND b.status = 'reserved'
  ) THEN
    RAISE EXCEPTION 'El alumno ya reservo esta sesion';
  END IF;

  v_bow_usage_type := CASE
    WHEN COALESCE(v_student.has_own_bow, false) THEN 'own'
    WHEN COALESCE(v_student.assigned_bow, false) THEN 'assigned'
    ELSE 'shared_inventory'
  END;

  IF NOT p_force THEN
    v_availability := public.check_session_availability_v3(
      p_session_id,
      p_student_id
    );

    IF (v_availability->>'available')::boolean = false THEN
      RAISE EXCEPTION '%', v_availability->>'message';
    END IF;
  END IF;

  INSERT INTO public.bookings (
    user_id,
    student_id,
    booked_by_profile_id,
    active_membership_id,
    session_id,
    status,
    distance_m,
    group_type,
    bow_usage_type,
    bow_poundage,
    admin_notes,
    created_at,
    updated_at
  )
  VALUES (
    COALESCE(v_student.self_profile_id, v_actor_id),
    p_student_id,
    v_actor_id,
    v_membership.id,
    p_session_id,
    'reserved',
    v_student.current_distance_m,
    (
      CASE
        WHEN v_bow_usage_type = 'own' THEN 'ownbow'
        WHEN v_bow_usage_type = 'assigned' THEN 'assigned'
        ELSE NULL
      END
    )::public.group_type,
    v_bow_usage_type,
    v_student.bow_poundage,
    NULLIF(btrim(p_admin_notes), ''),
    now(),
    now()
  )
  RETURNING * INTO v_booking;

  UPDATE public.student_memberships
  SET
    classes_used = classes_used + 1,
    classes_remaining = classes_remaining - 1,
    updated_at = now()
  WHERE id = v_membership.id
  RETURNING classes_remaining INTO v_balance_after;

  INSERT INTO public.student_credit_ledger (
    student_id,
    student_membership_id,
    booking_id,
    movement_type,
    delta,
    balance_after,
    reason,
    performed_by_profile_id,
    created_at
  )
  VALUES (
    p_student_id,
    v_membership.id,
    v_booking.id,
    'booking_reserved',
    -1,
    v_balance_after,
    CASE
      WHEN p_force THEN 'Reserva forzada desde admin'
      ELSE 'Reserva realizada desde admin'
    END,
    v_actor_id,
    now()
  );

  RETURN v_booking;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_book_session(uuid, uuid, text, boolean) TO authenticated;

COMMENT ON FUNCTION public.admin_book_session(uuid, uuid, text, boolean) IS
  'Reserva una sesion para cualquier alumno desde admin descontando el credito de la membresia aplicable en la fecha de la sesion. Puede forzar la reserva si p_force = true.';

