ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS is_country_club_tiabaya_member boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.students.is_country_club_tiabaya_member IS
  'Marca si el alumno pertenece al Country Club Tiabaya.';
