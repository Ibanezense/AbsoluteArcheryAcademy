import type { FinanceRecord } from '@/lib/services/FinancesService'

export type FinanceMovementKind = 'all' | 'membership' | 'intro'
export function financeMovementKind(record: FinanceRecord): Exclude<FinanceMovementKind, 'all'> {
  return record.plan_name === 'Clase de Prueba' ? 'intro' : 'membership'
}

export function filterFinanceRecords(records: FinanceRecord[], filters: { kind: FinanceMovementKind; status: string; method: string; search: string }) {
  const search = filters.search.trim().toLocaleLowerCase('es')
  return records.filter((record) => (filters.kind === 'all' || filters.kind === financeMovementKind(record))
    && (filters.status === 'all' || filters.status === record.payment_status)
    && (filters.method === 'all' || filters.method === record.payment_method)
    && (!search || [record.student_name, record.plan_name, record.payment_method].some((value) => value?.toLocaleLowerCase('es').includes(search))))
}

export function paginateFinanceRecords(records: FinanceRecord[], requestedPage: number) {
  const pageCount = Math.max(1, Math.ceil(records.length / 25))
  const page = Math.min(pageCount, Math.max(1, Math.floor(requestedPage) || 1))
  return { records: records.slice((page - 1) * 25, page * 25), page, pageCount, total: records.length }
}
