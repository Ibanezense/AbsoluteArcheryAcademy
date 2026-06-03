import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(relativePath: string) {
  const filePath = join(process.cwd(), relativePath)
  expect(existsSync(filePath)).toBe(true)
  return readFileSync(filePath, 'utf8')
}

describe('admin sensitive write surfaces', () => {
  it('keeps booking, attendance, intro and session-allocation writes behind RPC or API boundaries', () => {
    const adminSources = [
      'app/admin/asistencia/page.tsx',
      'app/admin/intro/IntroClient.tsx',
      'app/admin/intro/components/RegisterIntroModal.tsx',
      'app/admin/sesiones/page.tsx',
      'app/admin/sesiones/editar/[id]/page.tsx',
      'app/admin/alumnos/editar/[id]/page.tsx',
      'lib/services/IntroClassesService.ts',
      'lib/services/adminSessionsService.ts',
    ]

    const combined = adminSources.map(source).join('\n')

    expect(combined).toContain("supabase.rpc('admin_mark_attendance'")
    expect(combined).toContain("supabase.rpc('admin_cancel_booking'")
    expect(combined).toContain("supabase.rpc('admin_register_intro_class'")
    expect(combined).toContain("admin_upsert_session_with_allocations")
    expect(combined).toContain("fetch('/api/admin/create-student'")
    expect(combined).not.toMatch(/from\('bookings'\)[\s\S]{0,300}\.(insert|update|delete|upsert)/)
    expect(combined).not.toMatch(/from\('intro_clients'\)[\s\S]{0,300}\.(insert|update|delete|upsert)/)
    expect(combined).not.toMatch(/from\('intro_payments'\)[\s\S]{0,300}\.(insert|update|delete|upsert)/)
    expect(combined).not.toMatch(/from\('session_distance_allocations'\)[\s\S]{0,300}\.(insert|update|delete|upsert)/)
  })
})
