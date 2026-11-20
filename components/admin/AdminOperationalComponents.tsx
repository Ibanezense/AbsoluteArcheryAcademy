'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowRight, ChevronDown, Clock3, UserCheck, Users } from 'lucide-react'
import Avatar from '@/components/ui/Avatar'
import { attendanceActions } from '@/lib/utils/adminAttendance'
import { calendarDayLabel, calendarTime, calendarDate } from '@/lib/utils/introCalendar'

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

type SessionDistanceRow = { distance_m: number; capacity: number; reserved: number }
type SessionRosterRow = {
  id: string
  distance_m: number | null
  bow_usage_type: string | null
  bow_poundage: number | null
  status: string
  intro_client_id: string | null
  student: { full_name: string | null; avatar_url?: string | null } | null
  intro: { full_name: string | null } | null
}

function bowUsageLabel(type: string | null, poundage: number | null) {
  if (type === 'own') return 'Arco propio'
  if (type === 'assigned') return 'Arco asignado'
  if (type === 'shared_inventory') return poundage ? `Arco de academia · ${poundage} lb` : 'Arco de academia'
  return 'Equipo por confirmar'
}

export function AdminSessionAccordion({
  sessionId, startAt, endAt, locationName, sessionStatusLabel, sessionStatusTone,
  capacityLabel, capacityNote, totalReserved, distanceRows, bookings, notes,
  attendanceHref, attendanceLabel, editHref, onCancelByAcademy, initialExpanded = false,
}: {
  sessionId: string
  startAt: string
  endAt: string
  locationName: string
  sessionStatusLabel: string
  sessionStatusTone: BadgeTone
  capacityLabel?: string
  capacityNote?: string | null
  totalReserved: number
  distanceRows: SessionDistanceRow[]
  bookings: SessionRosterRow[]
  notes: string | null
  attendanceHref?: string
  attendanceLabel: string
  editHref?: string
  onCancelByAcademy?: () => void
  initialExpanded?: boolean
}) {
  const [expanded, setExpanded] = useState(initialExpanded)
  const detailId = `turno-${sessionId}`

  return (
    <article className="overflow-hidden rounded-xl border border-blue-100 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 p-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5">
          <p className="whitespace-nowrap rounded-lg bg-blue-50 px-2.5 py-1.5 text-sm font-bold tabular-nums text-[#101e3e]">{calendarTime(startAt)}–{calendarTime(endAt)}</p>
          <p className="text-sm font-bold text-[#101e3e]">{locationName}</p>
          <OperationalStatusBadge label={sessionStatusLabel} tone={sessionStatusTone} />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <p className="text-slate-700"><strong>{totalReserved}</strong> {totalReserved === 1 ? 'reserva activa' : 'reservas activas'}</p>
          {capacityLabel && <p className="font-semibold text-[#0758aa]">{capacityLabel}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" aria-expanded={expanded} aria-controls={detailId} onClick={() => setExpanded(current => !current)} className="btn-outline btn-sm">
            {expanded ? 'Ocultar detalle' : attendanceHref ? 'Ver detalle' : bookings.length ? 'Ver reservas' : 'Ver detalle'}
            <ChevronDown aria-hidden="true" className={`size-4 transition ${expanded ? 'rotate-180' : ''}`} />
          </button>
          {attendanceHref && <Link href={attendanceHref} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-blue-50 px-3 text-sm font-bold text-[#0758aa] hover:bg-blue-100">
            {attendanceLabel} <ArrowRight aria-hidden="true" className="size-4" />
          </Link>}
        </div>
      </div>
      {expanded && (
        <div id={detailId} className="space-y-3 border-t border-blue-100 bg-slate-50 p-3 sm:p-4">
          {capacityNote && <p className="text-xs text-slate-700">{capacityNote}</p>}
          {notes && <p className="whitespace-pre-wrap break-words text-sm text-slate-700"><strong>Notas</strong> · {notes}</p>}
          <div className="grid gap-3 lg:grid-cols-2">
            <section className="rounded-xl border border-blue-100 bg-white p-3">
              <h3 className="text-sm font-bold text-[#101e3e]">Distribución por distancia</h3>
              {distanceRows.length ? <ul className="mt-2 divide-y divide-blue-50">
                {distanceRows.map(row => <li key={row.distance_m} className="flex justify-between gap-2 py-1.5 text-sm">
                  <strong>{row.distance_m} m</strong><span>{row.reserved} reservadas / {row.capacity} configuradas</span>
                </li>)}
              </ul> : <p className="mt-2 text-sm text-slate-600">Sin distancias configuradas.</p>}
            </section>
            <section className="rounded-xl border border-blue-100 bg-white p-3">
              <h3 className="text-sm font-bold text-[#101e3e]">Alumnos y pruebas ({bookings.length})</h3>
              {bookings.length ? <ul className="mt-2 divide-y divide-blue-50">
                {bookings.map(booking => {
                  const name = booking.intro_client_id ? booking.intro?.full_name || 'Clase de prueba' : booking.student?.full_name || 'Alumno'
                  return <li key={booking.id} className="flex items-center gap-2 py-2">
                    <Avatar name={name} url={booking.student?.avatar_url} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-bold">{name}{booking.intro_client_id && <span className="ml-2 text-xs text-accent">Prueba</span>}</p>
                      <p className="text-xs text-slate-600">{booking.distance_m ? `${booking.distance_m} m · ` : ''}{bowUsageLabel(booking.bow_usage_type, booking.bow_poundage)}</p>
                    </div>
                    <OperationalStatusBadge label={booking.status === 'attended' ? 'Asistió' : booking.status === 'no_show' ? 'No asistió' : 'Reservada'} tone={booking.status === 'attended' ? 'success' : booking.status === 'no_show' ? 'warning' : 'info'} />
                  </li>
                })}
              </ul> : <p className="mt-2 text-sm text-slate-600">No hay reservas para este turno.</p>}
            </section>
          </div>
          {(editHref || onCancelByAcademy) && <div className="flex flex-wrap gap-2">
            {editHref && <Link href={editHref} className="btn-outline btn-sm">Editar turno</Link>}
            {onCancelByAcademy && <button type="button" onClick={onCancelByAcademy} className="btn-outline btn-sm border-rose-200 text-rose-800 hover:bg-rose-50">Cancelar por la academia</button>}
          </div>}
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
    location_name?: string
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
            aria-pressed={isActive}
            className={`min-h-14 min-w-[8rem] rounded-2xl border px-4 text-left transition ${
              isActive
                ? 'border-[#0758aa] bg-[#0758aa] text-white'
                : 'border-blue-100 bg-white text-[#142c4b] hover:border-blue-300'
            }`}
          >
            <span className="block text-sm font-black">{calendarTime(session.session_start_at)}</span>
            {session.location_name && <span className="block text-xs font-semibold">{session.location_name}</span>}
            <span className={`mt-1 block text-xs ${isActive ? 'text-white/90' : 'text-slate-600'}`}>{total} {total === 1 ? 'reserva' : 'reservas'} · {label}</span>
          </button>
        )
      })}
    </div>
  )
}

export function AttendanceStudentRow({
  entryType,
  name,
  avatarUrl,
  distanceM,
  equipmentLabel,
  participantLabel,
  status,
  notes,
  isProcessing,
  isMarking = false,
  canMarkAttendance = true,
  historyLink,
  canEdit = true,
  editDisabledReason,
  onAttended,
  onEdit,
  onCancel,
}: {
  entryType?: 'student' | 'intro'
  name: string
  avatarUrl: string | null
  distanceM: number | null
  equipmentLabel: string
  participantLabel?: string | null
  status: 'reserved' | 'cancelled' | 'attended' | 'no_show'
  notes?: string | null
  isProcessing: boolean
  isMarking?: boolean
  canMarkAttendance?: boolean
  historyLink?: ReactNode
  canEdit?: boolean
  editDisabledReason?: string | null
  onAttended: () => void
  onEdit: () => void
  onCancel: () => void
}) {
  const isReserved = status === 'reserved'
  const actions = attendanceActions(status)
  const editDisabled = isProcessing || !isReserved || !canEdit
  const statusLabel =
    status === 'attended'
      ? 'Asistió'
      : status === 'no_show'
        ? 'No asistió'
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
            {participantLabel && (
              <OperationalStatusBadge label={participantLabel} tone={entryType === 'intro' ? 'info' : 'neutral'} />
            )}
            <OperationalStatusBadge label={statusLabel} tone={statusTone} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {distanceM ? `${distanceM} m` : 'Sin distancia'} - {equipmentLabel}
          </p>
          {notes && <p className="mt-1 text-xs font-semibold text-amber-700">Nota: {notes}</p>}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {actions.canMark && <button
          type="button"
          onClick={onAttended}
          disabled={isProcessing || !canMarkAttendance}
          className="min-h-11 rounded-2xl bg-[#0758aa] px-3 text-sm font-black text-white hover:bg-[#084681] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-600"
        >
          {isMarking ? 'Registrando…' : 'Marcar asistencia'}
        </button>}
        {actions.canEdit && canEdit && <button
          type="button"
          onClick={onEdit}
          disabled={editDisabled}
          title={editDisabledReason || undefined}
          className="min-h-11 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-black text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Editar
        </button>}
        {actions.cancellationLabel && <button
          type="button"
          onClick={onCancel}
          disabled={isProcessing || status === 'cancelled'}
          className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {actions.cancellationLabel}
        </button>}
        {historyLink}
      </div>
    </div>
  )
}

export function AttendanceSummaryCard({
  startAt,
  locationName,
  total,
  attended,
  noShow,
  cancelled,
  sessionHasStarted = true,
}: {
  startAt: string
  locationName?: string
  total: number
  attended: number
  noShow: number
  cancelled: number
  sessionHasStarted?: boolean
}) {
  const pending = Math.max(total - attended - noShow - cancelled, 0)

  return (
    <section className="rounded-[1.45rem] border border-slate-200 bg-white p-5 shadow-[0_20px_55px_rgba(15,23,42,0.06)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-bold text-slate-500">{locationName || 'Sede no disponible'} · {calendarDayLabel(calendarDate(startAt))}</p>
          <h2 className="mt-1 font-heading text-3xl font-black tracking-[-0.05em] text-slate-950">
            {calendarTime(startAt)}
          </h2>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            ['Reservas', total],
            ['Asistieron', attended],
            ['Pendientes', pending],
            ['Canceladas', cancelled],
            ['No asistieron', noShow],
          ].map(([label, value]) => (
            <div key={label} className={`rounded-2xl p-3 ${label === 'Pendientes' ? 'bg-orange-50' : 'bg-blue-50'}`}>
              <p className={`text-[11px] font-bold ${label === 'Pendientes' ? 'text-orange-900' : 'text-[#084681]'}`}>{label}</p>
              <p className="mt-1 text-lg font-black text-slate-950">{value}</p>
            </div>
          ))}
        </div>
      </div>
      <div className={`mt-4 flex items-center gap-2 rounded-2xl p-3 text-sm font-bold ${pending > 0 ? 'bg-orange-50 text-orange-900' : 'bg-blue-50 text-[#084681]'}`}>
        {pending > 0 ? (
          <>
            <Clock3 className="h-4 w-4" />
            {!sessionHasStarted ? `Podrás marcar la asistencia a partir de las ${calendarTime(startAt)}.` : pending === 1 ? 'Falta 1 asistencia por registrar' : `Faltan ${pending} asistencias por registrar`}
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
      Volver a turnos
    </Link>
  )
}
