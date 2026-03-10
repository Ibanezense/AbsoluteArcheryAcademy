-- ============================================================================
-- SCHEMA CLEANUP PHASE 1
-- Fecha: 2026-02-28
-- Proposito:
-- 1. Eliminar tablas claramente muertas o fuera del flujo actual
-- 2. Reducir ruido del esquema sin tocar tablas legacy aun necesarias
-- 3. Mantener fuera de esta fase las tablas de membresias, reservas e infraestructura
-- ============================================================================

-- IMPORTANTE:
-- Esta fase solo elimina tablas sin uso real en la app actual ni en el modelo V2.
-- No toca:
-- - memberships / profile_memberships
-- - equipment / shooting_lanes / locations
-- - profiles / students / bookings / student_memberships
-- Ejecutar solo despues de exportar respaldo si esos datos historicos deben conservarse.

BEGIN;

-- ----------------------------------------------------------------------------
-- LIMPIEZA DE FUNCIONES LEGACY DEPENDIENTES
-- Evita errores por funciones que retornan tipos compuestos de tablas legacy.
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  v_table_name text;
  v_drop_sql text;
BEGIN
  FOR v_table_name IN
    SELECT unnest(ARRAY[
      'matches_eliminations',
      'personal_records',
      'ranking_history',
      'scores_qualifications',
      'season_statistics',
      'training_sessions',
      'badges',
      'tournament_results',
      'tournament_participations',
      'tournaments',
      'payment_transactions',
      'admin_users',
      'app_settings',
      'academy_profile',
      'coach_notes'
    ])
  LOOP
    FOR v_drop_sql IN
      SELECT DISTINCT format(
        'DROP FUNCTION IF EXISTS %I.%I(%s);',
        proc_ns.nspname,
        proc.proname,
        pg_get_function_identity_arguments(proc.oid)
      )
      FROM pg_class cls
      JOIN pg_namespace cls_ns
        ON cls_ns.oid = cls.relnamespace
      JOIN pg_depend dep
        ON (
          (dep.refclassid = 'pg_class'::regclass AND dep.refobjid = cls.oid)
          OR (dep.refclassid = 'pg_type'::regclass AND dep.refobjid = cls.reltype)
        )
      JOIN pg_proc proc
        ON proc.oid = dep.objid
      JOIN pg_namespace proc_ns
        ON proc_ns.oid = proc.pronamespace
      WHERE cls_ns.nspname = 'public'
        AND cls.relname = v_table_name
        AND dep.classid = 'pg_proc'::regclass
        AND proc_ns.nspname = 'public'
    LOOP
      EXECUTE v_drop_sql;
    END LOOP;
  END LOOP;
END
$$;

-- ----------------------------------------------------------------------------
-- TABLAS DEPORTIVAS / HISTORICAS SIN USO ACTUAL
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  v_table_name text;
BEGIN
  FOR v_table_name IN
    SELECT unnest(ARRAY[
      'matches_eliminations',
      'personal_records',
      'ranking_history',
      'scores_qualifications',
      'season_statistics',
      'training_sessions',
      'badges',
      'tournament_results',
      'tournament_participations',
      'tournaments',
      'payment_transactions',
      'admin_users',
      'app_settings',
      'academy_profile',
      'coach_notes'
    ])
  LOOP
    BEGIN
      EXECUTE format('DROP TABLE IF EXISTS public.%I;', v_table_name);
    EXCEPTION
      WHEN SQLSTATE '2BP01' THEN
        RAISE NOTICE 'Se omite DROP TABLE public.% por dependencias activas.', v_table_name;
    END;
  END LOOP;
END
$$;

COMMIT;

-- ----------------------------------------------------------------------------
-- NOTA
-- ----------------------------------------------------------------------------
-- Tablas excluidas intencionalmente de esta fase:
-- - attendance_audit: aun depende de RPCs de asistencia
-- - memberships: aun usada por la UI de admin/membresias
-- - profile_memberships: aun sirve de compatibilidad/migracion
-- - equipment / shooting_lanes / locations: requieren validacion funcional antes de retiro
