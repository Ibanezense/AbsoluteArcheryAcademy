import { CloudOff, Link2, Trophy, AlertCircle } from 'lucide-react'
import { StudentCard } from '@/components/student/StudentCard'
import { STUDENT_SUPPORT_URL } from '@/lib/utils/studentSupport'

export function CompetitionSourceState({
  state,
  failures,
  busy,
  onRetry,
}: {
  state: 'pending_link' | 'empty' | 'partial' | 'unavailable'
  failures: number
  busy: boolean
  onRetry: () => void
}) {
  const title =
    state === 'pending_link'
      ? 'Competencias pendientes de vinculación'
      : state === 'empty'
        ? 'Sin resultados de competencias publicados'
        : state === 'partial'
          ? 'Consulta incompleta'
          : 'No pudimos consultar tus competencias'
  const Icon =
    state === 'pending_link'
      ? Link2
      : state === 'empty'
        ? Trophy
        : state === 'partial'
          ? AlertCircle
          : CloudOff
  return (
    <StudentCard className={`p-5 ${state === 'partial' ? 'border-amber-200 bg-amber-50' : ''}`}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-6 w-6 shrink-0 text-accent" aria-hidden="true" />
        <div>
          <h2 className="font-bold">{title}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-textsec">
            {state === 'pending_link'
              ? 'La academia debe confirmar los registros de torneos que te corresponden antes de mostrarlos aquí.'
              : state === 'empty'
                ? 'La consulta se completó. Tus identidades vinculadas todavía no tienen resultados individuales publicados.'
                : state === 'partial'
                  ? `Mostramos los resultados que pudimos verificar. ${failures === 1 ? 'Un registro vinculado no pudo consultarse' : 'Hay registros vinculados que no pudieron consultarse'}; la lista puede estar incompleta.`
                  : 'La fuente de resultados no está disponible en este momento. Tus controles de entrenamiento siguen en su sección.'}
          </p>
          <div className="mt-4 flex flex-wrap gap-4">
            <button
              type="button"
              className="btn-outline min-h-11"
              disabled={busy}
              onClick={onRetry}
            >
              {busy ? 'Consultando…' : 'Volver a consultar'}
            </button>
            <a
              href={STUDENT_SUPPORT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center text-sm font-semibold text-accent"
              aria-label="Contactar a la academia por WhatsApp (pestaña nueva)"
            >
              Contactar a la academia
            </a>
          </div>
        </div>
      </div>
    </StudentCard>
  )
}
