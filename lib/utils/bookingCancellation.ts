type BookingCancellationState = {
  status: string
  start_at: string
}

export function canStudentCancelBooking(
  booking: BookingCancellationState,
  now: Date = new Date(),
) {
  if (booking.status !== 'reserved') return false
  return new Date(booking.start_at).getTime() >= now.getTime()
}
