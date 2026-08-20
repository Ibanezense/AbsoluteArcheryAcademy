import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('student offline access', () => {
  it('uses the cached session before remote validation and preserves it on network failures', () => {
    const authGuard = source('components/AuthGuard.tsx')

    expect(authGuard).toContain('supabase.auth.getSession()')
    expect(authGuard).toContain('isLikelyNetworkError')
    expect(authGuard).toMatch(/setIsAuthenticated\(true\)[\s\S]*supabase\.auth\.getUser\(\)/)
    expect(authGuard).toContain("event === 'SIGNED_OUT'")
    expect(authGuard).not.toContain("event === 'SIGNED_OUT' || !session")
  })

  it('shows a specific connectivity state and listens for reconnection', () => {
    const errorPage = source('app/error.tsx')

    expect(errorPage).toContain("window.addEventListener('online'")
    expect(errorPage).toContain("window.addEventListener('offline'")
    expect(errorPage).toContain('Sin conexión a Internet')
    expect(errorPage).toContain('Tus datos no se han perdido')
    expect(errorPage).not.toContain('revisa el log del servidor')
  })
})
