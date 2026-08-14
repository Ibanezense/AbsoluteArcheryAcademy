import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationsDir = join(process.cwd(), 'supabase', 'migrations')
const migrationName = readdirSync(migrationsDir).find((name) =>
  name.endsWith('_equipment_based_booking_capacity.sql'),
)
const migrationPath = migrationName ? join(migrationsDir, migrationName) : ''
const sql = migrationPath && existsSync(migrationPath)
  ? readFileSync(migrationPath, 'utf8')
  : ''

function functionSql(functionName: string) {
  const marker = `CREATE OR REPLACE FUNCTION public.${functionName}`
  const start = sql.indexOf(marker)
  if (start < 0) return ''

  const end = sql.indexOf('\n$$;', start)
  return end < 0 ? sql.slice(start) : sql.slice(start, end + 4)
}

function executableSql(body: string) {
  return body
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--.*$/gm, '')
}

describe('equipment-based booking capacity migration', () => {
  it('uses six configurable academy bows and two additional trial bows', () => {
    expect(migrationName).toBeTruthy()
    expect(sql).toMatch(/draw_weight_lbs[\s\S]*20[\s\S]*quantity_active[\s\S]*6/i)

    const helper = functionSql('get_session_equipment_availability')
    expect(helper).toContain('p_session_id uuid')
    expect(helper).toContain('p_exclude_booking_id uuid DEFAULT NULL')
    expect(helper).toMatch(/intro_client_id IS NOT NULL/i)
    expect(helper).toMatch(/student_id IS NOT NULL/i)
    expect(helper).toMatch(/bow_usage_type = 'shared_inventory'/i)
    expect(helper).toMatch(/GREATEST\(v_intro_reserved - 2, 0\)/i)
    expect(helper).toMatch(/v_academy_students_reserved \+ v_intro_academy_bows_used/i)
    expect(helper).toContain("b.status = 'reserved'")
  })

  it('removes target and distance capacity from canonical reservation decisions', () => {
    for (const functionName of [
      'get_session_equipment_availability',
      'check_session_availability_v3',
      'get_available_sessions_for_student',
      'admin_register_intro_class',
      'admin_update_intro_class',
      'get_available_intro_sessions',
    ]) {
      const body = executableSql(functionSql(functionName))
      expect(body, functionName).not.toMatch(/targets\s*\*\s*4/i)
      expect(body, functionName).not.toMatch(/slot_capacity\s*[-<>=]/i)
      expect(body, functionName).not.toMatch(/distance_remaining|reserved_distance/i)
    }
  })

  it('keeps own and assigned bows unlimited while academy uses remaining equipment', () => {
    const availability = functionSql('check_session_availability_v3')
    expect(availability).toContain("v_bow_usage_type IN ('own', 'assigned')")
    expect(availability).toMatch(/academy_bows_remaining[\s\S]*spots_for_student/i)
    expect(availability).toContain(
      'Para este turno ya no tenemos equipo disponible. Por favor, reserva otro turno disponible.',
    )
  })

  it('rechecks equipment after locking the session in every booking write', () => {
    for (const functionName of [
      'book_session',
      'admin_book_session',
      'admin_register_intro_class',
      'admin_update_intro_class',
    ]) {
      const body = functionSql(functionName)
      const lockPosition = body.indexOf('FOR UPDATE')
      const availabilityPosition = body.indexOf('get_session_equipment_availability') >= 0
        ? body.indexOf('get_session_equipment_availability')
        : body.indexOf('check_session_availability_v3')

      expect(lockPosition, functionName).toBeGreaterThanOrEqual(0)
      expect(availabilityPosition, functionName).toBeGreaterThan(lockPosition)
    }
  })

  it('exposes intro availability as unused trial bows plus remaining academy bows', () => {
    const helper = functionSql('get_session_equipment_availability')
    const introSessions = functionSql('get_available_intro_sessions')
    expect(helper).toMatch(/GREATEST\(2 - v_intro_reserved, 0\) \+ v_academy_bows_remaining/i)
    expect(introSessions).toContain("availability.data->>'intro_spots_remaining'")
    expect(introSessions).toContain('spots_remaining')
  })

  it('restricts all new and replaced RPCs to their intended roles', () => {
    for (const signature of [
      'get_session_equipment_availability(uuid, uuid)',
      'check_session_availability_v3(uuid, uuid)',
      'get_available_sessions_for_student(uuid, date, date)',
      'get_admin_available_sessions_for_student(uuid, date, date)',
      'get_available_intro_sessions(date, date)',
      'admin_register_intro_class(text, integer, text, uuid, numeric, text, text, text, text)',
      'admin_update_intro_class(uuid, uuid, text, integer, text, uuid, numeric, text, text, text, text)',
    ]) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${signature} FROM PUBLIC;`)
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${signature} FROM anon;`)
    }

    expect(sql).toContain(
      'REVOKE ALL ON FUNCTION public.get_session_equipment_availability(uuid, uuid) FROM authenticated;',
    )
    expect(sql).not.toContain(
      'GRANT EXECUTE ON FUNCTION public.get_session_equipment_availability(uuid, uuid) TO authenticated',
    )
  })
})
