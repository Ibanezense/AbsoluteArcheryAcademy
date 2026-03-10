-- ============================================================================
-- RPC: admin_delete_session
-- Fecha: 2026-03-10
-- Proposito: Permite a un administrador eliminar un turno por completo y sus reservas.
-- ============================================================================

DROP FUNCTION IF EXISTS public.admin_delete_session(uuid);
CREATE OR REPLACE FUNCTION public.admin_delete_session(
  p_session_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_actor_role text;
  v_is_admin boolean := false;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  -- Comprobar si el actor es superadmin o admin
  SELECT role INTO v_actor_role
  FROM public.profiles
  WHERE id = v_actor_id;
  
  IF v_actor_role IN ('superadmin', 'admin') THEN
    v_is_admin := true;
  END IF;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'No tienes permisos para eliminar turnos';
  END IF;

  -- Primero, eliminar cualquier relacion (cascada manual si el ON DELETE CASCADE no está configurado)
  DELETE FROM public.session_distance_allocations WHERE session_id = p_session_id;
  DELETE FROM public.bookings WHERE session_id = p_session_id;
  DELETE FROM public.sessions WHERE id = p_session_id;

END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_session(uuid) TO authenticated;

COMMENT ON FUNCTION public.admin_delete_session(uuid) IS 
  'Elimina un turno completamente, incluyendo sus cupos (distance_allocations) y reservas. Solo para admins.';
