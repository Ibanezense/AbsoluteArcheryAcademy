interface StatusBadgeProps {
  status: string
  label?: string
}

export function StatusBadge({ status, label: overrideLabel }: StatusBadgeProps) {
  const styles: Record<string, string> = {
    active: 'border border-success/20 bg-success/10 text-success',
    available: 'border border-success/20 bg-success/10 text-success',
    attended: 'border border-success/20 bg-success/10 text-success',
    confirmed: 'border border-blue-200 bg-blue-50 text-blue-700',
    reserved: 'border border-orange-200 bg-orange-50 text-accent',
    pending: 'border border-orange-200 bg-orange-50 text-accent',
    cancelled: 'border border-slate-200 bg-slate-100 text-slate-600',
    no_show: 'border border-danger/20 bg-danger/10 text-danger',
    expired: 'border border-danger/20 bg-danger/10 text-danger',
    expiring: 'border border-warning/20 bg-warning/10 text-warning',
  }

  const labels: Record<string, string> = {
    active: 'Activa',
    available: 'Disponible',
    attended: 'Asistió',
    confirmed: 'Confirmada',
    reserved: 'Pendiente',
    pending: 'Pendiente',
    no_show: 'No asistió',
    cancelled: 'Cancelada',
    expired: 'Vencida',
    expiring: 'Próxima a vencer',
  }

  const style = styles[status] || styles.reserved
  const label = overrideLabel || labels[status] || 'Pendiente'

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${style}`}>
      {(status === 'active' || status === 'available') && <span className="h-2 w-2 rounded-full bg-current" />}
      {label}
    </span>
  )
}
