import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import IntroCalendarToolbar from '@/app/admin/intro/components/IntroCalendarToolbar'
import IntroWeekCalendar from '@/app/admin/intro/components/IntroWeekCalendar'
import IntroAppointmentCard from '@/app/admin/intro/components/IntroAppointmentCard'
import { weekDates, type IntroAppointment, type IntroCalendarSession } from '@/lib/utils/introCalendar'

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')
const dates = weekDates('2026-10-14')
const noop = () => {}
const appointment: IntroAppointment = {
  booking_id: 'unique-appointment', intro_client_id: 'client', full_name: 'Laura', age: 25,
  session_id: 'slot', session_start: '2026-10-14T22:00:00Z', session_end: '2026-10-14T23:00:00Z',
  location_id: 'u', location_code: 'umacollo', location_name: 'Umacollo', location_address: null,
  capacity: 4, booked_total: 1, booking_status: 'reserved', intro_class_type: 'paid', payment_status: 'pending',
  amount_paid: 45, payment_method: null, paid_at: null, courtesy_reason: null, pay_on_site: true, updated_at: '2026-10-11T12:00:00Z',
}

describe('admin intro weekly calendar', () => {
  it('renders date, site, payment, all six states and both views', () => {
    const html = renderToStaticMarkup(React.createElement(IntroCalendarToolbar, {
      dates, date: dates[0], onDateChange: noop, onNavigate: noop,
      filters: { states: [], payment: 'all', search: '', locationId: '' }, onFilters: noop,
      locations: [], view: 'week', onView: noop,
    }))
    for (const label of ['Semana anterior', 'Semana siguiente', 'Hoy', 'Todas las sedes', 'Paga en sede', 'Reservado', 'Por pagar', 'Pagado', 'Asistido', 'No show', 'Cancelado', 'Estados']) expect(html).toContain(label)
    expect(html).toContain('type="date"')
    expect(html).toContain('Nombre o teléfono')
  })
  it('keeps full and empty slots visible without deriving capacity from filtered cards', () => {
    const session: IntroCalendarSession = { session_id: 'slot', start_at: '2026-10-14T22:00:00Z', end_at: '2026-10-14T23:00:00Z', location_id: 'u', location_code: 'umacollo', location_name: 'Umacollo', location_address: null, capacity: 4, booked_total: 4, available: 0, can_book: false, accepts_intro: true, clients: [] }
    const html = renderToStaticMarkup(React.createElement(IntroWeekCalendar, { sessions: [session], rows: [], dates, selectedDay: '2026-10-14', onDayChange: noop, onCreate: noop, active: null, onSelect: noop, onEdit: noop, disabled: false }))
    expect(html).toContain('Umacollo')
    expect(html).toContain('4/4 ocupados')
    expect(html).toContain('Sin citas')
    expect(html).toContain('Sin horarios')
    expect(html).toContain('17:00')
    expect(html).toContain('lg:hidden')
  })
  it('retains the academy logo across administrative navigation', () => {
    expect(source('components/AdminSidebar.tsx')).toContain('src="/AA ACADEMY logo blanco.png"')
    expect(source('app/admin/layout.tsx')).toContain('src="/AA ACADEMY logo blanco.png"')
  })
  it('renders a single appointment node across the desktop and mobile layout', () => {
    const session: IntroCalendarSession = { session_id: 'slot', start_at: appointment.session_start, end_at: appointment.session_end,
      location_id: 'u', location_code: 'umacollo', location_name: 'Umacollo', location_address: null,
      capacity: 4, booked_total: 1, available: 3, can_book: true, accepts_intro: true, clients: [appointment] }
    const html = renderToStaticMarkup(React.createElement(IntroWeekCalendar, { sessions: [session], rows: [appointment], dates,
      selectedDay: '2026-10-14', onDayChange: noop, onCreate: noop, active: null, onSelect: noop, onEdit: noop, disabled: false }))
    expect(html.match(/data-appointment-id="unique-appointment"/g)).toHaveLength(1)
  })
  it('renders the floating card without another draggable appointment node', () => {
    const html = renderToStaticMarkup(React.createElement(IntroAppointmentCard, { row: appointment, overlay: true, disabled: true, onSelect: noop, onEdit: noop }))
    expect(html).toContain('Laura')
    expect(html).not.toContain('data-appointment-id=')
    expect(html).not.toContain('Mover cita de Laura')
  })
  it('keeps private phone display and WhatsApp in the appointment detail', () => {
    const detail = source('app/admin/intro/components/IntroAppointmentDetail.tsx')
    expect(detail).toContain('showPhone')
    expect(detail).toContain('•••')
    expect(detail).toContain('wa.me')
  })
  it('keeps edits behind the version-checked administrative RPC and resolves deep links by ID', () => {
    const client = source('app/admin/intro/components/IntroCalendarClient.tsx')
    const service = source('lib/services/IntroClassesService.ts')
    expect(client).toContain('editBookingId')
    expect(client).toContain('getAppointment(bookingId)')
    expect(service).toContain("supabase.rpc('admin_change_intro_appointment'")
    expect(service).toContain('p_expected_updated_at')
    expect(client).not.toMatch(/from\('intro_clients'\)[\s\S]{0,300}\.(insert|update|delete|upsert)/)
  })
})
