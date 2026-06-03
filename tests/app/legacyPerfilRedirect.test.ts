import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function perfilSource() {
  const filePath = join(process.cwd(), 'app', 'perfil', 'page.tsx')
  expect(existsSync(filePath)).toBe(true)
  return readFileSync(filePath, 'utf8')
}

describe('/perfil legacy surface', () => {
  it('redirects to the V2 role surface instead of rendering legacy profile membership fields', () => {
    const source = perfilSource()

    expect(source).toContain('router.replace(getRoleRedirect')
    expect(source).toContain("getRoleRedirect(profile?.role")
    expect(source).not.toContain("select('*')")
    expect(source).not.toContain('membership_type')
    expect(source).not.toContain('classes_remaining')
    expect(source).not.toContain('distance_m')
    expect(source).not.toContain('useMembershipExpiry')
  })
})
