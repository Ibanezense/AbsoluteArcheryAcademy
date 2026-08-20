import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const page = readFileSync(join(process.cwd(), 'app', 'admin', 'asistencia', 'page.tsx'), 'utf8')
const componentPath = join(process.cwd(), 'components', 'admin', 'WeeklyAttendanceReview.tsx')

describe('admin weekly attendance alert', () => {
  it('loads the weekly review only for Sunday and refreshes student data after marking', () => {
    expect(page).toContain('getWeeklyAttendanceWindow(selectedDate)')
    expect(page).toContain('getWeeklyAttendanceReview(supabase, date)')
    expect(page).toContain('markWeeklyNoShow(supabase')
    expect(page).toContain('Marcar no asistió esta semana')
    expect(page).toContain('descontará una clase')
    expect(page).toContain('queryClient.invalidateQueries({ queryKey: studentKeys.all })')
    expect(page).toContain("import { membershipRenewalAlertKeys } from '@/lib/hooks/useMembershipRenewalAlerts'")
    expect(page.match(/queryKey: membershipRenewalAlertKeys\.all/g)).toHaveLength(3)
  })

  it('renders pending attendance and red candidate cards with championship context', () => {
    const component = readFileSync(componentPath, 'utf8')

    expect(component).toContain('Alumnos sin asistencia esta semana')
    expect(component).toContain('asistencias pendientes')
    expect(component).toContain('border-rose-300')
    expect(component).toContain('campeonato nacional')
    expect(component).toContain('Marcar no asistió esta semana')
  })
})
