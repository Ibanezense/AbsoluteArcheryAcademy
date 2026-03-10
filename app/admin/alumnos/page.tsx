'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import dayjs from 'dayjs'
import { Camera, ChevronRight, Plus, ShieldCheck, UserRound } from 'lucide-react'
import AdminGuard from '@/components/AdminGuard'
import Avatar from '@/components/ui/Avatar'
import { useToast } from '@/components/ui/ToastProvider'
import { useStudents, useToggleStudentActive } from '@/lib/queries/studentQueries'
import { norm } from '@/lib/utils/searchUtils'

function badgeTone(status: string | null, classesRemaining: number) {
  if (status === 'active' && classesRemaining === 0) return 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30'
  if (status === 'expired' || status === 'cancelled') return 'bg-red-500/15 text-red-300 border-red-500/30'
  if (status === 'active') return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
  return 'bg-white/5 text-textsec border-white/10'
}

export default function AdminAlumnosPage() {
  const toast = useToast()
  const [query, setQuery] = useState('')
  const { data: students = [], isLoading } = useStudents()
  const toggleStudentActive = useToggleStudentActive()

  const filteredStudents = useMemo(() => {
    const needle = norm(query)

    return students.filter((student) => {
      const haystack = [
        student.full_name,
        student.guardian_name || '',
        student.level || '',
        student.category || '',
        student.current_distance_m ? `${student.current_distance_m}` : '',
      ]
        .map((value) => norm(value))
        .join(' ')

      return needle === '' || haystack.includes(needle)
    })
  }, [students, query])

  const stats = useMemo(() => {
    const today = dayjs().startOf('day')
    const activeStudents = students.filter((student) => student.is_active)
    const withoutPhoto = students.filter((student) => !student.avatar_url).length
    const expiring = activeStudents.filter((student) => {
      if (!student.membership_end) return false
      return dayjs(student.membership_end).isBefore(today.add(8, 'day'))
    }).length
    const withoutGuardian = activeStudents.filter((student) => !student.guardian_profile_id && !student.self_profile_id).length

    return {
      total: students.length,
      active: activeStudents.length,
      withoutPhoto,
      expiring,
      withoutGuardian,
    }
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
    <AdminGuard>
      <div className="space-y-6">
        <section className="rounded-3xl border border-white/10 bg-card p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-accent">Alumnos</p>
              <h1 className="mt-2 text-3xl font-bold text-textpri">Fichas y cuentas</h1>
              <p className="mt-2 max-w-2xl text-sm text-textsec">
                Revisa foto, tutor, datos tecnicos, acceso y membresia activa desde una sola vista.
              </p>
            </div>
            <Link href="/admin/alumnos/editar/new" className="btn inline-flex items-center justify-center gap-2">
              <Plus className="h-4 w-4" />
              Nuevo alumno
            </Link>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="card p-4">
            <p className="text-sm text-textsec">Alumnos activos</p>
            <p className="mt-2 text-3xl font-bold text-textpri">{stats.active}</p>
          </div>
          <div className="card p-4">
            <p className="text-sm text-textsec">Sin foto</p>
            <p className="mt-2 text-3xl font-bold text-textpri">{stats.withoutPhoto}</p>
          </div>
          <div className="card p-4">
            <p className="text-sm text-textsec">Membresias por vencer</p>
            <p className="mt-2 text-3xl font-bold text-textpri">{stats.expiring}</p>
          </div>
          <div className="card p-4">
            <p className="text-sm text-textsec">Sin cuenta asociada</p>
            <p className="mt-2 text-3xl font-bold text-textpri">{stats.withoutGuardian}</p>
          </div>
        </section>

        <section className="card p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-textpri">Listado</h2>
              <p className="text-sm text-textsec">Busqueda por alumno, tutor, nivel o distancia.</p>
            </div>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar alumno..."
              className="input w-full lg:max-w-sm"
            />
          </div>
        </section>

        {isLoading ? (
          <div className="card p-8 text-center text-textsec">Cargando alumnos...</div>
        ) : filteredStudents.length === 0 ? (
          <div className="card p-8 text-center text-textsec">No hay alumnos que coincidan con la busqueda.</div>
        ) : (
          <section className="grid gap-4 lg:grid-cols-2">
            {filteredStudents.map((student) => {
              const membershipTone = badgeTone(student.membership_status, student.classes_remaining)
              const statusLabel =
                student.membership_status === 'active' && student.classes_remaining === 0
                  ? 'Sin clases'
                  : student.membership_status || 'Sin membresia'

              return (
                <article key={student.id} className="rounded-3xl border border-white/10 bg-card p-4 sm:p-5">
                  <div className="flex items-start gap-4">
                    <Avatar name={student.full_name} url={student.avatar_url} size="lg" />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-lg font-semibold text-textpri">{student.full_name}</h3>
                            {!student.avatar_url && (
                              <span className="inline-flex items-center gap-1 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2 py-1 text-[11px] text-yellow-300">
                                <Camera className="h-3 w-3" />
                                Sin foto
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-sm text-textsec">
                            {student.current_distance_m ? `${student.current_distance_m} m` : 'Sin distancia'}
                            {student.level ? ` · ${student.level}` : ''}
                            {student.category ? ` · ${student.category}` : ''}
                          </p>
                        </div>

                        <button
                          type="button"
                          className={`rounded-full px-3 py-1 text-xs font-medium ${student.is_active ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}`}
                          onClick={() => handleToggleActive(student.id, student.is_active)}
                        >
                          {student.is_active ? 'Activo' : 'Inactivo'}
                        </button>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl border border-white/10 bg-bg/40 p-3">
                          <p className="text-xs uppercase tracking-wide text-textsec">Acceso</p>
                          <div className="mt-2 space-y-2 text-sm text-textpri">
                            <div className="flex items-center gap-2">
                              <UserRound className="h-4 w-4 text-textsec" />
                              <span>{student.access_code ? `Alumno ${student.access_code}` : 'Sin cuenta de alumno'}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <ShieldCheck className="h-4 w-4 text-textsec" />
                              <span>{student.guardian_access_code ? `Tutor ${student.guardian_access_code}` : 'Sin tutor vinculado'}</span>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-bg/40 p-3">
                          <p className="text-xs uppercase tracking-wide text-textsec">Membresia</p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className={`rounded-full border px-2 py-1 text-xs font-medium ${membershipTone}`}>
                              {statusLabel}
                            </span>
                            <span className="text-sm text-textpri">{student.classes_remaining} clases restantes</span>
                          </div>
                          <p className="mt-2 text-sm text-textsec">
                            {student.membership_name || 'Sin plan asignado'}
                            {student.membership_end ? ` · vence ${dayjs(student.membership_end).format('DD/MM/YYYY')}` : ''}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0 text-sm text-textsec">
                          Tutor: <span className="text-textpri">{student.guardian_name || 'No vinculado'}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Link href={`/admin/alumnos/editar/${student.id}`} className="btn-outline text-sm">
                            Editar
                          </Link>
                          <Link href={`/admin/alumnos/${student.id}`} className="btn text-sm inline-flex items-center gap-2">
                            Ver ficha
                            <ChevronRight className="h-4 w-4" />
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              )
            })}
          </section>
        )}

        <Link
          href="/admin/alumnos/editar/new"
          className="fixed bottom-24 right-6 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-black shadow-lg transition hover:brightness-110 lg:hidden"
          title="Nuevo alumno"
        >
          <Plus className="h-6 w-6" />
        </Link>
      </div>
    </AdminGuard>
  )
}
