-- ============================================================================
-- Fix: Booking Unique Constraint
-- Proposito: Remover el constraint ux_bookings_user_session_active que usa
-- user_id (perfil) e impide que un tutor reserve para multiples hijos en la
-- misma sesion, y reemplazarlo por un constraint que use student_id.
-- ============================================================================

-- Remover restricciones previas si existen como constraint y no solo indice
ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS ux_bookings_user_session_active;

-- Remover el indice unico basado en user_id
DROP INDEX IF EXISTS ux_bookings_user_session_active;

-- Asegurar que tampoco exista el nuevo si estamos re-aplicando
ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS ux_bookings_student_session_active;

DROP INDEX IF EXISTS ux_bookings_student_session_active;

-- Crear el nuevo indice unico basado en student_id que es la entidad correcta
CREATE UNIQUE INDEX ux_bookings_student_session_active
  ON public.bookings (student_id, session_id)
  WHERE status = 'reserved';

COMMENT ON INDEX ux_bookings_student_session_active IS
  'Evita que un mismo alumno tenga multiples reservas activas para el mismo turno.';
