import { Link2, CloudOff, Target } from 'lucide-react'
import { StudentCard } from '@/components/student/StudentCard'
import { STUDENT_SUPPORT_URL } from '@/lib/utils/studentSupport'

export function ProgressSourceState({
  state,
  onRetry,
  busy = false,
}: {
  state: 'pending_link' | 'empty' | 'unavailable'
  onRetry: () => void
  busy?: boolean
}) {
  const Icon = state === 'pending_link' ? Link2 : state === 'empty' ? Target : CloudOff
  const title =
    state === 'pending_link'
      ? 'Tus controles aún no están vinculados'
      : state === 'empty'
        ? 'Aún no tienes controles registrados'
        : 'No pudimos consultar tus controles'
  return (
    <StudentCard className="p-6 md:p-8">
      <Icon className="h-8 w-8 text-accent" aria-hidden="true" />
      <h2 className="mt-4 text-lg font-bold">{title}</h2>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-textsec">
        {state === 'pending_link'
          ? 'La academia debe confirmar qué registro de controles te corresponde. Cuando lo vincule, podrás consultar aquí tus intentos y mejores marcas.'
          : state === 'empty'
            ? 'Tu registro está vinculado. Los controles que registre la academia aparecerán aquí con su fecha, distancia y cantidad de flechas.'
            : 'El historial no está disponible en este momento. Esto no significa que no tengas controles. Puedes volver a intentarlo.'}
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        {state !== 'empty' && (
          <button type="button" className="btn-outline min-h-11" disabled={busy} onClick={onRetry}>
            {busy ? 'Consultando…' : 'Volver a consultar'}
          </button>
        )}
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
    </StudentCard>
  )
}
