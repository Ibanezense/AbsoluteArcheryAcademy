BEGIN;

-- Keep cancellation records visible in the existing administrative roster.

CREATE OR REPLACE FUNCTION public.get_daily_roster(p_date date)
RETURNS TABLE (
  booking_id uuid,
  session_id uuid,
  session_start_at timestamptz,
  entry_type text,
  student_id uuid,
  intro_client_id uuid,
  student_name text,
  student_avatar_url text,
  booking_status text,
  admin_notes text,
  distance_m integer,
  bow_usage_type text,
  bow_poundage integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Solo administradores pueden ver el roster diario';
  END IF;

  RETURN QUERY
  SELECT
    b.id AS booking_id,
    b.session_id,
    s.start_at AS session_start_at,
    CASE WHEN b.intro_client_id IS NOT NULL THEN 'intro' ELSE 'student' END AS entry_type,
    st.id AS student_id,
    ic.id AS intro_client_id,
    COALESCE(st.full_name, ic.full_name, 'Sin nombre') AS student_name,
    st.avatar_url AS student_avatar_url,
    b.status::text AS booking_status,
    b.admin_notes,
    b.distance_m,
    b.bow_usage_type,
    b.bow_poundage
  FROM public.bookings b
  INNER JOIN public.sessions s
    ON s.id = b.session_id
  LEFT JOIN public.students st
    ON st.id = b.student_id
  LEFT JOIN public.intro_clients ic
    ON ic.id = b.intro_client_id
  WHERE s.start_at >= (p_date::timestamp AT TIME ZONE 'America/Lima')
    AND s.start_at < ((p_date + 1)::timestamp AT TIME ZONE 'America/Lima')
    AND b.status IN ('reserved', 'attended', 'no_show', 'cancelled')
  ORDER BY
    s.start_at ASC,
    lower(COALESCE(st.full_name, ic.full_name, 'Sin nombre')) ASC,
    COALESCE(st.full_name, ic.full_name, 'Sin nombre') ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_daily_roster(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_daily_roster(date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.prevent_attendance_before_session()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'attended' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'attended' AND OLD.session_id IS NOT DISTINCT FROM NEW.session_id THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM public.sessions WHERE id = NEW.session_id AND start_at > statement_timestamp()) THEN
    RAISE EXCEPTION 'Podrás marcar la asistencia cuando empiece el turno.';
  END IF;
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION public.prevent_attendance_before_session() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS prevent_attendance_before_session ON public.bookings;
CREATE TRIGGER prevent_attendance_before_session
BEFORE INSERT OR UPDATE OF status, session_id ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.prevent_attendance_before_session();

COMMIT;
