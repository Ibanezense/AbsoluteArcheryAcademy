type RpcClient = {
  rpc: (...args: any[]) => PromiseLike<{ data: unknown; error: { message?: string } | null }>
}

export async function correctCancelledAttendance(client: RpcClient, bookingId: string) {
  const { data, error } = await client.rpc('admin_correct_cancelled_attendance', { p_booking_id: bookingId })
  if (error) throw new Error(error.message || 'No se pudo registrar la asistencia')
  const result = data as { success?: boolean; already_corrected?: boolean; booking_id?: string; error?: string } | null
  if (!result?.success) throw new Error(result?.error || 'No se pudo registrar la asistencia')
  return result
}
