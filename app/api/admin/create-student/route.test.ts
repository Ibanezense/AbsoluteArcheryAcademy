import { beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeBooleanValue } from './route-helpers'

const mockCreateClient = vi.hoisted(() => vi.fn())

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
    const actorStudentInsert = vi.fn()
    const adminStudentInsert = vi.fn().mockReturnValue({
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
          insert: actorStudentInsert,
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
            insert: adminStudentInsert,
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
    expect(adminStudentInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        is_country_club_tiabaya_member: true,
      })
    )
    expect(actorStudentInsert).not.toHaveBeenCalled()
  })

  it('reuses an auth user found on a later listUsers page when createUser reports the email already exists', async () => {
    const adminStudentInsert = vi.fn().mockReturnValue({
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
    const listUsers = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          users: [{ id: 'other-user', email: 'other@example.com' }],
          nextPage: 2,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          users: [{ id: 'existing-student-auth', email: 'cct@example.com' }],
          nextPage: null,
        },
        error: null,
      })

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

        return {}
      }),
    }

    const adminClient = {
      auth: {
        admin: {
          createUser: vi.fn().mockResolvedValue({
            data: { user: null },
            error: { message: 'User has already been registered' },
          }),
          deleteUser: vi.fn().mockResolvedValue({ error: null }),
          listUsers,
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
            insert: adminStudentInsert,
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
            full_name: 'Alumno Reutilizado',
            email: 'cct@example.com',
            is_active: true,
          },
        }),
      })
    )

    expect(response.status).toBe(200)
    expect(listUsers).toHaveBeenNthCalledWith(1, { page: 1, perPage: 1000 })
    expect(listUsers).toHaveBeenNthCalledWith(2, { page: 2, perPage: 1000 })
    expect(adminStudentInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        self_profile_id: 'existing-student-auth',
      })
    )
  })

  it('does not delete a reused auth user if the student insert fails after reusing it', async () => {
    const deleteUser = vi.fn().mockResolvedValue({ error: null })
    const adminStudentInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'insert failed' },
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
    const listUsers = vi.fn().mockResolvedValue({
      data: {
        users: [{ id: 'existing-student-auth', email: 'cct@example.com' }],
        nextPage: null,
      },
      error: null,
    })

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

        return {}
      }),
    }

    const adminClient = {
      auth: {
        admin: {
          createUser: vi.fn().mockResolvedValue({
            data: { user: null },
            error: { message: 'User has already been registered' },
          }),
          deleteUser,
          listUsers,
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
            insert: adminStudentInsert,
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
            full_name: 'Alumno Reutilizado',
            email: 'cct@example.com',
            is_active: true,
          },
        }),
      })
    )

    expect(response.status).toBe(500)
    expect(deleteUser).not.toHaveBeenCalled()
  })
})

describe('PUT /api/admin/create-student', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()

    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
  })

  it('preserves the existing CCT affiliation flag when the PUT payload omits it', async () => {
    const studentSelectMaybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'student-1',
        self_profile_id: 'profile-1',
        is_country_club_tiabaya_member: true,
        guardians: [],
      },
      error: null,
    })

    const studentSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: studentSelectMaybeSingle,
      }),
    })

    const studentUpdateEq = vi.fn().mockResolvedValue({ error: null })
    const studentUpdate = vi.fn().mockReturnValue({
      eq: studentUpdateEq,
    })

    const profilesSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: { access_code: 'access-1' },
          error: null,
        }),
      }),
    })

    const profilesUpdateEq = vi.fn().mockResolvedValue({ error: null })
    const profilesUpdate = vi.fn().mockReturnValue({
      eq: profilesUpdateEq,
    })

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

        return {}
      }),
    }

    const adminClient = {
      auth: {
        admin: {
          createUser: vi.fn(),
          deleteUser: vi.fn(),
          listUsers: vi.fn(),
        },
      },
      from: vi.fn((table: string) => {
        if (table === 'profiles') {
          return {
            select: profilesSelect,
            upsert: vi.fn(),
            update: profilesUpdate,
          }
        }

        if (table === 'students') {
          return {
            select: studentSelect,
            update: studentUpdate,
          }
        }

        return {}
      }),
    }

    mockCreateClient.mockImplementation((url: string, key: string) => {
      if (key === 'service-key') return adminClient
      return actorClient
    })

    const { PUT } = await import('./route')

    const response = await PUT(
      new Request('http://localhost/api/admin/create-student', {
        method: 'PUT',
        headers: {
          authorization: 'Bearer admin-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          studentId: 'student-1',
          accountMode: 'student_only',
          student: {
            full_name: 'Alumno CCT',
            email: 'cct@example.com',
            is_active: true,
          },
        }),
      })
    )

    expect(response.status).toBe(200)
    expect(studentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        is_country_club_tiabaya_member: true,
      })
    )
    expect(studentSelectMaybeSingle).toHaveBeenCalled()
  })
})

describe('normalizeBooleanValue', () => {
  it('only accepts actual booleans and preserves the fallback for undefined input', () => {
    expect(normalizeBooleanValue(true, false)).toBe(true)
    expect(normalizeBooleanValue(false, true)).toBe(false)
    expect(normalizeBooleanValue(undefined, false)).toBe(false)
    expect(normalizeBooleanValue(undefined, true)).toBe(true)
  })
})
