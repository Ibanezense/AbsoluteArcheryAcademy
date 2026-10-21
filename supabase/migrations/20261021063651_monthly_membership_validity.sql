-- Monthly calendar rule: 20 October -> 20 November. No existing membership rows are edited.
CREATE OR REPLACE FUNCTION public.membership_cycle_end_date(p_start date,p_duration_days integer,p_period integer DEFAULT 1)
RETURNS date LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=pg_catalog AS $$
BEGIN
  IF p_duration_days<1 OR p_period NOT BETWEEN 1 AND 12 THEN RAISE EXCEPTION 'Duración no válida'; END IF;
  IF p_duration_days=30 THEN RETURN (p_start + make_interval(months=>p_period))::date; END IF;
  RETURN p_start + (p_duration_days*p_period-1);
END $$;
REVOKE ALL ON FUNCTION public.membership_cycle_end_date(date,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.membership_cycle_end_date(date,integer,integer) TO authenticated,service_role;

-- Preserve the deployed authorization, payments, idempotency and attendance rules verbatim.
-- Fail closed if an entry point is absent or its expected calculation has changed.
DO $migration$
DECLARE v_name text; v_fn record; v_definition text; v_found boolean;
BEGIN
  FOREACH v_name IN ARRAY ARRAY['admin_assign_membership_plan','admin_approve_membership_renewal_request','admin_create_student_membership_cycles'] LOOP
    v_found:=false;
    FOR v_fn IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=v_name AND p.prokind='f' LOOP
      v_definition:=pg_get_functiondef(v_fn.oid);
      IF position('public.membership_cycle_end_date(' IN v_definition)>0 THEN v_found:=true; CONTINUE; END IF;
      IF position('v_start_date + (v_plan.duration_days - 1)' IN v_definition)=0 THEN CONTINUE; END IF;
      v_found:=true;
      v_definition:=replace(v_definition,'v_start_date + (v_plan.duration_days - 1)',CASE WHEN v_name='admin_create_student_membership_cycles'
        THEN 'public.membership_cycle_end_date(COALESCE(p_start_date,current_date),v_plan.duration_days,v_period)'
        ELSE 'public.membership_cycle_end_date(v_start_date,v_plan.duration_days)' END);
      EXECUTE v_definition;
    END LOOP;
    IF NOT v_found THEN RAISE EXCEPTION 'No se pudo verificar el cálculo de %; revisar antes de activar',v_name; END IF;
  END LOOP;
END $migration$;
