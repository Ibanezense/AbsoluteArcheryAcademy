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
    expect(page).toContain('Reservas próximas')
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
    expect(page).toContain('Código de acceso')
    expect(page).toContain('••••••')
    expect(page).toContain('Mostrar código')
    expect(page).toContain('Ocultar código')
    expect(page).toContain('Copiar código')
  })

  it('explains independent FIFO cycles and uses profile membership RPCs', () => {
    const page = source('app/admin/alumnos/[id]/page.tsx')

    expect(page).toContain('Se creará un ciclo independiente')
    expect(page).toContain('se consumen primero en orden cronológico')
    expect(page).toContain("supabase.rpc('admin_assign_membership_from_profile'")
    expect(page).toContain("supabase.rpc('admin_manage_student_membership'")
  })

  it('selects persisted operational status fields for the profile surface', () => {
    const hook = source('lib/hooks/useStudentDetail.ts')

    expect(hook).toContain('operational_status')
    expect(hook).toContain('operational_status_reason')
    expect(hook).toContain('operational_status_updated_at')
    expect(hook).toContain('dominant_hand')
    expect(hook).toContain('expired_at')
  })

  it('renders editable profile and sports forms with permanent guardian contact fields', () => {
    const page = source('app/admin/alumnos/[id]/page.tsx')

    expect(page).toContain('ProfileFormState')
    expect(page).toContain('SportsFormState')
    expect(page).toContain('handleSaveStudentProfile')
    expect(page).toContain('Nombre del tutor')
    expect(page).toContain('Email del tutor')
    expect(page).toContain('Teléfono del tutor')
    expect(page).toContain('Guardar cambios')
    expect(page).toContain('Arco propio')
    expect(page).toContain('Arco asignado')
    expect(page).toContain('Arco de academia')
    expect(page).not.toContain('function ProfileField')
  })

  it('uses correct Spanish accents in the redesigned student surface', () => {
    const page = source('app/admin/alumnos/[id]/page.tsx')

    expect(page).toContain("{ id: 'membership', label: 'Membresía' }")
    expect(page).toContain('Información general')
    expect(page).toContain('Código de acceso')
    expect(page).toContain('Categoría')
    expect(page).toContain('Teléfono')
    expect(page).not.toContain('â€¢')
  })

  it('manages memberships inside the student profile with the requested table and actions', () => {
    const page = source('app/admin/alumnos/[id]/page.tsx')

    expect(page).toContain('MembershipAssignmentDrawer')
    expect(page).toContain("supabase.rpc('admin_assign_membership_from_profile'")
    expect(page).toContain("supabase.rpc('admin_manage_student_membership'")
    expect(page).toContain('Número de documento')
    expect(page).toContain('Tipo de pago')
    expect(page).toContain('Información del plan')
    expect(page).toContain('Cancelar membresía')
    expect(page).toContain('Cambiar fecha de inicio/finalización')
    expect(page).toContain('Cambiar de plan')
    expect(page).toContain('Cambiar el tipo de pago')
    expect(page).toContain('Cambiar la fecha de facturación')
    expect(page).toContain('Cambiar descuento')
    expect(page).toContain('Congelar la membresía')
    expect(page).toContain('Asignar membresía')
  })

  it('shows a general actions menu in the student header', () => {
    const page = source('app/admin/alumnos/[id]/page.tsx')

    expect(page).toContain('Acciones del alumno')
    expect(page).toContain('Reservar clase')
    expect(page).toContain('Bloquear alumno')
    expect(page).toContain('Eliminar alumno')
  })
})
