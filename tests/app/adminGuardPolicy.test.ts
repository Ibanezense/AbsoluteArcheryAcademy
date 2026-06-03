import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getAdminAccessDecision, getRoleRedirect } from '@/lib/security/adminAccess'

const adminDir = join(process.cwd(), 'app', 'admin')

function source(relativePath: string) {
  const filePath = join(process.cwd(), relativePath)
  expect(existsSync(filePath)).toBe(true)
  return readFileSync(filePath, 'utf8')
}

describe('admin guard policy', () => {
  it('allows admins and blocks student or guardian accounts with role-specific redirects', () => {
    expect(getAdminAccessDecision({ authenticated: true, role: 'admin' })).toEqual({
      allowed: true,
      redirectTo: null,
    })
    expect(getAdminAccessDecision({ authenticated: true, role: 'student' })).toEqual({
      allowed: false,
      redirectTo: '/',
    })
    expect(getAdminAccessDecision({ authenticated: true, role: 'guardian' })).toEqual({
      allowed: false,
      redirectTo: '/hub',
    })
    expect(getAdminAccessDecision({ authenticated: false, role: null })).toEqual({
      allowed: false,
      redirectTo: '/login',
    })
  })

  it('uses the same role redirects as the access-code login flow', () => {
    expect(getRoleRedirect('admin')).toBe('/admin')
    expect(getRoleRedirect('guardian')).toBe('/hub')
    expect(getRoleRedirect('student')).toBe('/')
    expect(getRoleRedirect(null)).toBe('/')
  })

  it('protects the complete /admin tree from the shared admin layout before rendering navigation or children', () => {
    const layout = source('app/admin/layout.tsx')

    expect(layout).toContain("import AdminGuard from '@/components/AdminGuard'")
    expect(layout.indexOf('<AdminGuard>')).toBeLessThan(layout.indexOf('<AdminSidebar'))
    expect(layout.indexOf('<AdminGuard>')).toBeLessThan(layout.indexOf('{children}'))
    expect(layout).toContain('</AdminGuard>')
  })

  it('does not keep page-level AdminGuard duplication under /admin once the layout guard owns the tree', () => {
    const guardedPageUsages = [
      'app/admin/page.tsx',
      'app/admin/asistencia/page.tsx',
      'app/admin/alumnos/page.tsx',
      'app/admin/alumnos/[id]/page.tsx',
      'app/admin/alumnos/editar/[id]/page.tsx',
      'app/admin/membresias/page.tsx',
      'app/admin/sesiones/page.tsx',
      'app/admin/sesiones/editar/[id]/page.tsx',
      'app/admin/ajustes/layout.tsx',
    ]

    for (const relativePath of guardedPageUsages) {
      const fileSource = source(relativePath)
      expect(fileSource).not.toContain("import AdminGuard from '@/components/AdminGuard'")
      expect(fileSource).not.toContain('<AdminGuard>')
      expect(fileSource).not.toContain('</AdminGuard>')
    }

    expect(existsSync(adminDir)).toBe(true)
  })
})
