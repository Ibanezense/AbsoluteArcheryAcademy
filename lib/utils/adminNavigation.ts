export function attendanceHref(date: string, sessionId?: string | null) {
  const params = new URLSearchParams({ date })
  if (sessionId) params.set('sessionId', sessionId)
  return `/admin/asistencia?${params.toString()}`
}

export function administrativeBookingHref(studentId?: string | null) {
  return studentId ? `/admin/alumnos/${encodeURIComponent(studentId)}?tab=bookings` : '/admin/sesiones'
}
