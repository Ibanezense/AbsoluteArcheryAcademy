import { describe, expect, it } from 'vitest'
import { filterFinanceRecords, paginateFinanceRecords } from './adminFinanceFilters'
import type { FinanceRecord } from '@/lib/services/FinancesService'

const rows = Array.from({ length: 61 }, (_, index) => ({ payment_id: `${index}`, student_name: index % 2 ? 'María' : 'José', plan_name: index % 3 ? 'Mensual' : 'Clase de Prueba', payment_status: index % 2 ? 'paid' : 'pending', payment_method: 'admin_manual', amount_paid: 10 } as FinanceRecord))

describe('finance filtered universe and pagination', () => {
  it('combines filters without changing the source dataset', () => {
    const result = filterFinanceRecords(rows, { kind: 'intro', status: 'paid', method: 'admin_manual', search: ' maría ' })
    expect(result.map((row) => row.payment_id)).toEqual(['3', '9', '15', '21', '27', '33', '39', '45', '51', '57'])
    expect(rows).toHaveLength(61)
  })
  it('paginates 25 rows while preserving the full export universe', () => {
    const filtered = filterFinanceRecords(rows, { kind: 'all', status: 'all', method: 'all', search: '' })
    expect(paginateFinanceRecords(filtered, 2).records.map((row) => row.payment_id)).toEqual(rows.slice(25, 50).map((row) => row.payment_id))
    expect(paginateFinanceRecords(filtered, 3).records).toHaveLength(11)
    expect(filtered).toHaveLength(61)
  })
  it('clamps stale pages after a filter reduces results and handles empty reports', () => {
    expect(paginateFinanceRecords(rows.slice(0, 2), 4).page).toBe(1)
    expect(paginateFinanceRecords([], 2)).toEqual({ records: [], page: 1, pageCount: 1, total: 0 })
  })
})
