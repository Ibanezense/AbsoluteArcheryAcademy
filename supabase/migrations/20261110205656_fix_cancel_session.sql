CREATE OR REPLACE FUNCTION public.admin_cancel_session(
  p_session uuid,
  p_reason text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_booking record;
  v_cancelled integer := 0;
BEGIN
  IF v_actor_id IS NULL OR NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Solo administradores pueden cancelar sesiones';
  END IF;
  IF NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'El motivo es obligatorio';
  END IF;
  PERFORM 1 FROM public.sessions WHERE id = p_session FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sesion no encontrada'; END IF;

  FOR v_booking IN
    SELECT * FROM public.bookings
    WHERE session_id = p_session AND status = 'reserved'
    FOR UPDATE
  LOOP
    INSERT INTO public.booking_cancellations (
      booking_id, student_id, cancellation_source, review_status,
      admin_reason, cancelled_by
    ) VALUES (
      v_booking.id, v_booking.student_id, 'academy', 'not_required',
      btrim(p_reason), v_actor_id
    ) ON CONFLICT (booking_id) DO NOTHING;
    UPDATE public.bookings SET status = 'cancelled', cancelled_at = now(),
      cancelled_by_profile_id = v_actor_id, cancelled_by_role = 'admin', updated_at = now()
    WHERE id = v_booking.id;
    PERFORM public.release_booking_resources(v_booking.id, 'academy');
    v_cancelled := v_cancelled + 1;
  END LOOP;
  UPDATE public.sessions SET status = 'cancelled', notes = concat_ws(E'\n', notes, 'Cancelada: ' || btrim(p_reason))
  WHERE id = p_session;
  RETURN v_cancelled;
END;
$$;

