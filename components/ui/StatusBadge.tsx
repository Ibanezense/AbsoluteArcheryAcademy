interface StatusBadgeProps {
  status: string
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const styles: Record<string, string> = {
    attended: 'bg-success/20 text-success',
    no_show: 'bg-danger/20 text-danger',
    cancelled: 'bg-textsec/20 text-textsec',
    reserved: 'bg-warning/20 text-warning',
  }

  const labels: Record<string, string> = {
    attended: 'Asistió',
    no_show: 'No asistió',
    cancelled: 'Cancelada',
    reserved: 'Reservada',
  }

  const style = styles[status] || styles.reserved
  const label = labels[status] || 'Reservada'

  return (
    <span className={`px-3 py-1 rounded-full text-xs font-medium ${style}`}>
      {label}
    </span>
  )
}
