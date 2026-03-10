-- ============================================================================
-- STUDENT CLASS CARDS RPC
-- Fecha: 2026-02-28
-- Proposito:
-- 1. Exponer cards visuales por clase de la membresia activa o mas reciente
-- 2. Vincular cada clase usada a su booking real cuando exista
-- 3. Dejar disponibles las clases aun no reservadas
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_student_class_cards(uuid, uuid);
CREATE OR REPLACE FUNCTION public.get_student_class_cards(
  p_student_id uuid DEFAULT NULL,
  p_student_membership_id uuid DEFAULT NULL
)
RETURNS TABLE (
  student_membership_id uuid,
  membership_name text,
  membership_status text,
  classes_total integer,
  classes_remaining integer,
  card_index integer,
  card_status text,
  booking_id uuid,
  session_id uuid,
  start_at timestamptz,
  end_at timestamptz,
  distance_m integer,
  bow_usage_type text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid;
  v_membership_id uuid;
BEGIN
  v_student_id := public.resolve_accessible_student_id(p_student_id);

  IF p_student_membership_id IS NOT NULL THEN
    SELECT sm.id
    INTO v_membership_id
    FROM public.student_memberships sm
    WHERE sm.id = p_student_membership_id
      AND sm.student_id = v_student_id;

    IF v_membership_id IS NULL THEN
      RAISE EXCEPTION 'Membresia no accesible para este alumno';
    END IF;
  ELSE
    SELECT sm.id
    INTO v_membership_id
    FROM public.student_memberships sm
    WHERE sm.student_id = v_student_id
    ORDER BY
      CASE
        WHEN sm.status = 'active' THEN 0
        WHEN sm.status = 'draft' THEN 1
        ELSE 2
      END,
      COALESCE(sm.end_date, DATE '9999-12-31') DESC,
      sm.created_at DESC
    LIMIT 1;
  END IF;

  IF v_membership_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH selected_membership AS (
    SELECT
      sm.id,
      sm.custom_name,
      sm.status,
      sm.classes_total,
      sm.classes_remaining
    FROM public.student_memberships sm
    WHERE sm.id = v_membership_id
  ),
  membership_bookings AS (
    SELECT
      row_number() OVER (
        ORDER BY
          COALESCE(s.start_at, b.created_at) ASC,
          b.created_at ASC,
          b.id ASC
      )::integer AS booking_position,
      b.id AS booking_id,
      b.session_id,
      s.start_at,
      s.end_at,
      b.distance_m,
      b.bow_usage_type,
      b.status::text AS card_status
    FROM public.bookings b
    LEFT JOIN public.sessions s
      ON s.id = b.session_id
    WHERE b.student_id = v_student_id
      AND b.active_membership_id = v_membership_id
      AND b.status IN ('reserved', 'attended', 'no_show')
  )
  SELECT
    sm.id AS student_membership_id,
    sm.custom_name AS membership_name,
    sm.status AS membership_status,
    sm.classes_total,
    sm.classes_remaining,
    slot.card_index,
    COALESCE(mb.card_status, 'available') AS card_status,
    mb.booking_id,
    mb.session_id,
    mb.start_at,
    mb.end_at,
    mb.distance_m,
    mb.bow_usage_type
  FROM selected_membership sm
  CROSS JOIN LATERAL generate_series(1, sm.classes_total) AS slot(card_index)
  LEFT JOIN membership_bookings mb
    ON mb.booking_position = slot.card_index
  ORDER BY slot.card_index ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_student_class_cards(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.get_student_class_cards(uuid, uuid) IS
  'Retorna las cards visuales por clase de la membresia activa o mas reciente del alumno accesible.';
