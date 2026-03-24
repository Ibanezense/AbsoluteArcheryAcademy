import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockCreateClient = vi.fn()

vi.mock('@supabase/supabase-js', () => ({
  createClient: mockCreateClient,
}))

describe('POST /api/admin/create-student', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()

    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
  })

  it('persists the CCT affiliation flag on the student insert payload', async () => {
    const studentInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'student-1' },
          error: null,
        }),
      }),
    })

    const profilesSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      }),
    })

    const profilesUpsert = vi.fn().mockResolvedValue({ error: null })

    const actorClient = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'admin-1' } },
          error: null,
        }),
      },
      from: vi.fn((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: 'admin-1', role: 'admin', is_active: true },
                  error: null,
                }),
              }),
            }),
          }
        }

        return {
          insert: studentInsert,
        }
      }),
    }

    const adminClient = {
      auth: {
        admin: {
          createUser: vi.fn().mockResolvedValue({
            data: {
              user: { id: 'student-auth-1' },
            },
            error: null,
          }),
          deleteUser: vi.fn().mockResolvedValue({ error: null }),
          listUsers: vi.fn(),
        },
      },
      from: vi.fn((table: string) => {
        if (table === 'profiles') {
          return {
            select: profilesSelect,
            upsert: profilesUpsert,
          }
        }

        if (table === 'students') {
          return {
            insert: studentInsert,
          }
        }

        return {}
      }),
    }

    mockCreateClient.mockImplementation((url: string, key: string) => {
      if (key === 'service-key') return adminClient
      return actorClient
    })

    const { POST } = await import('./route')

    const response = await POST(
      new Request('http://localhost/api/admin/create-student', {
        method: 'POST',
        headers: {
          authorization: 'Bearer admin-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          accountMode: 'student_only',
          student: {
            full_name: 'Alumno CCT',
            email: 'cct@example.com',
            is_active: true,
            is_country_club_tiabaya_member: true,
          },
        }),
      })
    )

    expect(response.status).toBe(200)
    expect(studentInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        is_country_club_tiabaya_member: true,
      })
    )
  })
})
