interface MembershipAlertProps {
  isExpired: boolean
  isExpiringSoon: boolean
  daysUntilExpiry: number | null
}

export function MembershipAlert({ isExpired, isExpiringSoon, daysUntilExpiry }: MembershipAlertProps) {
  if (isExpired) {
    const daysAgo = Math.abs(daysUntilExpiry ?? 0)
    return (
      <div className="rounded-2xl border border-danger/30 px-5 py-4 bg-danger/10">
        <div className="flex items-start gap-3">
          <span className="text-2xl">⚠️</span>
          <div>
            <p className="font-semibold text-danger">Membresía vencida</p>
            <p className="text-sm text-textsec mt-1">
              Tu membresía venció hace {daysAgo} día{daysAgo !== 1 ? 's' : ''}. 
              Contacta al administrador para renovarla.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (isExpiringSoon) {
    return (
      <div className="rounded-2xl border border-warning/30 px-5 py-4 bg-warning/10">
        <div className="flex items-start gap-3">
          <span className="text-2xl">⏰</span>
          <div>
            <p className="font-semibold text-warning">Membresía por vencer</p>
            <p className="text-sm text-textsec mt-1">
              Tu membresía vence en {daysUntilExpiry!} día{daysUntilExpiry! !== 1 ? 's' : ''}. 
              Considera renovarla pronto.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return null // No mostrar nada si no hay alerta
}
