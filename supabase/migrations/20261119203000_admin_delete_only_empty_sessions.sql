CREATE OR REPLACE FUNCTION public.admin_delete_empty_session(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Solo administradores pueden eliminar turnos';
  END IF;

  PERFORM 1 FROM public.sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Turno no encontrado';
  END IF;
  IF EXISTS (SELECT 1 FROM public.bookings WHERE session_id = p_session_id) THEN
    RAISE EXCEPTION 'El turno tiene historial y no se puede eliminar';
  END IF;

  DELETE FROM public.session_distance_allocations WHERE session_id = p_session_id;
  DELETE FROM public.sessions WHERE id = p_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_empty_session(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_empty_session(uuid) TO authenticated, service_role;

-- Older clients continue to call this name, with the same history safeguard.
CREATE OR REPLACE FUNCTION public.admin_delete_session(p_session_id uuid)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT public.admin_delete_empty_session(p_session_id);
$$;

REVOKE ALL ON FUNCTION public.admin_delete_session(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_session(uuid) TO authenticated, service_role;
