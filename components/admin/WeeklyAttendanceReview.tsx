'use client'

import Avatar from '@/components/ui/Avatar'
import type {
  WeeklyAttendanceCandidate,
  WeeklyAttendanceReview as WeeklyAttendanceReviewData,
} from '@/lib/services/adminWeeklyAttendanceService'

type WeeklyAttendanceReviewProps = {
  review: WeeklyAttendanceReviewData | null
  isLoading: boolean
  error: string | null
  processingStudentId: string | null
  onMark: (candidate: WeeklyAttendanceCandidate) => void
}

function membershipStatusLabel(status: WeeklyAttendanceCandidate['membership_display_status']) {
  return status === 'expiring' ? 'Por vencer' : 'Activa'
}

export default function WeeklyAttendanceReview({
  review,
  isLoading,
  error,
  processingStudentId,
  onMark,
}: WeeklyAttendanceReviewProps) {
  return (
    <section className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-[0_20px_55px_rgba(15,23,42,0.055)]">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.18em] text-rose-600">Control semanal</p>
        <h2 className="mt-2 font-heading text-2xl font-black tracking-[-0.045em] text-slate-950">
          Alumnos sin asistencia esta semana
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Revisa a quienes no asistieron entre jueves y domingo. El registro es importante para validar su
          participación en el campeonato nacional.
        </p>
      </div>

      {isLoading && (
        <div className="mt-5 rounded-2xl bg-slate-50 p-5 text-sm font-bold text-slate-500">
          Revisando asistencias de la semana…
        </div>
      )}

      {!isLoading && error && (
        <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm font-bold text-rose-700">
          {error}
        </div>
      )}

      {!isLoading && !error && review && review.pending_count > 0 && (
        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-bold text-amber-800">
          Hay {review.pending_count} asistencias pendientes. Completa todas las reservas de jueves a domingo para
          habilitar esta revisión.
        </div>
      )}

      {!isLoading && !error && review && review.pending_count === 0 && review.candidates.length === 0 && (
        <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm font-bold text-emerald-800">
          No hay alumnos pendientes de registrar como inasistencia semanal.
        </div>
      )}

      {!isLoading && !error && review && review.pending_count === 0 && review.candidates.length > 0 && (
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {review.candidates.map((candidate) => {
            const isProcessing = processingStudentId === candidate.student_id

            return (
              <article
                key={candidate.student_id}
                className="rounded-[1.35rem] border-2 border-rose-300 bg-rose-50/60 p-4 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <Avatar name={candidate.student_name} url={candidate.avatar_url} size="md" />
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-base font-black text-slate-950">{candidate.student_name}</h3>
                    <p className="mt-1 text-sm font-bold text-slate-600">{candidate.membership_name}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs font-black">
                      <span className="rounded-full bg-white px-3 py-1 text-slate-700">
                        {candidate.classes_remaining} clases disponibles
                      </span>
                      <span className="rounded-full bg-rose-100 px-3 py-1 text-rose-700">
                        {membershipStatusLabel(candidate.membership_display_status)}
                      </span>
                    </div>
                  </div>
                </div>

                <p className="mt-4 text-sm leading-6 text-rose-800">
                  No registra asistencia esta semana. Al confirmar se descontará una clase y quedará guardada la
                  inasistencia en su historial.
                </p>
                <button
                  type="button"
                  className="mt-4 w-full rounded-2xl bg-rose-600 px-4 py-3 text-sm font-black text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isProcessing}
                  onClick={() => onMark(candidate)}
                >
                  {isProcessing ? 'Registrando…' : 'Marcar no asistió esta semana'}
                </button>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
