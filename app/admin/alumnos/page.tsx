'use client'

import { useEffect, useMemo, useRef, useState, type MouseEventHandler } from 'react'
import Link from 'next/link'
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Phone,
  Search,
  UserPlus,
} from 'lucide-react'
import { AdminContentPanel, AdminPageHeader } from '@/components/admin/AdminVisualSystem'
import { MembershipRenewalAlertAction } from '@/components/admin/MembershipRenewalAlertAction'
import Avatar from '@/components/ui/Avatar'
import StudentLocationBadge from '@/components/admin/StudentLocationBadge'
import StudentBirthdayBadge from '@/components/admin/StudentBirthdayBadge'
import StudentBirthdayAction from '@/components/admin/StudentBirthdayAction'
import { useAdminStudentBirthdays } from '@/lib/hooks/useAdminStudentBirthdays'
import { useAuth } from '@/lib/hooks/useAuth'
import { useMembershipRenewalAlerts } from '@/lib/hooks/useMembershipRenewalAlerts'
import { useAcademyLocations } from '@/lib/infrastructureQueries'
import { useStudents, type StudentListRow } from '@/lib/queries/studentQueries'
import type { MembershipRenewalAlertMap } from '@/lib/services/membershipRenewalAlertService'
import { getStudentRenewalDateState } from '@/lib/utils/studentRenewalDate'
import {
  filterAdminStudents,
  getAdminStudentCategories,
  getAdminStudentStatus,
  type AdminStudentFilter,
  type AdminStudentStatus,
  type AdminStudentSort,
} from '@/lib/utils/adminStudentList'

const statusOptions: Array<[AdminStudentFilter, string]> = [
  ['all', 'Todos'],
  ['active', 'Activos'],
  ['expiring', 'Por vencer'],
  ['expired', 'Vencidos'],
  ['paused', 'En pausa'],
  ['inactive', 'Inactivos'],
]

const PAGE_SIZE = 25
const initialView = { query: '', locationId: '', category: '', status: 'all' as AdminStudentFilter, sort: 'status' as AdminStudentSort, page: 1 }
type ListView = typeof initialView
type SavedListView = ListView & { scroll: number; search: string }
const filterControl = 'min-h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700'

const statusPresentation: Record<AdminStudentStatus, { label: string; className: string; dot: string }> = {
  active: {
    label: 'Activo',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    dot: 'bg-emerald-500',
  },
  expiring: {
    label: 'Por vencer',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
    dot: 'bg-amber-500',
  },
  expired: {
    label: 'Vencido',
    className: 'border-rose-200 bg-rose-50 text-rose-700',
    dot: 'bg-rose-500',
  },
  paused: {
    label: 'En pausa',
    className: 'border-blue-200 bg-blue-50 text-blue-700',
    dot: 'bg-blue-500',
  },
  inactive: {
    label: 'Inactivo',
    className: 'border-slate-300 bg-slate-100 text-slate-700',
    dot: 'bg-slate-500',
  },
}

const dateFormatter = new Intl.DateTimeFormat('es-PE', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'America/Lima',
})

function formatDate(value: string | null) {
  if (!value) return null
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00-05:00` : value)
  return Number.isNaN(date.getTime()) ? null : dateFormatter.format(date)
}

function MembershipEndDate({ student }: { student: StudentListRow }) {
  const formattedDate = formatDate(student.membership_coverage_end)
  const planEnd = formatDate(student.membership_end)
  const renewalStart = formatDate(student.next_membership_start)
  const tone = getStudentRenewalDateState(student.membership_coverage_end).tone

  return (
    <div className="space-y-0.5">
      <p className={tone === 'orange' ? 'font-bold text-orange-800' : 'font-semibold text-slate-800'}>
        {formattedDate || 'Sin fecha registrada'}
        {tone === 'orange' && <span className="sr-only">, vence en siete días o menos</span>}
      </p>
      {student.membership_status === 'active' && planEnd && planEnd !== formattedDate && (
        <p className="text-xs font-normal text-slate-600">Fin del plan actual: {planEnd}</p>
      )}
      {renewalStart && (
        <p className="text-xs font-normal text-blue-800">{student.membership_status === 'active' ? 'Renovación' : 'Inicio programado'}: {renewalStart}</p>
      )}
    </div>
  )
}

function StudentStatusBadge({ student }: { student: StudentListRow }) {
  const status = getAdminStudentStatus(student)
  const presentation = statusPresentation[status]

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${presentation.className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${presentation.dot}`} aria-hidden="true" />
      {presentation.label}
    </span>
  )
}

function MembershipCell({ student }: { student: StudentListRow }) {
  if (!student.membership_name) {
    return <span className="text-slate-400">Sin membresía</span>
  }

  return (
    <div>
      <p className="font-semibold text-slate-800">{student.membership_name}</p>
      {student.open_membership_count > 1 ? (
        <p className="mt-1 text-xs font-semibold text-accent">
          {student.total_open_classes} clases en {student.open_membership_count} membresías
        </p>
      ) : student.membership_status === 'active' ? (
        <p className="mt-1 text-xs text-slate-400">
          {student.classes_remaining} {student.classes_remaining === 1 ? 'clase disponible' : 'clases disponibles'}
        </p>
      ) : null}
    </div>
  )
}

function hasBirthday(student: StudentListRow, flags: Readonly<Record<string, boolean>>) {
  return flags[student.id] === true && ['active', 'expired', 'paused'].includes(student.operational_status || '')
}

function DesktopStudentTable({
  students,
  alerts,
  rememberList,
  birthdays = {},
}: {
  students: StudentListRow[]
  alerts: MembershipRenewalAlertMap
  rememberList: MouseEventHandler<HTMLAnchorElement>
  birthdays?: Readonly<Record<string, boolean>>
}) {
  return (
    <div className="hidden md:block">
      <table className="w-full table-fixed border-collapse text-left">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            <th className="w-[28%] px-5 py-3.5">Alumno</th>
            <th className="w-[14%] px-4 py-3.5">Teléfono</th>
            <th className="w-[20%] px-4 py-3.5">Membresía</th>
            <th className="w-[12%] px-4 py-3.5">Última asistencia</th>
            <th className="w-[16%] px-4 py-3.5">Vigencia total</th>
            <th className="w-[10%] px-4 py-3.5 text-right">
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {students.map((student) => {
            const lastAttendance = formatDate(student.last_attendance_at)

            return (
              <tr key={student.id} className={`group transition-colors ${hasBirthday(student, birthdays) ? 'bg-amber-50/70 hover:bg-amber-100/70' : 'bg-white hover:bg-orange-50/35'}`}>
                <td className="px-5 py-3 align-middle">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={student.full_name} url={student.avatar_url} size="md" />
                    <div className="min-w-0">
                      <Link
                        href={`/admin/alumnos/${student.id}`}
                        onClick={rememberList}
                        className="block break-words font-semibold text-slate-950 transition hover:text-blue-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
                      >
                        {student.full_name}
                      </Link>
                      {student.category && <p className="mt-0.5 break-words text-xs text-slate-600">{student.category}</p>}
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <StudentStatusBadge student={student} />
                        {hasBirthday(student, birthdays) && <StudentBirthdayBadge />}
                        <StudentLocationBadge name={student.home_location_name} code={student.home_location_code} />
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 align-middle text-sm">
                  {student.phone ? (
                    <a href={`tel:${student.phone}`} className="font-semibold text-slate-700 hover:text-accent">
                      {student.phone}
                    </a>
                  ) : (
                    <span className="text-slate-400">Sin teléfono</span>
                  )}
                  {hasBirthday(student, birthdays) && <StudentBirthdayAction studentId={student.id} studentName={student.full_name} phone={student.phone} />}
                </td>
                <td className="px-4 py-3 align-middle text-sm">
                  <MembershipCell student={student} />
                  <MembershipRenewalAlertAction
                    studentName={student.full_name}
                    phone={student.phone}
                    alert={alerts[student.id]}
                    operationalStatus={getAdminStudentStatus(student)}
                    className="mt-2"
                  />
                </td>
                <td className="px-4 py-3 align-middle text-sm">
                  <span className={lastAttendance ? 'font-semibold text-slate-700' : 'text-slate-400'}>
                    {lastAttendance || 'Sin asistencias'}
                  </span>
                </td>
                <td className="px-4 py-3 align-middle text-sm">
                  <MembershipEndDate student={student} />
                </td>
                <td className="px-4 py-3 align-middle">
                  <div className="flex items-center justify-end gap-1">
                    <Link
                      href={`/admin/alumnos/editar/${student.id}`}
                      onClick={rememberList}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-blue-800 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700"
                      aria-label={`Editar a ${student.full_name}`}
                      title="Editar"
                    >
                      <Pencil className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="hidden xl:inline">Editar</span>
                    </Link>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function MobileStudentList({
  students,
  alerts,
  rememberList,
  birthdays = {},
}: {
  students: StudentListRow[]
  alerts: MembershipRenewalAlertMap
  rememberList: MouseEventHandler<HTMLAnchorElement>
  birthdays?: Readonly<Record<string, boolean>>
}) {
  return (
    <div className="divide-y divide-slate-100 md:hidden">
      {students.map((student) => {
        const lastAttendance = formatDate(student.last_attendance_at)

        return (
          <article key={student.id} className={`p-4 ${hasBirthday(student, birthdays) ? 'border-l-4 border-amber-400 bg-amber-50/70' : 'bg-white'}`}>
            <div className="flex items-start gap-3">
              <Avatar name={student.full_name} url={student.avatar_url} size="md" />
              <div className="min-w-0 flex-1">
                <Link href={`/admin/alumnos/${student.id}`} onClick={rememberList} className="block break-words font-semibold text-blue-900 hover:underline">
                  {student.full_name}
                </Link>
                {student.category && <p className="mt-0.5 break-words text-xs text-slate-600">{student.category}</p>}
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <StudentStatusBadge student={student} />
                  {hasBirthday(student, birthdays) && <StudentBirthdayBadge />}
                  <StudentLocationBadge name={student.home_location_name} code={student.home_location_code} />
                </div>
              </div>
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <MobileDetail label="Clases disponibles" value={`${student.classes_remaining} clases`} />
              <MobileDetail label="Vigencia total" value={<MembershipEndDate student={student} />} />
            </dl>
            <details className="mt-2 text-xs text-slate-600">
              <summary className="min-h-11 cursor-pointer py-3 font-medium">Contacto y asistencia</summary>
              <p className="pb-2">{student.membership_name || 'Sin membresía'} · {student.phone || 'Sin teléfono'}</p>
              <p className="pb-2">Última asistencia: {lastAttendance || 'Sin asistencias'}</p>
              {student.open_membership_count > 1 && <p>{student.total_open_classes} clases sin consumir en {student.open_membership_count} membresías</p>}
            </details>

            {hasBirthday(student, birthdays) && <StudentBirthdayAction studentId={student.id} studentName={student.full_name} phone={student.phone} />}

            <MembershipRenewalAlertAction
              studentName={student.full_name}
              phone={student.phone}
              alert={alerts[student.id]}
              operationalStatus={getAdminStudentStatus(student)}
              className="mt-3"
            />

            <div className="mt-3 flex items-center justify-end gap-2">
              <Link href={`/admin/alumnos/editar/${student.id}`} onClick={rememberList} className="btn-outline btn-sm">
                <Pencil className="h-3.5 w-3.5" />
                Editar
              </Link>
            </div>
          </article>
        )
      })}
    </div>
  )
}

function MobileDetail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">{label}</dt>
      <dd className="mt-1 break-words text-xs font-semibold text-slate-700">{value}</dd>
    </div>
  )
}

function StudentListSkeleton() {
  return (
    <div className="animate-pulse divide-y divide-slate-100" aria-label="Cargando alumnos">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="flex items-center gap-4 px-5 py-5">
          <div className="h-10 w-10 rounded-full bg-slate-200" />
          <div className="min-w-0 flex-1">
            <div className="h-3 w-40 max-w-full rounded bg-slate-200" />
            <div className="mt-2 h-2.5 w-20 rounded bg-slate-100" />
          </div>
          <div className="hidden h-3 w-28 rounded bg-slate-100 md:block" />
          <div className="hidden h-3 w-32 rounded bg-slate-100 md:block" />
          <div className="hidden h-3 w-24 rounded bg-slate-100 md:block" />
        </div>
      ))}
    </div>
  )
}

export default function AdminAlumnosPage() {
  const { profile } = useAuth()
  const storageKey = profile?.id ? `admin-alumnos-list:${profile.id}` : null
  const [view, setView] = useState(initialView)
  const [restoreScroll, setRestoreScroll] = useState<number | null>(null)
  const listStart = useRef<HTMLParagraphElement>(null)
  const { data: students = [], isLoading, isError, refetch } = useStudents()
  const { data: academyLocations = [] } = useAcademyLocations()

  useEffect(() => {
    if (!storageKey) return
    const search = window.location.search
    try {
      const stored = sessionStorage.getItem(storageKey)
      sessionStorage.removeItem(storageKey)
      const saved = stored ? JSON.parse(stored) as SavedListView : null
      if (saved && (saved.search === search || !search)) {
        const { scroll, search: _search, ...savedView } = saved
        setView(savedView)
        setRestoreScroll(scroll)
        return
      }
    } catch {
      // The list still works when session storage is unavailable.
    }
    const requested = new URLSearchParams(search).get('status')
    setView({ ...initialView, status: statusOptions.find(([value]) => value === requested)?.[0] ?? 'all' })
    setRestoreScroll(null)
  }, [storageKey])

  useEffect(() => {
    if (isLoading || isError || restoreScroll === null) return
    let scrollFrame = 0
    const frame = requestAnimationFrame(() => {
      scrollFrame = requestAnimationFrame(() => {
        window.scrollTo({ top: restoreScroll, behavior: 'instant' })
        setRestoreScroll(null)
      })
    })
    return () => { cancelAnimationFrame(frame); cancelAnimationFrame(scrollFrame) }
  }, [isLoading, isError, restoreScroll])

  const { query, status, locationId, category, sort } = view
  const matchingScope = useMemo(
    () => filterAdminStudents(students, query, status, new Date(), { locationId, sort }),
    [query, status, students, locationId, sort],
  )
  const categories = useMemo(() => {
    const counts = new Map(getAdminStudentCategories(matchingScope).map(({ id, count }) => [id, count]))
    return getAdminStudentCategories(students)
      .map(option => ({ ...option, count: counts.get(option.id) ?? 0 }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'es'))
  }, [matchingScope, students])
  const filteredStudents = useMemo(
    () => category ? filterAdminStudents(matchingScope, '', 'all', new Date(), { category, sort }) : matchingScope,
    [category, matchingScope, sort],
  )
  const pageCount = Math.max(1, Math.ceil(filteredStudents.length / PAGE_SIZE))
  const currentPage = Math.min(view.page, pageCount)
  const firstIndex = (currentPage - 1) * PAGE_SIZE
  const pageStudents = useMemo(() => filteredStudents.slice(firstIndex, firstIndex + PAGE_SIZE), [filteredStudents, firstIndex])

  const renderedStudentIds = useMemo(() => pageStudents.map(student => student.id), [pageStudents])
  const { data: renewalAlerts = {} } = useMembershipRenewalAlerts(renderedStudentIds)
  const birthdays = useAdminStudentBirthdays(profile?.role === 'admin' ? profile.id : null, renderedStudentIds)
  useEffect(() => {
    const visible = () => { if (document.visibilityState === 'visible') void refetch() }
    window.addEventListener('focus', visible)
    document.addEventListener('visibilitychange', visible)
    return () => { window.removeEventListener('focus', visible); document.removeEventListener('visibilitychange', visible) }
  }, [refetch])

  const locations = useMemo(() => {
    const options = new Map(academyLocations.filter(location => location.is_active).map(location => [location.id, location.name]))
    for (const student of students) {
      if (student.home_location_id && student.home_location_id !== 'both' && !options.has(student.home_location_id)) {
        options.set(student.home_location_id, student.home_location_name || 'Sede sin nombre')
      }
    }
    return [...options].sort((a, b) => a[1].localeCompare(b[1], 'es'))
  }, [academyLocations, students])

  function updateFilters(change: Partial<ListView>) {
    setView(previous => ({ ...previous, ...change, page: 1 }))
  }

  const rememberList: MouseEventHandler<HTMLAnchorElement> = event => {
    if (!storageKey || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    try {
      const saved: SavedListView = { ...view, page: currentPage, scroll: window.scrollY, search: window.location.search }
      sessionStorage.setItem(storageKey, JSON.stringify(saved))
    } catch {
      // Navigation remains available when session storage is unavailable.
    }
  }

  function goToPage(page: number) {
    setView(previous => ({ ...previous, page }))
    listStart.current?.focus({ preventScroll: true })
    listStart.current?.scrollIntoView({ block: 'nearest' })
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Alumnos"
        description="Gestiona perfiles, membresías y asistencia desde una sola lista."
        actions={
          <>
          <Link href="/admin/alumnos/claves" className="btn-outline h-12 shrink-0 px-5">Claves de acceso</Link>
          <Link href="/admin/alumnos/editar/new" onClick={rememberList} className="btn h-12 shrink-0 px-5">
            <UserPlus className="h-5 w-5" />
            Agregar alumno
          </Link>
          </>
        }
      />

      <AdminContentPanel className="overflow-hidden">
        <div className="border-b border-slate-200 bg-white p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(12rem,1.4fr)_minmax(8rem,.8fr)_minmax(12rem,1.1fr)_minmax(10rem,.8fr)]">
            <label className="relative block min-w-0">
              <span className="sr-only">Buscar alumnos</span>
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={query}
                onChange={(event) => updateFilters({ query: event.target.value })}
                placeholder="Buscar por nombre, DNI o teléfono"
                className={`${filterControl} bg-slate-50 pl-11 pr-4`}
              />
            </label>

            <select aria-label="Filtrar por sede" value={locationId} onChange={(event) => updateFilters({ locationId: event.target.value })} className={filterControl}>
              <option value="">Todas las sedes</option>
              {locations.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              <option value="both">Ambas sedes</option>
              <option value="unassigned">Sin sede asignada</option>
            </select>
            <select aria-label="Filtrar por categoría" value={category} onChange={(event) => updateFilters({ category: event.target.value })} className={filterControl}>
              <option value="">Todas las categorías ({matchingScope.length})</option>
              {categories.map(({ id, label, count }) => (
                <option key={id} value={id}>{label} ({count})</option>
              ))}
            </select>
            <select aria-label="Ordenar alumnos" value={sort} onChange={(event) => updateFilters({ sort: event.target.value as AdminStudentSort })} className={filterControl}>
              <option value="status">Estado y nombre</option>
              <option value="expiry">Próximo vencimiento</option>
              <option value="name">Nombre</option>
            </select>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Filtrar alumnos por estado" className="flex flex-wrap gap-1.5">
              {statusOptions.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={status === value}
                  onClick={() => updateFilters({ status: value })}
                  className={`min-h-11 rounded-xl border px-3 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700 ${status === value ? 'border-orange-300 bg-orange-50 text-orange-900' : 'border-blue-100 text-slate-700 hover:bg-blue-50'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {(query || status !== 'all' || locationId || category || sort !== 'status') && (
              <button type="button" onClick={() => { setView(initialView); setRestoreScroll(null) }} className="min-h-11 px-2 text-xs font-semibold text-blue-800 underline">
                Limpiar filtros
              </button>
            )}
          </div>
          <p ref={listStart} tabIndex={-1} aria-live="polite" className="mt-3 scroll-mt-20 text-xs font-medium text-slate-600">
            {!isLoading && !isError && (filteredStudents.length > 0
              ? `Mostrando ${firstIndex + 1}–${firstIndex + pageStudents.length} de ${filteredStudents.length} alumnos`
              : '0 alumnos')}
          </p>
        </div>

        {(birthdays.unavailable || birthdays.partial) && <div role="status" className="m-4 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-950">
          <span>{birthdays.partial ? 'La consulta de cumpleaños está incompleta.' : 'No se pudieron consultar los cumpleaños. La lista de alumnos sigue disponible.'}</span>
          <button type="button" onClick={() => void birthdays.refetch()} className="min-h-11 rounded-lg px-3 font-bold underline">Reintentar cumpleaños</button>
        </div>}
        {isLoading ? (
          <StudentListSkeleton />
        ) : isError ? (
          <div className="grid min-h-64 place-items-center px-5 py-12 text-center">
            <div>
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-rose-50 text-rose-600">
                <CalendarClock className="h-5 w-5" />
              </div>
              <h2 className="mt-4 font-heading text-xl font-semibold text-slate-950">No pudimos cargar los alumnos.</h2>
              <p className="mt-1 text-sm text-slate-500">Revisa la conexión e inténtalo nuevamente.</p>
              <button type="button" onClick={() => refetch()} className="btn-outline btn-sm mt-4">
                Reintentar
              </button>
            </div>
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="grid min-h-64 place-items-center px-5 py-12 text-center">
            <div>
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-slate-100 text-slate-500">
                {query ? <Search className="h-5 w-5" /> : <Phone className="h-5 w-5" />}
              </div>
              <h2 className="mt-4 font-heading text-xl font-semibold text-slate-950">No encontramos alumnos con estos filtros.</h2>
              <p className="mt-1 text-sm text-slate-500">Prueba con otra búsqueda o cambia los filtros.</p>
            </div>
          </div>
        ) : (
          <>
            <DesktopStudentTable students={pageStudents} alerts={renewalAlerts} birthdays={birthdays.flags} rememberList={rememberList} />
            <MobileStudentList students={pageStudents} alerts={renewalAlerts} birthdays={birthdays.flags} rememberList={rememberList} />
            {pageCount > 1 && (
              <nav aria-label="Páginas de alumnos" className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-slate-50/80 px-4 py-3 sm:gap-4">
                <button type="button" className="min-h-11 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-blue-900 disabled:text-slate-400" disabled={currentPage === 1} onClick={() => goToPage(currentPage - 1)}>
                  <ChevronLeft className="mr-1 inline h-4 w-4" aria-hidden="true" /> Anterior
                </button>
                <span className="text-xs font-medium text-slate-600">Página {currentPage} de {pageCount}</span>
                <button type="button" className="min-h-11 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-blue-900 disabled:text-slate-400" disabled={currentPage === pageCount} onClick={() => goToPage(currentPage + 1)}>
                  Siguiente <ChevronRight className="ml-1 inline h-4 w-4" aria-hidden="true" />
                </button>
              </nav>
            )}
          </>
        )}
      </AdminContentPanel>
    </div>
  )
}
