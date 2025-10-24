-- ====================================================================
-- FUNCIÓN ACTUALIZADA: admin_book_session con validación de límites
-- ====================================================================
-- Permite que el admin reserve clases para estudiantes
-- validando los límites por distancia y grupo
-- ====================================================================

-- Eliminar la función anterior si existe
DROP FUNCTION IF EXISTS admin_book_session(uuid, uuid);

CREATE OR REPLACE FUNCTION admin_book_session(
  p_session_id uuid,
  p_student_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_is_admin boolean;
  v_profile profiles;
  v_session sessions;
  v_availability jsonb;
BEGIN
  -- Verificar que es admin
  SELECT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = v_user AND role = 'admin'
  ) INTO v_is_admin;
  
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'No autorizado - Solo admins pueden hacer reservas';
  END IF;

  -- Obtener perfil del estudiante
  SELECT * INTO v_profile FROM profiles WHERE id = p_student_id;
  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'Estudiante no encontrado';
  END IF;

  -- Validar que tenga clases disponibles
  IF COALESCE(v_profile.classes_remaining, 0) <= 0 THEN
    RAISE EXCEPTION 'El estudiante no tiene clases disponibles';
  END IF;

  -- Validar configuración del perfil
  IF v_profile.distance_m IS NULL THEN
    RAISE EXCEPTION 'El estudiante no tiene configurada una distancia de tiro';
  END IF;

  IF v_profile.group_type IS NULL THEN
    RAISE EXCEPTION 'El estudiante no tiene configurado un grupo';
  END IF;

  -- Obtener la sesión
  SELECT * INTO v_session FROM sessions WHERE id = p_session_id FOR UPDATE;
  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Sesión no encontrada';
  END IF;

  IF v_session.status <> 'scheduled' THEN
    RAISE EXCEPTION 'La sesión no está disponible';
  END IF;

  -- Evitar doble reserva
  IF EXISTS (
    SELECT 1 FROM bookings 
    WHERE session_id = p_session_id 
      AND user_id = p_student_id 
      AND status = 'reserved'
  ) THEN
    RAISE EXCEPTION 'El estudiante ya tiene una reserva en esta sesión';
  END IF;

  -- VALIDAR DISPONIBILIDAD usando check_session_availability_v2
  v_availability := check_session_availability_v2(
    p_session_id, 
    v_profile.distance_m, 
    v_profile.group_type
  );

  IF (v_availability->>'available')::boolean = FALSE THEN
    RAISE EXCEPTION '%', v_availability->>'message';
  END IF;

  -- Crear la reserva
  INSERT INTO bookings(user_id, session_id, status, distance_m, group_type) 
  VALUES (p_student_id, p_session_id, 'reserved', v_profile.distance_m, v_profile.group_type);

  -- Descontar clase
  UPDATE profiles 
  SET classes_remaining = classes_remaining - 1 
  WHERE id = p_student_id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_book_session(uuid, uuid) TO authenticated;

-- ====================================================================
-- INSTRUCCIONES:
-- ====================================================================
-- 1. Ejecuta después de los otros dos archivos de migración
-- 2. admin_book_session ahora validará límites correctamente
-- ====================================================================
