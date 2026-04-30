'use client'

import Button from '@/components/ui/button'

interface MembershipAlertProps {
  isExpired: boolean
  isExpiringSoon: boolean
  daysUntilExpiry: number | null
  canRenew?: boolean
  onRenew?: () => void
}

export function MembershipAlert({
  isExpired,
  isExpiringSoon,
  daysUntilExpiry,
  canRenew = false,
  onRenew,
}: MembershipAlertProps) {
  if (isExpired) {
    const daysAgo = Math.abs(daysUntilExpiry ?? 0)
    return (
      <div className="rounded-2xl border border-danger/30 px-5 py-4 bg-danger/10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-danger/15 text-sm font-bold text-danger">
              !
            </span>
            <div>
              <p className="font-semibold text-danger">Membresia vencida</p>
              <p className="text-sm text-textsec mt-1">
                Tu membresia vencio hace {daysAgo} dia{daysAgo !== 1 ? 's' : ''}.
                {canRenew ? ' Renueva tu plan para habilitar nuevas clases.' : ' Contacta al administrador para renovarla.'}
              </p>
            </div>
          </div>

          {canRenew && onRenew && (
            <Button
              variant="destructive"
              onClick={onRenew}
              className="w-full shrink-0 sm:w-auto"
            >
              Renovar
            </Button>
          )}
        </div>
      </div>
    )
  }

  if (isExpiringSoon) {
    return (
      <div className="rounded-2xl border border-warning/30 px-5 py-4 bg-warning/10">
        <div className="flex items-start gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-warning/15 text-sm font-bold text-warning">
            !
          </span>
          <div>
            <p className="font-semibold text-warning">Membresia por vencer</p>
            <p className="text-sm text-textsec mt-1">
              Tu membresia vence en {daysUntilExpiry!} dia{daysUntilExpiry! !== 1 ? 's' : ''}.
              Considera renovarla pronto.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return null
}
