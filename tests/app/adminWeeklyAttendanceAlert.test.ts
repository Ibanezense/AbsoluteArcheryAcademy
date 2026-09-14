import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const page = readFileSync(join(process.cwd(), 'app', 'admin', 'asistencia', 'page.tsx'), 'utf8')
const componentPath = join(process.cwd(), 'components', 'admin', 'WeeklyAttendanceReview.tsx')
const service = readFileSync(join(process.cwd(), 'lib', 'services', 'adminWeeklyAttendanceService.ts'), 'utf8')

describe('admin weekly attendance alert', () => {
  it('loads the weekly review only for Sunday and refreshes student data after marking', () => {
    expect(page).toContain('getWeeklyAttendanceWindow(selectedDate)')
    expect(page).toContain('getWeeklyAttendanceReview(supabase, date)')
    expect(page).toContain('markWeeklyNoShow(supabase')
    expect(page).toContain('crypto.randomUUID()')
    expect(page).toContain('requestId')
    expect(service).toContain('p_request_id: input.requestId')
    expect(page).toContain('descontará una clase')
    expect(page).toContain('loadRoster(selectedDate)')
    expect(page).toContain('queryClient.invalidateQueries({ queryKey: studentKeys.all })')
    expect(page).toContain("import { membershipPlanKeys } from '@/lib/hooks/useMembershipPlans'")
    expect(page).toContain('queryClient.invalidateQueries({ queryKey: membershipPlanKeys.all })')
    expect(page).toContain("import { membershipRenewalAlertKeys } from '@/lib/hooks/useMembershipRenewalAlerts'")
    expect(page.match(/queryKey: membershipRenewalAlertKeys\.all/g)).toHaveLength(3)
  })

  it('renders each weekly deficit and marks one absence per click', () => {
    const component = readFileSync(componentPath, 'utf8')

    expect(component).toContain('Alumnos con asistencias pendientes esta semana')
    expect(component).toContain('asistencias pendientes')
    expect(component).toContain('border-rose-300')
    expect(component).toContain('campeonato nacional')
    expect(component).toContain('candidate.weekly_class_target')
    expect(component).toContain('candidate.attended_count')
    expect(component).toContain('candidate.booking_no_show_count')
    expect(component).toContain('candidate.weekly_no_show_count')
    expect(component).toContain('candidate.completed_count')
    expect(component).toContain('candidate.missing_count')
    expect(component).toContain('Marcar 1 inasistencia')
    expect(component).toContain('disabled={isProcessing}')
  })

  it('blocks repeated clicks while a student action is already in flight', () => {
    expect(page).toContain('weeklyActionsInFlight.current.has(candidate.student_id)')
    expect(page).toContain('weeklyActionsInFlight.current.add(candidate.student_id)')
    expect(page).toContain('weeklyActionsInFlight.current.delete(candidate.student_id)')
  })
})
