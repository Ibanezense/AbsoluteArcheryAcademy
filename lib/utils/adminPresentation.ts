export function formatAdminMoney(amount: number | null | undefined, currency = 'PEN') {
  if (amount == null || !Number.isFinite(amount)) return 'Dato no disponible'
  try {
    return new Intl.NumberFormat('es-PE', { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

export function paymentMethodLabel(value: string | null | undefined) {
  const labels: Record<string, string> = {
    cash: 'Efectivo', efectivo: 'Efectivo', manual: 'Registro manual', admin_manual: 'Registro manual',
    transfer: 'Transferencia', transferencia: 'Transferencia', card: 'Tarjeta',
    tarjeta: 'Tarjeta', yape: 'Yape', plin: 'Plin', not_applicable: 'No aplica',
  }
  return value ? labels[value.toLowerCase()] || value : 'Sin medio registrado'
}

export function equipmentLabel(value: string | null | undefined) {
  const labels: Record<string, string> = { own: 'Arco propio', assigned: 'Arco asignado', shared_inventory: 'Arco de academia' }
  return value ? labels[value] || value : 'Sin equipo registrado'
}

export function formatAdminDate(value: string | null | undefined) {
  if (!value) return 'Sin fecha'
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00-05:00` : value)
  return Number.isNaN(date.getTime()) ? 'Sin fecha' : new Intl.DateTimeFormat('es-PE', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Lima',
  }).format(date)
}
