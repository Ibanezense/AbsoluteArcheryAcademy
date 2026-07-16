import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function source(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('admin student profile operational redesign', () => {
  it('uses the approved admin visual system and tabbed operational sections', () => {
    const page = source('app/admin/alumnos/[id]/page.tsx')

    expect(page).toContain('AdminPageHeader')
    expect(page).toContain('AdminContentPanel')
    expect(page).toContain('Alertas prioritarias')
    expect(page).toContain('Clases disponibles')
    expect(page).toContain('Reservas proximas')
    expect(page).toContain('Pagos pendientes')
    expect(page).toContain('No-shows recientes')
    expect(page).toContain("'profile'")
    expect(page).toContain("'membership'")
    expect(page).toContain("'bookings'")
    expect(page).toContain("'attendance'")
    expect(page).toContain("'payments'")
    expect(page).toContain("'sports'")
    expect(page).not.toContain("'notes'")
    expect(page).toContain('Datos deportivos')
    expect(page).toContain('role="tablist"')
    expect(page).toContain('role="tabpanel"')
    expect(page).toContain("expiring: 'Por vencer'")
    expect(page).toContain("inactive: 'Inactivo'")
  })

  it('does not render repeated class cards in the admin student profile', () => {
    const page = source('app/admin/alumnos/[id]/page.tsx')

    expect(page).not.toContain('ClassCardsBoard')
    expect(page).not.toContain('useStudentClassCards')
    expect(page).toContain('Membresia actual')
    expect(page).toContain('Historial de membresias')
  })

  it('keeps the student access code masked until it is revealed', () => {
    const page = source('app/admin/alumnos/[id]/page.tsx')

    expect(page).toContain('revealedAccessTarget')
    expect(page).toContain('Codigo de acceso')
    expect(page).toContain('••••••')
    expect(page).toContain('Mostrar codigo')
    expect(page).toContain('Ocultar codigo')
    expect(page).toContain('Copiar codigo')
  })

  it('shows the renewal replacement warning and preserves existing admin membership RPCs', () => {
    const page = source('app/admin/alumnos/[id]/page.tsx')

    expect(page).toContain('La membresia anterior pasara al historial')
    expect(page).toContain('Las clases restantes no se acumularan automaticamente')
    expect(page).toContain("supabase.rpc('admin_update_student_membership'")
    expect(page).toContain("supabase.rpc('admin_delete_student_membership'")
  })

  it('selects persisted operational status fields for the profile surface', () => {
    const hook = source('lib/hooks/useStudentDetail.ts')

    expect(hook).toContain('operational_status')
    expect(hook).toContain('operational_status_reason')
    expect(hook).toContain('operational_status_updated_at')
    expect(hook).toContain('dominant_hand')
    expect(hook).toContain('expired_at')
  })
})
