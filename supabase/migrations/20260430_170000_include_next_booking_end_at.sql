-- ============================================================================
-- Fix: expose end_at/status in next booking widget
-- Fecha: 2026-04-30
-- Proposito:
-- 1. Permitir que la UI del alumno muestre "Cancelar reserva" hasta que termine la clase.
-- 2. Mantener compatibilidad agregando campos al JSON existente.
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_my_next_booking();
DROP FUNCTION IF EXISTS public.get_my_next_booking(uuid);
CREATE OR REPLACE FUNCTION public.get_my_next_booking(p_student_id uuid DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid;
  v_result json;
BEGIN
  v_student_id := public.resolve_accessible_student_id(p_student_id);

  SELECT json_build_object(
    'start_at', s.start_at,
    'end_at', s.end_at,
    'status', b.status,
    'distance_m', COALESCE(b.distance_m, s.distance),
    'booking_id', b.id
  )
  INTO v_result
  FROM public.bookings b
  INNER JOIN public.sessions s
    ON s.id = b.session_id
  WHERE b.student_id = v_student_id
    AND b.status = 'reserved'
    AND s.end_at >= now()
  ORDER BY s.start_at ASC
  LIMIT 1;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_next_booking(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_my_next_booking(uuid) IS
  'Retorna la siguiente reserva del alumno accesible incluyendo end_at/status para permitir cancelacion mientras la clase no haya terminado.';
