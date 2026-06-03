-- ============================================================================
-- Historical reconciliation plan for student operational status
-- Date: 2026-06-03
-- ============================================================================
-- DO NOT RUN WHOLE FILE IN PRODUCTION.
-- No ejecutar actualizaciones desde este archivo sin revisar IDs reales.
-- This file is intentionally outside supabase/migrations.
-- It provides read-only diagnostics and commented update templates.
-- Operational names below are references only; updates must use reviewed IDs.

-- Reference groups supplied by operations:
-- confirmed_paused:
--   Leonardo Manuel Alpaca Gutierrez
--   Ricardo Facundo Vilca Gomez
--   Eduardo Bernedo Riveros
--   Valentino Joshua Sanchez Huertas
--   Esteban Gael Del Carpio Pacheco
--   Martha Fernandez Mendoza
--   Gaela Vega Zegarra
-- confirmed_expired_not_paused:
--   Mariana Seira Shinsato Pari
-- zero_classes_expired_review:
--   Camila Azul Villegas Cori
--   Qhari Samin Zuniga Cano
--   Joyse Daniela Machi Huanca
--   Luana Antonella Vilca Gomez
--   Alexa Alai Palomino Venero
--   Gabriela Alison Acero Huaycho
--   Jose Antonio Rado Romero

-- 1. Resolve operational references to real IDs. Review duplicates manually.
WITH operational_reference(full_name, expected_state) AS (
  VALUES
    ('Leonardo Manuel Alpaca Gutierrez', 'paused'),
    ('Ricardo Facundo Vilca Gomez', 'paused'),
    ('Eduardo Bernedo Riveros', 'paused'),
    ('Valentino Joshua Sanchez Huertas', 'paused'),
    ('Esteban Gael Del Carpio Pacheco', 'paused'),
    ('Martha Fernandez Mendoza', 'paused'),
    ('Gaela Vega Zegarra', 'paused'),
    ('Mariana Seira Shinsato Pari', 'expired'),
    ('Camila Azul Villegas Cori', 'expired'),
    ('Qhari Samin Zuniga Cano', 'expired'),
    ('Joyse Daniela Machi Huanca', 'expired'),
    ('Luana Antonella Vilca Gomez', 'expired'),
    ('Alexa Alai Palomino Venero', 'expired'),
    ('Gabriela Alison Acero Huaycho', 'expired'),
    ('Jose Antonio Rado Romero', 'expired')
)
SELECT
  ref.expected_state,
  ref.full_name AS reference_name,
  s.id AS student_id,
  s.full_name AS matched_name,
  s.is_active,
  s.operational_status,
  sm.id AS latest_membership_id,
  sm.status AS latest_membership_status,
  sm.classes_remaining,
  sm.end_date,
  sm.expired_at,
  sm.expiration_reason
FROM operational_reference ref
LEFT JOIN public.students s
  ON lower(s.full_name) = lower(ref.full_name)
LEFT JOIN LATERAL (
  SELECT sm_inner.*
  FROM public.student_memberships sm_inner
  WHERE sm_inner.student_id = s.id
  ORDER BY
    COALESCE(sm_inner.expired_at, public.membership_end_date_expired_at(sm_inner.end_date), sm_inner.created_at) DESC,
    sm_inner.created_at DESC
  LIMIT 1
) sm ON true
ORDER BY ref.expected_state, ref.full_name;

-- 2. Active memberships with no remaining classes.
SELECT
  s.id AS student_id,
  s.full_name,
  sm.id AS membership_id,
  sm.status,
  sm.classes_remaining,
  sm.end_date,
  sm.expired_at,
  sm.expiration_reason
FROM public.student_memberships sm
JOIN public.students s ON s.id = sm.student_id
WHERE sm.status = 'active'
  AND COALESCE(sm.classes_remaining, 0) <= 0
ORDER BY s.full_name;

-- 3. Active memberships expired by date using America/Lima.
SELECT
  s.id AS student_id,
  s.full_name,
  sm.id AS membership_id,
  sm.status,
  sm.classes_remaining,
  sm.end_date,
  sm.expired_at,
  sm.expiration_reason
FROM public.student_memberships sm
JOIN public.students s ON s.id = sm.student_id
WHERE sm.status = 'active'
  AND sm.end_date IS NOT NULL
  AND sm.end_date < (now() AT TIME ZONE 'America/Lima')::date
ORDER BY sm.end_date ASC, s.full_name;

-- 4. Students that would become expired.
SELECT
  s.id AS student_id,
  s.full_name,
  s.operational_status,
  sm.id AS membership_id,
  sm.status AS membership_status,
  sm.expired_at,
  sm.expiration_reason
FROM public.students s
JOIN LATERAL (
  SELECT sm_inner.*
  FROM public.student_memberships sm_inner
  WHERE sm_inner.student_id = s.id
    AND sm_inner.status = 'expired'
  ORDER BY COALESCE(sm_inner.expired_at, sm_inner.created_at) DESC
  LIMIT 1
) sm ON true
WHERE s.operational_status NOT IN ('retired', 'withdrawn', 'blocked', 'suspended')
  AND NOT EXISTS (
    SELECT 1
    FROM public.student_memberships active_sm
    WHERE active_sm.student_id = s.id
      AND active_sm.status = 'active'
      AND COALESCE(active_sm.classes_remaining, 0) > 0
      AND active_sm.start_date <= (now() AT TIME ZONE 'America/Lima')::date
      AND (active_sm.end_date IS NULL OR active_sm.end_date >= (now() AT TIME ZONE 'America/Lima')::date)
  )
  AND (now() AT TIME ZONE 'America/Lima') < (
    COALESCE(sm.expired_at, public.membership_end_date_expired_at(sm.end_date), sm.created_at)
      AT TIME ZONE 'America/Lima'
  ) + interval '14 days'
ORDER BY sm.expired_at NULLS LAST, s.full_name;

-- 5. Students that would become paused on the next sync.
SELECT
  s.id AS student_id,
  s.full_name,
  s.operational_status,
  sm.id AS membership_id,
  sm.expired_at,
  sm.expiration_reason
FROM public.students s
JOIN LATERAL (
  SELECT sm_inner.*
  FROM public.student_memberships sm_inner
  WHERE sm_inner.student_id = s.id
    AND sm_inner.status = 'expired'
  ORDER BY COALESCE(sm_inner.expired_at, sm_inner.created_at) DESC
  LIMIT 1
) sm ON true
WHERE s.operational_status NOT IN ('retired', 'withdrawn', 'blocked', 'suspended')
  AND NOT EXISTS (
    SELECT 1
    FROM public.student_memberships active_sm
    WHERE active_sm.student_id = s.id
      AND active_sm.status = 'active'
      AND COALESCE(active_sm.classes_remaining, 0) > 0
      AND active_sm.start_date <= (now() AT TIME ZONE 'America/Lima')::date
      AND (active_sm.end_date IS NULL OR active_sm.end_date >= (now() AT TIME ZONE 'America/Lima')::date)
  )
  AND (now() AT TIME ZONE 'America/Lima') >= (
    COALESCE(sm.expired_at, public.membership_end_date_expired_at(sm.end_date), sm.created_at)
      AT TIME ZONE 'America/Lima'
  ) + interval '14 days'
ORDER BY sm.expired_at NULLS LAST, s.full_name;

-- 6. is_active false while an active membership exists.
SELECT
  s.id AS student_id,
  s.full_name,
  s.is_active,
  s.operational_status,
  sm.id AS active_membership_id,
  sm.classes_remaining,
  sm.end_date
FROM public.students s
JOIN public.student_memberships sm
  ON sm.student_id = s.id
WHERE COALESCE(s.is_active, true) = false
  AND sm.status = 'active'
ORDER BY s.full_name;

-- 7. More than one active membership.
SELECT
  s.id AS student_id,
  s.full_name,
  COUNT(*) AS active_membership_count,
  array_agg(sm.id ORDER BY sm.created_at DESC) AS active_membership_ids
FROM public.students s
JOIN public.student_memberships sm
  ON sm.student_id = s.id
WHERE sm.status = 'active'
GROUP BY s.id, s.full_name
HAVING COUNT(*) > 1
ORDER BY s.full_name;

-- 8. Future reservations for affected students. Review manually; do not auto-cancel.
WITH affected_students AS (
  SELECT DISTINCT s.id
  FROM public.students s
  LEFT JOIN public.student_memberships sm ON sm.student_id = s.id
  WHERE s.operational_status IN ('expired', 'paused', 'retired', 'withdrawn', 'blocked', 'suspended')
     OR (sm.status = 'active' AND COALESCE(sm.classes_remaining, 0) <= 0)
     OR (sm.status = 'active' AND sm.end_date IS NOT NULL AND sm.end_date < (now() AT TIME ZONE 'America/Lima')::date)
)
SELECT
  s.id AS student_id,
  s.full_name,
  b.id AS booking_id,
  b.status AS booking_status,
  b.active_membership_id,
  sess.start_at,
  sess.end_at
FROM affected_students affected
JOIN public.students s ON s.id = affected.id
JOIN public.bookings b ON b.student_id = s.id
JOIN public.sessions sess ON sess.id = b.session_id
WHERE b.status = 'reserved'
  AND sess.start_at > now()
ORDER BY sess.start_at, s.full_name;

-- 9. Protected manual statuses.
SELECT
  id AS student_id,
  full_name,
  is_active,
  operational_status,
  operational_status_reason,
  operational_status_updated_at
FROM public.students
WHERE operational_status IN ('retired', 'withdrawn', 'blocked', 'suspended')
ORDER BY full_name;

-- 10. Inconsistencies between is_active and operational_status.
SELECT
  id AS student_id,
  full_name,
  is_active,
  operational_status,
  operational_status_reason
FROM public.students
WHERE (operational_status = 'active' AND COALESCE(is_active, false) = false)
   OR (operational_status <> 'active' AND COALESCE(is_active, true) = true)
ORDER BY full_name;

-- 11. Expired memberships missing expired_at.
SELECT
  s.id AS student_id,
  s.full_name,
  sm.id AS membership_id,
  sm.status,
  sm.end_date,
  sm.classes_remaining,
  sm.expired_at,
  sm.expiration_reason
FROM public.student_memberships sm
JOIN public.students s ON s.id = sm.student_id
WHERE sm.status = 'expired'
  AND sm.expired_at IS NULL
ORDER BY s.full_name;

-- 12. Cases where expired_at can be derived from ledger reaching zero.
WITH ledger_balances AS (
  SELECT
    scl.student_id,
    scl.student_membership_id,
    scl.id AS ledger_id,
    scl.created_at,
    scl.balance_after,
    row_number() OVER (
      PARTITION BY scl.student_membership_id
      ORDER BY scl.created_at ASC, scl.id ASC
    ) AS balance_order
  FROM public.student_credit_ledger scl
  WHERE scl.balance_after = 0
)
SELECT
  s.id AS student_id,
  s.full_name,
  sm.id AS membership_id,
  sm.status,
  sm.classes_remaining,
  sm.end_date,
  sm.expired_at,
  lb.ledger_id,
  lb.created_at AS derived_expired_at_candidate
FROM public.student_memberships sm
JOIN public.students s ON s.id = sm.student_id
LEFT JOIN ledger_balances lb
  ON lb.student_membership_id = sm.id
 AND lb.balance_order = 1
WHERE COALESCE(sm.classes_remaining, 0) <= 0
  AND sm.expired_at IS NULL
ORDER BY s.full_name;

-- 13. Cases requiring conservative fallback because ledger cannot derive expired_at.
SELECT
  s.id AS student_id,
  s.full_name,
  sm.id AS membership_id,
  sm.status,
  sm.classes_remaining,
  sm.end_date,
  sm.expired_at
FROM public.student_memberships sm
JOIN public.students s ON s.id = sm.student_id
WHERE COALESCE(sm.classes_remaining, 0) <= 0
  AND sm.expired_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.student_credit_ledger scl
    WHERE scl.student_membership_id = sm.id
      AND scl.balance_after = 0
  )
ORDER BY s.full_name;

-- Update template A: apply only after replacing UUIDs with reviewed IDs.
-- BEGIN;
-- WITH reviewed_memberships(id, derived_expired_at, reason) AS (
--   VALUES
--     ('00000000-0000-0000-0000-000000000000'::uuid, '2026-06-03T08:00:00Z'::timestamptz, 'no_classes_remaining')
-- )
-- UPDATE public.student_memberships sm
-- SET
--   status = 'expired',
--   expired_at = COALESCE(sm.expired_at, reviewed.derived_expired_at),
--   expiration_reason = COALESCE(sm.expiration_reason, reviewed.reason),
--   classes_remaining = GREATEST(COALESCE(sm.classes_remaining, 0), 0),
--   updated_at = now()
-- FROM reviewed_memberships reviewed
-- WHERE sm.id = reviewed.id;
-- ROLLBACK;

-- Update template B: sync reviewed students only after membership expired_at review.
-- BEGIN;
-- SELECT public.sync_student_membership_operational_status(reviewed.student_id)
-- FROM (
--   VALUES
--     ('00000000-0000-0000-0000-000000000000'::uuid)
-- ) AS reviewed(student_id);
-- ROLLBACK;
