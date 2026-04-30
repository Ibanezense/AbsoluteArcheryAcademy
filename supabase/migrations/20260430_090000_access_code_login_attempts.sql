-- ============================================================================
-- ACCESS CODE LOGIN RATE LIMITING
-- Fecha: 2026-04-30
-- Proposito: Persistir intentos de login por codigo para bloquear fuerza bruta.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.access_code_login_attempts (
  id bigserial PRIMARY KEY,
  ip_hash text NOT NULL,
  access_code_hash text NOT NULL,
  success boolean NOT NULL DEFAULT false,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS access_code_login_attempts_lookup_idx
  ON public.access_code_login_attempts (ip_hash, access_code_hash, success, attempted_at DESC);

CREATE INDEX IF NOT EXISTS access_code_login_attempts_attempted_at_idx
  ON public.access_code_login_attempts (attempted_at DESC);

ALTER TABLE public.access_code_login_attempts ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.access_code_login_attempts IS
  'Intentos de login por codigo con IP/codigo hasheados. Usado por la API con service role para rate limiting.';
