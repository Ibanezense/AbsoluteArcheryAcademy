type RpcResponse<T> = {
  data: T | null
  error: { message?: string } | null
}

type RpcClient = {
  rpc: (...args: any[]) => Promise<RpcResponse<unknown>>
}

function throwIfRpcError(error: { message?: string } | null, fallbackMessage: string): never | void {
  if (!error) return
  throw new Error(error.message || fallbackMessage)
}

export async function adminBookSession(
  client: RpcClient,
  input: {
    sessionId: string
    studentId: string
    adminNotes?: string
    forceBooking?: boolean
  }
) {
  const { data, error } = await client.rpc('admin_book_session', {
    p_session_id: input.sessionId,
    p_student_id: input.studentId,
    p_admin_notes: input.adminNotes || null,
    p_force: input.forceBooking || false,
  })

  throwIfRpcError(error, 'No se pudo reservar la sesion.')
  return data
}

export async function adminCancelBooking(client: RpcClient, bookingId: string) {
  const { data, error } = await client.rpc('admin_cancel_booking', {
    p_booking_id: bookingId,
  })

  throwIfRpcError(error, 'No se pudo cancelar la reserva.')
  return data
}

export async function adminCancelSession(
  client: RpcClient,
  input: {
    sessionId: string
    refund: boolean
  }
) {
  const { data, error } = await client.rpc('admin_cancel_session', {
    p_session: input.sessionId,
    p_refund: input.refund,
  })

  throwIfRpcError(error, 'No se pudo cancelar el turno.')
  return data
}
