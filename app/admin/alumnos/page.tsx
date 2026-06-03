'use client'

import { useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import dayjs from 'dayjs'
import {
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  CircleDollarSign,
  Clock3,
  CreditCard,
  Download,
  Phone,
  Search,
  ShieldCheck,
  Target,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react'
import { AdminContentPanel, AdminDonutChart, AdminMiniBarChart, AdminPageHeader, AdminStatCard } from '@/components/admin/AdminVisualSystem'
import Avatar from '@/components/ui/Avatar'
import { useToast } from '@/components/ui/ToastProvider'
import { useStudents, useToggleStudentActive, type StudentListRow } from '@/lib/queries/studentQueries'
import { norm } from '@/lib/utils/searchUtils'

type StudentsTab = 'all' | 'active' | 'inactive' | 'expiring' | 'withoutClasses'

const accessMask = '••••••'

function ageLabel(dateOfBirth: string | null) {
  if (!dateOfBirth) return 'Edad sin registrar'
  const years = dayjs().diff(dayjs(dateOfBirth), 'year')
  return `${years} anos`
}

function membershipTone(student: StudentListRow) {
  if (student.effective_operational_status === 'paused') return 'border-blue-200 bg-blue-50 text-blue-700'
  if (student.effective_operational_status === 'expired') return 'border-rose-200 bg-rose-50 text-rose-700'
  if (student.effective_operational_status === 'blocked' || student.effective_operational_status === 'suspended') return 'border-red-200 bg-red-50 text-red-700'
  if (student.effective_operational_status === 'retired' || student.effective_operational_status === 'withdrawn') return 'border-slate-200 bg-slate-100 text-slate-600'
  if (isExpiringSoon(student)) return 'border-amber-200 bg-amber-50 text-amber-700'
  return 'border-emerald-200 bg-emerald-50 text-emerald-700'
}

function membershipLabel(student: StudentListRow) {
  if (student.effective_operational_status === 'paused') return 'Pausado'
  if (student.effective_operational_status === 'expired') return 'Vencido'
  if (student.effective_operational_status === 'blocked') return 'Bloqueado'
  if (student.effective_operational_status === 'suspended') return 'Suspendido'
  if (student.effective_operational_status === 'retired' || student.effective_operational_status === 'withdrawn') return 'Retirado'
  if (isExpiringSoon(student)) return 'Por vencer'
  return 'Activo'
}

function isOperationalActive(student: StudentListRow) {
  return student.effective_operational_status === 'active'
}

function isExpiringSoon(student: StudentListRow) {
  if (!isOperationalActive(student) || student.membership_status !== 'active' || !student.membership_end) return false

  const today = dayjs().startOf('day')
  const end = dayjs(student.membership_end).startOf('day')
  const daysLeft = end.diff(today, 'day')
  return daysLeft >= 0 && daysLeft <= 7
}

function hasNoClassesAvailable(student: StudentListRow) {
  return student.membership_status === 'expired' && student.membership_raw_classes_remaining <= 0
}

function levelCode(level: string | null) {
  if (!level) return 'SR'
  return level
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

function InfoRow({ icon, label, value, accent = false }: { icon: ReactNode; label: string; value: ReactNode; accent?: boolean }) {
  return (
    <div className="grid grid-cols-[1.25rem_1fr_auto] items-center gap-2 text-xs">
      <span className="text-slate-400">{icon}</span>
      <span className="text-slate-500">{label}</span>
      <span className={`text-right font-bold ${accent ? 'text-accent' : 'text-slate-900'}`}>{value}</span>
    </div>
  )
}

function StudentCard({
  student,
  revealed,
  onToggleReveal,
  onToggleActive,
}: {
  student: StudentListRow
  revealed: boolean
  onToggleReveal: () => void
  onToggleActive: () => void
}) {
  const contact = student.phone || student.email || 'Sin contacto'
  const membershipEnd = student.membership_end ? dayjs(student.membership_end).format('D MMM YYYY') : 'Sin fecha'

  return (
    <article className="rounded-[1.4rem] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.055)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_24px_60px_rgba(15,23,42,0.09)]">
      <div className="flex items-start gap-4">
        <Avatar name={student.full_name} url={student.avatar_url} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-base font-black tracking-[-0.02em] text-slate-950">{student.full_name}</h3>
                <span className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-500">
                  {levelCode(student.level)}
                </span>
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {ageLabel(student.date_of_birth)} · {student.division || 'Division sin registrar'} · {student.level || 'Nivel sin registrar'}
              </p>
            </div>
            <button
              type="button"
              onClick={onToggleActive}
              className={`rounded-xl border px-2.5 py-1 text-[11px] font-bold ${membershipTone(student)}`}
            >
              {membershipLabel(student)}
            </button>
          </div>

          <div className="mt-5 grid gap-3 border-t border-slate-100 pt-4">
            <InfoRow icon={<BadgeCheck className="h-3.5 w-3.5" />} label="Membresia" value={student.membership_name || 'Sin plan'} />
            <InfoRow icon={<Clock3 className="h-3.5 w-3.5" />} label="Clases restantes" value={`${student.classes_remaining}`} />
            <InfoRow icon={<CalendarDays className="h-3.5 w-3.5" />} label="Proxima clase" value="Ver agenda" />
            <InfoRow icon={<CalendarDays className="h-3.5 w-3.5" />} label="Vencimiento" value={membershipEnd} accent={!!student.membership_end} />
            <InfoRow icon={<Users className="h-3.5 w-3.5" />} label="Tutor" value={student.guardian_name || 'No vinculado'} />
            <InfoRow icon={<Phone className="h-3.5 w-3.5" />} label="Contacto" value={contact} />
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2">
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3 text-center">
              <p className="text-[11px] font-semibold text-slate-500">Distancia</p>
              <p className="mt-1 text-sm font-black text-emerald-600">{student.current_distance_m ? `${student.current_distance_m}m` : 'N/D'}</p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3 text-center">
              <p className="text-[11px] font-semibold text-slate-500">Pagos al dia</p>
              <p className="mt-1 text-sm font-black text-emerald-600">Ver</p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3 text-center">
              <p className="text-[11px] font-semibold text-slate-500">Acceso</p>
              <button type="button" onClick={onToggleReveal} className="mt-1 text-sm font-black text-accent">
                {revealed ? 'Ocultar codigo' : 'Ver codigo'}
              </button>
            </div>
          </div>

          <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <div className="flex items-center justify-between gap-2">
              <span>Alumno</span>
              <span className={revealed ? 'font-mono font-bold tracking-wide text-slate-950' : 'tracking-[0.22em]'}>
                {student.access_code ? (revealed ? student.access_code : accessMask) : 'Sin cuenta'}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span>Tutor</span>
              <span className={revealed ? 'font-mono font-bold tracking-wide text-slate-950' : 'tracking-[0.22em]'}>
                {student.guardian_access_code ? (revealed ? student.guardian_access_code : accessMask) : 'Sin tutor'}
              </span>
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <Link href={`/admin/alumnos/editar/${student.id}`} className="btn-outline btn-sm min-w-24">
              Editar
            </Link>
            <Link href={`/admin/alumnos/${student.id}`} className="btn btn-sm min-w-28">
              Ver perfil
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </article>
  )
}

export default function AdminAlumnosPage() {
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState<StudentsTab>('all')
  const [revealedAccessStudentId, setRevealedAccessStudentId] = useState<string | null>(null)
  const { data: students = [], isLoading } = useStudents()
  const toggleStudentActive = useToggleStudentActive()

  const stats = useMemo(() => {
    const active = students.filter(isOperationalActive)
    const expiring = active.filter(isExpiringSoon).length
    const withoutClasses = students.filter(hasNoClassesAvailable).length
    const activeMemberships = active.filter((student) => student.membership_status === 'active').length

    return {
      total: students.length,
      active: active.length,
      activeMemberships,
      expiring,
      withoutClasses,
    }
  }, [students])

  const filteredStudents = useMemo(() => {
    const needle = norm(query)
    return students.filter((student) => {
      const haystack = [
        student.full_name,
        student.guardian_name || '',
        student.dni || '',
        student.phone || '',
        student.level || '',
        student.category || '',
        student.current_distance_m ? `${student.current_distance_m}` : '',
      ].map((value) => norm(value)).join(' ')

      if (needle && !haystack.includes(needle)) return false
      if (activeTab === 'active') return isOperationalActive(student)
      if (activeTab === 'inactive') return student.effective_operational_status === 'paused'
      if (activeTab === 'expiring') return isExpiringSoon(student)
      if (activeTab === 'withoutClasses') return hasNoClassesAvailable(student)
      return true
    })
  }, [activeTab, query, students])

  const levelDistribution = useMemo(() => {
    const active = students.filter(isOperationalActive)
    const groups = [
      { label: 'Principiante', count: active.filter((student) => norm(student.level || '').includes('principiante')).length, color: '#2563eb' },
      { label: 'Intermedio', count: active.filter((student) => norm(student.level || '').includes('intermedio')).length, color: '#14b8a6' },
      { label: 'Avanzado', count: active.filter((student) => norm(student.level || '').includes('avanz')).length, color: '#f97316' },
      { label: 'Competitivo', count: active.filter((student) => norm(student.level || '').includes('compet')).length, color: '#8b5cf6' },
    ]
    return { total: active.length, groups }
  }, [students])

  async function handleToggleActive(studentId: string, currentState: boolean) {
    try {
      await toggleStudentActive.mutateAsync({ id: studentId, isActive: !currentState })
      toast.push({
        message: !currentState ? 'Alumno reactivado.' : 'Alumno marcado como inactivo.',
        type: 'success',
      })
    } catch (error: any) {
      toast.push({ message: error.message || 'No se pudo actualizar el estado.', type: 'error' })
    }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Alumnos"
        description="Gestion de alumnos, membresias y seguimiento operativo."
        actions={
          <>
            <div className="relative w-full lg:w-96">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar alumno, DNI o telefono"
                className="h-12 w-full rounded-2xl border border-slate-200 bg-white pl-11 pr-4 text-sm text-slate-950 shadow-[0_10px_30px_rgba(15,23,42,0.04)] outline-none transition placeholder:text-slate-400 focus:border-accent/40 focus:ring-4 focus:ring-orange-100"
              />
            </div>
            <Link href="/admin/alumnos/editar/new" className="btn h-12 shrink-0 px-5">
              <PlusIcon />
              Nuevo alumno
            </Link>
          </>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdminStatCard label="Alumnos activos" value={stats.active} helper={`${stats.total} alumnos registrados`} icon={<Users className="h-5 w-5" />} tone="green" />
        <AdminStatCard label="Membresias vigentes" value={stats.activeMemberships} helper="Planes activos o recientes" icon={<ShieldCheck className="h-5 w-5" />} tone="orange" />
        <AdminStatCard label="Por vencer (7 dias)" value={stats.expiring} helper="Requieren renovacion" icon={<CalendarDays className="h-5 w-5" />} tone="purple" />
        <AdminStatCard label="Sin clases disponibles" value={stats.withoutClasses} helper="Requieren asignacion" icon={<XCircle className="h-5 w-5" />} tone="red" />
      </section>

      <section className="admin-students-grid grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <AdminContentPanel className="p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative w-full lg:max-w-md">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar alumno por nombre, DNI o telefono"
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm outline-none focus:border-accent/40 focus:ring-4 focus:ring-orange-100"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  ['all', 'Todos'],
                  ['active', 'Activos'],
                  ['inactive', 'Pausados'],
                  ['expiring', 'Por vencer'],
                  ['withoutClasses', 'Sin clases'],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveTab(key as StudentsTab)}
                    className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${
                      activeTab === key
                        ? 'border-accent bg-accent text-white shadow-[0_10px_25px_rgba(249,115,22,0.22)]'
                        : 'border-slate-200 bg-white text-slate-600 hover:text-accent'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </AdminContentPanel>

          {isLoading ? (
            <AdminContentPanel className="p-10 text-center text-slate-500">Cargando alumnos...</AdminContentPanel>
          ) : filteredStudents.length === 0 ? (
            <AdminContentPanel className="p-10 text-center text-slate-500">No hay alumnos que coincidan con el filtro.</AdminContentPanel>
          ) : (
            <section className="grid gap-4 lg:grid-cols-2">
              {filteredStudents.map((student) => (
                <StudentCard
                  key={student.id}
                  student={student}
                  revealed={revealedAccessStudentId === student.id}
                  onToggleReveal={() => setRevealedAccessStudentId(revealedAccessStudentId === student.id ? null : student.id)}
                  onToggleActive={() => handleToggleActive(student.id, student.is_active)}
                />
              ))}
            </section>
          )}

          <p className="text-sm text-slate-500">
            Mostrando {filteredStudents.length} de {students.length} alumnos
          </p>
        </div>

        <aside className="space-y-5">
          <AdminContentPanel className="p-5">
            <h2 className="text-base font-black text-slate-950">Alertas operativas</h2>
            <div className="mt-4 space-y-4">
              <SideAlert icon={<CalendarDays className="h-5 w-5" />} label="Por vencer esta semana" value={stats.expiring} action="Ver lista" href="/admin/membresias" tone="orange" />
              <SideAlert icon={<XCircle className="h-5 w-5" />} label="Sin clases disponibles" value={stats.withoutClasses} action="Asignar clases" href="/admin/membresias" tone="red" />
              <SideAlert icon={<CircleDollarSign className="h-5 w-5" />} label="Pendientes de pago" value="Ver" action="Ver pagos" href="/admin/finanzas" tone="amber" />
              <SideAlert icon={<UserPlus className="h-5 w-5" />} label="Nuevos alumnos del mes" value="Ver" action="Ver todos" href="/admin/alumnos" tone="blue" />
            </div>
          </AdminContentPanel>

          <AdminContentPanel className="p-5">
            <h2 className="text-base font-black text-slate-950">Proximas clases hoy</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Usa Asistencia para ver la agenda diaria con reservas reales y marcar asistencia.
            </p>
            <Link href="/admin/asistencia" className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-accent">
              Ver agenda completa <ArrowRight className="h-4 w-4" />
            </Link>
          </AdminContentPanel>

          <AdminContentPanel className="p-5">
            <h2 className="text-base font-black text-slate-950">Distribucion por nivel</h2>
            <div className="mt-4">
              <AdminDonutChart
                data={levelDistribution.groups.map((group) => ({
                  name: group.label,
                  value: group.count,
                  color: group.color,
                }))}
                total={levelDistribution.total}
                label="Total activos"
              />
            </div>
            <div className="mt-4 space-y-3">
              {levelDistribution.groups.map((group) => (
                <div key={group.label} className="flex items-center justify-between gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: group.color }} />
                    <span className="text-slate-600">{group.label}</span>
                  </div>
                  <span className="font-black text-slate-950">
                    {group.count}
                    <span className="ml-1 text-xs text-slate-400">
                      {levelDistribution.total > 0 ? `${Math.round((group.count / levelDistribution.total) * 100)}%` : '0%'}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </AdminContentPanel>

          <AdminContentPanel className="p-5">
            <h2 className="text-base font-black text-slate-950">Asistencia semanal</h2>
            <p className="mt-4 text-3xl font-black text-slate-950">Ver reporte</p>
            <p className="text-sm text-slate-500">Promedio desde asistencia</p>
            <div className="mt-4 rounded-2xl bg-slate-50 p-3">
              <AdminMiniBarChart
                tone="blue"
                className="h-20 w-full"
                data={[
                  { name: 'Lun', value: 62 },
                  { name: 'Mar', value: 76 },
                  { name: 'Mie', value: 68 },
                  { name: 'Jue', value: 72 },
                  { name: 'Vie', value: 80 },
                  { name: 'Sab', value: 64 },
                  { name: 'Dom', value: 70 },
                ]}
              />
              <div className="mt-2 grid grid-cols-7 text-center text-[10px] font-semibold text-slate-400">
                <span>Lun</span><span>Mar</span><span>Mie</span><span>Jue</span><span>Vie</span><span>Sab</span><span>Dom</span>
              </div>
            </div>
          </AdminContentPanel>

          <AdminContentPanel className="p-5">
            <h2 className="text-base font-black text-slate-950">Acciones rapidas</h2>
            <div className="mt-4 grid gap-2">
              <QuickAction href="/admin" icon={<CreditCard className="h-4 w-4" />} label="Reserva rapida" />
              <QuickAction href="/admin/asistencia" icon={<BadgeCheck className="h-4 w-4" />} label="Pasar asistencia" />
              <QuickAction href="/admin/finanzas" icon={<Target className="h-4 w-4" />} label="Generar reporte" />
              <QuickAction href="/admin/alumnos" icon={<Download className="h-4 w-4" />} label="Exportar alumnos" />
            </div>
          </AdminContentPanel>
        </aside>
      </section>

      <Link
        href="/admin/alumnos/editar/new"
        className="fixed bottom-24 right-6 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-[0_18px_45px_rgba(249,115,22,0.32)] transition hover:brightness-110 lg:hidden"
        title="Nuevo alumno"
      >
        <UserPlus className="h-6 w-6" />
      </Link>
    </div>
  )
}

function PlusIcon() {
  return <UserPlus className="h-5 w-5" />
}

function SideAlert({ icon, label, value, action, href, tone }: { icon: ReactNode; label: string; value: ReactNode; action: string; href: string; tone: 'orange' | 'red' | 'amber' | 'blue' }) {
  const toneClass =
    tone === 'red'
      ? 'border-rose-100 bg-rose-50 text-rose-600'
      : tone === 'amber'
        ? 'border-amber-100 bg-amber-50 text-amber-600'
        : tone === 'blue'
          ? 'border-blue-100 bg-blue-50 text-blue-600'
          : 'border-orange-100 bg-orange-50 text-accent'

  return (
    <div className="flex gap-3 rounded-2xl border border-slate-100 bg-white p-3">
      <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl border ${toneClass}`}>{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-slate-950">{label}</p>
        <p className="mt-1 text-2xl font-black text-slate-950">{value}</p>
        <Link href={href} className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-accent">
          {action} <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  )
}

function QuickAction({ href, icon, label }: { href: string; icon: ReactNode; label: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-700 transition hover:border-accent/30 hover:text-accent">
      {icon}
      {label}
    </Link>
  )
}
