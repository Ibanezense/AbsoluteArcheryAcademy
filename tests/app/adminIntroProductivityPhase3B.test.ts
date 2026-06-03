import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function source(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('admin intro productivity phase 3B', () => {
  it('uses the migrated intro model without showing technical audit copy in the UI', () => {
    const client = source('app/admin/intro/IntroClient.tsx')
    const service = source('lib/services/IntroClassesService.ts')
    const modal = source('app/admin/intro/components/RegisterIntroModal.tsx')

    expect(client).not.toContain('IntroModelAudit')
    expect(client).not.toContain('Modelo de pruebas actualizado')
    expect(client).not.toContain('Diferencia pagada/gratuita/cortesia')
    expect(client).not.toContain('Migracion aplicada')
    expect(client).not.toContain('Auditoria del modelo actual')
    expect(client).not.toContain('Requiere migracion aplicada')
    expect(client).not.toContain('Campos usados:')
    expect(client).not.toContain('Tipo no definido')
    expect(service).toContain('intro_payments')
    expect(service).toContain('intro_class_type')
    expect(service).toContain('payment_status')
    expect(service).toContain('courtesy_reason')
    expect(service).toContain('amount')
    expect(service).toContain('payment_method')
    expect(modal).toContain('introClassType')
    expect(modal).toContain('paymentStatus')
    expect(modal).toContain('courtesyReason')
    expect(modal).toContain('Pagada')
    expect(modal).toContain('Gratuita')
    expect(modal).toContain('Cortesia')
  })

  it('uses the white academy logo in the desktop sidebar and mobile admin header', () => {
    const sidebar = source('components/AdminSidebar.tsx')
    const layout = source('app/admin/layout.tsx')

    expect(sidebar).toContain('src="/AA ACADEMY logo blanco.png"')
    expect(layout).toContain('src="/AA ACADEMY logo blanco.png"')
    expect(sidebar).not.toContain('src="/aa-academy-logo-720.png"')
    expect(layout).not.toContain('src="/aa-academy-logo-720.png"')
  })

  it('renders responsive daily agenda, desktop table, mobile cards and detail drawer', () => {
    const client = source('app/admin/intro/IntroClient.tsx')
    const page = source('app/admin/intro/page.tsx')

    expect(page).toContain('title="Pruebas"')
    expect(page).toContain('Agenda y seguimiento de clases intro')
    expect(client).toContain('IntroDailyAgenda')
    expect(client).toContain('IntroClientTable')
    expect(client).toContain('IntroClientCard')
    expect(client).toContain('IntroDetailDrawer')
    expect(client).toContain('hidden')
    expect(client).toContain('lg:block')
    expect(client).toContain('lg:hidden')
    expect(client).toContain('Ver detalle')
  })

  it('adds real filters, privacy, WhatsApp, loading, empty and error states without unsafe writes', () => {
    const client = source('app/admin/intro/IntroClient.tsx')

    expect(client).toContain('IntroFilters')
    expect(client).toContain('Hoy')
    expect(client).toContain('Mañana')
    expect(client).toContain('Esta semana')
    expect(client).toContain('Próximas')
    expect(client).toContain('SensitivePhone')
    expect(client).toContain('maskPhone')
    expect(client).toContain('wa.me')
    expect(client).toContain('No hay clases intro para los filtros seleccionados.')
    expect(client).toContain('No pudimos cargar las clases intro.')
    expect(client).toContain('IntroSkeleton')
    expect(client).toContain('Limpiar filtros')
    expect(client).toContain('flex flex-wrap gap-2')
    expect(client).toContain('basis-[6.4rem]')
    expect(client).toContain('text-[13px]')
    expect(client).toContain('className="input py-3 pl-10 text-sm"')
    expect(client).not.toMatch(/from\('intro_clients'\)[\s\S]{0,300}\.(insert|update|delete|upsert)/)
    expect(client).not.toMatch(/from\('intro_payments'\)[\s\S]{0,300}\.(insert|update|delete|upsert)/)
  })
})
