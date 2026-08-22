export interface MembershipExpiryExtension {
  student_id: string
  student_name: string
  membership_id: string
  membership_name: string
  current_end_date: string
  new_end_date: string
}

export interface MembershipExpiryExtensionPreview {
  affected_count: number
  extensions: MembershipExpiryExtension[]
  already_applied?: boolean
  batch_id?: string
}

export type MembershipExpiryExtensionResult = MembershipExpiryExtensionPreview

export interface ApplyBulkMembershipExpiryExtensionInput {
  reason: string
  idempotencyKey: string
}

export interface ApplyBulkMembershipExpiryExtensionRpcPayload {
  p_reason: string
  p_idempotency_key: string
}

type RpcError = {
  message?: string
}

type RpcResponse = {
  data: unknown
  error: RpcError | null
}

export interface MembershipExpiryExtensionRpcClient {
  rpc(
    functionName: 'admin_preview_bulk_membership_expiry_extension',
  ): PromiseLike<RpcResponse>
  rpc(
    functionName: 'admin_apply_bulk_membership_expiry_extension',
    payload: ApplyBulkMembershipExpiryExtensionRpcPayload,
  ): PromiseLike<RpcResponse>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isMembershipExpiryExtension(
  value: unknown,
): value is MembershipExpiryExtension {
  if (!isRecord(value)) return false

  return [
    'student_id',
    'student_name',
    'membership_id',
    'membership_name',
    'current_end_date',
    'new_end_date',
  ].every((field) => typeof value[field] === 'string')
}

function normalizeResult(data: unknown): MembershipExpiryExtensionPreview {
  if (
    !isRecord(data) ||
    !Number.isInteger(data.affected_count) ||
    (data.affected_count as number) < 0 ||
    !Array.isArray(data.extensions) ||
    data.affected_count !== data.extensions.length ||
    !data.extensions.every(isMembershipExpiryExtension)
  ) {
    return { affected_count: 0, extensions: [] }
  }

  const result: MembershipExpiryExtensionPreview = {
    affected_count: data.affected_count as number,
    extensions: data.extensions,
  }

  if (typeof data.already_applied === 'boolean') {
    result.already_applied = data.already_applied
  }

  if (typeof data.batch_id === 'string') {
    result.batch_id = data.batch_id
  }

  return result
}

function rpcErrorMessage(error: RpcError, fallback: string): string {
  const detail = error.message?.trim()
  return detail ? `${fallback}: ${detail}` : `${fallback}.`
}

export async function previewBulkMembershipExpiryExtension(
  client: MembershipExpiryExtensionRpcClient,
): Promise<MembershipExpiryExtensionPreview> {
  const { data, error } = await client.rpc(
    'admin_preview_bulk_membership_expiry_extension',
  )

  if (error) {
    throw new Error(
      rpcErrorMessage(error, 'No se pudo cargar la vista previa de vencimientos'),
    )
  }

  return normalizeResult(data)
}

export async function applyBulkMembershipExpiryExtension(
  client: MembershipExpiryExtensionRpcClient,
  input: ApplyBulkMembershipExpiryExtensionInput,
): Promise<MembershipExpiryExtensionResult> {
  const reason = input.reason.trim()
  if (!reason) {
    throw new Error('El motivo es obligatorio.')
  }

  const { data, error } = await client.rpc(
    'admin_apply_bulk_membership_expiry_extension',
    {
      p_reason: reason,
      p_idempotency_key: input.idempotencyKey,
    },
  )

  if (error) {
    throw new Error(
      rpcErrorMessage(error, 'No se pudieron retrasar los vencimientos'),
    )
  }

  return normalizeResult(data)
}
