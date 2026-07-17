ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS dominant_hand text;

ALTER TABLE public.students
  DROP CONSTRAINT IF EXISTS students_dominant_hand_check;

ALTER TABLE public.students
  ADD CONSTRAINT students_dominant_hand_check
  CHECK (dominant_hand IS NULL OR dominant_hand IN ('right', 'left', 'ambidextrous'));

COMMENT ON COLUMN public.students.dominant_hand IS
  'Mano dominante del alumno: right, left o ambidextrous.';
