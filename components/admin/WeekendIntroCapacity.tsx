'use client'

import Link from 'next/link'
import { ArrowRight, CalendarDays, RefreshCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAdminWeekendIntroCapacity } from '@/lib/hooks/useAdminDashboardData'
import {
  buildWeekendIntroSlots,
  getLimaReferenceDate,
  type WeekendIntroCapacityDay,
  type WeekendIntroCapacitySlot,
  type WeekendIntroCapacityStatus,
} from '@/lib/utils/weekendIntroCapacity'

const dayDefinitions: Array<{
  key: WeekendIntroCapacityDay
  label: string
  capacity: number
}> = [
  { key: 'saturday', label: 'Sábado', capacity: 4 },
  { key: 'sunday', label: 'Domingo', capacity: 3 },
]

const statusLabels: Record<Exclude<WeekendIntroCapacityStatus, 'available'>, string> = {
  last_spot: 'Último cupo',
  full: 'Lleno',
  finished: 'Finalizado',
  not_scheduled: 'No programado',
}

const statusStyles: Record<WeekendIntroCapacityStatus, string> = {
  available: 'border-emerald-200 bg-emerald-50/70 text-emerald-800',
  last_spot: 'border-amber-300 bg-amber-50 text-amber-900',
  full: 'border-rose-400 bg-rose-50 text-rose-800',
  finished: 'border-slate-200 bg-slate-100/80 text-slate-500',
  not_scheduled: 'border-dashed border-slate-300 bg-slate-50/70 text-slate-500',
}

const timeFormatter = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const dateFormatter = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'short',
})

function addCalendarDays(date: string, days: number) {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

function getWeekendDates(now: Date): Record<WeekendIntroCapacityDay, string> {
  const referenceDate = getLimaReferenceDate(now)
  const referenceUtc = new Date(`${referenceDate}T00:00:00Z`)
  const daysSinceMonday = (referenceUtc.getUTCDay() + 6) % 7
  const monday = addCalendarDays(referenceDate, -daysSinceMonday)

  return {
    saturday: addCalendarDays(monday, 5),
    sunday: addCalendarDays(monday, 6),
  }
}

function formatDayDate(date: string) {
  return dateFormatter.format(new Date(`${date}T12:00:00Z`)).replace('.', '')
}

function formatTime(value: string) {
  return timeFormatter.format(new Date(value))
}

function getStatusLabel(slot: WeekendIntroCapacitySlot) {
  if (slot.status === 'available' && slot.session) {
    return `${slot.session.spotsRemaining} de ${slot.session.equipmentCapacity} cupos libres`
  }

  return statusLabels[slot.status as Exclude<WeekendIntroCapacityStatus, 'available'>]
}

function SlotContent({ slot }: { slot: WeekendIntroCapacitySlot }) {
  const time = slot.session
    ? `${formatTime(slot.session.startAt)} – ${formatTime(slot.session.endAt)}`
    : 'Horario por definir'
  const status = getStatusLabel(slot)

  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="font-heading text-lg font-black tracking-[-0.025em] text-slate-950">
          {time}
        </p>
        {(slot.status === 'available' || slot.status === 'last_spot') && (
          <ArrowRight className="mt-1 h-4 w-4 shrink-0 opacity-65 transition group-hover:translate-x-0.5" />
        )}
      </div>
      <p className="mt-2 text-xs font-bold leading-4">{status}</p>
    </>
  )
}

function SlotCard({ slot, dayLabel }: { slot: WeekendIntroCapacitySlot; dayLabel: string }) {
  const time = slot.session
    ? `${formatTime(slot.session.startAt)} a ${formatTime(slot.session.endAt)}`
    : `turno ${slot.position + 1}`
  const status = getStatusLabel(slot)
  const ariaLabel = `${dayLabel}, ${time}: ${status}`
  const actionable = slot.status === 'available' || slot.status === 'last_spot'
  const className = `group block min-h-[5.6rem] rounded-2xl border p-3.5 ${statusStyles[slot.status]} ${
    actionable
      ? 'shadow-[0_10px_25px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(15,23,42,0.09)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200'
      : ''
  }`

  return actionable ? (
    <Link href='/admin/intro' aria-label={ariaLabel} className={className}>
      <SlotContent slot={slot} />
    </Link>
  ) : (
    <article aria-label={ariaLabel} className={className}>
      <SlotContent slot={slot} />
    </article>
  )
}

function SectionHeading({ isFetching = false }: { isFetching?: boolean }) {
  return (
    <div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-orange-200 bg-orange-50 text-accent">
          <CalendarDays className="h-5 w-5" />
        </div>
        <div>
          <h2
            id="weekend-intro-capacity-title"
            className="font-heading text-xl font-black tracking-[-0.025em] text-slate-950"
          >
            Disponibilidad para clases de prueba
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-5 text-slate-500">
            La disponibilidad combina 6 arcos de academia de 20 lb y 2 arcos exclusivos de 18 lb para introducción.
          </p>
        </div>
      </div>
      <span
        role="status"
        aria-live="polite"
        className="min-h-5 shrink-0 text-xs font-semibold text-slate-400"
      >
        {isFetching ? 'Actualizando...' : ''}
      </span>
    </div>
  )
}

function LoadingSlots({ dates }: { dates: Record<WeekendIntroCapacityDay, string> }) {
  const skeletons = Array.from({ length: 7 })

  return (
    <div className="grid gap-5 p-5 md:grid-cols-2 md:p-6 xl:grid-cols-[4fr_3fr]">
      {dayDefinitions.map((day, dayIndex) => {
        const start = dayIndex === 0 ? 0 : 4
        return (
          <div key={day.key}>
            <DayHeading label={day.label} date={dates[day.key]} />
            <div className={`mt-3 grid gap-2.5 sm:grid-cols-2 ${day.key === 'saturday' ? 'xl:grid-cols-4' : 'xl:grid-cols-3'}`}>
              {skeletons.slice(start, start + day.capacity).map((_, index) => (
                <div
                  key={`${day.key}-${index}`}
                  aria-hidden="true"
                  className="min-h-[5.6rem] animate-pulse rounded-2xl border border-slate-200 bg-slate-100 p-3.5"
                >
                  <div className="h-5 w-24 rounded bg-slate-200" />
                  <div className="mt-3 h-3 w-20 rounded bg-slate-200" />
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function DayHeading({ label, date }: { label: string; date: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h3 className="font-heading text-base font-black uppercase tracking-[0.06em] text-slate-900">{label}</h3>
      <span className="text-xs font-bold uppercase tracking-[0.08em] text-slate-400">
        {formatDayDate(date)}
      </span>
    </div>
  )
}

export default function WeekendIntroCapacity() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const clock = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(clock)
  }, [])

  const { sessions, isLoading, isFetching, error, refetch } = useAdminWeekendIntroCapacity(now)
  const slots = buildWeekendIntroSlots(sessions, now)
  const dates = getWeekendDates(now)

  return (
    <section
      aria-labelledby="weekend-intro-capacity-title"
      className="overflow-hidden rounded-[1.4rem] border border-slate-200/80 bg-white shadow-[0_20px_55px_rgba(15,23,42,0.06)]"
    >
      <SectionHeading isFetching={isFetching && !isLoading} />

      {isLoading ? (
        <LoadingSlots dates={dates} />
      ) : error ? (
        <div className="p-5 sm:p-6">
          <div className="flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-rose-800">
                No se pudo cargar la disponibilidad de clases de prueba.
              </p>
              <p className="mt-1 text-sm text-rose-700">Intenta nuevamente sin salir del dashboard.</p>
            </div>
            <button
              type="button"
              onClick={() => refetch()}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-rose-300 bg-white px-4 text-sm font-bold text-rose-700 transition hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-200"
            >
              <RefreshCcw className="h-4 w-4" />
              Reintentar
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-5 p-5 md:grid-cols-2 md:p-6 xl:grid-cols-[4fr_3fr]">
          {dayDefinitions.map((day) => {
            const daySlots = slots.filter((slot) => slot.day === day.key)

            return (
              <div key={day.key}>
                <DayHeading label={day.label} date={dates[day.key]} />
                <div className={`mt-3 grid gap-2.5 sm:grid-cols-2 ${day.key === 'saturday' ? 'xl:grid-cols-4' : 'xl:grid-cols-3'}`}>
                  {daySlots.map((slot) => (
                    <SlotCard
                      key={`${slot.day}-${slot.position}`}
                      slot={slot}
                      dayLabel={day.label}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
