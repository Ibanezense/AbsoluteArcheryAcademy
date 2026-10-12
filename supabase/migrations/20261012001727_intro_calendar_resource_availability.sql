BEGIN;

-- Trial capacity must respect shared bows occupied by overlapping sessions.
-- Fixed operational sites use their physical capacity rather than shared assets.
CREATE OR REPLACE FUNCTION public.intro_calendar_spots(p_session_id uuid, p_exclude_booking_id uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_session public.sessions; v_data jsonb; v_equipment integer; v_shared integer;
BEGIN
  SELECT * INTO v_session FROM public.sessions WHERE id=p_session_id;
  IF v_session.id IS NULL THEN RETURN 0; END IF;
  v_data := public.get_multisite_session_availability(p_session_id, NULL, true, p_exclude_booking_id);
  v_equipment := COALESCE((public.get_session_equipment_availability(p_session_id, p_exclude_booking_id)->>'intro_spots_remaining')::integer,0);
  IF v_data->>'capacity_policy' = 'fixed_operational' THEN
    RETURN GREATEST(0, LEAST(v_equipment, COALESCE((v_data->>'physical_spots_remaining')::integer,0)));
  END IF;
  SELECT COALESCE(SUM(GREATEST(0, LEAST(
    allocation.quantity - (
      SELECT count(*) FROM public.booking_resource_claims claim
      JOIN public.academy_bows bow ON bow.id=claim.academy_bow_id
      WHERE claim.session_id=p_session_id AND claim.resource_type='shared_bow' AND claim.released_at IS NULL
        AND bow.draw_weight_lbs=allocation.draw_weight_lbs
        AND (p_exclude_booking_id IS NULL OR claim.booking_id<>p_exclude_booking_id)
    ),
    (SELECT count(*) FROM public.academy_bows bow
     WHERE bow.pool_type='shared' AND bow.operational_status='active' AND bow.draw_weight_lbs=allocation.draw_weight_lbs
       AND NOT EXISTS (
         SELECT 1 FROM public.booking_resource_claims claim JOIN public.sessions occupied ON occupied.id=claim.session_id
         WHERE claim.academy_bow_id=bow.id AND claim.released_at IS NULL
           AND (p_exclude_booking_id IS NULL OR claim.booking_id<>p_exclude_booking_id)
           AND occupied.start_at<v_session.end_at AND occupied.end_at>v_session.start_at
       ))
  ))),0)::integer INTO v_shared
  FROM public.session_equipment_allocations allocation
  WHERE allocation.session_id=p_session_id AND allocation.draw_weight_lbs IN (18,20);
  RETURN GREATEST(0, LEAST(v_equipment, v_shared, COALESCE((v_data->>'physical_spots_remaining')::integer,0)));
END;
$$;
REVOKE ALL ON FUNCTION public.intro_calendar_spots(uuid,uuid) FROM PUBLIC, anon, authenticated;

COMMIT;
