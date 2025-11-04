-- ============================================================================
-- Migración: Añadir columna amount_paid a profile_memberships
-- Fecha: 2025-11-04
-- Descripción: Añade columna para registrar el monto pagado por cada membresía
-- ============================================================================

-- Añadir columna amount_paid a la tabla profile_memberships
ALTER TABLE public.profile_memberships 
ADD COLUMN IF NOT EXISTS amount_paid INTEGER NOT NULL DEFAULT 0 
CHECK (amount_paid >= 0);

-- Comentario descriptivo
COMMENT ON COLUMN public.profile_memberships.amount_paid IS 
  'Monto pagado en soles (PEN) por esta membresía';

-- Verificación:
-- SELECT id, user_id, membership_type_id, amount_paid FROM public.profile_memberships LIMIT 5;
