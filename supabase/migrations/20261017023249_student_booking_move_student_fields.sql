-- Shared eligibility for the picker and the final write; never callable by clients.
CREATE OR REPLACE FUNCTION public.student_booking_move_restriction(p_booking_id uuid, p_session_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b public.bookings; old_session public.sessions; target public.sessions;
  m public.student_memberships; st public.students; loc public.academy_locations;
  target_date date; old_week date; target_week date; used integer;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id=p_booking_id;
  IF b.id IS NULL OR b.student_id IS NULL OR b.intro_client_id IS NOT NULL THEN RETURN 'Reserva de alumno no encontrada.'; END IF;
  SELECT * INTO old_session FROM public.sessions WHERE id=b.session_id;
  IF b.status <> 'reserved' OR old_session.status <> 'scheduled' OR old_session.start_at <= now() THEN RETURN 'Solo se pueden mover reservas pendientes de clases futuras.'; END IF;
  IF b.session_id=p_session_id THEN RETURN 'Selecciona un horario diferente al actual.'; END IF;
  SELECT * INTO target FROM public.sessions WHERE id=p_session_id;
  IF target.id IS NULL OR target.status <> 'scheduled' OR target.start_at <= now() THEN RETURN 'El nuevo turno ya no está disponible.'; END IF;
  SELECT * INTO loc FROM public.academy_locations WHERE id=target.location_id;
  IF loc.id IS NULL OR NOT loc.is_active THEN RETURN 'La sede no está activa.'; END IF;
  SELECT * INTO st FROM public.students WHERE id=b.student_id;
  IF NOT COALESCE(st.is_active,false) OR st.operational_status IN ('inactive','paused','retired','withdrawn','blocked','suspended') THEN RETURN 'El alumno no está habilitado para reservar.'; END IF;
  IF st.current_distance_m IS NULL THEN RETURN 'Configura la distancia del alumno antes de cambiar el horario.'; END IF;
  IF loc.code='umacollo' AND st.current_distance_m > 20 THEN RETURN 'Umacollo admite distancias de hasta 20 metros.'; END IF;
  SELECT * INTO m FROM public.student_memberships WHERE id=b.active_membership_id;
  target_date := (target.start_at AT TIME ZONE 'America/Lima')::date;
  IF m.id IS NULL OR m.student_id<>b.student_id OR m.status<>'active' OR target_date<m.start_date OR (m.end_date IS NOT NULL AND target_date>m.end_date) THEN RETURN 'El horario debe estar dentro de la vigencia de la membresía de esta reserva.'; END IF;
  IF m.frozen_at IS NOT NULL OR EXISTS (SELECT 1 FROM public.membership_freezes f WHERE f.membership_purchase_id=m.purchase_id AND f.status<>'cancelled' AND target_date BETWEEN f.start_date AND f.end_date) THEN RETURN 'La membresía está congelada para esa fecha.'; END IF;
  IF EXISTS (SELECT 1 FROM public.bookings other JOIN public.sessions s ON s.id=other.session_id WHERE other.student_id=b.student_id AND other.id<>b.id AND other.status='reserved' AND s.start_at<target.end_at AND s.end_at>target.start_at) THEN RETURN 'El alumno ya tiene otra reserva en un horario superpuesto.'; END IF;
  old_week := date_trunc('week',old_session.start_at AT TIME ZONE 'America/Lima')::date;
  target_week := date_trunc('week',target.start_at AT TIME ZONE 'America/Lima')::date;
  IF b.credit_kind='normal' AND m.weekly_class_target>0 AND old_week<>target_week THEN
    SELECT count(*) INTO used FROM public.bookings other JOIN public.sessions s ON s.id=other.session_id
    WHERE other.active_membership_id=m.id AND other.id<>b.id AND other.credit_kind='normal'
      AND (other.status IN ('reserved','attended','no_show') OR EXISTS (SELECT 1 FROM public.booking_cancellations bc WHERE bc.booking_id=other.id AND (bc.review_status='pending' OR bc.resolution='no_show')))
      AND date_trunc('week',s.start_at AT TIME ZONE 'America/Lima')::date=target_week;
    IF used>=m.weekly_class_target THEN RETURN 'La membresía ya alcanzó su límite de clases en esa semana.'; END IF;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.student_booking_move_restriction(uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_booking_move_options(p_booking_id uuid,p_date date,p_location_id uuid DEFAULT NULL)
RETURNS TABLE(session_id uuid,start_at timestamptz,end_at timestamptz,location_id uuid,location_name text,available boolean,reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.bookings; s record; restriction text; availability jsonb;
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'No autorizado'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id=p_booking_id AND student_id IS NOT NULL AND intro_client_id IS NULL;
  IF b.id IS NULL THEN RAISE EXCEPTION 'Reserva de alumno no encontrada.'; END IF;
  IF p_date IS NULL THEN RAISE EXCEPTION 'Selecciona una fecha.'; END IF;
  FOR s IN SELECT ss.*,l.name AS site_name FROM public.sessions ss JOIN public.academy_locations l ON l.id=ss.location_id
    WHERE ss.start_at >= (p_date::timestamp AT TIME ZONE 'America/Lima') AND ss.start_at < ((p_date+1)::timestamp AT TIME ZONE 'America/Lima')
      AND ss.start_at>now() AND ss.status='scheduled' AND l.is_active AND ss.id<>b.session_id AND (p_location_id IS NULL OR ss.location_id=p_location_id)
    ORDER BY ss.start_at,ss.location_id,ss.id
  LOOP
    restriction:=public.student_booking_move_restriction(b.id,s.id);
    IF restriction IS NULL THEN
      availability:=public.get_multisite_session_availability(s.id,b.student_id,false,b.id);
      IF NOT COALESCE((availability->>'available')::boolean,false) THEN restriction:=availability->>'message'; END IF;
    END IF;
    session_id:=s.id; start_at:=s.start_at; end_at:=s.end_at; location_id:=s.location_id; location_name:=s.site_name;
    available:=restriction IS NULL; reason:=restriction;
    RETURN NEXT;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reschedule_student_booking(p_booking_id uuid,p_session_id uuid,p_expected_updated_at timestamptz)
RETURNS public.bookings LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.bookings; st public.students; restriction text; previous_session uuid; availability jsonb;
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'No autorizado'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id=p_booking_id FOR UPDATE;
  IF b.id IS NULL OR b.student_id IS NULL OR b.intro_client_id IS NOT NULL THEN RAISE EXCEPTION 'Reserva de alumno no encontrada.'; END IF;
  IF p_expected_updated_at IS NULL OR b.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'La reserva cambió. Actualiza el perfil antes de volver a intentarlo.'; END IF;
  -- Serialize the student, membership and both turn capacities before rechecking.
  SELECT * INTO st FROM public.students WHERE id=b.student_id FOR UPDATE;
  PERFORM 1 FROM public.student_memberships WHERE id=b.active_membership_id FOR UPDATE;
  PERFORM 1 FROM public.sessions WHERE id IN (b.session_id,p_session_id) ORDER BY id FOR UPDATE;
  restriction:=public.student_booking_move_restriction(b.id,p_session_id);
  IF restriction IS NOT NULL THEN RAISE EXCEPTION '%',restriction; END IF;
  -- Release and claim inside the same transaction. Any failure restores the original claims.
  PERFORM public.release_booking_resources(b.id,'admin_reschedule');
  availability:=public.get_multisite_session_availability(p_session_id,b.student_id,false,b.id);
  IF NOT COALESCE((availability->>'available')::boolean,false) THEN RAISE EXCEPTION '%',availability->>'message'; END IF;
  previous_session:=b.session_id;
  UPDATE public.bookings SET session_id=p_session_id,manually_rescheduled=true,updated_at=clock_timestamp(),
    distance_m=st.current_distance_m,
    bow_usage_type=CASE WHEN COALESCE(st.has_own_bow,false) THEN 'own' WHEN COALESCE(st.assigned_bow,false) THEN 'assigned' ELSE 'shared_inventory' END,
    bow_poundage=CASE WHEN COALESCE(st.has_own_bow,false) THEN NULL ELSE COALESCE(st.bow_poundage,20) END
  WHERE id=b.id RETURNING * INTO b;
  PERFORM public.log_admin_action('booking_rescheduled','bookings',b.id,b.student_id,p_session_id,b.id,
    jsonb_build_object('previous_session_id',previous_session,'session_id',p_session_id,'membership_id',b.active_membership_id,'credit_kind',b.credit_kind));
  RETURN b;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_get_booking_move_options(uuid,date,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_reschedule_student_booking(uuid,uuid,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_get_booking_move_options(uuid,date,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reschedule_student_booking(uuid,uuid,timestamptz) TO authenticated;
