'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import dayjs from 'dayjs'
import { ArrowRight, ChevronDown, Clock3, UserCheck, Users } from 'lucide-react'
import Avatar from '@/components/ui/Avatar'

type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

function badgeClasses(tone: BadgeTone) {
  switch (tone) {
    case 'success':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700'
    case 'warning':
      return 'border-amber-200 bg-amber-50 text-amber-700'
    case 'danger':
      return 'border-rose-200 bg-rose-50 text-rose-700'
    case 'info':
      return 'border-blue-200 bg-blue-50 text-blue-700'
    default:
      return 'border-slate-200 bg-slate-50 text-slate-700'
  }
}

export function OperationalStatusBadge({ label, tone = 'neutral' }: { label: string; tone?: BadgeTone }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-black ${badgeClasses(tone)}`}>
      {label}
    </span>
  )
}

export function EmptyOperationalState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="rounded-[1.35rem] border border-dashed border-slate-200 bg-white p-8 text-center shadow-[0_18px_45px_rgba(15,23,42,0.045)]">
      <p className="text-base font-black text-slate-950">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">{description}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  )
}

type SessionDistanceRow = {
  distance_m: number
  capacity: number
  reserved: number
  available: number
  targets?: number
}

type SessionRosterRow = {
  id: string
  distance_m: number | null
  bow_usage_type: 'shared_inventory' | 'assigned' | 'own' | null
  bow_poundage: number | null
  admin_notes: string | null
  student: {
    full_name: string | null
    avatar_url: string | null
    phone?: string | null
    email?: string | null
  } | null
}

function bowUsageLabel(type: SessionRosterRow['bow_usage_type'], poundage: number | null) {
  if (type === 'own') return 'Arco propio'
  if (type === 'assigned') return 'Arco asignado'
  if (poundage) return `Arco academia ${poundage} lb`
  return 'Arco academia'
}

export function AdminSessionAccordion({
  sessionId,
  startAt,
  endAt,
  sessionStatusLabel,
  sessionStatusTone,
  occupancyLabel,
  occupancyTone,
  totalReserved,
  totalCapacity,
  availableSlots,
  occupancyRate,
  distanceRows,
  bookings,
  attendanceHref,
  editHref,
  onCancelWithoutRefund,
  onCancelWithRefund,
}: {
  sessionId: string
  startAt: string
  endAt: string
  sessionStatusLabel: string
  sessionStatusTone: BadgeTone
  occupancyLabel: string
  occupancyTone: BadgeTone
  totalReserved: number
  totalCapacity: number
  availableSlots: number
  occupancyRate: number
  distanceRows: SessionDistanceRow[]
  bookings: SessionRosterRow[]
  attendanceHref: string
  editHref: string
  onCancelWithoutRefund: () => void
  onCancelWithRefund: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const distanceLabel = distanceRows.length
    ? distanceRows.map((row) => `${row.distance_m} m`).join(' · ')
    : 'Sin distancias'

  return (
    <article className="overflow-hidden rounded-[1.25rem] border border-slate-200 bg-white shadow-[0_16px_42px_rgba(15,23,42,0.05)]">
      <div className="grid gap-3 p-3 sm:p-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="grid min-w-0 gap-3 rounded-2xl text-left transition hover:bg-slate-50 sm:grid-cols-[7.5rem_minmax(0,1fr)]"
        >
          <div className="rounded-2xl bg-slate-50 px-4 py-3">
            <p className="font-heading text-xl font-black leading-none tracking-[-0.045em] text-slate-950">
              {dayjs(startAt).format('HH:mm')}
            </p>
            <p className="mt-2 text-sm font-black leading-none text-slate-950">
              {dayjs(endAt).format('HH:mm')}
            </p>
          </div>

          <div className="min-w-0 py-1">
            <div className="flex flex-wrap items-center gap-2">
              <OperationalStatusBadge label={sessionStatusLabel} tone={sessionStatusTone} />
              <OperationalStatusBadge label={occupancyLabel} tone={occupancyTone} />
            </div>
            <p className="mt-2 truncate text-sm font-bold text-slate-600">{distanceLabel}</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">Reservas</p>
                <p className="mt-1 font-black text-slate-950">{totalReserved} / {totalCapacity}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">Cupos libres</p>
                <p className="mt-1 font-black text-slate-950">{availableSlots}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">Ocupacion</p>
                <p className="mt-1 font-black text-slate-950">{occupancyRate}%</p>
              </div>
            </div>
          </div>
        </button>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:justify-end">
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:border-accent/40 hover:text-accent"
          >
            {expanded ? 'Ocultar detalle' : 'Ver detalle'}
            <ChevronDown className={`h-4 w-4 transition ${expanded ? 'rotate-180' : ''}`} />
          </button>
          <Link
            href={attendanceHref}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-black text-slate-700 transition hover:border-accent/40 hover:text-accent"
          >
            Pasar asistencia <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/70 p-3 sm:p-4">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_220px]">
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-black text-slate-950">Distribucion por distancia</h3>
              <div className="mt-4 space-y-3">
                {distanceRows.length === 0 ? (
                  <p className="text-sm text-slate-500">No hay cupos configurados para este turno.</p>
                ) : (
                  distanceRows.map((row) => (
                    <div key={`${sessionId}-${row.distance_m}`} className="grid grid-cols-[3.5rem_minmax(0,1fr)_4.5rem] items-center gap-3 text-sm">
                      <span className="font-black text-slate-950">{row.distance_m} m</span>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full rounded-full bg-accent"
                          style={{ width: `${row.capacity > 0 ? Math.min((row.reserved / row.capacity) * 100, 100) : 0}%` }}
                        />
                      </div>
                      <span className="text-right text-xs font-black text-slate-600">{row.reserved}/{row.capacity}</span>
                    </div>
                  ))
                )}
              </div>
              {distanceRows.length > 0 && (
                <p className="mt-4 text-xs font-bold text-slate-500">
                  Total: {totalReserved} reservas activas, {availableSlots} cupos libres.
                </p>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-black text-slate-950">Alumnos reservados ({bookings.length})</h3>
                <Link href={attendanceHref} className="inline-flex min-h-10 items-center gap-2 rounded-2xl bg-accent px-4 text-sm font-black text-white">
                  Pasar asistencia <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
              <div className="mt-4 max-h-72 space-y-2 overflow-y-auto pr-1">
                {bookings.length === 0 ? (
                  <div className="rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-500">
                    No hay reservas para este turno.
                  </div>
                ) : (
                  bookings.map((booking) => (
                    <div key={booking.id} className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
                      <Avatar name={booking.student?.full_name || 'Alumno'} url={booking.student?.avatar_url || null} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-black text-slate-950">{booking.student?.full_name || 'Alumno sin nombre'}</p>
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {booking.distance_m ? `${booking.distance_m} m` : 'Sin distancia'} - {bowUsageLabel(booking.bow_usage_type, booking.bow_poundage)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-4">
              <Link href={editHref} className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700">
                Editar turno
              </Link>
              <button type="button" onClick={onCancelWithRefund} className="min-h-11 rounded-2xl border border-amber-300 bg-amber-50 px-4 text-sm font-black text-amber-800">
                Cancelar con reembolso
              </button>
              <button type="button" onClick={onCancelWithoutRefund} className="min-h-11 rounded-2xl border border-rose-300 bg-rose-50 px-4 text-sm font-black text-rose-700">
                Cancelar sin reembolso
              </button>
            </section>
          </div>
        </div>
      )}
    </article>
  )
}

export function AttendanceSessionTabs({
  sessions,
  activeSessionId,
  onSelect,
}: {
  sessions: Array<{
    session_id: string
    session_start_at: string
    bookings: Array<{ booking_status: string }>
  }>
  activeSessionId: string | null
  onSelect: (sessionId: string) => void
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {sessions.map((session) => {
        const total = session.bookings.length
        const processed = session.bookings.filter((booking) => booking.booking_status !== 'reserved').length
        const label = processed === 0 ? 'pendiente' : processed === total ? 'completa' : 'parcial'
        const isActive = session.session_id === activeSessionId

        return (
          <button
            key={session.session_id}
            type="button"
            onClick={() => onSelect(session.session_id)}
            className={`min-h-14 min-w-[8rem] rounded-2xl border px-4 text-left transition ${
              isActive
                ? 'border-accent bg-accent text-white shadow-[0_16px_35px_rgba(249,115,22,0.22)]'
                : 'border-slate-200 bg-white text-slate-700 hover:border-accent/40'
            }`}
          >
            <span className="block text-sm font-black">{dayjs(session.session_start_at).format('HH:mm')}</span>
            <span className={`mt-1 block text-xs ${isActive ? 'text-white/80' : 'text-slate-500'}`}>{total} alumnos - {label}</span>
          </button>
        )
      })}
    </div>
  )
}

export function AttendanceStudentRow({
  name,
  avatarUrl,
  distanceM,
  equipmentLabel,
  status,
  notes,
  isProcessing,
  onAttended,
  onNoShow,
  onEdit,
  onCancel,
}: {
  name: string
  avatarUrl: string | null
  distanceM: number | null
  equipmentLabel: string
  status: 'reserved' | 'cancelled' | 'attended' | 'no_show'
  notes?: string | null
  isProcessing: boolean
  onAttended: () => void
  onNoShow: () => void
  onEdit: () => void
  onCancel: () => void
}) {
  const isReserved = status === 'reserved'
  const statusLabel =
    status === 'attended'
      ? 'Asistio'
      : status === 'no_show'
        ? 'No asistio'
        : status === 'cancelled'
          ? 'Cancelada'
          : 'Pendiente'
  const statusTone: BadgeTone =
    status === 'attended'
      ? 'success'
      : status === 'no_show'
        ? 'danger'
        : status === 'cancelled'
          ? 'neutral'
          : 'warning'

  return (
    <div className="grid gap-4 rounded-[1.35rem] border border-slate-200 bg-white p-4 shadow-[0_14px_35px_rgba(15,23,42,0.045)] lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
      <div className="flex min-w-0 items-start gap-3">
        <Avatar url={avatarUrl} name={name} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-black text-slate-950">{name}</p>
            <OperationalStatusBadge label={statusLabel} tone={statusTone} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {distanceM ? `${distanceM} m` : 'Sin distancia'} - {equipmentLabel}
          </p>
          {notes && <p className="mt-1 text-xs font-semibold text-amber-700">Nota: {notes}</p>}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-4 lg:min-w-[29rem]">
        <button
          type="button"
          onClick={onAttended}
          disabled={isProcessing || !isReserved}
          className="min-h-11 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 text-sm font-black text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isProcessing ? '...' : 'Asistio'}
        </button>
        <button
          type="button"
          onClick={onNoShow}
          disabled={isProcessing || !isReserved}
          className="min-h-11 rounded-2xl border border-rose-200 bg-rose-50 px-3 text-sm font-black text-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isProcessing ? '...' : 'No asistio'}
        </button>
        <button
          type="button"
          onClick={onEdit}
          disabled={isProcessing || !isReserved}
          className="min-h-11 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-black text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Editar
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isProcessing || status === 'cancelled'}
          className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

export function AttendanceSummaryCard({
  startAt,
  total,
  attended,
  noShow,
  cancelled,
}: {
  startAt: string
  total: number
  attended: number
  noShow: number
  cancelled: number
}) {
  const pending = Math.max(total - attended - noShow - cancelled, 0)
  const completed = total > 0 ? Math.round(((attended + noShow + cancelled) / total) * 100) : 0

  return (
    <section className="rounded-[1.45rem] border border-slate-200 bg-white p-5 shadow-[0_20px_55px_rgba(15,23,42,0.06)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-bold text-slate-500">Sesion activa</p>
          <h2 className="mt-1 font-heading text-3xl font-black tracking-[-0.05em] text-slate-950">
            {dayjs(startAt).format('HH:mm')}
          </h2>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            ['Reservas', total],
            ['Asistio', attended],
            ['Pendientes', pending],
            ['No-show', noShow],
            ['Completado', `${completed}%`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl bg-slate-50 p-3">
              <p className="text-[11px] font-bold text-slate-500">{label}</p>
              <p className="mt-1 text-lg font-black text-slate-950">{value}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2 rounded-2xl bg-orange-50 p-3 text-sm font-bold text-accent">
        {pending > 0 ? (
          <>
            <Clock3 className="h-4 w-4" />
            Faltan {pending} asistencias por registrar
          </>
        ) : (
          <>
            <UserCheck className="h-4 w-4" />
            Asistencia completa
          </>
        )}
      </div>
    </section>
  )
}

export function AttendanceBackToSessionsLink({ href = '/admin/sesiones' }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700">
      <Users className="h-4 w-4" />
      Volver a sesiones
    </Link>
  )
}
