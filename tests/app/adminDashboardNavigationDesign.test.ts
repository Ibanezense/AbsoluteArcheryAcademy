import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function source(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('admin dashboard navigation design', () => {
  it('keeps the mobile admin bottom nav limited to the four primary actions', () => {
    const bottomNav = source('components/AdminBottomNav.tsx')
    const itemHrefCount = (bottomNav.match(/href: '\/admin/g) || []).length

    expect(itemHrefCount).toBe(4)
    expect(bottomNav).toContain("href: '/admin'")
    expect(bottomNav).toContain("href: '/admin/alumnos'")
    expect(bottomNav).toContain("href: '/admin/asistencia'")
    expect(bottomNav).toContain("href: '/admin/membresias'")

    expect(bottomNav).not.toContain("href: '/admin/sesiones'")
    expect(bottomNav).not.toContain("href: '/admin/intro'")
    expect(bottomNav).not.toContain("href: '/admin/finanzas'")
    expect(bottomNav).not.toContain("href: '/admin/ajustes'")
  })

  it('keeps secondary admin routes available from the hamburger/sidebar menu', () => {
    const sidebar = source('components/AdminSidebar.tsx')

    for (const href of ['/admin/sesiones', '/admin/intro', '/admin/finanzas', '/admin/ajustes']) {
      expect(sidebar).toContain(`href="${href}"`)
    }
  })
})
