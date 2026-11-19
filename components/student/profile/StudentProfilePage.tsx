'use client'

import Link from 'next/link'
import {
  ArrowRight,
  Crosshair,
  RefreshCw,
  MessageCircle,
  UserRound,
} from 'lucide-react'
import { AuthGuard } from '@/components/AuthGuard'
import { MobileStudentHeader } from '@/components/student/MobileStudentHeader'
import { StudentCard } from '@/components/student/StudentCard'
import { useStudentContext } from '@/lib/hooks/useStudentContext'
import { useProgressAccountId } from '@/lib/hooks/useStudentProgress'
import { useStudentProfile } from '@/lib/hooks/useStudentProfile'
import Avatar from '@/components/ui/Avatar'
import { STUDENT_SUPPORT_URL } from '@/lib/utils/studentSupport'

function Detail({
  label,
  value,
  featured = false,
}: {
  label: string
  value: string | null | undefined
  featured?: boolean
}) {
  return (
    <div className={featured ? 'min-w-0 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2.5' : 'min-w-0 border-b border-blue-50 py-2.5 last:border-0'}>
      <dt className="text-xs font-semibold text-slate-600">{label}</dt>
      <dd
        className={`mt-0.5 break-words text-sm ${value ? featured ? 'font-bold text-accent' : 'font-semibold text-[#101e3e]' : 'text-slate-600'}`}
      >
        {value || 'No registrado'}
      </dd>
    </div>
  )
}

function birthday(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T12:00:00Z`)
  return Number.isNaN(date.getTime())
    ? null
    : new Intl.DateTimeFormat('es-PE', {
        dateStyle: 'long',
        timeZone: 'UTC',
      }).format(date)
}

export default function StudentProfilePage() {
  const context = useStudentContext()
  const accountId = useProgressAccountId()
  const ready =
    !context.loading &&
    !context.error &&
    !!accountId &&
    context.account?.id === accountId
  const isAdmin = ready && context.account?.role === 'admin'
  const query = useStudentProfile(
    accountId,
    context.activeStudentId,
    ready && !isAdmin,
  )
  const profile =
    ready &&
    !isAdmin &&
    !query.isError &&
    query.data?.student_id === context.activeStudentId &&
    query.data.profile.id === context.activeStudentId
      ? query.data.profile
      : null

  return (
    <AuthGuard>
      <div className="min-h-screen bg-[#F5F8FC] pb-8 text-textpri">
        <MobileStudentHeader
          title="Mi perfil"
          subtitle="Tus datos personales y deportivos"
        />
        <div className="mx-auto max-w-5xl space-y-4 px-4 py-4 sm:px-6 sm:py-6">
          {!ready ? (
            <div className="rounded-3xl border border-line bg-white p-6">
              <p role="status">{context.error || 'Verificando tu acceso…'}</p>
            </div>
          ) : isAdmin ? (
            <div className="rounded-3xl border border-line bg-white p-6">
              <h2 className="font-bold">Cuenta administrativa</h2>
              <p className="mt-2 text-sm text-textsec">
                Consulta los perfiles de alumnos desde el panel administrativo.
              </p>
              <Link
                className="mt-4 inline-flex min-h-11 items-center font-semibold text-accent"
                href="/admin"
              >
                Ir a administración <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </div>
          ) : !context.activeStudentId ? (
            <div className="rounded-3xl border border-line bg-white p-6">
              <p>Selecciona un alumno para ver su perfil.</p>
              <Link
                href="/hub"
                className="mt-4 inline-flex min-h-11 items-center font-semibold text-accent"
              >
                Elegir alumno <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </div>
          ) : query.isError ? (
            <div
              role="alert"
              className="rounded-3xl border border-line bg-white p-6"
            >
              <h2 className="font-bold">No pudimos cargar tu perfil</h2>
              <p className="mt-2 text-sm text-textsec">
                Actualiza para verificar tu acceso y consultar la información.
              </p>
              <button
                type="button"
                className="btn-outline mt-4 min-h-11"
                disabled={query.isFetching}
                onClick={() => void query.refetch()}
              >
                {query.isFetching ? 'Consultando…' : 'Reintentar'}
              </button>
            </div>
          ) : !profile ? (
            <div className="rounded-3xl border border-line bg-white p-6">
              <p role="status">Consultando tu perfil…</p>
            </div>
          ) : (
            <>
              <StudentCard className="border-blue-100 bg-blue-50/60 px-4 py-3 sm:px-5">
                <section aria-label="Perfil del alumno" className="flex items-center gap-3">
                  <Avatar
                    name={profile.full_name || 'Alumno'}
                    url={profile.avatar_url}
                    size="lg"
                    className="shrink-0 border-2 border-orange-300 bg-orange-100 text-accent"
                  />
                  <h2 className="min-w-0 break-words text-lg font-bold leading-tight text-[#101e3e]">
                    {profile.full_name || 'Alumno'}
                  </h2>
                </section>
              </StudentCard>

              <div className="grid items-start gap-4 md:grid-cols-2">
                <StudentCard className="border-blue-100 p-4 sm:p-5">
                  <section aria-labelledby="sports-title">
                    <h2 id="sports-title" className="flex items-center gap-2 text-lg font-bold text-[#101e3e]">
                      <Crosshair aria-hidden="true" className="size-5 text-accent" /> Datos deportivos
                    </h2>
                    <dl className="mt-3 grid grid-cols-2 gap-x-3">
                      <Detail
                        label="Distancia asignada"
                        value={profile.current_distance_m == null ? null : `${profile.current_distance_m} m`}
                        featured
                      />
                      <Detail
                        label="Equipo"
                        value={
                          profile.has_own_bow == null
                            ? null
                            : profile.has_own_bow ? 'Arco propio' : 'Arco de la academia'
                        }
                        featured
                      />
                      <Detail label="División" value={profile.division} />
                      <Detail label="Categoría" value={profile.category} />
                      <Detail label="Nivel" value={profile.level} />
                      <Detail label="Potencia del arco" value={profile.bow_poundage == null ? null : `${profile.bow_poundage} lb`} />
                    </dl>
                  </section>
                </StudentCard>
                <StudentCard className="border-blue-100 p-4 sm:p-5">
                  <section aria-labelledby="personal-title">
                    <h2 id="personal-title" className="flex items-center gap-2 text-lg font-bold text-[#101e3e]">
                      <UserRound aria-hidden="true" className="size-5 text-[#0758aa]" /> Datos personales
                    </h2>
                    <dl className="mt-2">
                      <Detail label="Fecha de nacimiento" value={birthday(profile.date_of_birth)} />
                      <Detail label="Correo electrónico" value={profile.email} />
                      <Detail label="Teléfono" value={profile.phone} />
                    </dl>
                    <div className="mt-2 border-t border-blue-100 pt-3">
                      <p className="text-xs text-slate-600">La academia actualiza los datos de tu perfil.</p>
                      <a
                        href={STUDENT_SUPPORT_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-[#0758aa] underline underline-offset-2"
                      >
                        <MessageCircle aria-hidden="true" className="size-4 shrink-0" />
                        Solicitar corrección por WhatsApp
                      </a>
                    </div>
                  </section>
                </StudentCard>
              </div>
              <button
                type="button"
                onClick={() => void query.refetch()}
                disabled={query.isFetching}
                className="inline-flex min-h-11 items-center gap-2 px-2 text-sm font-semibold text-slate-600 hover:text-[#0758aa] hover:underline disabled:opacity-60"
              >
                <RefreshCw aria-hidden="true" className={`size-4 ${query.isFetching ? 'motion-safe:animate-spin' : ''}`} />
                {query.isFetching ? 'Actualizando…' : 'Actualizar vista'}
              </button>
            </>
          )}
        </div>
      </div>
    </AuthGuard>
  )
}
