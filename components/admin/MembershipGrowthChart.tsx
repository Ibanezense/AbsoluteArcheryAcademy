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
  const [period, setPeriod] = useState(12)
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
  const chartRows = rows.map(row => ({ ...row, newStudents: query.data?.firstMonth && row.month >= query.data.firstMonth ? row.newStudents : null, notRenewed: query.data?.firstMonth && row.month >= query.data.firstMonth ? row.notRenewed : null }))
  const totals = rows.reduce((sum, row) => ({ newStudents: sum.newStudents + row.newStudents, notRenewed: sum.notRenewed + row.notRenewed, reactivated: sum.reactivated + row.reactivated }), { newStudents: 0, notRenewed: 0, reactivated: 0 })

  return <section aria-labelledby="membership-growth-title" className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 id="membership-growth-title" className="text-lg font-semibold text-slate-950">Alumnos nuevos y no renovados</h2><p className="mt-1 text-sm text-slate-500">Evolución mensual · siete días de plazo para renovar</p></div>
      <label className="flex items-center gap-2 text-sm text-slate-600">Periodo<select className="min-h-11 rounded-lg border border-slate-200 bg-white px-3" value={period} onChange={event => setPeriod(Number(event.target.value))}><option value={6}>Últimos 6 meses</option><option value={12}>Últimos 12 meses</option></select></label>
    </div>
    {query.data && query.data.issues.length > 0 && <div role="status" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900"><p className="font-semibold">Datos parciales: {query.data.issues.length} {query.data.issues.length === 1 ? 'alumno excluido' : 'alumnos excluidos'} por historial inconsistente.</p><p>Revisa sus fechas antes de interpretar los totales como completos.</p>{query.data.issues.map((issue, index) => <p key={issue.studentId || index}>{issue.message} {issue.studentId && <Link className="inline-flex min-h-11 items-center font-semibold underline" href={`/admin/alumnos/${issue.studentId}?tab=membership`}>Revisar ficha {index + 1}</Link>}</p>)}</div>}
    {query.isPending ? <p role="status" className="py-12 text-center text-sm text-slate-500">Cargando evolución de alumnos…</p> : query.isError ? <div role="alert" className="mt-4 rounded-lg bg-rose-50 p-4 text-sm text-rose-800"><p>{query.error instanceof Error ? query.error.message : 'No pudimos cargar el historial.'}</p><button className="mt-2 min-h-11 font-semibold underline" type="button" onClick={() => void query.refetch()}>Reintentar</button></div> : !query.data.firstMonth ? <p className="py-10 text-center text-sm text-slate-500">{query.data.issues.length ? 'No hay historiales válidos para calcular la evolución. Revisa las fichas indicadas.' : 'Todavía no hay membresías registradas para calcular esta evolución.'}</p> : <>
      <div className="mt-5 grid grid-cols-3 gap-2 sm:gap-4">
        <div className="rounded-lg bg-emerald-50 p-3"><p className="min-h-8 text-xs text-emerald-800 sm:min-h-0">Nuevos</p><p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-900">{totals.newStudents}</p></div>
        <div className="rounded-lg bg-rose-50 p-3"><p className="min-h-8 text-xs text-rose-800 sm:min-h-0">No renovaron</p><p className="mt-1 text-2xl font-semibold tabular-nums text-rose-900">{totals.notRenewed}</p></div>
        <div className="rounded-lg bg-slate-50 p-3"><p className="min-h-8 text-xs text-slate-600 sm:min-h-0">Reactivados</p><p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{totals.reactivated}</p></div>
      </div>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-600" aria-label="Leyenda del gráfico"><span className="flex items-center gap-2"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-emerald-600" />Alumnos nuevos</span><span className="flex items-center gap-2"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-rose-600" />No renovaron</span></div>
      <div className="mt-3 h-72 min-w-0 w-full" role="img" aria-label="Barras mensuales de alumnos nuevos y alumnos que no renovaron. Los valores están disponibles en la tabla inferior.">
        <ResponsiveContainer width="100%" height="100%"><BarChart data={chartRows} accessibilityLayer margin={{ top: 16, right: 4, bottom: 4, left: -20 }}>
          <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="3 3" />
          <XAxis dataKey="month" tickFormatter={value => monthLabel(value)} axisLine={false} tickLine={false} tick={{ fontSize: 10 }} minTickGap={12} />
          <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
          <Tooltip labelFormatter={label => monthLabel(String(label), true)} cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: 8, borderColor: '#e2e8f0', fontSize: 12 }} />
          <Bar dataKey="newStudents" name="Nuevos" fill="#059669" radius={[3, 3, 0, 0]} maxBarSize={24} isAnimationActive={false} />
          <Bar dataKey="notRenewed" name="No renovaron" fill="#e11d48" radius={[3, 3, 0, 0]} maxBarSize={24} isAnimationActive={false} />
        </BarChart></ResponsiveContainer>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">Nuevos: primera membresía registrada, sin pruebas ni obsequios. No renovaron: vencimiento sin continuidad tras siete días; la baja corresponde al mes del vencimiento. El mes actual y los plazos abiertos son provisionales.</p>
      <details className="mt-4 rounded-lg border border-slate-200 p-3"><summary className="min-h-6 cursor-pointer text-sm font-medium text-slate-700">Ver cifras por mes y criterios</summary>
        <p className="mt-3 text-xs leading-5 text-slate-500">Cada alumno se cuenta una vez por categoría y mes. Una vuelta después del plazo se registra como reactivación, conserva la baja anterior y no cuenta como alumno nuevo. Los totales son la suma de los meses mostrados, no alumnos únicos del periodo. Se usa el historial registrado, incluidas membresías históricas; se excluyen borradores, canceladas y obsequios. Los meses anteriores al primer registro no se muestran como cero.</p>
        <div className="mt-3 overflow-x-auto"><table className="min-w-full text-left text-xs"><caption className="sr-only">Altas y no renovaciones por mes</caption><thead><tr className="border-b text-slate-500"><th scope="col" className="py-2 pr-3">Mes</th><th scope="col" className="px-2 py-2">Nuevos</th><th scope="col" className="px-2 py-2">No renovaron</th><th scope="col" className="px-2 py-2">Reactivados</th><th scope="col" className="py-2 pl-2">En plazo</th></tr></thead><tbody>{rows.map(row => <tr key={row.month} className="border-b border-slate-100 last:border-0"><th scope="row" className="py-3 pr-3 font-medium"><span className="whitespace-nowrap">{monthLabel(row.month)}</span>{row.provisional && <span className="block text-[10px] font-normal text-amber-700">Provisional</span>}</th>{row.month < query.data.firstMonth! ? <td colSpan={4} className="px-2 py-3 text-slate-500">Sin historial</td> : <><td className="px-2 tabular-nums">{row.newStudents}</td><td className="px-2 tabular-nums">{row.notRenewed}</td><td className="px-2 tabular-nums">{row.reactivated}</td><td className="pl-2 tabular-nums">{row.pending}</td></>}</tr>)}</tbody></table></div>
      </details>
    </>}
  </section>
}
