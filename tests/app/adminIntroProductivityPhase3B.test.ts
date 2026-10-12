import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import IntroCalendarToolbar from '@/app/admin/intro/components/IntroCalendarToolbar'
import IntroWeekCalendar from '@/app/admin/intro/components/IntroWeekCalendar'
import { weekDates, type IntroCalendarSession } from '@/lib/utils/introCalendar'

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')
const dates = weekDates('2026-10-14')
const noop = () => {}

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
