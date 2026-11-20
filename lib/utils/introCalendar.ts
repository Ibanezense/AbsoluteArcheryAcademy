import type { IntroSessionGroup } from '@/lib/services/IntroClassesService'
import { norm } from './searchUtils'

export type IntroState = 'reserved' | 'pending' | 'paid' | 'attended' | 'no_show' | 'cancelled'
type AttendanceStatus = Exclude<IntroState, 'pending' | 'paid'>
export type IntroAppointment = IntroSessionGroup['clients'][number] & {
  session_id: string; session_start: string; session_end: string;
  capacity: number; booked_total: number; location_id: string;
  location_code: string; location_name: string; location_address: string | null;
  updated_at: string; pay_on_site: boolean;
  dni?: string | null
}
export type IntroCalendarSession = Omit<IntroSessionGroup, 'clients'> & {
  available: number; accepts_intro: boolean; can_book: boolean;
  clients: IntroAppointment[];
  physical_remaining?: number | null
  academy_remaining?: number | null
}
export type IntroCalendarFilters = {
  states: IntroState[]; payment: 'all' | 'pending' | 'paid' | 'on_site'; search: string; locationId: string;
}
export const INTRO_STATES: { value: IntroState; label: string; color: string; dot: string }[] = [
  { value: 'reserved', label: 'Reservado', color: 'border-blue-200 bg-blue-50 text-blue-700', dot: 'bg-blue-500' },
  { value: 'pending', label: 'Por pagar', color: 'border-amber-200 bg-amber-50 text-amber-800', dot: 'bg-amber-500' },
  { value: 'paid', label: 'Pagado', color: 'border-emerald-200 bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
  { value: 'attended', label: 'Asistió', color: 'border-teal-200 bg-teal-50 text-teal-800', dot: 'bg-teal-600' },
  { value: 'no_show', label: 'No asistió', color: 'border-rose-200 bg-rose-50 text-rose-700', dot: 'bg-rose-500' },
  { value: 'cancelled', label: 'Cancelado', color: 'border-slate-200 bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
]
export const ATTENDANCE_STATES = INTRO_STATES.filter(state => state.value !== 'pending' && state.value !== 'paid')

export function calendarDate(value: string | Date): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date(value))
}
export function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}
export function weekDates(date: string): string[] {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay()
  const monday = shiftDate(date, -((weekday + 6) % 7))
  return Array.from({ length: 7 }, (_, index) => shiftDate(monday, index))
}
export function calendarTime(value: string): string {
  return new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))
}
export function calendarDayLabel(date: string, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }): string {
  return new Intl.DateTimeFormat('es-PE', { ...options, timeZone: 'America/Lima' }).format(new Date(`${date}T12:00:00Z`))
}
export function appointmentStatus(row: Pick<IntroAppointment, 'booking_status' | 'payment_status'>): IntroState {
  if (row.booking_status === 'cancelled' || row.booking_status === 'attended' || row.booking_status === 'no_show') return row.booking_status
  return row.payment_status === 'paid' ? 'paid' : row.payment_status === 'pending' ? 'pending' : 'reserved'
}
export function attendanceStatus({ booking_status }: Pick<IntroAppointment, 'booking_status'>): AttendanceStatus {
  if (booking_status === 'attended' || booking_status === 'no_show' || booking_status === 'cancelled') return booking_status
  return 'reserved'
}
export function filterAppointments(rows: IntroAppointment[], filters: IntroCalendarFilters): IntroAppointment[] {
  const search = norm(filters.search.trim())
  const phoneSearch = /^[+\d().\s-]+$/.test(search) ? search.replace(/\D/g, '') : ''
  return rows.filter((row) =>
    (!filters.locationId || row.location_id === filters.locationId)
    && (!filters.states.length || filters.states.includes(attendanceStatus(row)))
    && (filters.payment === 'all' || (filters.payment === 'on_site'
      ? row.payment_status === 'pending' && row.pay_on_site
      : row.payment_status === filters.payment))
    && (!search || norm(row.full_name).includes(search) || Boolean(phoneSearch && row.phone?.replace(/\D/g, '').includes(phoneSearch))),
  )
}
export function canReschedule(row: Pick<IntroAppointment, 'booking_status'>): boolean { return row.booking_status === 'reserved' }
