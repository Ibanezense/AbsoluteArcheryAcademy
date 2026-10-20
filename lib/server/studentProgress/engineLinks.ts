import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  EngineLinkOperation,
  EngineLinksContext,
} from '@/lib/contracts/studentCompetitions'
import type { ProgressLink } from '@/lib/contracts/studentProgress'
import { ProgressError, rpcError } from './auth'
import {
  engineCommand,
  engineStatus,
  EngineSourceError,
  type EngineIdentityStatus,
} from './engineClient'
import { finalizeEngineOperation } from './engineFinalizer'
import { clearCompetitionsCache, type EngineContext } from './competitions'
export type EngineOperationResult = {
  link: ProgressLink
  operation: EngineLinkOperation
}
export type EngineOperationClaim = EngineOperationResult & {
  lease: null | { token: string; actor_id: string }
  evidence: string
}
type Command = Parameters<typeof engineCommand>[0]
export type EngineOperationDependencies = {
  claim: () => Promise<EngineOperationClaim>
  verify: () => Promise<void>
  guard: () => Promise<void>
  status: () => Promise<EngineIdentityStatus>
  command: (body: Command) => Promise<unknown>
  finalize: (
    input: Parameters<typeof finalizeEngineOperation>[0]
  ) => Promise<EngineOperationResult>
  fail: (
    code: NonNullable<EngineLinkOperation['last_error_code']>
  ) => Promise<void>
}
function applied(proof: EngineIdentityStatus, operation: EngineLinkOperation) {
  return (
    proof.namespace === 'academy_reservas_student' &&
    proof.external_id === operation.student_id &&
    proof.competitor_id === operation.external_id &&
    proof.generation === operation.generation &&
    proof.request?.request_id === operation.id &&
    proof.request.action === operation.action &&
    proof.request.generation === operation.generation &&
    proof.request.status === 'applied' &&
    (operation.action === 'confirm'
      ? proof.link_status === 'confirmed'
      : ['revoked', 'absent'].includes(proof.link_status))
  )
}
export async function executeEngineOperation(
  studentId: string,
  operationId: string,
  deps: EngineOperationDependencies
): Promise<EngineOperationResult> {
  const claim = await deps.claim(),
    operation = claim.operation
  if (
    operation.student_id !== studentId ||
    operation.id !== operationId ||
    claim.link.student_id !== studentId
  )
    throw new ProgressError(403, 'forbidden')
  await deps.guard()
  if (!claim.lease) return { link: claim.link, operation }
  const stage = async () => {
    await deps.guard()
    await deps.verify()
  }
  async function pending(error: unknown): Promise<EngineOperationResult> {
    await stage()
    const code =
      error instanceof EngineSourceError ? error.code : 'remote_unavailable'
    await deps.fail(code)
    if (code === 'identity_conflict')
      throw new ProgressError(409, 'link_conflict')
    return {
      link: claim.link,
      operation: { ...operation, last_error_code: code },
    }
  }
  async function finish(proof: EngineIdentityStatus) {
    await stage()
    try {
      const result = await deps.finalize({
        operationId: operation.id,
        leaseToken: claim.lease!.token,
        actorId: claim.lease!.actor_id,
        proof,
      })
      clearCompetitionsCache()
      return result
    } catch (error) {
      if (error instanceof ProgressError && [403, 409].includes(error.status))
        throw error
      return pending(error)
    }
  }
  await stage()
  let proof: EngineIdentityStatus
  try {
    proof = await deps.status()
  } catch (error) {
    return pending(error)
  }
  await stage()
  if (applied(proof, operation)) return finish(proof)
  if (proof.generation !== null && proof.generation >= operation.generation)
    return pending(new EngineSourceError(409, 'identity_conflict'))
  let commandError: unknown = null
  try {
    await deps.command({
      operation: operation.action,
      request_id: operation.id,
      competitor_id: operation.external_id,
      external_id: studentId,
      actor_id: claim.lease.actor_id,
      evidence: claim.evidence,
      generation: operation.generation,
    })
  } catch (error) {
    commandError = error
  }
  // A failed/lost POST response may already have committed remotely. Ask status before any resend.
  await stage()
  try {
    proof = await deps.status()
  } catch (error) {
    return pending(commandError || error)
  }
  await stage()
  if (applied(proof, operation)) return finish(proof)
  return pending(
    commandError ||
      new EngineSourceError(
        proof.generation !== null && proof.generation >= operation.generation
          ? 409
          : 502,
        proof.generation !== null && proof.generation >= operation.generation
          ? 'identity_conflict'
          : 'invalid_source'
      )
  )
}
export async function readEngineContext(
  client: SupabaseClient,
  studentId: string
): Promise<EngineContext> {
  const { data, error } = await client.rpc('engine_progress_context', {
    p_student_id: studentId,
  })
  if (error)
    throw error.code === 'P0001'
      ? new ProgressError(403, 'forbidden')
      : rpcError(error.code)
  if (!data || data.student_id !== studentId || !Array.isArray(data.links))
    throw new ProgressError(403, 'forbidden')
  return data
}
export async function readAdminEngineContext(
  client: SupabaseClient,
  studentId: string
): Promise<EngineLinksContext> {
  const { data, error } = await client.rpc('admin_engine_progress_context', {
    p_student_id: studentId,
  })
  if (error)
    throw error.code === 'P0001'
      ? new ProgressError(403, 'forbidden')
      : rpcError(error.code)
  if (
    !data ||
    data.student_id !== studentId ||
    !Array.isArray(data.links) ||
    !Array.isArray(data.operations)
  )
    throw new ProgressError(403, 'forbidden')
  return data
}
export async function runEngineOperation(
  client: SupabaseClient,
  studentId: string,
  operationId: string,
  guard: () => Promise<void>
) {
  let claim: EngineOperationClaim
  async function rpc<T>(
    name: string,
    args: Record<string, unknown>
  ): Promise<T> {
    const { data, error } = await client.rpc(name, args)
    if (error)
      throw error.code === 'P0001'
        ? new ProgressError(403, 'forbidden')
        : rpcError(error.code)
    return data
  }
  return executeEngineOperation(studentId, operationId, {
    claim: async () => {
      claim = await rpc<EngineOperationClaim>('admin_claim_engine_operation', {
        p_student_id: studentId,
        p_operation_id: operationId,
      })
      return claim
    },
    guard,
    verify: async () => {
      await rpc('admin_verify_engine_operation', {
        p_student_id: studentId,
        p_operation_id: operationId,
        p_lease_token: claim.lease!.token,
      })
    },
    status: () =>
      engineStatus(studentId, claim.operation.external_id, operationId),
    command: engineCommand,
    finalize: finalizeEngineOperation,
    fail: async (code) => {
      await rpc('admin_fail_engine_operation', {
        p_student_id: studentId,
        p_operation_id: operationId,
        p_lease_token: claim.lease!.token,
        p_error: code,
      })
    },
  })
}
