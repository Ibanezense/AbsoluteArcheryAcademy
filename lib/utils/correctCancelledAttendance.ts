export function canCorrectCancelledAttendance(
  booking: { status: string; source?: string; start_at: string | null },
  now = new Date(),
) {
  if (booking.status !== 'cancelled' || booking.source === 'weekly' || booking.source === 'expiry' || !booking.start_at) return false
  const start = new Date(booking.start_at).getTime()
  return Number.isFinite(start) && start < now.getTime()
}
