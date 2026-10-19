'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fetchMembershipGrowthHistory } from '@/lib/services/adminMembershipGrowthService'
import { buildMembershipGrowthReport } from '@/lib/utils/adminMembershipGrowth'
import { getLimaDateKey } from '@/lib/utils/membershipCycles'
import { studentKeys } from '@/lib/queries/studentQueries'

const monthLabel = (value: string, long = false) => new Intl.DateTimeFormat('es-PE', { month: long ? 'long' : 'short', year: long ? 'numeric' : '2-digit', timeZone: 'UTC' }).format(new Date(`${value}-01T12:00:00Z`))

export default function MembershipGrowthChart() {
  const [period, setPeriod] = useState(6)
  const today = getLimaDateKey()
  const query = useQuery({
    queryKey: [...studentKeys.all, 'membership-growth', today],
    queryFn: async () => {
      const history = await fetchMembershipGrowthHistory()
      return buildMembershipGrowthReport(history, today, 12)
    },
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  })
  const rows = (query.data?.rows || []).slice(-period)
  const series = [
    { key: 'newStudents', label: 'Nuevos', color: '#059669' },
    { key: 'renewed', label: 'Renovaron', color: '#2563eb' },
    { key: 'pending', label: 'Pendientes', color: '#d97706' },
    { key: 'notRenewed', label: 'Perdidos', color: '#e11d48' },
    { key: 'reactivated', label: 'Reactivados', color: '#7c3aed' },
  ] as const
  const chartRows = rows.map(row => ({ ...row, ...Object.fromEntries(series.map(item => [item.key, query.data?.firstMonth && row.month >= query.data.firstMonth ? row[item.key] : null])) }))
  const totals = Object.fromEntries(series.map(item => [item.key, rows.reduce((sum, row) => sum + row[item.key], 0)]))
  const closed = rows.filter(row => !row.provisional)
  const eligible = closed.reduce((sum, row) => sum + row.eligible, 0)
  const renewed = closed.reduce((sum, row) => sum + row.renewed, 0)
  const rate = eligible ? renewed / eligible * 100 : null

  return <section aria-labelledby="membership-growth-title" className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 id="membership-growth-title" className="text-lg font-semibold text-slate-950">Inscripciones y renovaciones</h2><p className="mt-1 text-sm text-slate-500">Evolución mensual · 30 días de plazo para renovar</p></div>
      <label className="flex items-center gap-2 text-sm text-slate-600">Periodo<select className="min-h-11 rounded-lg border border-slate-200 bg-white px-3" value={period} onChange={event => setPeriod(Number(event.target.value))}><option value={6}>Últimos 6 meses</option><option value={12}>Últimos 12 meses</option></select></label>
    </div>
    {query.data && query.data.issues.length > 0 && <div role="status" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900"><p className="font-semibold">Datos parciales: {query.data.issues.length} {query.data.issues.length === 1 ? 'alumno excluido' : 'alumnos excluidos'} por historial inconsistente.</p><p>Revisa sus fechas antes de interpretar los totales como completos.</p>{query.data.issues.map((issue, index) => <p key={issue.studentId || index}>{issue.message} {issue.studentId && <Link className="inline-flex min-h-11 items-center font-semibold underline" href={`/admin/alumnos/${issue.studentId}?tab=membership`}>Revisar ficha {index + 1}</Link>}</p>)}</div>}
    {query.isPending ? <p role="status" className="py-12 text-center text-sm text-slate-500">Cargando evolución de alumnos…</p> : query.isError ? <div role="alert" className="mt-4 rounded-lg bg-rose-50 p-4 text-sm text-rose-800"><p>{query.error instanceof Error ? query.error.message : 'No pudimos cargar el historial.'}</p><button className="mt-2 min-h-11 font-semibold underline" type="button" onClick={() => void query.refetch()}>Reintentar</button></div> : !query.data.firstMonth ? <p className="py-10 text-center text-sm text-slate-500">{query.data.issues.length ? 'No hay historiales válidos para calcular la evolución. Revisa las fichas indicadas.' : 'Todavía no hay membresías registradas para calcular esta evolución.'}</p> : <>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {series.map(item => <div key={item.key} className="rounded-lg bg-slate-50 p-3"><p className="text-xs font-medium" style={{ color: item.color }}>{item.label}</p><p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{totals[item.key]}</p></div>)}
        <div className="rounded-lg bg-slate-900 p-3 text-white"><p className="text-xs">Tasa de renovación</p><p className="mt-1 text-2xl font-semibold tabular-nums">{rate === null ? '—' : `${rate.toFixed(1)}%`}</p><p className="mt-1 text-[11px] text-slate-300">{eligible ? `${renewed} de ${eligible} · meses cerrados` : 'Sin meses cerrados con vencimientos'}</p></div>
      </div>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-600" aria-label="Leyenda del gráfico">{series.map(item => <span key={item.key} className="flex items-center gap-2"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm" style={{ background: item.color }} />{item.label}</span>)}</div>
      <div className="mt-3 h-72 min-w-0 w-full" role="img" aria-label="Barras mensuales de alumnos nuevos, renovaciones, pendientes, perdidos y reactivados. Los valores están disponibles en la tabla inferior.">
        <ResponsiveContainer width="100%" height="100%"><BarChart data={chartRows} accessibilityLayer margin={{ top: 16, right: 4, bottom: 4, left: -20 }}>
          <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="3 3" />
          <XAxis dataKey="month" tickFormatter={value => monthLabel(value)} axisLine={false} tickLine={false} tick={{ fontSize: 10 }} minTickGap={12} />
          <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
          <Tooltip labelFormatter={label => monthLabel(String(label), true)} cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: 8, borderColor: '#e2e8f0', fontSize: 12 }} />
          {series.map(item => <Bar key={item.key} dataKey={item.key} name={item.label} fill={item.color} radius={[3, 3, 0, 0]} maxBarSize={24} isAnimationActive={false} />)}
        </BarChart></ResponsiveContainer>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">Nuevos y reactivados corresponden al mes de inicio de la membresía. Renovaron, pendientes y perdidos corresponden al mes del vencimiento. El plazo para renovar es de 30 días exactos, incluido el último día.</p>
      <details className="mt-4 rounded-lg border border-slate-200 p-3"><summary className="min-h-6 cursor-pointer text-sm font-medium text-slate-700">Ver cifras por mes y criterios</summary>
        <p className="mt-3 text-xs leading-5 text-slate-500">Cada alumno se clasifica una vez por mes de vencimiento, usando su último vencimiento efectivo del mes. Las renovaciones anticipadas también cuentan. Pendientes: aún dentro del plazo. Perdidos: plazo completo sin renovar. Reactivados: regresaron después del plazo; se conserva la pérdida anterior. Nuevos: primera membresía, sin pruebas ni obsequios. La tasa divide renovaciones entre alumnos con vencimiento en meses cerrados; un mes cierra 30 días después de su último día. Los totales suman los meses mostrados y no son alumnos únicos del periodo. Se excluyen borradores, canceladas y obsequios.</p>
        <div className="mt-3 overflow-x-auto"><table className="min-w-full text-left text-xs"><caption className="sr-only">Inscripciones y renovaciones por mes</caption><thead><tr className="border-b text-slate-500"><th scope="col" className="py-2 pr-3">Mes</th>{series.map(item => <th key={item.key} scope="col" className="px-2 py-2">{item.label}</th>)}<th scope="col" className="px-2 py-2">Vencimientos</th><th scope="col" className="px-2 py-2">Tasa</th></tr></thead><tbody>{rows.map(row => <tr key={row.month} className="border-b border-slate-100 last:border-0"><th scope="row" className="py-3 pr-3 font-medium"><span className="whitespace-nowrap">{monthLabel(row.month)}</span>{row.provisional && <span className="block text-[10px] font-normal text-amber-700">Provisional</span>}</th>{row.month < query.data.firstMonth! ? <td colSpan={7} className="px-2 py-3 text-slate-500">Sin historial</td> : <>{series.map(item => <td key={item.key} className="px-2 tabular-nums">{row[item.key]}</td>)}<td className="px-2 tabular-nums">{row.eligible}</td><td className="px-2 tabular-nums">{row.renewalRate === null ? '—' : `${row.renewalRate.toFixed(1)}%`}</td></>}</tr>)}</tbody></table></div>
      </details>
    </>}
  </section>
}
