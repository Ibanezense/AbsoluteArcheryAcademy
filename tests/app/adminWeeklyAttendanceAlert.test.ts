import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const page = readFileSync(join(process.cwd(), 'app/admin/asistencia/page.tsx'), 'utf8')
const components = readFileSync(join(process.cwd(), 'components/admin/AdminOperationalComponents.tsx'), 'utf8')

describe('attendance-only administrative controls', () => {
  it('removes manual and weekly no-show actions', () => {
    expect(page).not.toContain('markWeeklyNoShow')
    expect(page).not.toContain('WeeklyAttendanceReview')
    expect(page).not.toContain('onNoShow')
    expect(components).not.toContain('onNoShow')
    expect(page).toContain('p_attended: true')
  })
  it('explains automatic cancellation and refreshes balances after attendance', () => {
    expect(page).toContain('sin asistencia se cancelan al finalizar el día')
    expect(page).toContain('queryKey: studentKeys.all')
    expect(page).toContain('queryKey: membershipRenewalAlertKeys.all')
  })
  it('removes recovery carryover from membership creation', () => {
    const assignment = readFileSync(join(process.cwd(), 'app/admin/membresias/page.tsx'), 'utf8')
    expect(assignment).not.toContain('Clases de recuperación del ciclo anterior')
    expect(assignment).not.toContain('recoveryClasses: Number(assignmentForm.recovery_classes')
    expect(assignment).toContain('Las clases pendientes vencen al finalizar el periodo y no se recuperan.')
  })
})
