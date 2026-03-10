-- ============================================================================
-- PREPARE ACCESS CODE LOGIN
-- Fecha: 2026-02-28
-- Proposito:
-- 1. Normalizar profiles.access_code para login por codigo
-- 2. Mantener compatibilidad temporal con codigos legacy
-- 3. Exponer una funcion util para generar nuevos codigos
-- ============================================================================

ALTER TABLE public.profiles
  ALTER COLUMN access_code TYPE text
  USING NULLIF(upper(btrim(access_code::text)), '');

UPDATE public.profiles
SET access_code = upper(btrim(access_code))
WHERE access_code IS NOT NULL;

DROP INDEX IF EXISTS idx_profiles_access_code_unique;
CREATE UNIQUE INDEX idx_profiles_access_code_unique
  ON public.profiles(access_code)
  WHERE access_code IS NOT NULL;

COMMENT ON COLUMN public.profiles.access_code IS
  'Codigo de acceso administrado por la academia. Objetivo actual: 6 caracteres alfanumericos en mayusculas. Durante la transicion pueden existir codigos legacy.';

CREATE OR REPLACE FUNCTION public.generate_access_code(p_length integer DEFAULT 6)
RETURNS text
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  v_chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text := '';
  v_index integer;
BEGIN
  IF p_length < 6 THEN
    RAISE EXCEPTION 'El largo minimo del access_code es 6';
  END IF;

  FOR v_index IN 1..p_length LOOP
    v_code := v_code || substr(v_chars, 1 + floor(random() * length(v_chars))::integer, 1);
  END LOOP;

  RETURN v_code;
END;
$$;

COMMENT ON FUNCTION public.generate_access_code(integer) IS
  'Genera un codigo de acceso alfanumerico en mayusculas para cuentas gestionadas por la academia.';
