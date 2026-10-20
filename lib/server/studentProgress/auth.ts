import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { ProgressContext } from './training'
export class ProgressError extends Error {
  constructor(
    public status: number,
    public code: string
  ) {
    super(code)
  }
}
export const privateHeaders = { 'Cache-Control': 'private, no-store', Vary: 'Authorization' }
export function failure(error: unknown) {
  const e = error instanceof ProgressError ? error : new ProgressError(503, 'unavailable')
  return Response.json({ error: e.code }, { status: e.status, headers: privateHeaders })
}
export function success(value: unknown) {
  return Response.json(value, { headers: privateHeaders })
}
export async function authorize(request: Request, admin = false): Promise<SupabaseClient> {
  const authorization = request.headers.get('authorization') || ''
  if (!/^Bearer \S+$/.test(authorization)) throw new ProgressError(401, 'invalid_session')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  if (!url || !key) throw new ProgressError(503, 'unavailable')
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  })
  const { data, error } = await client.auth.getUser(authorization.slice(7))
  if (error || !data.user) throw new ProgressError(401, 'invalid_session')
  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('id,role,is_active')
    .eq('id', data.user.id)
    .maybeSingle()
  if (
    profileError ||
    !profile ||
    profile.is_active === false ||
    (admin && profile.role !== 'admin')
  )
    throw new ProgressError(403, 'forbidden')
  return client
}
export async function readContext(
  client: SupabaseClient,
  studentId: string
): Promise<ProgressContext> {
  const { data, error } = await client.rpc('student_progress_context', { p_student_id: studentId })
  if (error)
    throw new ProgressError(
      error.code === '42501' || error.code === 'P0001' ? 403 : 503,
      error.code === '42501' || error.code === 'P0001' ? 'forbidden' : 'unavailable'
    )
  if (!data || data.student_id !== studentId) throw new ProgressError(403, 'forbidden')
  return data as ProgressContext
}
export function rpcError(code: string) {
  return new ProgressError(
    ['40001', '23505'].includes(code) ? 409 : code === '42501' ? 403 : code === '22023' ? 400 : 503,
    ['40001', '23505'].includes(code)
      ? 'link_conflict'
      : code === '42501'
        ? 'forbidden'
        : code === '22023'
          ? 'invalid_request'
          : 'unavailable'
  )
}
export async function readAdminBody(request: Request): Promise<Record<string, unknown>> {
  const invalid = () => new ProgressError(400, 'invalid_request')
  if (Number(request.headers.get('content-length')) > 8192 || !request.body) throw invalid()
  const reader = request.body.getReader()
  let size = 0
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let text = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 8192) throw invalid()
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
  } catch {
    throw invalid()
  } finally {
    await reader.cancel()
  }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw invalid()
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid()
  return value as Record<string, unknown>
}
