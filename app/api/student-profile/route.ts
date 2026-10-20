import {
  authorize,
  failure,
  privateHeaders,
  ProgressError,
  success,
} from '@/lib/server/studentProgress/auth'
import { uuidPattern } from '@/lib/server/studentProgress/source'
import { buildStudentCategory } from '@/lib/utils/studentCategory'
import type { StudentProfile } from '@/lib/contracts/studentProfile'

export const dynamic = 'force-dynamic'
const fields =
  'id,full_name,avatar_url,date_of_birth,email,phone,division,gender,level,current_distance_m,has_own_bow,bow_poundage'

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams
    const studentId = params.get('studentId') || ''
    if (
      Array.from(params.keys()).some((key) => key !== 'studentId') ||
      params.getAll('studentId').length !== 1 ||
      !uuidPattern.test(studentId)
    ) {
      throw new ProgressError(400, 'invalid_request')
    }
    const client = await authorize(request)
    async function checkAccess() {
      const { data, error } = await client.rpc(
        'resolve_accessible_student_id',
        {
          p_student_id: studentId,
        },
      )
      if (error) {
        const denied = ['P0001', '42501'].includes(error.code)
        throw new ProgressError(
          denied ? 403 : 503,
          denied ? 'forbidden' : 'unavailable',
        )
      }
      if (data !== studentId) throw new ProgressError(403, 'forbidden')
    }
    await checkAccess()
    const { data, error } = await client
      .from('students')
      .select(fields)
      .eq('id', studentId)
      .maybeSingle()
    if (error) throw new ProgressError(503, 'unavailable')
    if (!data || data.id !== studentId)
      throw new ProgressError(403, 'forbidden')
    await authorize(request)
    await checkAccess()
    const text = (value: unknown) => (typeof value === 'string' ? value : null)
    const number = (value: unknown) =>
      typeof value === 'number' && Number.isFinite(value) ? value : null
    // Construct a fresh object even when a client unexpectedly returns more than the selected columns.
    const profile: StudentProfile = {
      id: studentId,
      full_name: text(data.full_name),
      avatar_url: text(data.avatar_url),
      date_of_birth: text(data.date_of_birth),
      email: text(data.email),
      phone: text(data.phone),
      division: text(data.division),
      gender: text(data.gender),
      level: text(data.level),
      category: buildStudentCategory({
        dateOfBirth: text(data.date_of_birth),
        division: text(data.division),
        gender: text(data.gender),
      }),
      current_distance_m: number(data.current_distance_m),
      has_own_bow:
        typeof data.has_own_bow === 'boolean' ? data.has_own_bow : null,
      bow_poundage: number(data.bow_poundage),
    }
    return success({
      student_id: studentId,
      profile,
      checked_at: new Date().toISOString(),
    })
  } catch (error) {
    return failure(error)
  }
}

function unsupported() {
  return Response.json(
    { error: 'method_not_allowed' },
    { status: 405, headers: { ...privateHeaders, Allow: 'GET' } },
  )
}
export const POST = unsupported
export const PUT = unsupported
export const PATCH = unsupported
export const DELETE = unsupported
