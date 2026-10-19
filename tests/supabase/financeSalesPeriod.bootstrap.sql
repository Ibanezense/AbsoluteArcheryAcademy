-- Disposable only, after adminTrialConversion.bootstrap.sql.
CREATE TABLE membership_plans(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),base_price numeric);
CREATE TABLE membership_purchases(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),purchased_at timestamptz);
ALTER TABLE student_memberships ADD COLUMN purchase_id uuid REFERENCES membership_purchases(id), ADD COLUMN membership_plan_id uuid REFERENCES membership_plans(id), ADD COLUMN custom_name text;
CREATE TABLE student_membership_payments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),student_id uuid REFERENCES students(id),student_membership_id uuid REFERENCES student_memberships(id),created_at timestamptz DEFAULT now(),paid_at timestamptz,amount numeric,payment_status text,payment_method text,source text);
CREATE TABLE intro_payments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),intro_client_id uuid REFERENCES intro_clients(id),paid_at timestamptz,amount numeric,payment_status text,payment_method text);
CREATE FUNCTION get_finances_actionable_dashboard(date,date,date) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{"paid_month":999,"pending_month":999,"projection_month":1998,"overdue_count":3,"overdue_amount":50,"top_debtors":[],"overdue_rows":[]}'::jsonb $$;
CREATE FUNCTION get_admin_dashboard_operational_data() RETURNS json LANGUAGE sql AS $$ SELECT '{"today":{"reservationsToday":7},"monthly":{"revenueThisMonth":999,"activeStudents":41},"alerts":{"pendingPayments":3},"studentsByLevel":{}}'::json $$;
