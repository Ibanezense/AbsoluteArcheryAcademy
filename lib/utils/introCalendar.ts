import type { IntroSessionGroup } from '@/lib/services/IntroClassesService'

export type IntroState = 'reserved' | 'pending' | 'paid' | 'attended' | 'no_show' | 'cancelled'
export type IntroAppointment = IntroSessionGroup['clients'][number] & {
  session_id: string; session_start: string; session_end: string;
  capacity: number; booked_total: number; location_id: string;
  location_code: string; location_name: string; location_address: string | null;
  updated_at: string; pay_on_site: boolean;
}
export type IntroCalendarSession = Omit<IntroSessionGroup, 'clients'> & {
  available: number; accepts_intro: boolean; can_book: boolean;
  clients: IntroAppointment[];
}
export type IntroCalendarFilters = {
  states: IntroState[]; payment: 'all' | 'pending' | 'paid' | 'on_site'; search: string; locationId: string;
}
export const INTRO_STATES: { value: IntroState; label: string; color: string; dot: string }[] = [
  { value: 'reserved', label: 'Reservado', color: 'border-blue-200 bg-blue-50 text-blue-700', dot: 'bg-blue-500' },
  { value: 'pending', label: 'Por pagar', color: 'border-amber-200 bg-amber-50 text-amber-800', dot: 'bg-amber-500' },
  { value: 'paid', label: 'Pagado', color: 'border-emerald-200 bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
  { value: 'attended', label: 'Asistido', color: 'border-teal-200 bg-teal-50 text-teal-800', dot: 'bg-teal-600' },
  { value: 'no_show', label: 'No show', color: 'border-rose-200 bg-rose-50 text-rose-700', dot: 'bg-rose-500' },
  { value: 'cancelled', label: 'Cancelado', color: 'border-slate-200 bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
]

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
export function filterAppointments(rows: IntroAppointment[], filters: IntroCalendarFilters): IntroAppointment[] {
  const search = filters.search.trim().toLocaleLowerCase('es')
  return rows.filter((row) =>
    (!filters.locationId || row.location_id === filters.locationId)
    && (!filters.states.length || filters.states.includes(appointmentStatus(row)))
    && (filters.payment === 'all' || (filters.payment === 'on_site'
      ? row.payment_status === 'pending' && row.pay_on_site
      : row.payment_status === filters.payment))
    && (!search || row.full_name.toLocaleLowerCase('es').includes(search) || row.phone?.includes(search)),
  )
}
export function canReschedule(row: Pick<IntroAppointment, 'booking_status'>): boolean { return row.booking_status === 'reserved' }
