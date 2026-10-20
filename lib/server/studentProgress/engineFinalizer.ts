import { createClient } from '@supabase/supabase-js'
import { ProgressError, rpcError } from './auth'
import type { EngineIdentityStatus } from './engineClient'
import type { EngineLinkOperation } from '@/lib/contracts/studentCompetitions'
import type { ProgressLink } from '@/lib/contracts/studentProgress'
// Trusted mutation channel only. Never use this client for auth, context or reads.
export async function finalizeEngineOperation(input: {
  operationId: string
  leaseToken: string
  actorId: string
  proof: EngineIdentityStatus
}): Promise<{ link: ProgressLink; operation: EngineLinkOperation }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new ProgressError(503, 'unavailable')
  const mutator = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await mutator.rpc(
    'server_finalize_engine_operation',
    {
      p_operation_id: input.operationId,
      p_lease_token: input.leaseToken,
      p_actor_id: input.actorId,
      p_proof: input.proof,
    }
  )
  if (error) throw rpcError(error.code)
  return data
}
