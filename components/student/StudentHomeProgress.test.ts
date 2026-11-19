// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { StudentHomeProgress } from './StudentHomeProgress'
import type { AcademyControl } from '@/lib/contracts/studentProgress'
import { summarizeTrainingControls } from '@/lib/utils/studentTrainingProgress'

const control: AcademyControl = {
  id: 'control', student_id: 'student', distance: 18, arrows: 36, score: 308,
  performed_date: '2026-11-18', performed_time: null, status: 'valid', revision: 1,
  created_at: '', updated_at: '',
}
const student = vi.hoisted(() => ({ distance: 25 }))
const controls: AcademyControl[] = [control, { ...control, id: 'two-round', arrows: 72, score: 615 }]
vi.mock('@/lib/hooks/useStudentProgress', () => ({
  useStudentProgress: () => ({
    data: {
      student_id: 'student', state: 'ready', assigned_distance_m: student.distance, controls,
      summary: summarizeTrainingControls(controls, student.distance),
    },
  }),
}))
vi.mock('@/components/student/progress/TrainingEvolutionChart', () => ({
  TrainingEvolutionChart: ({ controls, format }: { controls: AcademyControl[]; format: number }) =>
    createElement('div', { role: 'img', 'aria-label': controls.filter(row => row.arrows === format).map(row => row.id).join(',') }),
}))
afterEach(cleanup)

it('keeps the last control at the assigned distance and labels records from the previous distance', () => {
  render(createElement(StudentHomeProgress, { accountId: 'account', studentId: 'student' }))
  expect(screen.getByText('Aún no hay controles a 25 m.')).toBeTruthy()
  expect(screen.getByText('18 m · Distancia anterior')).toBeTruthy()
  expect(screen.getByText('308 / 360')).toBeTruthy()
  expect(screen.getByText('615 / 720')).toBeTruthy()
  expect(screen.queryByRole('img')).toBeNull()
  expect(screen.getByRole('link', { name: /historial/i }).getAttribute('href')).toBe('/mi-progreso')
})

it('shows the chart for the assigned distance with separate formats', () => {
  student.distance = 18
  render(createElement(StudentHomeProgress, { accountId: 'account', studentId: 'student' }))
  expect(screen.getByRole('img', { name: 'control' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '72 flechas' }))
  expect(screen.getByRole('img', { name: 'two-round' })).toBeTruthy()
})
