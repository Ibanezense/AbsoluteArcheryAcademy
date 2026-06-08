'use client'

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import dayjs from 'dayjs'
import 'dayjs/locale/es'
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Calendar,
  DollarSign,
  Edit3,
  Eye,
  Filter,
  Loader2,
  MessageCircle,
  Phone,
  Plus,
  Search,
  Target,
  User,
  UsersRound,
  X,
} from 'lucide-react'
import { AdminContentPanel } from '@/components/admin/AdminVisualSystem'
import {
  IntroClassesService,
  type AvailableIntroSession,
  type IntroClassType,
  type IntroPaymentStatus,
  type IntroSessionGroup,
} from '@/lib/services/IntroClassesService'
import RegisterIntroModal from './components/RegisterIntroModal'

dayjs.locale('es')

type IntroClientRow = IntroSessionGroup['clients'][number] & {
  session_id: string
  session_start: string
  session_end: string
  capacity: number
  booked_total: number
}

type IntroDateScope = 'today' | 'tomorrow' | 'week' | 'upcoming' | 'all'
type IntroClassFilter = 'all' | IntroClassType
type IntroPaymentFilter = 'all' | IntroPaymentStatus
type IntroOperationalFilter = 'all' | 'reserved' | 'attended' | 'no_show'

type IntroFiltersState = {
  dateScope: IntroDateScope
  classType: IntroClassFilter
  paymentStatus: IntroPaymentFilter
  operationalStatus: IntroOperationalFilter
  search: string
}

type IntroKpi = {
  label: string
  value: string | number
  helper: string
  tone: 'orange' | 'green' | 'blue' | 'red' | 'amber' | 'slate'
  icon: ReactNode
}

const initialFilters: IntroFiltersState = {
  dateScope: 'upcoming',
  classType: 'all',
  paymentStatus: 'all',
  operationalStatus: 'all',
  search: '',
}

function money(value: number | null | undefined) {
  return `S/ ${Number(value || 0).toFixed(2)}`
}

function maskPhone(phone?: string | null) {
  if (!phone) return 'Sin telefono'
  const digits = phone.replace(/\D/g, '')
  if (digits.length <= 4) return '••••'
  return `${digits.slice(0, 3)} ••• ${digits.slice(-3)}`
}

function SensitivePhone({ phone }: { phone?: string | null }) {
  return <span className="font-mono text-xs text-slate-500">{maskPhone(phone)}</span>
}

function whatsappHref(client: IntroClientRow) {
  const digits = client.phone?.replace(/\D/g, '') || ''
  if (digits.length < 8) return null
  const text = encodeURIComponent(
    `Hola, ${client.full_name}. Te escribimos de Absolute Archery para confirmar tu clase de introducción de tiro con arco.`,
  )
  return `https://wa.me/${digits}?text=${text}`
}

function introClassType(client: IntroClientRow): IntroClassType {
  return client.intro_class_type || (Number(client.amount_paid || 0) > 0 ? 'paid' : 'free')
}

function introClassLabel(client: IntroClientRow) {
  const type = introClassType(client)
  if (type === 'free') return 'Gratuita'
  if (type === 'courtesy') return 'Cortesia'
  return 'Pagada'
}

function introClassClasses(client: IntroClientRow) {
  const type = introClassType(client)
  if (type === 'free') return 'border-blue-200 bg-blue-50 text-blue-700'
  if (type === 'courtesy') return 'border-violet-200 bg-violet-50 text-violet-700'
  return 'border-emerald-200 bg-emerald-50 text-emerald-700'
}

function paymentStatus(client: IntroClientRow): IntroPaymentStatus {
  return client.payment_status || (Number(client.amount_paid || 0) > 0 && Boolean(client.paid_at) ? 'paid' : 'not_applicable')
}

function paymentStatusLabel(client: IntroClientRow) {
  const status = paymentStatus(client)
  if (status === 'not_applicable') return 'No aplica'
  if (status === 'paid') return 'Pagado'
  return 'Pendiente'
}

function paymentStatusClasses(client: IntroClientRow) {
  const status = paymentStatus(client)
  if (status === 'paid') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (status === 'not_applicable') return 'border-slate-200 bg-slate-50 text-slate-600'
  return 'border-amber-200 bg-amber-50 text-amber-700'
}

function operationalLabel(status: string) {
  if (status === 'attended') return 'Asistio'
  if (status === 'no_show') return 'No asistio'
  if (status === 'cancelled') return 'Cancelada'
  return 'Confirmada'
}

function operationalClasses(status: string) {
  if (status === 'attended') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (status === 'no_show') return 'border-rose-200 bg-rose-50 text-rose-700'
  if (status === 'cancelled') return 'border-slate-200 bg-slate-50 text-slate-600'
  return 'border-blue-200 bg-blue-50 text-blue-700'
}

function Badge({ children, className }: { children: ReactNode; className: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-black ${className}`}>
      {children}
    </span>
  )
}

function flattenIntroSessions(data: IntroSessionGroup[]): IntroClientRow[] {
  return data
    .flatMap((session) =>
      session.clients.map((client) => ({
        ...client,
        session_id: session.session_id,
        session_start: session.start_at,
        session_end: session.end_at,
        capacity: session.capacity,
        booked_total: session.booked_total,
      })),
    )
    .sort((a, b) => dayjs(a.session_start).valueOf() - dayjs(b.session_start).valueOf())
}

function IntroKpiCard({ kpi }: { kpi: IntroKpi }) {
  const toneClass =
    kpi.tone === 'green'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : kpi.tone === 'blue'
        ? 'border-blue-200 bg-blue-50 text-blue-700'
        : kpi.tone === 'red'
          ? 'border-rose-200 bg-rose-50 text-rose-700'
          : kpi.tone === 'amber'
            ? 'border-amber-200 bg-amber-50 text-amber-700'
            : kpi.tone === 'slate'
              ? 'border-slate-200 bg-slate-50 text-slate-600'
              : 'border-orange-200 bg-orange-50 text-accent'

  return (
    <article className="rounded-[1.35rem] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.055)]">
      <div className="flex items-start justify-between gap-3">
        <div className={`grid h-11 w-11 place-items-center rounded-2xl border ${toneClass}`}>{kpi.icon}</div>
        <span className="rounded-full bg-slate-50 px-3 py-1 text-[11px] font-black text-slate-500">Actual</span>
      </div>
      <p className="mt-4 text-sm font-bold text-slate-600">{kpi.label}</p>
      <p className="mt-2 font-heading text-3xl font-black leading-none tracking-[-0.055em] text-slate-950">{kpi.value}</p>
      <p className="mt-2 text-xs leading-5 text-slate-500">{kpi.helper}</p>
    </article>
  )
}

function IntroFilters({
  filters,
  onChange,
  onClear,
}: {
  filters: IntroFiltersState
  onChange: (next: IntroFiltersState) => void
  onClear: () => void
}) {
  const patch = (partial: Partial<IntroFiltersState>) => onChange({ ...filters, ...partial })

  return (
    <AdminContentPanel className="p-5">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-black text-slate-950">
              <Filter className="h-4 w-4 text-accent" />
              Filtros operativos
            </div>
            <p className="mt-1 text-xs text-slate-500">Solo se activan filtros respaldados por datos persistentes.</p>
          </div>
          <button type="button" onClick={onClear} className="min-h-11 rounded-2xl border border-slate-200 px-4 text-sm font-black text-slate-700">
            Limpiar filtros
          </button>
        </div>

        <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(13rem,0.75fr)_minmax(13rem,0.75fr)_minmax(16rem,0.95fr)]">
          <div className="min-w-0 rounded-2xl bg-slate-50 p-3">
            <p className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-slate-400">Fecha</p>
            <div className="flex flex-wrap gap-2">
              {[
                ['today', 'Hoy'],
                ['tomorrow', 'Mañana'],
                ['week', 'Esta semana'],
                ['upcoming', 'Próximas'],
                ['all', 'Todas'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => patch({ dateScope: value as IntroDateScope })}
                  className={`min-h-10 flex-1 basis-[6.4rem] rounded-xl px-3 text-[13px] font-black leading-tight transition sm:flex-none sm:basis-auto ${
                    filters.dateScope === value ? 'bg-accent text-white shadow-[0_14px_32px_rgba(249,115,22,0.22)]' : 'bg-white text-slate-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <label className="rounded-2xl bg-slate-50 p-3">
            <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Tipo</span>
            <select value={filters.classType} onChange={(event) => patch({ classType: event.target.value as IntroClassFilter })} className="input mt-2">
              <option value="all">Todos</option>
              <option value="paid">Pagadas</option>
              <option value="free">Gratuitas</option>
              <option value="courtesy">Cortesias</option>
            </select>
          </label>

          <label className="rounded-2xl bg-slate-50 p-3">
            <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Pago</span>
            <select value={filters.paymentStatus} onChange={(event) => patch({ paymentStatus: event.target.value as IntroPaymentFilter })} className="input mt-2">
              <option value="all">Todos</option>
              <option value="paid">Pagado</option>
              <option value="pending">Pendiente</option>
              <option value="not_applicable">No aplica</option>
            </select>
          </label>

          <div className="grid gap-3 rounded-2xl bg-slate-50 p-3">
            <label>
              <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Operacion</span>
              <select value={filters.operationalStatus} onChange={(event) => patch({ operationalStatus: event.target.value as IntroOperationalFilter })} className="input mt-2">
                <option value="all">Todos</option>
                <option value="reserved">Confirmada</option>
                <option value="attended">Asistio</option>
                <option value="no_show">No asistio</option>
              </select>
            </label>
            <label>
              <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Busqueda</span>
              <div className="relative mt-2">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={filters.search}
                  onChange={(event) => patch({ search: event.target.value })}
                  placeholder="Nombre o telefono"
                  className="input py-3 pl-10 text-sm"
                />
              </div>
            </label>
          </div>
        </div>
      </div>
    </AdminContentPanel>
  )
}

function IntroDailyAgenda({
  sessions,
  onShowUpcoming,
  onSelect,
}: {
  sessions: IntroSessionGroup[]
  onShowUpcoming: () => void
  onSelect: (client: IntroClientRow) => void
}) {
  const todaySessions = sessions.filter((session) => dayjs(session.start_at).isSame(dayjs(), 'day'))

  return (
    <AdminContentPanel className="p-5">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-black text-slate-950">Agenda del dia</p>
          <p className="mt-1 text-xs text-slate-500">Horario, cupos y prospectos confirmados para hoy.</p>
        </div>
        <button type="button" onClick={onShowUpcoming} className="min-h-11 rounded-2xl border border-slate-200 px-4 text-sm font-black text-slate-700">
          Ver próximas pruebas
        </button>
      </div>

      {todaySessions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
          <p className="font-black text-slate-950">No hay clases intro programadas para hoy.</p>
          <p className="mt-1 text-sm text-slate-500">Revisa las próximas pruebas para anticipar seguimiento.</p>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {todaySessions.map((session) => {
            const available = Math.max(session.capacity - session.booked_total, 0)
            return (
              <article key={session.session_id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-heading text-2xl font-black tracking-[-0.055em] text-slate-950">{dayjs(session.start_at).format('HH:mm')}</p>
                    <p className="text-xs font-bold text-slate-500">{session.clients.length} pruebas · {available} cupos libres</p>
                  </div>
                  <Badge className={available <= 0 ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}>
                    {session.booked_total}/{session.capacity}
                  </Badge>
                </div>
                <div className="mt-4 space-y-2">
                  {session.clients.length === 0 ? (
                    <p className="rounded-xl bg-white p-3 text-sm text-slate-500">Sin prospectos en este turno.</p>
                  ) : (
                    session.clients.map((client) => (
                      <button
                        key={client.booking_id}
                        type="button"
                        onClick={() => onSelect({ ...client, session_id: session.session_id, session_start: session.start_at, session_end: session.end_at, capacity: session.capacity, booked_total: session.booked_total })}
                        className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl bg-white px-3 text-left transition hover:bg-orange-50/50"
                      >
                        <span className="truncate text-sm font-black text-slate-800">{client.full_name}</span>
                        <span className="text-xs font-bold text-slate-500">{paymentStatusLabel({ ...client, session_id: session.session_id, session_start: session.start_at, session_end: session.end_at, capacity: session.capacity, booked_total: session.booked_total })}</span>
                      </button>
                    ))
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </AdminContentPanel>
  )
}

function IntroClientTable({
  clients,
  onSelect,
  onEdit,
}: {
  clients: IntroClientRow[]
  onSelect: (client: IntroClientRow) => void
  onEdit: (client: IntroClientRow) => void
}) {
  return (
    <div className="hidden overflow-hidden rounded-[1.4rem] border border-slate-200 bg-white shadow-[0_20px_55px_rgba(15,23,42,0.06)] lg:block">
      <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
        <p className="text-sm font-black text-slate-950">Clases intro</p>
        <p className="mt-1 text-xs text-slate-500">Vista desktop para agenda, pago y seguimiento operativo.</p>
      </div>
      <div className="max-h-[44rem] overflow-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-xs font-black uppercase tracking-[0.14em] text-slate-400">
            <tr>
              <th className="px-5 py-4">Fecha</th>
              <th className="px-5 py-4">Prospecto</th>
              <th className="px-5 py-4">Contacto</th>
              <th className="px-5 py-4">Tipo</th>
              <th className="px-5 py-4">Pago</th>
              <th className="px-5 py-4">Operacion</th>
              <th className="px-5 py-4 text-right">Monto</th>
              <th className="px-5 py-4 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client) => (
              <tr key={client.booking_id} className="border-t border-slate-100 bg-white transition hover:bg-orange-50/30">
                <td className="px-5 py-4">
                  <p className="font-bold text-slate-950">{dayjs(client.session_start).format('DD MMM YYYY')}</p>
                  <p className="text-xs text-slate-400">{dayjs(client.session_start).format('HH:mm')} - {dayjs(client.session_end).format('HH:mm')}</p>
                </td>
                <td className="max-w-[14rem] px-5 py-4">
                  <p className="truncate font-black text-slate-950">{client.full_name}</p>
                  <p className="text-xs text-slate-500">{client.age} años</p>
                </td>
                <td className="px-5 py-4"><SensitivePhone phone={client.phone} /></td>
                <td className="px-5 py-4"><Badge className={introClassClasses(client)}>{introClassLabel(client)}</Badge></td>
                <td className="px-5 py-4"><Badge className={paymentStatusClasses(client)}>{paymentStatusLabel(client)}</Badge></td>
                <td className="px-5 py-4"><Badge className={operationalClasses(client.booking_status)}>{operationalLabel(client.booking_status)}</Badge></td>
                <td className="px-5 py-4 text-right font-heading text-lg font-black tracking-[-0.04em] text-slate-950">{money(client.amount_paid)}</td>
                <td className="px-5 py-4 text-right">
                  <div className="inline-flex gap-2">
                    {whatsappHref(client) ? (
                      <a href={whatsappHref(client) || '#'} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-emerald-200 px-4 text-sm font-black text-emerald-700">
                        <MessageCircle className="h-4 w-4" />
                        WhatsApp
                      </a>
                    ) : (
                      <button type="button" disabled className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-slate-200 px-4 text-sm font-black text-slate-400">
                        <MessageCircle className="h-4 w-4" />
                        Sin telefono
                      </button>
                    )}
                    <button type="button" onClick={() => onSelect(client)} className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-accent px-4 text-sm font-black text-white">
                      <Eye className="h-4 w-4" />
                      Ver detalle
                    </button>
                    <button type="button" onClick={() => onEdit(client)} className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-slate-200 px-4 text-sm font-black text-slate-700">
                      <Edit3 className="h-4 w-4" />
                      Editar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function IntroClientCard({
  client,
  onSelect,
  onEdit,
}: {
  client: IntroClientRow
  onSelect: (client: IntroClientRow) => void
  onEdit: (client: IntroClientRow) => void
}) {
  const whatsapp = whatsappHref(client)

  return (
    <article className="rounded-[1.35rem] border border-slate-200 bg-white p-4 shadow-[0_16px_40px_rgba(15,23,42,0.055)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-black text-slate-950">{client.full_name}</p>
          <p className="mt-1 text-xs text-slate-500">{client.age} años · {dayjs(client.session_start).format('DD MMM, HH:mm')}</p>
        </div>
        <Badge className={operationalClasses(client.booking_status)}>{operationalLabel(client.booking_status)}</Badge>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-slate-50 p-3">
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">Tipo</p>
          <p className="mt-1 text-sm font-bold text-slate-700">{introClassLabel(client)}</p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-3">
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">Pago</p>
          <p className="mt-1 text-sm font-bold text-slate-700">{paymentStatusLabel(client)}</p>
        </div>
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Contacto</p>
          <p className="mt-1"><SensitivePhone phone={client.phone} /></p>
        </div>
        <p className="font-heading text-3xl font-black tracking-[-0.055em] text-slate-950">{money(client.amount_paid)}</p>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <button type="button" onClick={() => onSelect(client)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-accent px-4 text-sm font-black text-white">
          <Eye className="h-4 w-4" />
          Ver detalle
        </button>
        <button type="button" onClick={() => onEdit(client)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 text-sm font-black text-slate-700">
          <Edit3 className="h-4 w-4" />
          Editar
        </button>
        {whatsapp ? (
          <a href={whatsapp} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-emerald-200 px-4 text-sm font-black text-emerald-700">
            <MessageCircle className="h-4 w-4" />
            Abrir WhatsApp
          </a>
        ) : (
          <button type="button" disabled className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 text-sm font-black text-slate-400">
            <MessageCircle className="h-4 w-4" />
            Sin telefono
          </button>
        )}
      </div>
    </article>
  )
}

function IntroDetailDrawer({
  client,
  onClose,
  onEdit,
}: {
  client: IntroClientRow | null
  onClose: () => void
  onEdit: (client: IntroClientRow) => void
}) {
  if (!client) return null

  const whatsapp = whatsappHref(client)
  const rows = [
    ['Nombre', client.full_name],
    ['Edad', `${client.age} años`],
    ['Telefono', client.phone || 'No disponible'],
    ['Fecha', dayjs(client.session_start).format('DD/MM/YYYY')],
    ['Hora', `${dayjs(client.session_start).format('HH:mm')} - ${dayjs(client.session_end).format('HH:mm')}`],
    ['Turno', client.session_id],
    ['Tipo de clase', introClassLabel(client)],
    ['Estado de pago', paymentStatusLabel(client)],
    ['Monto', money(client.amount_paid)],
    ['Metodo de pago', client.payment_method || 'No disponible'],
    ['Estado operativo', operationalLabel(client.booking_status)],
    ['Cupos del turno', `${client.booked_total}/${client.capacity}`],
    ['Motivo de cortesia', client.courtesy_reason || 'No aplica'],
  ]

  return (
    <div className="fixed inset-0 z-[90] flex justify-end bg-slate-950/40 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" onClick={onClose}>
      <aside className="flex h-full w-full max-w-xl flex-col overflow-hidden rounded-[1.6rem] bg-white shadow-[0_30px_90px_rgba(15,23,42,0.25)]" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5">
          <div>
            <p className="text-sm font-bold text-slate-500">Detalle de clase intro</p>
            <h2 className="mt-1 font-heading text-3xl font-black tracking-[-0.055em] text-slate-950">{client.full_name}</h2>
          </div>
          <button type="button" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-2xl border border-slate-200 text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <div className="mb-4 grid gap-2 sm:grid-cols-3">
            {whatsapp ? (
              <a href={whatsapp} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 text-sm font-black text-white">
                <MessageCircle className="h-4 w-4" />
                Abrir WhatsApp
              </a>
            ) : (
              <button type="button" disabled className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-slate-100 px-4 text-sm font-black text-slate-400">
                <MessageCircle className="h-4 w-4" />
                Sin telefono
              </button>
            )}
            <button type="button" onClick={() => onEdit(client)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-accent px-4 text-sm font-black text-white">
              <Edit3 className="h-4 w-4" />
              Editar
            </button>
            <button type="button" onClick={onClose} className="min-h-11 rounded-2xl border border-slate-200 px-4 text-sm font-black text-slate-700">
              Cerrar
            </button>
          </div>
          <div className="space-y-3">
            {rows.map(([label, value]) => (
              <div key={label} className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">{label}</p>
                <p className="mt-1 break-words font-bold text-slate-800">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  )
}

function EditIntroModal({
  client,
  onClose,
  onSuccess,
}: {
  client: IntroClientRow | null
  onClose: () => void
  onSuccess: () => void
}) {
  const [sessions, setSessions] = useState<AvailableIntroSession[]>([])
  const [isLoadingSessions, setIsLoadingSessions] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    fullName: '',
    age: '',
    phone: '',
    sessionId: '',
    introClassType: 'paid' as IntroClassType,
    paymentStatus: 'paid' as IntroPaymentStatus,
    amountPaid: '45.00',
    paymentMethod: 'transferencia',
    courtesyReason: '',
  })

  useEffect(() => {
    if (!client) return

    setFormData({
      fullName: client.full_name,
      age: String(client.age || ''),
      phone: client.phone || '',
      sessionId: client.session_id,
      introClassType: introClassType(client),
      paymentStatus: paymentStatus(client),
      amountPaid: Number(client.amount_paid || 0).toFixed(2),
      paymentMethod: client.payment_method || (introClassType(client) === 'paid' ? 'transferencia' : 'not_applicable'),
      courtesyReason: client.courtesy_reason || '',
    })
    setError(null)
    void loadSessions(client)
  }, [client])

  const loadSessions = async (currentClient: IntroClientRow) => {
    setIsLoadingSessions(true)
    try {
      const available = await IntroClassesService.getAvailableSessions(31)
      const currentSession: AvailableIntroSession = {
        session_id: currentClient.session_id,
        start_at: currentClient.session_start,
        end_at: currentClient.session_end,
        capacity: currentClient.capacity,
        booked: currentClient.booked_total,
        available: Math.max(currentClient.capacity - currentClient.booked_total, 0),
      }
      const merged = available.some((session) => session.session_id === currentSession.session_id)
        ? available
        : [currentSession, ...available]

      setSessions(merged)
    } catch (err) {
      setError('Error al cargar turnos disponibles.')
    } finally {
      setIsLoadingSessions(false)
    }
  }

  const updateIntroClassType = (nextType: IntroClassType) => {
    setFormData((prev) => ({
      ...prev,
      introClassType: nextType,
      amountPaid: nextType === 'paid' ? (Number(prev.amountPaid) > 0 ? prev.amountPaid : '45.00') : '0.00',
      paymentStatus: nextType === 'paid' ? (prev.paymentStatus === 'paid' ? 'paid' : 'pending') : 'not_applicable',
      paymentMethod: nextType === 'paid' ? (prev.paymentMethod === 'not_applicable' ? 'transferencia' : prev.paymentMethod) : 'not_applicable',
      courtesyReason: nextType === 'courtesy' ? prev.courtesyReason : '',
    }))
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!client) return

    if (!formData.fullName.trim() || !formData.age || !formData.sessionId || formData.amountPaid === '') {
      setError('Completa nombre, edad, horario y pago.')
      return
    }

    if (formData.introClassType === 'paid' && Number(formData.amountPaid) <= 0) {
      setError('Una clase pagada requiere un monto mayor a cero.')
      return
    }

    if (formData.introClassType !== 'paid' && Number(formData.amountPaid) !== 0) {
      setError('Las clases gratuitas o de cortesia deben tener monto cero.')
      return
    }

    if (formData.introClassType === 'courtesy' && !formData.courtesyReason.trim()) {
      setError('Indica el motivo de la cortesia.')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      await IntroClassesService.updateIntroClass({
        bookingId: client.booking_id,
        introClientId: client.intro_client_id,
        fullName: formData.fullName,
        age: parseInt(formData.age, 10),
        phone: formData.phone,
        sessionId: formData.sessionId,
        amountPaid: parseFloat(formData.amountPaid),
        paymentMethod: formData.paymentMethod,
        introClassType: formData.introClassType,
        paymentStatus: formData.paymentStatus,
        courtesyReason: formData.courtesyReason || null,
      })
      onSuccess()
    } catch (err: any) {
      setError(err.message || 'No se pudo actualizar la clase intro.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!client) return null

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/40 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-[1.6rem] bg-white shadow-[0_30px_90px_rgba(15,23,42,0.25)]" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5">
          <div>
            <p className="text-sm font-bold text-slate-500">Editar clase intro</p>
            <h2 className="mt-1 font-heading text-3xl font-black tracking-[-0.055em] text-slate-950">{client.full_name}</h2>
          </div>
          <button type="button" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-2xl border border-slate-200 text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-5">
          {error && <div className="mb-4 rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</div>}

          <form id="edit-intro-form" onSubmit={handleSubmit} className="space-y-5">
            <section className="space-y-3">
              <h3 className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Prospecto</h3>
              <label className="block">
                <span className="mb-1.5 block text-sm font-bold text-slate-700">Nombre completo</span>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input value={formData.fullName} onChange={(event) => setFormData((prev) => ({ ...prev, fullName: event.target.value }))} className="input pl-10" />
                </div>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-bold text-slate-700">Edad</span>
                  <input type="number" min="5" max="99" value={formData.age} onChange={(event) => setFormData((prev) => ({ ...prev, age: event.target.value }))} className="input" />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-bold text-slate-700">Telefono</span>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input value={formData.phone} onChange={(event) => setFormData((prev) => ({ ...prev, phone: event.target.value }))} className="input pl-10" />
                  </div>
                </label>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Horario</h3>
              <label className="block">
                <span className="mb-1.5 block text-sm font-bold text-slate-700">Turno asignado</span>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <select value={formData.sessionId} onChange={(event) => setFormData((prev) => ({ ...prev, sessionId: event.target.value }))} disabled={isLoadingSessions} className="input pl-10">
                    {sessions.map((session) => (
                      <option key={session.session_id} value={session.session_id}>
                        {dayjs(session.start_at).format('ddd DD MMM - HH:mm')} ({session.available} cupos libres)
                      </option>
                    ))}
                  </select>
                </div>
              </label>
            </section>

            <section className="space-y-3">
              <h3 className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Tipo y pago</h3>
              <div className="grid gap-2 sm:grid-cols-3">
                {[
                  ['paid', 'Pagada', 'Tarifa regular'],
                  ['free', 'Gratuita', 'Promocion'],
                  ['courtesy', 'Cortesia', 'Excepcion'],
                ].map(([value, label, helper]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => updateIntroClassType(value as IntroClassType)}
                    className={`min-h-16 rounded-xl border px-3 py-2 text-left transition ${
                      formData.introClassType === value
                        ? 'border-accent bg-accent/10 text-slate-950'
                        : 'border-slate-200 bg-slate-50 text-slate-600'
                    }`}
                  >
                    <span className="block text-sm font-black">{label}</span>
                    <span className="mt-0.5 block text-xs">{helper}</span>
                  </button>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-bold text-slate-700">Monto</span>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input type="number" step="0.01" value={formData.amountPaid} onChange={(event) => setFormData((prev) => ({ ...prev, amountPaid: event.target.value }))} disabled={formData.introClassType !== 'paid'} className="input pl-10" />
                  </div>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-bold text-slate-700">Estado</span>
                  <select value={formData.paymentStatus} onChange={(event) => setFormData((prev) => ({ ...prev, paymentStatus: event.target.value as IntroPaymentStatus }))} disabled={formData.introClassType !== 'paid'} className="input">
                    {formData.introClassType === 'paid' ? (
                      <>
                        <option value="paid">Pagado</option>
                        <option value="pending">Pendiente</option>
                      </>
                    ) : (
                      <option value="not_applicable">No aplica</option>
                    )}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-bold text-slate-700">Metodo</span>
                  <select value={formData.paymentMethod} onChange={(event) => setFormData((prev) => ({ ...prev, paymentMethod: event.target.value }))} disabled={formData.introClassType !== 'paid'} className="input">
                    {formData.introClassType === 'paid' ? (
                      <>
                        <option value="transferencia">Transferencia</option>
                        <option value="yape">Yape</option>
                        <option value="plin">Plin</option>
                        <option value="efectivo">Efectivo</option>
                      </>
                    ) : (
                      <option value="not_applicable">No aplica</option>
                    )}
                  </select>
                </label>
              </div>

              {formData.introClassType === 'courtesy' && (
                <label className="block">
                  <span className="mb-1.5 block text-sm font-bold text-slate-700">Motivo de cortesia</span>
                  <textarea value={formData.courtesyReason} onChange={(event) => setFormData((prev) => ({ ...prev, courtesyReason: event.target.value }))} className="input min-h-24 py-3" />
                </label>
              )}
            </section>
          </form>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50 px-5 py-4">
          <button type="button" onClick={onClose} disabled={isSubmitting} className="min-h-11 rounded-2xl border border-slate-200 px-4 text-sm font-black text-slate-700 disabled:opacity-50">
            Cancelar
          </button>
          <button type="submit" form="edit-intro-form" disabled={isSubmitting || isLoadingSessions} className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-accent px-5 text-sm font-black text-white disabled:opacity-50">
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Guardar cambios
          </button>
        </div>
      </div>
    </div>
  )
}

function IntroSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        {[0, 1, 2, 3, 4, 5].map((item) => (
          <div key={item} className="h-36 animate-pulse rounded-[1.35rem] bg-slate-100" />
        ))}
      </div>
      <div className="h-96 animate-pulse rounded-[1.45rem] bg-slate-100" />
    </div>
  )
}

function IntroEmptyState({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex min-h-[20rem] flex-col items-center justify-center rounded-[1.4rem] border border-dashed border-slate-200 bg-white p-8 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-orange-50 text-accent">
        <Search className="h-6 w-6" />
      </div>
      <p className="mt-4 text-lg font-black text-slate-950">No hay clases intro para los filtros seleccionados.</p>
      <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">Ajusta fecha, pago, estado o busqueda para revisar otros prospectos.</p>
      <button type="button" onClick={onClear} className="mt-5 min-h-11 rounded-2xl bg-accent px-5 text-sm font-black text-white">
        Limpiar filtros
      </button>
    </div>
  )
}

function IntroErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-[1.4rem] border border-rose-200 bg-rose-50 p-6 text-center">
      <p className="text-base font-black text-rose-700">No pudimos cargar las clases intro.</p>
      <p className="mt-2 text-sm text-rose-600">Revisa la conexion o intenta nuevamente.</p>
      <button type="button" onClick={onRetry} className="mt-5 min-h-11 rounded-2xl bg-rose-600 px-5 text-sm font-black text-white">
        Reintentar
      </button>
    </div>
  )
}

export default function IntroClient() {
  const [sessions, setSessions] = useState<IntroSessionGroup[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedClient, setSelectedClient] = useState<IntroClientRow | null>(null)
  const [selectedEditClient, setSelectedEditClient] = useState<IntroClientRow | null>(null)
  const [filters, setFilters] = useState<IntroFiltersState>(initialFilters)

  const clients = useMemo(() => flattenIntroSessions(sessions), [sessions])

  const fetchData = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await IntroClassesService.getUpcomingIntroSchedule()
      setSessions(result)
    } catch (err: any) {
      console.error(err)
      setError(err?.message || 'No pudimos cargar las clases intro.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void fetchData()
  }, [])

  useEffect(() => {
    const editBookingId = new URLSearchParams(window.location.search).get('editBookingId')
    if (!editBookingId || selectedEditClient) return

    const editableClient = clients.find((client) => client.booking_id === editBookingId)
    if (editableClient) {
      setSelectedEditClient(editableClient)
    }
  }, [clients, selectedEditClient])

  const filteredClients = useMemo(() => {
    const search = filters.search.trim().toLowerCase()
    const now = dayjs()

    return clients.filter((client) => {
      const start = dayjs(client.session_start)
      const matchesDate =
        filters.dateScope === 'all'
        || (filters.dateScope === 'today' && start.isSame(now, 'day'))
        || (filters.dateScope === 'tomorrow' && start.isSame(now.add(1, 'day'), 'day'))
        || (filters.dateScope === 'week' && start.isAfter(now.startOf('day')) && start.isBefore(now.add(7, 'day').endOf('day')))
        || (filters.dateScope === 'upcoming' && start.isAfter(now.startOf('day')))
      const matchesClassType = filters.classType === 'all' || introClassType(client) === filters.classType
      const matchesPayment = filters.paymentStatus === 'all' || paymentStatus(client) === filters.paymentStatus
      const matchesOperational = filters.operationalStatus === 'all' || client.booking_status === filters.operationalStatus
      const matchesSearch = !search
        || client.full_name.toLowerCase().includes(search)
        || client.phone?.toLowerCase().includes(search)

      return matchesDate && matchesClassType && matchesPayment && matchesOperational && matchesSearch
    })
  }, [clients, filters])

  const kpis: IntroKpi[] = useMemo(() => {
    const now = dayjs()
    const todayCount = clients.filter((client) => dayjs(client.session_start).isSame(now, 'day')).length
    const tomorrowCount = clients.filter((client) => dayjs(client.session_start).isSame(now.add(1, 'day'), 'day')).length
    const upcomingCount = clients.filter((client) => dayjs(client.session_start).isAfter(now.startOf('day'))).length
    const pendingCount = clients.filter((client) => paymentStatus(client) === 'pending').length
    const paidCount = clients.filter((client) => paymentStatus(client) === 'paid').length
    const freeCount = clients.filter((client) => introClassType(client) === 'free').length
    const courtesyCount = clients.filter((client) => introClassType(client) === 'courtesy').length
    const attendedCount = clients.filter((client) => client.booking_status === 'attended').length
    const noShowCount = clients.filter((client) => client.booking_status === 'no_show').length

    return [
      { label: 'Pruebas de hoy', value: todayCount, helper: 'Intro agendadas para el dia actual.', tone: 'orange', icon: <CalendarDays className="h-5 w-5" /> },
      { label: 'Pruebas de mañana', value: tomorrowCount, helper: 'Reservas intro del siguiente dia.', tone: 'blue', icon: <Clock3 className="h-5 w-5" /> },
      { label: 'Proximas pruebas', value: upcomingCount, helper: 'Desde hoy hacia adelante.', tone: 'slate', icon: <Target className="h-5 w-5" /> },
      { label: 'Pendientes de pago', value: pendingCount, helper: 'Derivado de monto/pago disponible.', tone: 'amber', icon: <AlertTriangle className="h-5 w-5" /> },
      { label: 'Pagadas', value: paidCount, helper: 'Monto mayor que cero con pago registrado.', tone: 'green', icon: <CheckCircle2 className="h-5 w-5" /> },
      { label: 'Gratuitas / cortesias', value: `${freeCount}/${courtesyCount}`, helper: 'Tipo persistente: gratuitas y cortesias.', tone: 'blue', icon: <UsersRound className="h-5 w-5" /> },
      { label: 'No-show', value: noShowCount, helper: `${attendedCount} asistieron segun bookings.status.`, tone: 'red', icon: <UsersRound className="h-5 w-5" /> },
    ]
  }, [clients])

  const handleCreated = () => {
    setIsModalOpen(false)
    void fetchData()
  }

  const handleUpdated = () => {
    setSelectedEditClient(null)
    setSelectedClient(null)
    void fetchData()
  }

  const clearFilters = () => setFilters(initialFilters)

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-accent px-5 text-sm font-black text-white shadow-[0_16px_35px_rgba(249,115,22,0.24)] transition hover:-translate-y-0.5 active:scale-[0.98]"
        >
          <Plus className="h-5 w-5" />
          Nueva clase intro
        </button>
      </div>

      <IntroFilters filters={filters} onChange={setFilters} onClear={clearFilters} />

      {isLoading ? (
        <IntroSkeleton />
      ) : error ? (
        <IntroErrorState onRetry={fetchData} />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            {kpis.map((kpi) => <IntroKpiCard key={kpi.label} kpi={kpi} />)}
          </div>

          <IntroDailyAgenda sessions={sessions} onShowUpcoming={() => setFilters({ ...filters, dateScope: 'upcoming' })} onSelect={setSelectedClient} />

          {filteredClients.length === 0 ? (
            <IntroEmptyState onClear={clearFilters} />
          ) : (
            <>
              <IntroClientTable clients={filteredClients} onSelect={setSelectedClient} onEdit={setSelectedEditClient} />
              <div className="space-y-3 lg:hidden">
                {filteredClients.map((client) => (
                  <IntroClientCard key={client.booking_id} client={client} onSelect={setSelectedClient} onEdit={setSelectedEditClient} />
                ))}
              </div>
            </>
          )}
        </>
      )}

      <RegisterIntroModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleCreated}
      />
      <EditIntroModal
        client={selectedEditClient}
        onClose={() => setSelectedEditClient(null)}
        onSuccess={handleUpdated}
      />
      <IntroDetailDrawer
        client={selectedClient}
        onClose={() => setSelectedClient(null)}
        onEdit={setSelectedEditClient}
      />
    </div>
  )
}
