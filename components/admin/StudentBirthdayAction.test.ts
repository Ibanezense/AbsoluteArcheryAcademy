// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import StudentBirthdayAction from './StudentBirthdayAction'

afterEach(cleanup)
it('opens the supplied student contact manually without recording a send', () => {
  render(createElement(StudentBirthdayAction, { studentId: 's1', studentName: 'Ana', phone: '+51997224472' }))
  const link = screen.getByRole('link', { name: /Saludar a Ana por WhatsApp/ })
  expect(link.getAttribute('href')).toContain('https://wa.me/51997224472?text=')
  expect(link.getAttribute('target')).toBe('_blank')
  expect(link.getAttribute('rel')).toBe('noopener noreferrer')
})
it('takes missing or ambiguous contacts to the same student profile', () => {
  render(createElement(StudentBirthdayAction, { studentId: 's2', studentName: 'José', phone: '997224472 / 999222444' }))
  expect(screen.getByRole('link', { name: 'Revisar contacto' }).getAttribute('href')).toBe('/admin/alumnos/s2')
})
