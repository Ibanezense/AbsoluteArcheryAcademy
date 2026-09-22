type RpcError = {
  message?: string
}

export type AttendanceReversalRpcClient = {
  rpc: (...args: any[]) => PromiseLike<{ data: unknown; error: RpcError | null }>
}

export type AttendanceReversalSource = 'booking' | 'weekly'

export type AttendanceReversalResult = {
  success: boolean
  already_reversed: boolean
  reversal_id: string
  membership_id: string
  classes_remaining: number
  error?: string
}

export async function reverseStudentNoShow(
  client: AttendanceReversalRpcClient,
  input: {
    source: AttendanceReversalSource
    eventId: string
    reason: string
    requestId: string
  },
): Promise<AttendanceReversalResult> {
  const { data, error } = await client.rpc('admin_reverse_no_show', {
    p_source: input.source,
    p_event_id: input.eventId,
    p_reason: input.reason.trim(),
    p_request_id: input.requestId,
  })

  if (error) {
    throw new Error(error.message || 'No se pudo revertir la inasistencia.')
  }

  const result = data as AttendanceReversalResult | null
  if (!result?.success) {
    throw new Error(result?.error || 'No se pudo revertir la inasistencia.')
  }

  return result
}
