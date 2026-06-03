import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function source(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('admin memberships active list and plans catalog', () => {
  it('implements the active memberships tab with filters, desktop table and mobile cards', () => {
    const page = source('app/admin/membresias/page.tsx')

    expect(page).toContain('MembershipsActiveTab')
    expect(page).toContain('Buscar alumno o plan')
    expect(page).toContain('Estado operativo')
    expect(page).toContain('Vencimiento')
    expect(page).toContain('hidden overflow-hidden rounded-[1.35rem] border border-slate-200 lg:block')
    expect(page).toContain('lg:hidden')
    expect(page).toContain('Mostrando')
    expect(page).toContain('Renovar')
  })

  it('supports safe membership edits through the existing admin RPCs', () => {
    const page = source('app/admin/membresias/page.tsx')
    const hook = source('lib/hooks/useMembershipPlans.ts')

    expect(page).toContain('MembershipEditPanel')
    expect(page).toContain("supabase.rpc('admin_update_student_membership'")
    expect(page).toContain("supabase.rpc('admin_delete_student_membership'")
    expect(page).toContain('Eliminar membresia')
    expect(page).toContain("tone: 'danger'")
    expect(hook).toContain('membership_plan_id')
    expect(hook).toContain('classes_used')
    expect(hook).toContain('notes')
  })

  it('implements the plans catalog with create, edit, activation toggle, deletion and sale handoff', () => {
    const page = source('app/admin/membresias/page.tsx')

    expect(page).toContain('PlansCatalogTab')
    expect(page).toContain('PlanEditorModal')
    expect(page).toContain('Crear plan')
    expect(page).toContain('Guardar cambios')
    expect(page).toContain("supabase.from('membership_plans').insert")
    expect(page).toContain("supabase.from('membership_plans').update")
    expect(page).toContain("supabase.from('membership_plans').delete")
    expect(page).toContain('Usar en venta')
    expect(page).toContain('Desactivar plan')
    expect(page).toContain('Activar plan')
  })

  it('opens plan creation and editing in a centered modal instead of a narrow sidebar panel', () => {
    const page = source('app/admin/membresias/page.tsx')

    expect(page).toContain('PlanEditorModal')
    expect(page).toContain('fixed inset-0 z-50')
    expect(page).toContain('max-w-3xl')
    expect(page).toContain('max-h-[calc(100vh-2rem)]')
    expect(page).not.toContain('xl:grid-cols-[minmax(0,1fr)_380px]')
  })

  it('keeps the next blocks inside frontend and existing backend protections', () => {
    const page = source('app/admin/membresias/page.tsx')

    expect(page).not.toContain('ALTER TABLE')
    expect(page).not.toContain('CREATE OR REPLACE FUNCTION')
    expect(page).toContain('La eliminacion se bloqueara si el plan esta asociado a ciclos existentes.')
    expect(page).toContain('El backend bloqueara la eliminacion si existen reservas asociadas.')
  })
})
