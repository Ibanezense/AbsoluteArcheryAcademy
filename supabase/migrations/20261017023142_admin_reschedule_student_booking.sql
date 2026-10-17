-- Atomic admin moves preserve booking identity and membership credits.
CREATE OR REPLACE FUNCTION public.get_multisite_session_availability(
  p_session_id uuid,
  p_student_id uuid DEFAULT NULL,
  p_is_intro boolean DEFAULT false,
  p_exclude_booking_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.sessions;
  v_location public.academy_locations;
  v_student public.students;
  v_usage text := 'shared_inventory';
  v_weight integer := 20;
  v_physical_capacity integer := 0;
  v_reserved integer := 0;
  v_regular_reserved integer := 0;
  v_physical_remaining integer := 0;
  v_regular_remaining integer := 0;
  v_allocated integer := 0;
  v_session_bows_used integer := 0;
  v_globally_free integer := 0;
  v_shared_remaining integer := 0;
  v_assigned_bow_available boolean := false;
  v_student_id uuid;
BEGIN
  SELECT * INTO v_session
  FROM public.sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'Sesion no encontrada';
  END IF;

  SELECT * INTO v_location
  FROM public.academy_locations
  WHERE id = v_session.location_id;

  IF p_student_id IS NOT NULL THEN
    v_student_id := CASE WHEN auth.uid() IS NULL THEN p_student_id
      ELSE public.resolve_accessible_student_id(p_student_id) END;
    SELECT * INTO v_student FROM public.students WHERE id = v_student_id;
    IF v_student.id IS NULL THEN RAISE EXCEPTION 'Alumno no encontrado'; END IF;
    v_usage := CASE
      WHEN COALESCE(v_student.has_own_bow, false) THEN 'own'
      WHEN COALESCE(v_student.assigned_bow, false) THEN 'assigned'
      ELSE 'shared_inventory'
    END;
    v_weight := COALESCE(v_student.bow_poundage, 20);
  ELSIF p_is_intro THEN
    -- 18 lb is a priority for trials, not an absolute restriction. If those
    -- assets are unavailable, 20 lb may be selected by the claim function.
    v_weight := 18;
  END IF;

  SELECT COUNT(*)::integer,
         COUNT(*) FILTER (WHERE b.student_id IS NOT NULL)::integer
  INTO v_reserved, v_regular_reserved
  FROM public.bookings b
  WHERE b.session_id = p_session_id AND b.status = 'reserved'
    AND (p_exclude_booking_id IS NULL OR b.id <> p_exclude_booking_id);

  SELECT COALESCE(
    v_session.physical_capacity,
    (SELECT SUM(COALESCE(sda.slot_capacity, sda.targets * 4))
     FROM public.session_distance_allocations sda WHERE sda.session_id = p_session_id),
    0
  )::integer INTO v_physical_capacity;

  IF v_location.code = 'umacollo' THEN
    v_physical_capacity := 4;
    v_regular_remaining := GREATEST(2 - v_regular_reserved, 0);
  ELSE
    v_regular_remaining := GREATEST(v_physical_capacity - v_regular_reserved, 0);
  END IF;
  v_physical_remaining := GREATEST(v_physical_capacity - v_reserved, 0);

  IF v_usage = 'shared_inventory' THEN
    SELECT COALESCE(sea.quantity, 0)
    INTO v_allocated
    FROM public.session_equipment_allocations sea
    WHERE sea.session_id = p_session_id AND sea.draw_weight_lbs = v_weight;

    SELECT COUNT(*)::integer INTO v_session_bows_used
    FROM public.booking_resource_claims claim
    JOIN public.academy_bows bow ON bow.id = claim.academy_bow_id
    WHERE claim.session_id = p_session_id
      AND (p_exclude_booking_id IS NULL OR claim.booking_id <> p_exclude_booking_id)
      AND claim.resource_type = 'shared_bow'
      AND claim.released_at IS NULL
      AND bow.draw_weight_lbs = v_weight;

    SELECT COUNT(*)::integer INTO v_globally_free
    FROM public.academy_bows bow
    WHERE bow.pool_type = 'shared'
      AND bow.operational_status = 'active'
      AND bow.draw_weight_lbs = v_weight
      AND NOT EXISTS (
        SELECT 1
        FROM public.booking_resource_claims claim
        JOIN public.sessions occupied_session ON occupied_session.id = claim.session_id
        WHERE claim.academy_bow_id = bow.id
          AND (p_exclude_booking_id IS NULL OR claim.booking_id <> p_exclude_booking_id)
          AND claim.released_at IS NULL
          AND occupied_session.start_at < v_session.end_at
          AND occupied_session.end_at > v_session.start_at
      );

    v_shared_remaining := GREATEST(LEAST(v_allocated - v_session_bows_used, v_globally_free), 0);

    IF p_is_intro AND v_weight = 18 AND v_shared_remaining = 0 THEN
      SELECT COALESCE(sea.quantity, 0) INTO v_allocated
      FROM public.session_equipment_allocations sea
      WHERE sea.session_id = p_session_id AND sea.draw_weight_lbs = 20;
      SELECT COUNT(*)::integer INTO v_session_bows_used
      FROM public.booking_resource_claims claim
      JOIN public.academy_bows bow ON bow.id = claim.academy_bow_id
      WHERE claim.session_id = p_session_id AND (p_exclude_booking_id IS NULL OR claim.booking_id <> p_exclude_booking_id)
      AND claim.resource_type = 'shared_bow'
        AND claim.released_at IS NULL AND bow.draw_weight_lbs = 20;
      SELECT COUNT(*)::integer INTO v_globally_free
      FROM public.academy_bows bow
      WHERE bow.pool_type = 'shared' AND bow.operational_status = 'active'
        AND bow.draw_weight_lbs = 20
        AND NOT EXISTS (
          SELECT 1 FROM public.booking_resource_claims claim
          JOIN public.sessions occupied_session ON occupied_session.id = claim.session_id
          WHERE claim.academy_bow_id = bow.id
          AND (p_exclude_booking_id IS NULL OR claim.booking_id <> p_exclude_booking_id) AND claim.released_at IS NULL
            AND occupied_session.start_at < v_session.end_at
            AND occupied_session.end_at > v_session.start_at
        );
      v_shared_remaining := GREATEST(LEAST(v_allocated - v_session_bows_used, v_globally_free), 0);
      IF v_shared_remaining > 0 THEN v_weight := 20; END IF;
    END IF;
  ELSIF v_usage = 'assigned' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.academy_bows bow
      WHERE bow.assigned_student_id = v_student.id
        AND bow.pool_type = 'assigned'
        AND bow.operational_status = 'active'
        AND NOT EXISTS (
          SELECT 1
          FROM public.booking_resource_claims claim
          JOIN public.sessions occupied_session ON occupied_session.id = claim.session_id
          WHERE claim.academy_bow_id = bow.id
          AND (p_exclude_booking_id IS NULL OR claim.booking_id <> p_exclude_booking_id)
            AND claim.released_at IS NULL
            AND (p_exclude_booking_id IS NULL OR claim.booking_id <> p_exclude_booking_id)
            AND occupied_session.start_at < v_session.end_at
            AND occupied_session.end_at > v_session.start_at
        )
    ) INTO v_assigned_bow_available;
    v_shared_remaining := CASE WHEN v_assigned_bow_available THEN 1 ELSE 0 END;
  ELSE
    v_shared_remaining := v_physical_remaining;
  END IF;

  RETURN jsonb_build_object(
    'available', v_session.status = 'scheduled'
      AND v_physical_remaining > 0
      AND (p_is_intro OR v_location.code <> 'umacollo' OR v_regular_remaining > 0)
      AND (v_usage = 'own' OR v_shared_remaining > 0),
    'location_code', v_location.code,
    'capacity_policy', v_location.capacity_policy,
    'physical_capacity', v_physical_capacity,
    'physical_spots_remaining', v_physical_remaining,
    'regular_spots_remaining', v_regular_remaining,
    'shared_bows_remaining', v_shared_remaining,
    'selected_bow_weight', v_weight,
    'bow_usage_type', v_usage,
    'message', CASE
      WHEN v_physical_remaining <= 0 THEN 'No quedan espacios disponibles en paca'
      WHEN NOT p_is_intro AND v_location.code = 'umacollo' AND v_regular_remaining <= 0 THEN 'El turno ya tiene dos alumnos regulares'
      WHEN v_usage = 'shared_inventory' AND v_shared_remaining <= 0 THEN 'No queda un arco compartido compatible'
      WHEN v_usage = 'assigned' AND v_shared_remaining <= 0 THEN 'El arco asignado no esta disponible en este horario'
      ELSE 'Turno disponible'
    END
  );
END;
$$;


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
  IF NOT COALESCE(st.is_active,false) OR st.status IN ('retired','withdrawn','blocked','suspended') THEN RETURN 'El alumno no está habilitado para reservar.'; END IF;
  IF st.distance_m IS NULL THEN RETURN 'Configura la distancia del alumno antes de cambiar el horario.'; END IF;
  IF loc.code='umacollo' AND st.distance_m > 20 THEN RETURN 'Umacollo admite distancias de hasta 20 metros.'; END IF;
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
    distance_m=st.distance_m,
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
