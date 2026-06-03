import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function source(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('admin memberships redesign block 1', () => {
  it('renders the approved admin header, primary CTA and operational tabs', () => {
    const page = source('app/admin/membresias/page.tsx')

    expect(page).toContain('title="Membresias"')
    expect(page).toContain('Gestiona planes, renovaciones y estado de cuenta de tus alumnos')
    expect(page).toContain('Nueva venta o renovacion')
    expect(page).toContain("type MembershipTab = 'summary' | 'active' | 'plans'")
    expect(page).toContain('Resumen')
    expect(page).toContain('Membresias activas')
    expect(page).toContain('Catalogo de planes')
  })

  it('prioritizes real operational KPIs and avoids unsupported metrics', () => {
    const page = source('app/admin/membresias/page.tsx')

    expect(page).toContain('membershipKpis')
    expect(page).toContain('Membresias activas')
    expect(page).toContain('Por vencer')
    expect(page).toContain('Sin clases')
    expect(page).toContain('Una clase')
    expect(page).toContain('Renovaciones')
    expect(page).toContain('Ingresos por membresias')
    expect(page).not.toContain('Pagos pendientes, solo si existe dato real')
    expect(page).not.toContain('Pausadas')
  })

  it('moves sale or renewal into the summary with replacement warnings and confirmation', () => {
    const page = source('app/admin/membresias/page.tsx')

    expect(page).toContain('MembershipSaleForm')
    expect(page).toContain('Paso 1')
    expect(page).toContain('Paso 2')
    expect(page).toContain('Paso 3')
    expect(page).toContain('Resumen del nuevo ciclo')
    expect(page).toContain('Esta accion reemplazara la membresia actual del alumno')
    expect(page).toContain('Las clases restantes no se acumularan automaticamente')
    expect(page).toContain('Estas clases no se trasladaran automaticamente al nuevo plan')
    expect(page).toContain('Resumen previo a la renovacion')
    expect(page).toContain("tone: 'warning'")
    expect(page).toContain('Activar membresia')
    expect(page).toContain('Renovar membresia')
    expect(page).not.toContain('classes_remaining +')
    expect(page).not.toContain('duration_days +')
  })

  it('keeps attention cards and routes later tabs to the implemented blocks', () => {
    const page = source('app/admin/membresias/page.tsx')

    expect(page).toContain('Pendientes importantes')
    expect(page).toContain('MembershipAttentionCard')
    expect(page).toContain('Ver alumnos')
    expect(page).toContain('MembershipsActiveTab')
    expect(page).toContain('PlansCatalogTab')
    expect(page).not.toContain('MembershipMobileCard')
    expect(page).not.toContain('MembershipDetailDrawer')
  })

  it('loads all memberships for truthful monthly renewal and income KPIs', () => {
    const hook = source('lib/hooks/useMembershipPlans.ts')
    const page = source('app/admin/membresias/page.tsx')

    expect(hook).toContain('useAdminStudentMemberships')
    expect(hook).toContain('student_memberships')
    expect(hook).not.toMatch(/useAdminStudentMemberships[\s\S]*\.limit\(12\)/)
    expect(page).toContain('useAdminStudentMemberships')
    expect(page).toContain('membership.created_at')
    expect(page).toContain('membership.total_amount')
  })
})
