-- ====================================================================
-- FUNCIÓN ACTUALIZADA: book_session con validación de límites
-- ====================================================================
-- Actualiza book_session para validar:
-- 1. Cupos disponibles por distancia (pacas x 4 plazas)
-- 2. Cupos disponibles por grupo (niños, jóvenes, adultos, etc.)
-- 3. Almacena distance_m y group_type en la reserva
-- ====================================================================

CREATE OR REPLACE FUNCTION book_session(p_session uuid)
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

  -- VALIDAR DISPONIBILIDAD usando check_session_availability_v2
  v_availability := check_session_availability_v2(
    p_session, 
    v_profile.distance_m, 
    v_profile.group_type
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

GRANT EXECUTE ON FUNCTION book_session(uuid) TO authenticated;
