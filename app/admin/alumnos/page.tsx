'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  CalendarClock,
  ChevronDown,
  Pencil,
  Phone,
  Search,
  UserPlus,
} from 'lucide-react'
import { AdminContentPanel, AdminPageHeader } from '@/components/admin/AdminVisualSystem'
import Avatar from '@/components/ui/Avatar'
import { useStudents, type StudentListRow } from '@/lib/queries/studentQueries'
import {
  filterAdminStudents,
  getAdminStudentStatus,
  type AdminStudentFilter,
  type AdminStudentStatus,
} from '@/lib/utils/adminStudentList'

const statusOptions: Array<[AdminStudentFilter, string]> = [
  ['all', 'Todos'],
  ['active', 'Activos'],
  ['expiring', 'Por vencer'],
  ['expired', 'Vencidos'],
  ['paused', 'En pausa'],
  ['inactive', 'Inactivos'],
]

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
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : dateFormatter.format(date)
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
      {student.membership_status === 'active' ? (
        <p className="mt-1 text-xs text-slate-400">
          {student.classes_remaining} {student.classes_remaining === 1 ? 'clase disponible' : 'clases disponibles'}
        </p>
      ) : null}
    </div>
  )
}

function DesktopStudentTable({ students }: { students: StudentListRow[] }) {
  return (
    <div className="hidden md:block">
      <table className="w-full table-fixed border-collapse text-left">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-black uppercase tracking-[0.08em] text-slate-500">
            <th className="w-[28%] px-5 py-3.5">Alumno</th>
            <th className="w-[14%] px-4 py-3.5">Teléfono</th>
            <th className="w-[20%] px-4 py-3.5">Membresía</th>
            <th className="w-[15%] px-4 py-3.5">Última asistencia</th>
            <th className="w-[15%] px-4 py-3.5">Fecha de ingreso</th>
            <th className="w-[8%] px-4 py-3.5 text-right">
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {students.map((student) => {
            const lastAttendance = formatDate(student.last_attendance_at)
            const enrollmentDate = formatDate(student.created_at)

            return (
              <tr key={student.id} className="group bg-white transition-colors hover:bg-orange-50/35">
                <td className="px-5 py-4 align-middle">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={student.full_name} url={student.avatar_url} size="md" />
                    <div className="min-w-0">
                      <Link
                        href={`/admin/alumnos/${student.id}`}
                        className="block truncate font-bold text-slate-950 transition hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
                      >
                        {student.full_name}
                      </Link>
                      <div className="mt-1.5">
                        <StudentStatusBadge student={student} />
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4 align-middle text-sm">
                  {student.phone ? (
                    <a href={`tel:${student.phone}`} className="font-semibold text-slate-700 hover:text-accent">
                      {student.phone}
                    </a>
                  ) : (
                    <span className="text-slate-400">Sin teléfono</span>
                  )}
                </td>
                <td className="px-4 py-4 align-middle text-sm">
                  <MembershipCell student={student} />
                </td>
                <td className="px-4 py-4 align-middle text-sm">
                  <span className={lastAttendance ? 'font-semibold text-slate-700' : 'text-slate-400'}>
                    {lastAttendance || 'Sin asistencias'}
                  </span>
                </td>
                <td className="px-4 py-4 align-middle text-sm">
                  <span className="font-semibold text-slate-700">{enrollmentDate || 'Sin fecha'}</span>
                </td>
                <td className="px-4 py-4 align-middle">
                  <div className="flex items-center justify-end gap-1">
                    <Link
                      href={`/admin/alumnos/editar/${student.id}`}
                      className="grid h-9 w-9 place-items-center rounded-xl text-slate-400 transition hover:bg-white hover:text-accent hover:shadow-sm"
                      aria-label={`Editar a ${student.full_name}`}
                      title="Editar"
                    >
                      <Pencil className="h-4 w-4" />
                    </Link>
                    <Link
                      href={`/admin/alumnos/${student.id}`}
                      className="grid h-9 w-9 place-items-center rounded-xl text-slate-400 transition hover:bg-white hover:text-accent hover:shadow-sm"
                      aria-label={`Ver perfil de ${student.full_name}`}
                      title="Ver perfil"
                    >
                      <ArrowRight className="h-4 w-4" />
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

function MobileStudentList({ students }: { students: StudentListRow[] }) {
  return (
    <div className="divide-y divide-slate-100 md:hidden">
      {students.map((student) => {
        const lastAttendance = formatDate(student.last_attendance_at)
        const enrollmentDate = formatDate(student.created_at)

        return (
          <article key={student.id} className="bg-white p-4">
            <div className="flex items-start gap-3">
              <Avatar name={student.full_name} url={student.avatar_url} size="md" />
              <div className="min-w-0 flex-1">
                <Link href={`/admin/alumnos/${student.id}`} className="block truncate font-bold text-slate-950">
                  {student.full_name}
                </Link>
                <div className="mt-1.5">
                  <StudentStatusBadge student={student} />
                </div>
              </div>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl bg-slate-50/80 p-3.5">
              <MobileDetail label="Teléfono" value={student.phone || 'Sin teléfono'} />
              <MobileDetail label="Membresía" value={student.membership_name || 'Sin membresía'} />
              <MobileDetail label="Última asistencia" value={lastAttendance || 'Sin asistencias'} />
              <MobileDetail label="Fecha de ingreso" value={enrollmentDate || 'Sin fecha'} />
            </dl>

            <div className="mt-3 flex items-center justify-end gap-2">
              <Link href={`/admin/alumnos/editar/${student.id}`} className="btn-outline btn-sm">
                <Pencil className="h-3.5 w-3.5" />
                Editar
              </Link>
              <Link href={`/admin/alumnos/${student.id}`} className="btn btn-sm">
                Ver perfil
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </article>
        )
      })}
    </div>
  )
}

function MobileDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">{label}</dt>
      <dd className="mt-1 truncate text-xs font-semibold text-slate-700">{value}</dd>
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
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<AdminStudentFilter>('all')
  const { data: students = [], isLoading, isError, refetch } = useStudents()

  const filteredStudents = useMemo(
    () => filterAdminStudents(students, query, statusFilter),
    [query, statusFilter, students],
  )

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Alumnos"
        description="Gestiona perfiles, membresías y asistencia desde una sola lista."
        actions={
          <Link href="/admin/alumnos/editar/new" className="btn h-12 shrink-0 px-5">
            <UserPlus className="h-5 w-5" />
            Agregar alumno
          </Link>
        }
      />

      <AdminContentPanel className="overflow-hidden">
        <div className="border-b border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <label className="relative block min-w-0 flex-1 lg:max-w-xl">
              <span className="sr-only">Buscar alumnos</span>
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por nombre, DNI o teléfono"
                className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm font-medium text-slate-950 outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-accent/50 focus:bg-white focus:ring-4 focus:ring-orange-100"
              />
            </label>

            <label className="relative block sm:w-52">
              <span className="sr-only">Filtrar alumnos por estado</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as AdminStudentFilter)}
                className="h-12 w-full appearance-none rounded-2xl border border-slate-200 bg-white px-4 pr-10 text-sm font-bold text-slate-700 outline-none transition focus:border-accent/50 focus:ring-4 focus:ring-orange-100"
              >
                {statusOptions.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </label>

            <p className="whitespace-nowrap text-xs font-semibold text-slate-500 lg:ml-auto">
              Mostrando <span className="font-black text-slate-950">{filteredStudents.length}</span> de {students.length} alumnos
            </p>
          </div>
        </div>

        {isLoading ? (
          <StudentListSkeleton />
        ) : isError ? (
          <div className="grid min-h-64 place-items-center px-5 py-12 text-center">
            <div>
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-rose-50 text-rose-600">
                <CalendarClock className="h-5 w-5" />
              </div>
              <h2 className="mt-4 font-heading text-xl font-black text-slate-950">No pudimos cargar los alumnos.</h2>
              <p className="mt-1 text-sm text-slate-500">Revisa la conexión e inténtalo nuevamente.</p>
              <button type="button" onClick={() => refetch()} className="btn-outline btn-sm mt-4">
                Reintentar
              </button>
            </div>
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="grid min-h-64 place-items-center px-5 py-12 text-center">
            <div>
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-500">
                {query ? <Search className="h-5 w-5" /> : <Phone className="h-5 w-5" />}
              </div>
              <h2 className="mt-4 font-heading text-xl font-black text-slate-950">No encontramos alumnos con estos filtros.</h2>
              <p className="mt-1 text-sm text-slate-500">Prueba con otra búsqueda o cambia el estado seleccionado.</p>
            </div>
          </div>
        ) : (
          <>
            <DesktopStudentTable students={filteredStudents} />
            <MobileStudentList students={filteredStudents} />
          </>
        )}
      </AdminContentPanel>
    </div>
  )
}
