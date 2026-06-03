'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import dayjs from 'dayjs'
import 'dayjs/locale/es'
import {
  AlertTriangle,
  Banknote,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Eye,
  FileDown,
  FileText,
  Filter,
  ReceiptText,
  Search,
  Target,
  X,
} from 'lucide-react'
import { AdminContentPanel } from '@/components/admin/AdminVisualSystem'
import { FinancesService, type FinanceActionableDashboard, type FinanceRecord } from '@/lib/services/FinancesService'

dayjs.locale('es')

type FinanceMovementKind = 'all' | 'membership' | 'intro'
type FinancePeriod = 'today' | 'week' | 'month' | 'custom'
type FinanceFiltersState = {
  period: FinancePeriod
  month: number
  year: number
  customStart: string
  customEnd: string
  kind: FinanceMovementKind
  status: string
  method: string
  search: string
}
type FinanceKpi = {
  label: string
  value: string
  helper: string
  tone: 'green' | 'amber' | 'orange' | 'blue' | 'red'
  icon: ReactNode
}

const YEARS = Array.from({ length: 5 }, (_, index) => new Date().getFullYear() - index)
const MONTHS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]

const initialFilters: FinanceFiltersState = {
  period: 'month',
  month: new Date().getMonth(),
  year: new Date().getFullYear(),
  customStart: dayjs().startOf('month').format('YYYY-MM-DD'),
  customEnd: dayjs().format('YYYY-MM-DD'),
  kind: 'all',
  status: 'all',
  method: 'all',
  search: '',
}

function money(value: number | string | null | undefined) {
  return `S/ ${Number(value || 0).toFixed(2)}`
}

function movementKind(record: FinanceRecord): Exclude<FinanceMovementKind, 'all'> {
  return record.plan_name === 'Clase de Prueba' ? 'intro' : 'membership'
}

function movementKindLabel(kind: FinanceMovementKind) {
  if (kind === 'intro') return 'Clase intro'
  if (kind === 'membership') return 'Membresia'
  return 'Todos'
}

function paymentMethodLabel(method: string | null | undefined) {
  if (!method) return 'Sin metodo'
  if (method === 'admin_manual') return 'Caja / Manual'
  if (method === 'transferencia') return 'Transferencia'
  return method.replaceAll('_', ' ')
}

function statusLabel(status: string) {
  switch (status) {
    case 'paid':
      return 'Pagado'
    case 'pending':
      return 'Pendiente'
    case 'late':
      return 'Atrasado'
    case 'cancelled':
      return 'Anulado'
    case 'waived':
      return 'Exonerado'
    default:
      return status || 'Sin estado'
  }
}

function statusClasses(status: string) {
  switch (status) {
    case 'paid':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700'
    case 'pending':
      return 'border-amber-200 bg-amber-50 text-amber-700'
    case 'late':
    case 'cancelled':
      return 'border-rose-200 bg-rose-50 text-rose-700'
    case 'waived':
      return 'border-slate-200 bg-slate-50 text-slate-600'
    default:
      return 'border-slate-200 bg-slate-50 text-slate-600'
  }
}

function dateRangeFromFilters(filters: FinanceFiltersState) {
  if (filters.period === 'today') {
    const start = dayjs().startOf('day')
    return { start, end: start.add(1, 'day') }
  }

  if (filters.period === 'week') {
    const start = dayjs().startOf('week').add(1, 'day')
    return { start, end: start.add(7, 'day') }
  }

  if (filters.period === 'custom') {
    const start = dayjs(filters.customStart || dayjs().format('YYYY-MM-DD')).startOf('day')
    const end = dayjs(filters.customEnd || filters.customStart || dayjs().format('YYYY-MM-DD')).startOf('day').add(1, 'day')
    return end.isAfter(start) ? { start, end } : { start, end: start.add(1, 'day') }
  }

  const start = dayjs().year(filters.year).month(filters.month).startOf('month')
  return { start, end: start.add(1, 'month') }
}

function periodLabel(filters: FinanceFiltersState) {
  const { start, end } = dateRangeFromFilters(filters)
  if (filters.period === 'today') return 'Hoy'
  if (filters.period === 'week') return `Semana ${start.format('D MMM')} - ${end.subtract(1, 'day').format('D MMM')}`
  if (filters.period === 'custom') return `Rango ${start.format('D MMM')} - ${end.subtract(1, 'day').format('D MMM')}`
  return `${MONTHS[filters.month]} ${filters.year}`
}

function maskSensitive(value: string | null | undefined) {
  if (!value) return 'No disponible'
  const clean = String(value)
  if (clean.length <= 8) return `${clean.slice(0, 2)}...`
  return `${clean.slice(0, 6)}...${clean.slice(-4)}`
}

function SensitiveValue({ value }: { value: string | null | undefined }) {
  return <span className="font-mono text-xs text-slate-500">{maskSensitive(value)}</span>
}

function FinanceStatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-black ${statusClasses(status)}`}>
      {statusLabel(status)}
    </span>
  )
}

function FinanceKpiCard({ kpi }: { kpi: FinanceKpi }) {
  const toneClass =
    kpi.tone === 'green'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : kpi.tone === 'amber'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : kpi.tone === 'red'
          ? 'border-rose-200 bg-rose-50 text-rose-700'
          : kpi.tone === 'blue'
            ? 'border-blue-200 bg-blue-50 text-blue-700'
            : 'border-orange-200 bg-orange-50 text-accent'

  return (
    <article className="rounded-[1.35rem] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.055)]">
      <div className="flex items-start justify-between gap-4">
        <div className={`grid h-11 w-11 place-items-center rounded-2xl border ${toneClass}`}>
          {kpi.icon}
        </div>
        <span className="rounded-full bg-slate-50 px-3 py-1 text-[11px] font-black text-slate-500">Periodo</span>
      </div>
      <p className="mt-4 text-sm font-bold text-slate-600">{kpi.label}</p>
      <p className="mt-2 font-heading text-3xl font-black leading-none tracking-[-0.055em] text-slate-950">{kpi.value}</p>
      <p className="mt-2 text-xs leading-5 text-slate-500">{kpi.helper}</p>
    </article>
  )
}

function FinanceFilters({
  filters,
  onChange,
  methodOptions,
  statusOptions,
  onClear,
  onExport,
  exportDisabled,
}: {
  filters: FinanceFiltersState
  onChange: (next: FinanceFiltersState) => void
  methodOptions: string[]
  statusOptions: string[]
  onClear: () => void
  onExport: () => void
  exportDisabled: boolean
}) {
  const patch = (partial: Partial<FinanceFiltersState>) => onChange({ ...filters, ...partial })

  return (
    <AdminContentPanel className="p-5">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-black text-slate-950">
              <Filter className="h-4 w-4 text-accent" />
              Filtros
            </div>
            <p className="mt-1 text-xs text-slate-500">Solo se muestran filtros con datos o soporte actual.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={onClear} className="min-h-11 rounded-2xl border border-slate-200 px-4 text-sm font-black text-slate-700">
              Limpiar filtros
            </button>
            <button
              type="button"
              onClick={onExport}
              disabled={exportDisabled}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white transition disabled:cursor-not-allowed disabled:opacity-45"
            >
              <FileDown className="h-4 w-4" />
              Exportar CSV
            </button>
          </div>
        </div>

        <div className="grid gap-3 xl:grid-cols-[1.2fr_0.9fr_0.9fr]">
          <div className="rounded-2xl bg-slate-50 p-3">
            <p className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-slate-400">Periodo</p>
            <div className="grid grid-cols-4 gap-2">
              {[
                ['today', 'Hoy'],
                ['week', 'Semana'],
                ['month', 'Mes'],
                ['custom', 'Rango'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => patch({ period: value as FinancePeriod })}
                  className={`min-h-11 rounded-xl px-3 text-sm font-black transition ${
                    filters.period === value ? 'bg-accent text-white shadow-[0_14px_32px_rgba(249,115,22,0.22)]' : 'bg-white text-slate-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {filters.period === 'month' && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <select value={filters.month} onChange={(event) => patch({ month: Number(event.target.value) })} className="input">
                  {MONTHS.map((month, index) => <option key={month} value={index}>{month}</option>)}
                </select>
                <select value={filters.year} onChange={(event) => patch({ year: Number(event.target.value) })} className="input">
                  {YEARS.map((year) => <option key={year} value={year}>{year}</option>)}
                </select>
              </div>
            )}

            {filters.period === 'custom' && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <input type="date" value={filters.customStart} onChange={(event) => patch({ customStart: event.target.value })} className="input" />
                <input type="date" value={filters.customEnd} onChange={(event) => patch({ customEnd: event.target.value })} className="input" />
              </div>
            )}
          </div>

          <div className="grid gap-3 rounded-2xl bg-slate-50 p-3 sm:grid-cols-2 xl:grid-cols-1">
            <label className="space-y-2">
              <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Tipo</span>
              <select value={filters.kind} onChange={(event) => patch({ kind: event.target.value as FinanceMovementKind })} className="input">
                <option value="all">Todos</option>
                <option value="membership">Membresia</option>
                <option value="intro">Clase intro</option>
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Estado</span>
              <select value={filters.status} onChange={(event) => patch({ status: event.target.value })} className="input">
                <option value="all">Todos</option>
                {statusOptions.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
              </select>
            </label>
          </div>

          <div className="grid gap-3 rounded-2xl bg-slate-50 p-3">
            <label className="space-y-2">
              <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Metodo</span>
              <select value={filters.method} onChange={(event) => patch({ method: event.target.value })} className="input">
                <option value="all">Todos</option>
                {methodOptions.map((method) => <option key={method} value={method}>{paymentMethodLabel(method)}</option>)}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Busqueda</span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={filters.search}
                  onChange={(event) => patch({ search: event.target.value })}
                  placeholder="Alumno, plan o metodo"
                  className="input pl-10"
                />
              </div>
            </label>
          </div>
        </div>
      </div>
    </AdminContentPanel>
  )
}

function FinanceSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
        {[0, 1, 2, 3, 4].map((item) => (
          <div key={item} className="h-36 animate-pulse rounded-[1.35rem] bg-slate-100" />
        ))}
      </div>
      <div className="h-96 animate-pulse rounded-[1.45rem] bg-slate-100" />
    </div>
  )
}

function FinanceEmptyState({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex min-h-[20rem] flex-col items-center justify-center rounded-[1.4rem] border border-dashed border-slate-200 bg-white p-8 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-orange-50 text-accent">
        <Search className="h-6 w-6" />
      </div>
      <p className="mt-4 text-lg font-black text-slate-950">No hay movimientos para los filtros seleccionados.</p>
      <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">Ajusta el periodo, tipo, estado o busqueda para revisar otros movimientos financieros.</p>
      <button type="button" onClick={onClear} className="mt-5 min-h-11 rounded-2xl bg-accent px-5 text-sm font-black text-white">
        Limpiar filtros
      </button>
    </div>
  )
}

function FinanceErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-[1.4rem] border border-rose-200 bg-rose-50 p-6 text-center">
      <p className="text-base font-black text-rose-700">No pudimos cargar la informacion financiera.</p>
      <p className="mt-2 text-sm text-rose-600">Revisa la conexion o intenta nuevamente.</p>
      <button type="button" onClick={onRetry} className="mt-5 min-h-11 rounded-2xl bg-rose-600 px-5 text-sm font-black text-white">
        Reintentar
      </button>
    </div>
  )
}

function FinanceMovementTable({
  records,
  onSelect,
}: {
  records: FinanceRecord[]
  onSelect: (record: FinanceRecord) => void
}) {
  return (
    <div className="hidden overflow-hidden rounded-[1.4rem] border border-slate-200 bg-white shadow-[0_20px_55px_rgba(15,23,42,0.06)] lg:block">
      <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
        <p className="text-sm font-black text-slate-950">Movimientos financieros</p>
        <p className="mt-1 text-xs text-slate-500">Tabla desktop con importes alineados y detalle bajo demanda.</p>
      </div>
      <div className="max-h-[42rem] overflow-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-xs font-black uppercase tracking-[0.14em] text-slate-400">
            <tr>
              <th className="px-5 py-4">Fecha</th>
              <th className="px-5 py-4">Alumno</th>
              <th className="px-5 py-4">Concepto</th>
              <th className="px-5 py-4">Plan o servicio</th>
              <th className="px-5 py-4 text-right">Monto</th>
              <th className="px-5 py-4">Metodo</th>
              <th className="px-5 py-4">Estado</th>
              <th className="px-5 py-4">Referencia</th>
              <th className="px-5 py-4 text-right">Accion</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.payment_id} className="border-t border-slate-100 bg-white transition hover:bg-orange-50/30">
                <td className="px-5 py-4">
                  <p className="font-bold text-slate-950">{dayjs(record.paid_at).format('DD MMM YYYY')}</p>
                  <p className="text-xs text-slate-400">{dayjs(record.paid_at).format('HH:mm')}</p>
                </td>
                <td className="max-w-[14rem] truncate px-5 py-4 font-bold text-slate-900">{record.student_name}</td>
                <td className="px-5 py-4">
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{movementKindLabel(movementKind(record))}</span>
                </td>
                <td className="max-w-[14rem] truncate px-5 py-4 text-slate-600">{record.plan_name}</td>
                <td className="px-5 py-4 text-right font-heading text-lg font-black tracking-[-0.04em] text-slate-950">{money(record.amount_paid)}</td>
                <td className="px-5 py-4 text-slate-600">{paymentMethodLabel(record.payment_method)}</td>
                <td className="px-5 py-4"><FinanceStatusBadge status={record.payment_status} /></td>
                <td className="px-5 py-4"><SensitiveValue value={record.payment_id} /></td>
                <td className="px-5 py-4 text-right">
                  <button type="button" onClick={() => onSelect(record)} className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-slate-200 px-4 text-sm font-black text-slate-700">
                    <Eye className="h-4 w-4" />
                    Ver detalle
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function FinanceMovementCard({
  record,
  onSelect,
}: {
  record: FinanceRecord
  onSelect: (record: FinanceRecord) => void
}) {
  return (
    <article className="rounded-[1.35rem] border border-slate-200 bg-white p-4 shadow-[0_16px_40px_rgba(15,23,42,0.055)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-black text-slate-950">{record.student_name}</p>
          <p className="mt-1 text-xs text-slate-500">{dayjs(record.paid_at).format('DD MMM YYYY - HH:mm')}</p>
        </div>
        <FinanceStatusBadge status={record.payment_status} />
      </div>
      <div className="mt-4 rounded-2xl bg-slate-50 p-3">
        <p className="text-xs font-bold text-slate-500">{movementKindLabel(movementKind(record))}</p>
        <p className="mt-1 truncate text-sm font-bold text-slate-700">{record.plan_name}</p>
        <p className="mt-3 font-heading text-3xl font-black tracking-[-0.055em] text-slate-950">{money(record.amount_paid)}</p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="font-black uppercase tracking-[0.14em] text-slate-400">Metodo</p>
          <p className="mt-1 font-bold text-slate-700">{paymentMethodLabel(record.payment_method)}</p>
        </div>
        <div>
          <p className="font-black uppercase tracking-[0.14em] text-slate-400">Referencia</p>
          <p className="mt-1"><SensitiveValue value={record.payment_id} /></p>
        </div>
      </div>
      <button type="button" onClick={() => onSelect(record)} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-accent px-4 text-sm font-black text-white">
        <Eye className="h-4 w-4" />
        Ver detalle
      </button>
    </article>
  )
}

function FinanceMovementDetail({
  record,
  onClose,
}: {
  record: FinanceRecord | null
  onClose: () => void
}) {
  if (!record) return null

  const rows = [
    ['Alumno', record.student_name],
    ['Fecha', dayjs(record.paid_at).format('DD/MM/YYYY HH:mm')],
    ['Monto', money(record.amount_paid)],
    ['Concepto', movementKindLabel(movementKind(record))],
    ['Plan o servicio', record.plan_name],
    ['Metodo', paymentMethodLabel(record.payment_method)],
    ['Estado', statusLabel(record.payment_status)],
    ['Referencia', maskSensitive(record.payment_id)],
    ['Observaciones', record.discount_calculated ? `Descuento registrado: ${money(record.discount_calculated)}` : 'Sin observaciones disponibles'],
  ]

  return (
    <div className="fixed inset-0 z-[90] flex justify-end bg-slate-950/40 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" onClick={onClose}>
      <aside className="flex h-full w-full max-w-xl flex-col overflow-hidden rounded-[1.6rem] bg-white shadow-[0_30px_90px_rgba(15,23,42,0.25)]" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5">
          <div>
            <p className="text-sm font-bold text-slate-500">Detalle de movimiento</p>
            <h2 className="mt-1 font-heading text-3xl font-black tracking-[-0.055em] text-slate-950">{money(record.amount_paid)}</h2>
          </div>
          <button type="button" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-2xl border border-slate-200 text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="space-y-3">
            {rows.map(([label, value]) => (
              <div key={label} className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">{label}</p>
                <p className="mt-1 break-words font-bold text-slate-800">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  )
}

function FinanceMobileSummary({
  stats,
  period,
  activeFiltersCount,
}: {
  stats: { totalIncome: number; paidCount: number; pendingCount: number }
  period: string
  activeFiltersCount: number
}) {
  return (
    <div className="rounded-[1.35rem] border border-slate-200 bg-white p-4 shadow-[0_16px_40px_rgba(15,23,42,0.055)] lg:hidden">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Resumen superior</p>
          <p className="mt-1 text-sm font-bold text-slate-600">{period}</p>
        </div>
        <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-black text-accent">{activeFiltersCount} filtros activos</span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-emerald-50 p-3">
          <p className="text-[11px] font-bold text-emerald-700">Ingresos</p>
          <p className="mt-1 font-heading text-xl font-black text-slate-950">{money(stats.totalIncome)}</p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-3">
          <p className="text-[11px] font-bold text-slate-500">Pagos</p>
          <p className="mt-1 font-heading text-xl font-black text-slate-950">{stats.paidCount}</p>
        </div>
        <div className="rounded-2xl bg-amber-50 p-3">
          <p className="text-[11px] font-bold text-amber-700">Pend.</p>
          <p className="mt-1 font-heading text-xl font-black text-slate-950">{stats.pendingCount}</p>
        </div>
      </div>
    </div>
  )
}

export default function FinancesClient() {
  const [filters, setFilters] = useState<FinanceFiltersState>(initialFilters)
  const [records, setRecords] = useState<FinanceRecord[]>([])
  const [actionable, setActionable] = useState<FinanceActionableDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedRecord, setSelectedRecord] = useState<FinanceRecord | null>(null)

  const dateRange = useMemo(() => dateRangeFromFilters(filters), [filters])
  const startDateString = dateRange.start.format('YYYY-MM-DD')
  const endDateString = dateRange.end.format('YYYY-MM-DD')

  const loadFinances = async () => {
    setLoading(true)
    setError(null)

    try {
      const [data, dashboard] = await Promise.all([
        FinancesService.getMonthlyReport(startDateString, endDateString),
        FinancesService.getActionableDashboard(startDateString, endDateString),
      ])
      setRecords(data)
      setActionable(dashboard)
    } catch (loadError: any) {
      console.error('Error loading finances:', loadError)
      setError(loadError?.message || 'No pudimos cargar la informacion financiera.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadFinances()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDateString, endDateString])

  const methodOptions = useMemo(() => {
    return Array.from(new Set(records.map((record) => record.payment_method).filter(Boolean))).sort()
  }, [records])

  const statusOptions = useMemo(() => {
    return Array.from(new Set(records.map((record) => record.payment_status).filter(Boolean))).sort()
  }, [records])

  const filteredRecords = useMemo(() => {
    const search = filters.search.trim().toLowerCase()

    return records.filter((record) => {
      const kind = movementKind(record)
      const matchesKind = filters.kind === 'all' || filters.kind === kind
      const matchesStatus = filters.status === 'all' || record.payment_status === filters.status
      const matchesMethod = filters.method === 'all' || record.payment_method === filters.method
      const matchesSearch = !search
        || record.student_name?.toLowerCase().includes(search)
        || record.plan_name?.toLowerCase().includes(search)
        || record.payment_method?.toLowerCase().includes(search)

      return matchesKind && matchesStatus && matchesMethod && matchesSearch
    })
  }, [filters.kind, filters.method, filters.search, filters.status, records])

  const stats = useMemo(() => {
    const paidRecords = filteredRecords.filter((record) => record.payment_status === 'paid')
    const pendingRecords = filteredRecords.filter((record) => record.payment_status === 'pending' || record.payment_status === 'late')
    const totalIncome = paidRecords.reduce((sum, record) => sum + Number(record.amount_paid || 0), 0)
    const introPaidCount = paidRecords.filter((record) => movementKind(record) === 'intro').length
    const ticketAverage = paidRecords.length ? totalIncome / paidRecords.length : 0

    return {
      totalIncome,
      paidCount: paidRecords.length,
      pendingCount: pendingRecords.length,
      introPaidCount,
      ticketAverage,
    }
  }, [filteredRecords])

  const kpis: FinanceKpi[] = [
    {
      label: 'Ingresos del periodo',
      value: money(stats.totalIncome),
      helper: 'Suma de movimientos pagados en el rango visible.',
      tone: 'green',
      icon: <Banknote className="h-5 w-5" />,
    },
    {
      label: 'Pagos registrados',
      value: stats.paidCount.toString(),
      helper: 'Conteo de pagos con estado pagado.',
      tone: 'blue',
      icon: <ReceiptText className="h-5 w-5" />,
    },
    {
      label: 'Pagos pendientes',
      value: stats.pendingCount.toString(),
      helper: 'Incluye estados pendiente y atrasado del reporte.',
      tone: 'amber',
      icon: <Clock3 className="h-5 w-5" />,
    },
    {
      label: 'Clases intro pagadas',
      value: stats.introPaidCount.toString(),
      helper: 'Derivado de movimientos con plan Clase de Prueba.',
      tone: 'orange',
      icon: <Target className="h-5 w-5" />,
    },
    {
      label: 'Ticket promedio',
      value: money(stats.ticketAverage),
      helper: 'Promedio calculado solo sobre pagos registrados.',
      tone: 'green',
      icon: <CheckCircle2 className="h-5 w-5" />,
    },
  ]

  const activeFiltersCount = [
    filters.period !== 'month',
    filters.kind !== 'all',
    filters.status !== 'all',
    filters.method !== 'all',
    Boolean(filters.search.trim()),
  ].filter(Boolean).length

  const clearFilters = () => setFilters(initialFilters)

  const exportToCsv = () => {
    if (filteredRecords.length === 0) return

    const headers = ['Fecha', 'Alumno', 'Concepto', 'Plan o servicio', 'Monto', 'Metodo', 'Estado', 'Referencia parcial']
    const rows = filteredRecords.map((record) => [
      dayjs(record.paid_at).format('DD/MM/YYYY HH:mm'),
      record.student_name,
      movementKindLabel(movementKind(record)),
      record.plan_name,
      Number(record.amount_paid || 0).toFixed(2),
      paymentMethodLabel(record.payment_method),
      statusLabel(record.payment_status),
      maskSensitive(record.payment_id),
    ])

    const escapeCsv = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`
    const csvContent = [headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `Finanzas_${periodLabel(filters).replaceAll(' ', '_')}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <FinanceFilters
        filters={filters}
        onChange={setFilters}
        methodOptions={methodOptions}
        statusOptions={statusOptions}
        onClear={clearFilters}
        onExport={exportToCsv}
        exportDisabled={filteredRecords.length === 0}
      />

      {loading ? (
        <FinanceSkeleton />
      ) : error ? (
        <FinanceErrorState onRetry={loadFinances} />
      ) : (
        <>
          <FinanceMobileSummary stats={stats} period={periodLabel(filters)} activeFiltersCount={activeFiltersCount} />

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {kpis.map((kpi) => <FinanceKpiCard key={kpi.label} kpi={kpi} />)}
          </div>

          {actionable && (
            <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
              <AdminContentPanel className="p-5">
                <div className="flex items-start gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-2xl border border-rose-200 bg-rose-50 text-rose-700">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-950">Morosidad con dato real</p>
                    <p className="mt-1 font-heading text-3xl font-black tracking-[-0.055em] text-rose-600">{money(actionable.overdue_amount)}</p>
                    <p className="mt-1 text-xs text-slate-500">{actionable.overdue_count || 0} pagos atrasados con vencimiento registrado.</p>
                  </div>
                </div>
              </AdminContentPanel>

              <AdminContentPanel className="p-5">
                <div className="flex items-start gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-2xl border border-orange-200 bg-orange-50 text-accent">
                    <CalendarDays className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-950">Proyeccion del rango</p>
                    <p className="mt-1 font-heading text-3xl font-black tracking-[-0.055em] text-slate-950">{money(actionable.projection_month)}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Cobrado {money(actionable.paid_month)} + pendiente {money(actionable.pending_month)}.
                    </p>
                  </div>
                </div>
              </AdminContentPanel>
            </div>
          )}

          {filteredRecords.length === 0 ? (
            <FinanceEmptyState onClear={clearFilters} />
          ) : (
            <>
              <FinanceMovementTable records={filteredRecords} onSelect={setSelectedRecord} />
              <div className="space-y-3 lg:hidden">
                {filteredRecords.map((record) => (
                  <FinanceMovementCard key={record.payment_id} record={record} onSelect={setSelectedRecord} />
                ))}
              </div>
            </>
          )}

          {actionable?.top_debtors?.length ? (
            <AdminContentPanel className="p-5">
              <div className="mb-4 flex items-center gap-2">
                <FileText className="h-4 w-4 text-accent" />
                <p className="text-sm font-black text-slate-950">Seguimiento de atrasos</p>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {actionable.top_debtors.slice(0, 6).map((debtor) => (
                  <div key={debtor.student_id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <p className="truncate font-black text-slate-950">{debtor.student_name}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {debtor.overdue_count} pagos - desde {debtor.oldest_due_date ? dayjs(debtor.oldest_due_date).format('DD/MM/YYYY') : 'sin fecha'}
                    </p>
                    <p className="mt-3 font-heading text-2xl font-black tracking-[-0.05em] text-rose-600">{money(debtor.overdue_amount)}</p>
                  </div>
                ))}
              </div>
            </AdminContentPanel>
          ) : null}
        </>
      )}

      <FinanceMovementDetail record={selectedRecord} onClose={() => setSelectedRecord(null)} />
    </div>
  )
}
