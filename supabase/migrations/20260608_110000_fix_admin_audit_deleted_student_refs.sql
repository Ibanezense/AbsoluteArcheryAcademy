-- ============================================================================
-- FIX ADMIN AUDIT REFERENCES DURING STUDENT DELETION
-- Fecha: 2026-06-08
-- Proposito:
-- 1. Evitar que auditorias disparadas por deletes en cascada rompan FKs
-- 2. Mantener el UUID original en metadata para trazabilidad
-- 3. Conservar referencias FK solo cuando la fila referenciada aun existe
-- ============================================================================

CREATE OR REPLACE FUNCTION public.log_admin_action(
  p_action_type text,
  p_target_table text,
  p_target_id uuid DEFAULT NULL,
  p_student_id uuid DEFAULT NULL,
  p_session_id uuid DEFAULT NULL,
  p_booking_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_role text;
  v_student_id uuid;
  v_session_id uuid;
  v_booking_id uuid;
  v_metadata jsonb;
BEGIN
  v_actor_id := auth.uid();
  v_role := COALESCE(auth.role(), '');

  IF v_actor_id IS NULL AND v_role <> 'service_role' THEN
    RETURN;
  END IF;

  IF v_actor_id IS NOT NULL AND NOT public.is_admin_user() THEN
    RETURN;
  END IF;

  v_metadata := COALESCE(p_metadata, '{}'::jsonb);

  IF p_student_id IS NOT NULL THEN
    SELECT p_student_id
    INTO v_student_id
    FROM public.students
    WHERE id = p_student_id;

    IF v_student_id IS NULL THEN
      v_metadata := v_metadata || jsonb_build_object('original_student_id', p_student_id);
    END IF;
  END IF;

  IF p_session_id IS NOT NULL THEN
    SELECT p_session_id
    INTO v_session_id
    FROM public.sessions
    WHERE id = p_session_id;

    IF v_session_id IS NULL THEN
      v_metadata := v_metadata || jsonb_build_object('original_session_id', p_session_id);
    END IF;
  END IF;

  IF p_booking_id IS NOT NULL THEN
    SELECT p_booking_id
    INTO v_booking_id
    FROM public.bookings
    WHERE id = p_booking_id;

    IF v_booking_id IS NULL THEN
      v_metadata := v_metadata || jsonb_build_object('original_booking_id', p_booking_id);
    END IF;
  END IF;

  INSERT INTO public.admin_action_audit (
    actor_profile_id,
    action_type,
    target_table,
    target_id,
    student_id,
    session_id,
    booking_id,
    metadata,
    created_at
  )
  VALUES (
    v_actor_id,
    COALESCE(NULLIF(btrim(p_action_type), ''), 'admin_action'),
    COALESCE(NULLIF(btrim(p_target_table), ''), 'unknown'),
    p_target_id,
    v_student_id,
    v_session_id,
    v_booking_id,
    v_metadata,
    now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_admin_action(text, text, uuid, uuid, uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_admin_action(text, text, uuid, uuid, uuid, uuid, jsonb) TO service_role;

COMMENT ON FUNCTION public.log_admin_action(text, text, uuid, uuid, uuid, uuid, jsonb) IS
  'Registra acciones admin tolerando referencias borradas por cascada y preservando IDs originales en metadata.';
