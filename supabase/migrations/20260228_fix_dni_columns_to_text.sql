-- ============================================================================
-- FIX DNI COLUMN TYPES
-- Fecha: 2026-02-28
-- Proposito:
-- 1. Evitar problemas con columnas dni definidas como character ambiguo
-- 2. Normalizar dni a text en profiles y students
-- 3. Mantener validacion de 8 digitos por constraint
-- ============================================================================

ALTER TABLE public.profiles
  ALTER COLUMN dni TYPE text
  USING NULLIF(btrim(dni::text), '');

ALTER TABLE public.students
  ALTER COLUMN dni TYPE text
  USING NULLIF(btrim(dni::text), '');

DROP INDEX IF EXISTS idx_profiles_dni_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_dni_unique
  ON public.profiles(dni)
  WHERE dni IS NOT NULL;

DROP INDEX IF EXISTS idx_students_dni_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_students_dni_unique
  ON public.students(dni)
  WHERE dni IS NOT NULL;

ALTER TABLE public.students
  DROP CONSTRAINT IF EXISTS students_dni_format_chk;

ALTER TABLE public.students
  ADD CONSTRAINT students_dni_format_chk
  CHECK (dni IS NULL OR dni ~ '^[0-9]{8}$');

COMMENT ON COLUMN public.profiles.dni IS
  'DNI de 8 digitos. Se almacena como text para evitar problemas de padding o tipos character heredados.';

COMMENT ON COLUMN public.students.dni IS
  'DNI de 8 digitos del alumno. Se almacena como text para evitar problemas de padding o tipos character heredados.';
