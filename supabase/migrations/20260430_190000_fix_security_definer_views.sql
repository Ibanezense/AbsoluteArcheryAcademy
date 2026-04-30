-- ============================================================================
-- Fix Supabase Advisor: Security Definer Views
-- Fecha: 2026-04-30
-- Proposito:
-- 1. Evitar que vistas publicas se ejecuten con privilegios del owner.
-- 2. Hacer que las vistas respeten permisos/RLS del invocador.
-- 3. Ejecutar de forma defensiva: algunas vistas existen en Supabase pero no
--    estan versionadas en las migraciones antiguas del repo.
-- ============================================================================

ALTER VIEW IF EXISTS public.dashboard_kpis SET (security_invoker = true);
ALTER VIEW IF EXISTS public.session_distance_availability SET (security_invoker = true);
ALTER VIEW IF EXISTS public.session_details SET (security_invoker = true);
ALTER VIEW IF EXISTS public.sessions_with_availability SET (security_invoker = true);
ALTER VIEW IF EXISTS public.admin_roster_by_distance SET (security_invoker = true);
ALTER VIEW IF EXISTS public.admin_students_view SET (security_invoker = true);
ALTER VIEW IF EXISTS public.admin_bookings_view SET (security_invoker = true);
ALTER VIEW IF EXISTS public.weekly_schedule SET (security_invoker = true);
