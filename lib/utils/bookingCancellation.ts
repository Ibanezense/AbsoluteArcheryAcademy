type BookingCancellationState = {
  status: string
  end_at: string
}

export function canStudentCancelBooking(
  booking: BookingCancellationState,
  now: Date = new Date(),
) {
  if (booking.status !== 'reserved') return false
  return new Date(booking.end_at).getTime() > now.getTime()
}
