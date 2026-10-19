import { describe, expect, it } from 'vitest'
import { equipmentLabel, formatAdminDate, formatAdminMoney, paymentMethodLabel } from './adminPresentation'

describe('admin presentation', () => {
  it('keeps unknown values and distinguishes missing information from zero', () => {
    expect(formatAdminMoney(null)).toBe('Dato no disponible')
    expect(formatAdminMoney(0)).toContain('0.00')
    expect(paymentMethodLabel('manual')).toBe('Registro manual')
    expect(paymentMethodLabel('cash')).toBe('Efectivo')
    expect(paymentMethodLabel('transfer')).toBe('Transferencia')
    expect(paymentMethodLabel('otro-medio')).toBe('otro-medio')
    expect(equipmentLabel('own')).toBe('Arco propio')
    expect(equipmentLabel('assigned')).toBe('Arco asignado')
  })
  it('keeps civil dates in Lima and handles unknown dates', () => {
    expect(formatAdminDate('2026-10-18')).toContain('18')
    expect(formatAdminDate(null)).toBe('Sin fecha')
    expect(formatAdminDate('invalid')).toBe('Sin fecha')
  })
})
