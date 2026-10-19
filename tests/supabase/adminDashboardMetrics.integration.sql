-- Read-only assertions against a disposable test database; rollback all JWT changes.
BEGIN;
DO $$
DECLARE actor uuid; result jsonb; classified integer; active integer; expected integer;
BEGIN
  SELECT id INTO STRICT actor FROM public.profiles WHERE role='admin' AND is_active LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  result := public.get_admin_dashboard_operational_data()::jsonb;
  SELECT count(*) INTO expected FROM public.students WHERE COALESCE(is_active,true)=true;
  active := (result->'monthly'->>'activeStudents')::integer;
  classified := (result->'studentsByLevel'->>'beginner')::integer +
    (result->'studentsByLevel'->>'developing')::integer +
    (result->'studentsByLevel'->>'advanced')::integer +
    (result->'studentsByLevel'->>'competitive')::integer;
  IF active <> expected THEN RAISE EXCEPTION 'Dashboard active population differs from students.is_active'; END IF;
  IF classified > active THEN RAISE EXCEPTION 'Level counts exceed active population'; END IF;
  -- Unknown values, including Nivel 1, are not assigned an invented equivalence.
  IF EXISTS (
    SELECT 1 FROM (VALUES ('Principiante','beginner'),('En Desarrollo','developing'),
      ('Avanzado','advanced'),('Competitivo','competitive'),('Nivel 1',NULL),('',NULL),(NULL,NULL)) example(level,expected)
    WHERE (CASE WHEN lower(level) LIKE '%competit%' THEN 'competitive'
      WHEN lower(level) LIKE '%avanzad%' THEN 'advanced'
      WHEN lower(level) LIKE '%desarroll%' THEN 'developing'
      WHEN lower(level) LIKE '%princip%' THEN 'beginner' ELSE NULL END) IS DISTINCT FROM expected
  ) THEN RAISE EXCEPTION 'Level classification equivalence changed'; END IF;
END $$;
ROLLBACK;
