export function attendanceActions(status: 'reserved' | 'attended' | 'no_show' | 'cancelled') {
  return {
    canMark: status === 'reserved',
    canEdit: status === 'reserved',
    cancellationLabel: status === 'cancelled' ? null : status === 'reserved' ? 'Cancelar por academia' : 'Corregir y cancelar',
  }
}
