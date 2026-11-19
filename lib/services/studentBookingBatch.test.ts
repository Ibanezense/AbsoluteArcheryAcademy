import { describe, expect, it, vi } from 'vitest'
import { bookStudentSessions } from './studentBookingService'
import { supabase } from '@/lib/supabaseClient'

vi.mock('@/lib/supabaseClient', () => ({ supabase: { rpc: vi.fn() } }))

describe('student booking selection', () => {
  it('confirms in order, records individual rejections and skips duplicate selections', async () => {
    vi.mocked(supabase.rpc)
      .mockResolvedValueOnce({ error: null } as never)
      .mockResolvedValueOnce({ error: { message: 'Ya alcanzaste el límite semanal.' }, status: 400 } as never)
      .mockResolvedValueOnce({ error: null } as never)

    await expect(bookStudentSessions('student', ['a', 'b', 'a', 'c'])).resolves.toEqual([
      { sessionId: 'a', status: 'confirmed' },
      { sessionId: 'b', status: 'rejected', message: 'Ya alcanzaste el límite semanal.' },
      { sessionId: 'c', status: 'confirmed' },
    ])
    expect(vi.mocked(supabase.rpc).mock.calls).toEqual(['a', 'b', 'c'].map(id =>
      ['book_session_multisite', { p_session: id, p_student_id: 'student' }],
    ))
  })

  it('stops if the result is uncertain and leaves later turns unattempted', async () => {
    vi.mocked(supabase.rpc).mockClear().mockRejectedValueOnce(new Error('Failed to fetch'))

    await expect(bookStudentSessions('student', ['a', 'b'])).resolves.toEqual([
      { sessionId: 'a', status: 'uncertain' },
      { sessionId: 'b', status: 'skipped' },
    ])
    expect(supabase.rpc).toHaveBeenCalledTimes(1)
  })
})
