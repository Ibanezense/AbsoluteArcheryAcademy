import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260602_140000_intro_class_type_payment_status.sql',
)

function migrationSql() {
  expect(existsSync(migrationPath)).toBe(true)
  return readFileSync(migrationPath, 'utf8')
}

describe('20260602 intro class type and payment status migration', () => {
  it('persists paid, free and courtesy intro class metadata with constraints', () => {
    const sql = migrationSql()

    expect(sql).toContain('ADD COLUMN IF NOT EXISTS intro_class_type text')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS payment_status text')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS courtesy_reason text')
    expect(sql).toContain('courtesy_authorized_by_profile_id uuid REFERENCES public.profiles(id)')
    expect(sql).toContain("intro_class_type IN ('paid', 'free', 'courtesy')")
    expect(sql).toContain("payment_status IN ('pending', 'paid', 'not_applicable')")
    expect(sql).toContain("intro_class_type = 'paid'")
    expect(sql).toContain('amount > 0')
    expect(sql).toContain("intro_class_type = 'free'")
    expect(sql).toContain('amount = 0')
    expect(sql).toContain("intro_class_type = 'courtesy'")
    expect(sql).toContain("NULLIF(btrim(COALESCE(courtesy_reason, '')), '') IS NOT NULL")
  })

  it('extends the atomic intro registration RPC without partial table writes', () => {
    const sql = migrationSql()

    expect(sql).toContain('DROP FUNCTION IF EXISTS public.admin_register_intro_class(text, integer, text, uuid, numeric, text)')
    expect(sql).toContain('p_intro_class_type text DEFAULT')
    expect(sql).toContain('p_payment_status text DEFAULT')
    expect(sql).toContain('p_courtesy_reason text DEFAULT')
    expect(sql).toContain('v_intro_class_type := COALESCE')
    expect(sql).toContain('Tipo de clase intro no valido')
    expect(sql).toContain('Estado de pago no valido')
    expect(sql).toContain('El motivo de cortesia es obligatorio')
    expect(sql).toContain('INSERT INTO public.intro_payments')
    expect(sql).toContain('intro_class_type')
    expect(sql).toContain('payment_status')
    expect(sql).toContain('courtesy_reason')
    expect(sql).toContain("CASE WHEN v_intro_class_type = 'courtesy' THEN v_actor_id ELSE NULL END")
    expect(sql).not.toContain('EXCEPTION\n  WHEN OTHERS')
  })
})
