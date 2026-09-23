import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const hook = readFileSync(join(process.cwd(), 'lib', 'hooks', 'useStudentDetail.ts'), 'utf8')
const page = readFileSync(join(process.cwd(), 'app', 'admin', 'alumnos', '[id]', 'page.tsx'), 'utf8')

describe('student weekly attendance history', () => {
  it('loads weekly attendance events from the student entity', () => {
    expect(hook).toContain(".from('student_weekly_attendance')")
    expect(hook).toContain(".eq('student_id', studentId)")
    expect(hook).toContain(".select('id,student_membership_id,week_start,week_end,status,classes_consumed,marked_at,occurrence_index,note')")
    expect(hook).toContain(".order('occurrence_index', { ascending: false })")
    expect(hook).toContain('weekly_attendance:')
  })

  it('combines the weekly events into the visible attendance history', () => {
    expect(page).toMatch(/buildStudentAttendanceHistory\([\s\S]*data\.bookings,[\s\S]*data\.weekly_attendance,[\s\S]*data\.attendance_reversals,[\s\S]*\)/)
    expect(page).toContain('Inasistencia semanal (jueves a domingo)')
    expect(page).toContain("booking.source === 'weekly'")
    expect(page).toContain("booking.admin_notes || 'Inasistencia semanal (jueves a domingo)'")
  })
})
