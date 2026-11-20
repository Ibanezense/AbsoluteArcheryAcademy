'use client'

import { AdminFilterBar } from '@/components/admin/AdminFilterBar'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { ATTENDANCE_STATES, calendarDayLabel, type IntroCalendarFilters } from '@/lib/utils/introCalendar'
import type { AcademyLocation } from '@/lib/infrastructureQueries'

export default function IntroCalendarToolbar({ dates, date, onDateChange, onNavigate, filters, onFilters, locations, view, onView }: {
  dates: string[]; date: string; onDateChange: (date: string) => void; onNavigate: (days: number) => void;
  filters: IntroCalendarFilters; onFilters: (filters: IntroCalendarFilters) => void; locations: AcademyLocation[];
  view: 'day' | 'week' | 'states'; onView: (view: 'day' | 'week' | 'states') => void;
}) {
  return <div className="space-y-4 rounded-2xl border border-blue-100 bg-white p-4">
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => onNavigate(view === 'day' ? -1 : -7)} aria-label={view === 'day' ? 'Día anterior' : 'Semana anterior'} className="min-h-11 min-w-11 rounded-lg border border-blue-100 p-2.5 text-[#084681]"><ChevronLeft size={16} /></button>
      <button type="button" onClick={() => onNavigate(0)} className="rounded-lg border border-blue-100 px-4 py-2 text-sm font-semibold text-[#142c4b]">Hoy</button>
      <button type="button" onClick={() => onNavigate(view === 'day' ? 1 : 7)} aria-label={view === 'day' ? 'Día siguiente' : 'Semana siguiente'} className="min-h-11 min-w-11 rounded-lg border border-blue-100 p-2.5 text-[#084681]"><ChevronRight size={16} /></button>
      <p className="ml-2 text-sm font-bold text-[#101e3e]">{view === 'day' ? calendarDayLabel(date, { day: 'numeric', month: 'short', year: 'numeric' }) : `${calendarDayLabel(dates[0])} — ${calendarDayLabel(dates[6], { day: 'numeric', month: 'short', year: 'numeric' })}`}</p>
      <div className="ml-auto flex rounded-xl bg-[#edf5ff] p-1" aria-label="Vista del calendario">{([['day', 'Día'], ['week', 'Semana'], ['states', 'Estados']] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={view === value} onClick={() => onView(value)} className={`rounded-lg px-4 py-2 text-xs font-bold ${view === value ? 'bg-[#0758aa] text-white shadow-sm' : 'text-[#084681]'}`}>{label}</button>)}</div>
    </div>
    <div className="grid grid-cols-2 gap-3">
      <label className="text-xs font-medium text-[#084681]">Fecha<input aria-label="Fecha del calendario" type="date" value={date} onChange={(event) => event.target.value && onDateChange(event.target.value)} className="mt-1 block min-h-11 min-w-0 w-full rounded-xl border border-blue-100 bg-[#f4f9ff] px-3 text-sm text-[#101e3e]" /></label>
      <label className="text-xs font-medium text-[#084681]">Sede<select aria-label="Filtrar por sede" value={filters.locationId} onChange={(event) => onFilters({ ...filters, locationId: event.target.value })} className="mt-1 block min-h-11 min-w-0 w-full rounded-xl border border-blue-100 bg-[#f4f9ff] px-3 text-sm text-[#101e3e]"><option value="">Todas las sedes</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}{!location.is_active ? ' (inactiva)' : ''}</option>)}</select></label>
    </div>
    <AdminFilterBar activeCount={filters.states.length + Number(filters.payment !== 'all') + Number(Boolean(filters.search.trim()))} onClear={() => onFilters({ ...filters, states: [], payment: 'all', search: '' })}>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-xs font-medium text-[#084681]">Pago<select value={filters.payment} onChange={(event) => onFilters({ ...filters, payment: event.target.value as IntroCalendarFilters['payment'] })} className="mt-1 block min-h-11 min-w-0 w-full rounded-xl border border-blue-100 bg-[#f4f9ff] px-3 text-sm text-[#101e3e]"><option value="all">Todos los pagos</option><option value="pending">Por pagar</option><option value="on_site">Pendiente · Paga en sede</option><option value="paid">Pagado</option></select></label>
      <label className="text-xs font-medium text-[#084681]">Buscar<div className="relative mt-1"><Search size={16} className="absolute left-3 top-3.5 text-[#084681]" /><input value={filters.search} onChange={(event) => onFilters({ ...filters, search: event.target.value })} placeholder="Nombre o teléfono" className="block min-h-11 w-full rounded-xl border border-blue-100 bg-[#f4f9ff] pl-9 pr-3 text-sm text-[#101e3e]" /></div></label>
    </div>
    <div className="flex flex-wrap items-center gap-2"><span className="mr-1 text-xs text-[#084681]">Asistencia</span>{ATTENDANCE_STATES.map((state) => <button type="button" key={state.value} aria-pressed={filters.states.includes(state.value)} onClick={() => onFilters({ ...filters, states: filters.states.includes(state.value) ? filters.states.filter((value) => value !== state.value) : [...filters.states, state.value] })} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${filters.states.includes(state.value) ? state.color : 'border-blue-100 text-[#084681] hover:bg-[#f4f9ff]'}`}><span className={`h-1.5 w-1.5 rounded-full ${state.dot}`} />{state.label}</button>)}<button type="button" className="ml-auto px-2 text-xs font-semibold text-[#084681] underline underline-offset-4" onClick={() => onFilters({ states: [], payment: 'all', search: '', locationId: '' })}>Limpiar filtros</button></div>
    </AdminFilterBar>
  </div>
}
