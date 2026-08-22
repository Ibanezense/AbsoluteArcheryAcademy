CREATE TABLE IF NOT EXISTS public.membership_expiry_extension_batches (
  idempotency_key uuid PRIMARY KEY,
  actor_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason text NOT NULL,
  extension_days integer NOT NULL DEFAULT 7 CHECK (extension_days = 7),
  affected_count integer NOT NULL DEFAULT 0 CHECK (affected_count >= 0),
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.membership_expiry_extension_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS membership_expiry_extension_batches_admin_select
  ON public.membership_expiry_extension_batches;

CREATE POLICY membership_expiry_extension_batches_admin_select
  ON public.membership_expiry_extension_batches
  FOR SELECT
  TO authenticated
  USING (public.is_admin_user());

REVOKE ALL ON TABLE public.membership_expiry_extension_batches FROM PUBLIC;
REVOKE ALL ON TABLE public.membership_expiry_extension_batches FROM anon;
REVOKE ALL ON TABLE public.membership_expiry_extension_batches FROM authenticated;
GRANT SELECT ON TABLE public.membership_expiry_extension_batches TO authenticated;
GRANT SELECT ON TABLE public.membership_expiry_extension_batches TO service_role;

CREATE OR REPLACE FUNCTION public.admin_preview_bulk_membership_expiry_extension()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today_lima date := (now() AT TIME ZONE 'America/Lima')::date;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticacion requerida';
  END IF;

  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  WITH candidates AS (
    SELECT DISTINCT ON (sm.student_id)
      sm.id,
      sm.student_id,
      st.full_name AS student_name,
      sm.custom_name AS membership_name,
      sm.end_date AS current_end_date,
      sm.end_date + 7 AS new_end_date
    FROM public.student_memberships sm
    JOIN public.students st ON st.id = sm.student_id
    WHERE sm.status = 'active'
      AND sm.classes_remaining > 0
      AND sm.end_date IS NOT NULL
      AND sm.end_date >= v_today_lima
    ORDER BY sm.student_id, sm.start_date DESC, sm.created_at DESC, sm.id DESC
  )
  SELECT jsonb_build_object(
    'affected_count', COUNT(*),
    'extensions', COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'student_id', candidate.student_id,
          'student_name', candidate.student_name,
          'membership_id', candidate.id,
          'membership_name', candidate.membership_name,
          'current_end_date', candidate.current_end_date,
          'new_end_date', candidate.new_end_date
        )
        ORDER BY candidate.student_name, candidate.student_id
      ),
      '[]'::jsonb
    )
  )
  INTO v_result
  FROM candidates candidate;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_apply_bulk_membership_expiry_extension(
  p_reason text,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today_lima date := (now() AT TIME ZONE 'America/Lima')::date;
  v_target_ids uuid[] := ARRAY[]::uuid[];
  v_affected_count integer := 0;
  v_existing_actor_profile_id uuid;
  v_existing_reason text;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticacion requerida';
  END IF;

  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF NULLIF(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'El motivo es obligatorio';
  END IF;

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'La clave de idempotencia es obligatoria';
  END IF;

  INSERT INTO public.membership_expiry_extension_batches (
    idempotency_key,
    actor_profile_id,
    reason,
    extension_days,
    affected_count,
    result
  )
  VALUES (
    p_idempotency_key,
    auth.uid(),
    btrim(p_reason),
    7,
    0,
    NULL
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  IF NOT FOUND THEN
    SELECT batch.result, batch.actor_profile_id, batch.reason
    INTO v_result, v_existing_actor_profile_id, v_existing_reason
    FROM public.membership_expiry_extension_batches batch
    WHERE batch.idempotency_key = p_idempotency_key;

    IF v_existing_actor_profile_id IS DISTINCT FROM auth.uid()
      OR v_existing_reason IS DISTINCT FROM btrim(p_reason)
    THEN
      RAISE EXCEPTION 'Conflicto de idempotencia: la clave ya pertenece a otra solicitud';
    END IF;

    RETURN COALESCE(v_result, jsonb_build_object(
      'affected_count', 0,
      'extensions', '[]'::jsonb
    )) || jsonb_build_object('already_applied', true);
  END IF;

  PERFORM pg_advisory_xact_lock(724315117, 7);
  LOCK TABLE public.student_memberships IN SHARE ROW EXCLUSIVE MODE;

  SELECT array_agg(candidate.id ORDER BY candidate.id)
  INTO v_target_ids
  FROM (
    SELECT DISTINCT ON (sm.student_id)
      sm.id,
      sm.student_id
    FROM public.student_memberships sm
    WHERE sm.status = 'active'
      AND sm.classes_remaining > 0
      AND sm.end_date IS NOT NULL
      AND sm.end_date >= v_today_lima
    ORDER BY sm.student_id, sm.start_date DESC, sm.created_at DESC, sm.id DESC
  ) candidate;

  v_target_ids := COALESCE(v_target_ids, ARRAY[]::uuid[]);

  PERFORM sm.id
  FROM public.student_memberships sm
  WHERE sm.id = ANY(v_target_ids)
  ORDER BY sm.id
  FOR UPDATE;

  SELECT COALESCE(array_agg(sm.id ORDER BY sm.id), ARRAY[]::uuid[])
  INTO v_target_ids
  FROM public.student_memberships sm
  WHERE sm.id = ANY(v_target_ids)
    AND sm.status = 'active'
    AND sm.classes_remaining > 0
    AND sm.end_date IS NOT NULL
    AND sm.end_date >= v_today_lima;

  WITH updated_memberships AS (
    UPDATE public.student_memberships sm
    SET end_date = sm.end_date + 7,
        updated_at = now()
    WHERE sm.id = ANY(v_target_ids)
    RETURNING
      sm.id,
      sm.student_id,
      sm.custom_name AS membership_name,
      sm.end_date - 7 AS current_end_date,
      sm.end_date AS new_end_date
  )
  SELECT
    COUNT(*)::integer,
    jsonb_build_object(
      'affected_count', COUNT(*),
      'extensions', COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'student_id', updated_memberships.student_id,
            'student_name', (
              SELECT st.full_name
              FROM public.students st
              WHERE st.id = updated_memberships.student_id
            ),
            'membership_id', updated_memberships.id,
            'membership_name', updated_memberships.membership_name,
            'current_end_date', updated_memberships.current_end_date,
            'new_end_date', updated_memberships.new_end_date
          )
          ORDER BY updated_memberships.student_id
        ),
        '[]'::jsonb
      ),
      'already_applied', false
  )
  INTO v_affected_count, v_result
  FROM updated_memberships;

  UPDATE public.membership_expiry_extension_batches
  SET affected_count = v_affected_count,
      result = v_result
  WHERE idempotency_key = p_idempotency_key;

  PERFORM public.log_admin_action(
    'bulk_membership_expiry_extension',
    'membership_expiry_extension_batches',
    p_idempotency_key,
    NULL,
    NULL,
    NULL,
    jsonb_build_object(
      'reason', btrim(p_reason),
      'extension_days', 7,
      'affected_count', v_affected_count,
      'result', v_result
    )
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_preview_bulk_membership_expiry_extension() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_preview_bulk_membership_expiry_extension() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_preview_bulk_membership_expiry_extension() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_preview_bulk_membership_expiry_extension() TO service_role;

REVOKE ALL ON FUNCTION public.admin_apply_bulk_membership_expiry_extension(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_apply_bulk_membership_expiry_extension(text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_apply_bulk_membership_expiry_extension(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_apply_bulk_membership_expiry_extension(text, uuid) TO service_role;
