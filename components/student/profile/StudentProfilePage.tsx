'use client'

import Link from 'next/link'
import {
  ArrowRight,
  Crosshair,
  RefreshCw,
  ShieldCheck,
  Trophy,
  UserRound,
} from 'lucide-react'
import { AuthGuard } from '@/components/AuthGuard'
import { MobileStudentHeader } from '@/components/student/MobileStudentHeader'
import { useStudentContext } from '@/lib/hooks/useStudentContext'
import { useProgressAccountId } from '@/lib/hooks/useStudentProgress'
import { useStudentProfile } from '@/lib/hooks/useStudentProfile'
import { useProgressAvailability } from '@/components/student/progress/ProgressAvailability'
import Avatar from '@/components/ui/Avatar'
import { STUDENT_SUPPORT_URL } from '@/lib/utils/studentSupport'

function Detail({
  label,
  value,
}: {
  label: string
  value: string | null | undefined
}) {
  return (
    <div className="min-w-0 border-b border-slate-100 py-3.5 last:border-0">
      <dt className="text-xs font-semibold text-textsec">{label}</dt>
      <dd
        className={`mt-1 break-words text-sm font-semibold ${value ? 'text-slate-900' : 'font-normal text-slate-400'}`}
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
  const progressEnabled = useProgressAvailability()
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
      <div className="min-h-screen bg-bg pb-8 text-textpri">
        <MobileStudentHeader
          title="Mi perfil"
          subtitle="Tu información y tus logros"
        />
        <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6 sm:py-7">
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
              <section
                aria-label="Perfil del alumno"
                className="sport-dark relative isolate overflow-hidden rounded-2xl border border-slate-700 p-6 text-white shadow-soft sm:p-8"
              >
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-20 top-0 -z-10 h-full w-56 -skew-x-[20deg] border-x-[20px] border-white/[0.035]"
                />
                <div className="flex items-start justify-between gap-4">
                  <Avatar
                    name={profile.full_name || 'Alumno'}
                    url={profile.avatar_url}
                    size="lg"
                    className="shrink-0 rounded-2xl border border-white/10 text-orange-300"
                  />
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-slate-300">
                    <ShieldCheck className="h-3.5 w-3.5 text-orange-400" />
                    Academia
                  </span>
                </div>
                <p className="mt-6 text-[0.65rem] font-bold uppercase tracking-[0.22em] text-orange-400">
                  Absolute Archery
                </p>
                <h2 className="mt-2 max-w-2xl font-heading text-4xl font-bold leading-none tracking-tight text-white sm:text-5xl">
                  {profile.full_name || 'Alumno'}
                </h2>
                <p className="mt-2 text-sm text-slate-300">
                  {profile.category || 'Perfil deportivo por completar'}
                </p>
                {context.account?.role === 'guardian' && (
                  <Link
                    href="/hub"
                    className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-orange-300"
                  >
                    Cambiar alumno <ArrowRight className="h-4 w-4" />
                  </Link>
                )}
              </section>

              {progressEnabled && (
                <Link
                  href="/mi-progreso"
                  className="group my-5 flex min-h-[108px] items-center gap-4 rounded-2xl border border-orange-200 bg-orange-50 p-5 transition-colors hover:border-orange-400 hover:bg-orange-100/60"
                >
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-accent text-white shadow-card">
                    <Trophy className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-heading text-2xl font-bold tracking-tight text-textpri">
                      Mi progreso
                    </span>
                    <span className="mt-1 block text-xs leading-relaxed text-[#76543D]">
                      Tus récords, controles y resultados deportivos.
                    </span>
                  </span>
                  <ArrowRight className="h-5 w-5 shrink-0 text-orange-700 transition-transform group-hover:translate-x-1" />
                </Link>
              )}

              <div
                className={`grid gap-5 md:grid-cols-2 ${progressEnabled ? '' : 'mt-5'}`}
              >
                <section
                  aria-labelledby="personal-title"
                  className="surface-panel px-5 pb-2 pt-5 sm:px-6"
                >
                  <h2
                    id="personal-title"
                    className="flex items-center gap-2.5 font-heading text-2xl font-bold"
                  >
                    <UserRound className="h-4 w-4 text-orange-600" />
                    Datos personales
                  </h2>
                  <dl className="mt-3">
                    <Detail label="Nombre completo" value={profile.full_name} />
                    <Detail
                      label="Fecha de nacimiento"
                      value={birthday(profile.date_of_birth)}
                    />
                    <Detail label="Correo electrónico" value={profile.email} />
                    <Detail label="Teléfono" value={profile.phone} />
                  </dl>
                </section>
                <section
                  aria-labelledby="sports-title"
                  className="surface-panel px-5 pb-2 pt-5 sm:px-6"
                >
                  <h2
                    id="sports-title"
                    className="flex items-center gap-2.5 font-heading text-2xl font-bold"
                  >
                    <Crosshair className="h-4 w-4 text-orange-600" />
                    Datos deportivos
                  </h2>
                  <dl className="mt-3 grid grid-cols-2 gap-x-5">
                    <Detail label="División" value={profile.division} />
                    <Detail label="Nivel" value={profile.level} />
                    <Detail
                      label="Distancia asignada"
                      value={
                        profile.current_distance_m == null
                          ? null
                          : `${profile.current_distance_m} m`
                      }
                    />
                    <Detail label="Categoría" value={profile.category} />
                    <Detail
                      label="Equipo"
                      value={
                        profile.has_own_bow == null
                          ? null
                          : profile.has_own_bow
                            ? 'Arco propio'
                            : 'Arco de la academia'
                      }
                    />
                    <Detail
                      label="Potencia del arco"
                      value={
                        profile.bow_poundage == null
                          ? null
                          : `${profile.bow_poundage} lb`
                      }
                    />
                  </dl>
                </section>
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-slate-500">
                <a
                  href={STUDENT_SUPPORT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Solicitar actualización de datos por WhatsApp (abre una pestaña nueva)"
                  className="inline-flex min-h-11 items-center font-medium text-slate-600 underline decoration-slate-300 underline-offset-4 hover:text-orange-700"
                >
                  Solicitar actualización de datos a la academia
                </a>
                <button
                  type="button"
                  onClick={() => void query.refetch()}
                  disabled={query.isFetching}
                  className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-slate-600 hover:text-orange-700"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${query.isFetching ? 'animate-spin' : ''}`}
                  />
                  {query.isFetching ? 'Actualizando…' : 'Actualizar vista'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </AuthGuard>
  )
}
