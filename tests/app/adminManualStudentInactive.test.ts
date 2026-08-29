import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const pagePath = join(process.cwd(), 'app', 'admin', 'alumnos', '[id]', 'page.tsx')
const servicePath = join(process.cwd(), 'lib', 'services', 'adminStudentOperationalStatusService.ts')

describe('admin manual student inactive action', () => {
  it('adds the dedicated client service', () => {
    expect(existsSync(servicePath)).toBe(true)
  })

  it('offers a reversible confirmed action without reusing account blocking', () => {
    const page = readFileSync(pagePath, 'utf8')

    expect(page).toContain("import { setStudentManualInactive } from '@/lib/services/adminStudentOperationalStatusService'")
    expect(page).toContain('Marcar como inactivo')
    expect(page).toContain('Quitar estado inactivo')
    expect(page).toContain('handleToggleManualInactive')
    expect(page).toContain("title: manualInactive ? 'Quitar estado inactivo' : 'Marcar como inactivo'")
    expect(page).toContain('await setStudentManualInactive(supabase, data.id, !manualInactive)')
    expect(page).toContain('studentStatusSaving')
    expect(page).toContain('await refreshStudentData()')
    expect(page).toContain('const accessIsActive = data.self_account?.is_active ?? data.is_active')
    expect(page).toContain("await supabase.rpc('admin_set_student_account_access'")
    expect(page).toContain('p_student_id: data.id')
    expect(page).toContain('p_is_active: nextAccessActive')
    expect(page).not.toContain("supabase.from('profiles').update({ is_active: nextAccessActive })")
    expect(page).toContain('{(data.self_account || !manualInactive) && (')
    expect(page).toContain("if (!data || (!data.self_account && data.operational_status === 'inactive')) return")
    expect(page).toContain("{accessIsActive ? 'Bloquear alumno' : 'Reactivar acceso'}")
  })
})
