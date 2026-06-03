import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function source(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('admin finances productivity phase 3B', () => {
  it('uses only available finance fields and avoids invented metrics', () => {
    const client = source('app/admin/finanzas/FinancesClient.tsx')

    expect(client).toContain('type FinanceMovementKind')
    expect(client).toContain("record.plan_name === 'Clase de Prueba'")
    expect(client).toContain('Ingresos del periodo')
    expect(client).toContain('Pagos registrados')
    expect(client).toContain('Clases intro pagadas')
    expect(client).toContain('Ticket promedio')
    expect(client).not.toContain('Responsable de registro')
    expect(client).not.toContain('Comparacion mensual')
    expect(client).not.toContain('Ingreso esperado vs recibido')
  })

  it('provides responsive desktop table, mobile cards and detail drawer', () => {
    const client = source('app/admin/finanzas/FinancesClient.tsx')

    expect(client).toContain('FinanceMovementTable')
    expect(client).toContain('FinanceMovementCard')
    expect(client).toContain('FinanceMovementDetail')
    expect(client).toContain('hidden')
    expect(client).toContain('lg:block')
    expect(client).toContain('lg:hidden')
    expect(client).toContain('Ver detalle')
    expect(client).toContain('<table')
  })

  it('adds real filters, privacy masking, empty/loading/error states and no unsafe write actions', () => {
    const client = source('app/admin/finanzas/FinancesClient.tsx')

    expect(client).toContain('FinanceFilters')
    expect(client).toContain('Hoy')
    expect(client).toContain('Semana')
    expect(client).toContain('Mes')
    expect(client).toContain('Rango')
    expect(client).toContain('SensitiveValue')
    expect(client).toContain('maskSensitive')
    expect(client).toContain('Exportar CSV')
    expect(client).toContain('exportToCsv')
    expect(client).toContain('No hay movimientos para los filtros seleccionados.')
    expect(client).toContain('No pudimos cargar la informacion financiera.')
    expect(client).toContain('Limpiar filtros')
    expect(client).toContain('FinanceSkeleton')
    expect(client).not.toMatch(/\.(insert|update|delete|upsert)\(/)
    expect(client).not.toContain('Anular')
    expect(client).not.toContain('Eliminar')
    expect(client).not.toContain('Devolver')
  })
})
