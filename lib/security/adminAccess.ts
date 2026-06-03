import type { Profile } from '@/lib/types'

type AccountRole = Profile['role'] | null | undefined

export type AdminAccessDecision = {
  allowed: boolean
  redirectTo: string | null
}

export function getRoleRedirect(role?: AccountRole) {
  if (role === 'admin') return '/admin'
  if (role === 'guardian') return '/hub'
  return '/'
}

export function getAdminAccessDecision({
  authenticated,
  role,
}: {
  authenticated: boolean
  role?: AccountRole
}): AdminAccessDecision {
  if (!authenticated) {
    return { allowed: false, redirectTo: '/login' }
  }

  if (role === 'admin') {
    return { allowed: true, redirectTo: null }
  }

  return { allowed: false, redirectTo: getRoleRedirect(role) }
}
