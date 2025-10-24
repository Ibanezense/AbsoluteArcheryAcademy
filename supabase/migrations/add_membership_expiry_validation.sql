-- ====================================================================
-- ADD: Validación de membresía vencida en funciones de booking
-- ====================================================================
-- Este script agrega validación para impedir reservas si la membresía
-- está vencida, incluso si el alumno tiene clases disponibles
-- ====================================================================

-- ====================================================================
-- 1. ACTUALIZAR book_session (usuarios regulares)
-- ====================================================================
DROP FUNCTION IF EXISTS public.book_session(uuid);

CREATE OR REPLACE FUNCTION public.book_session(p_session uuid)
RETURNS bookings
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_profile profiles;
  v_session sessions;
  v_booking bookings;
  v_availability jsonb;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  -- Obtener perfil del usuario
  SELECT * INTO v_profile FROM profiles WHERE id = v_user;
  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'Perfil no encontrado';
  END IF;

  -- NUEVA VALIDACIÓN: Verificar que la membresía no esté vencida
  IF v_profile.membership_end IS NOT NULL AND v_profile.membership_end < CURRENT_DATE THEN
    RAISE EXCEPTION 'Tu membresía ha vencido. Por favor contacta al administrador para renovarla.';
  END IF;

  -- Validar que tenga clases disponibles
  IF COALESCE(v_profile.classes_remaining, 0) <= 0 THEN
    RAISE EXCEPTION 'No tienes clases disponibles';
  END IF;

  -- Validar que tenga distancia y grupo configurados
  IF v_profile.distance_m IS NULL THEN
    RAISE EXCEPTION 'Tu perfil no tiene configurada una distancia de tiro. Por favor contacta al administrador.';
  END IF;

  IF v_profile.group_type IS NULL THEN
    RAISE EXCEPTION 'Tu perfil no tiene configurado un grupo. Por favor contacta al administrador.';
  END IF;

  -- Obtener la sesión
  SELECT * INTO v_session FROM sessions WHERE id = p_session FOR UPDATE;
  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Sesión no encontrada';
  END IF;

  IF v_session.status <> 'scheduled' THEN
    RAISE EXCEPTION 'La sesión no está disponible';
  END IF;

  IF v_session.start_at <= NOW() THEN
    RAISE EXCEPTION 'No puedes reservar una clase pasada';
  END IF;

  -- Evitar doble reserva del mismo usuario en la misma sesión
  IF EXISTS (
    SELECT 1 FROM bookings 
    WHERE session_id = p_session 
      AND user_id = v_user 
      AND status = 'reserved'
  ) THEN
    RAISE EXCEPTION 'Ya reservaste esta sesión';
  END IF;

  -- VALIDAR DISPONIBILIDAD usando check_session_availability_v2 con prefijo public
  v_availability := public.check_session_availability_v2(
    p_session, 
    v_profile.distance_m, 
    v_profile.group_type::text
  );

  -- Si no hay cupos disponibles, lanzar excepción con el mensaje apropiado
  IF (v_availability->>'available')::boolean = FALSE THEN
    RAISE EXCEPTION '%', v_availability->>'message';
  END IF;

  -- Crear la reserva con distancia y grupo
  INSERT INTO bookings(user_id, session_id, status, distance_m, group_type) 
  VALUES (v_user, p_session, 'reserved', v_profile.distance_m, v_profile.group_type)
  RETURNING * INTO v_booking;

  -- Descontar clase del perfil
  UPDATE profiles 
  SET classes_remaining = classes_remaining - 1 
  WHERE id = v_user;

  RETURN v_booking;
END;
$$;

GRANT EXECUTE ON FUNCTION public.book_session(uuid) TO authenticated;

-- ====================================================================
-- 2. ACTUALIZAR admin_book_session (administradores)
-- ====================================================================
-- NOTA: Los admins SÍ pueden reservar para alumnos con membresía vencida
-- (caso de uso: renovación en proceso, clase de cortesía, etc.)
-- Pero se les advierte con un mensaje si la membresía está vencida
DROP FUNCTION IF EXISTS public.admin_book_session(uuid, uuid);

CREATE OR REPLACE FUNCTION public.admin_book_session(
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

  -- ADVERTENCIA: Si la membresía está vencida (pero el admin puede continuar)
  IF v_profile.membership_end IS NOT NULL AND v_profile.membership_end < CURRENT_DATE THEN
    RAISE NOTICE 'ADVERTENCIA: La membresía del estudiante está vencida desde %', v_profile.membership_end;
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

  -- VALIDAR DISPONIBILIDAD usando check_session_availability_v2 con prefijo public
  v_availability := public.check_session_availability_v2(
    p_session_id, 
    v_profile.distance_m, 
    v_profile.group_type::text
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

GRANT EXECUTE ON FUNCTION public.admin_book_session(uuid, uuid) TO authenticated;

-- ====================================================================
-- VERIFICACIÓN
-- ====================================================================
-- Para verificar que las funciones se actualizaron correctamente:
-- SELECT routine_name, routine_schema 
-- FROM information_schema.routines 
-- WHERE routine_name IN ('book_session', 'admin_book_session')
-- AND routine_schema = 'public';
-- ====================================================================
