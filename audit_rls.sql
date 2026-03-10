-- ============================================================================
-- SCRIPT DE AUDITORÍA DE SEGURIDAD RLS
-- ============================================================================

SELECT
    relname AS nombre_tabla,
    relrowsecurity AS rls_activado
FROM pg_class
WHERE relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  AND relkind = 'r'
ORDER BY rls_activado ASC, nombre_tabla ASC;
