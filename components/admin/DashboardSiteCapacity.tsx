'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { fetchAdminSiteCapacity } from '@/lib/services/adminSiteCapacityService'
import { localDashboardReadsEnabled, readLocalCapacity } from '@/lib/services/adminDashboardLocalReads'
import type { DashboardSite } from '@/lib/utils/adminDashboardSite'

const dateTime = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
const time = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hour12: false })

export default function DashboardSiteCapacity({ site: dashboardSite }: { site?: DashboardSite }) {
  const [localSite, setLocalSite] = useState<DashboardSite>('all')
  const site = dashboardSite ?? localSite
  const [expanded, setExpanded] = useState(false)
  const query = useQuery({
    queryKey: ['admin-dashboard-site-capacity'],
    queryFn: () => fetchAdminSiteCapacity(localDashboardReadsEnabled()
      ? { rpc: async () => ({ data: await readLocalCapacity(), error: null }) }
      : supabase),
    staleTime: 30_000,
  })
  const rows = (query.data ?? []).filter(row => site === 'all' || row.site === site)
  const visibleRows = expanded ? rows : rows.slice(0, 3)
  return <section aria-labelledby="site-capacity-title" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 id="site-capacity-title" className="font-heading text-xl font-bold text-slate-950">Cupos por horario</h2><p className="mt-1 text-sm text-slate-600">Próximos siete días · hora de Lima</p></div>
      {dashboardSite === undefined && <label className="text-sm font-medium text-slate-700">Sede <select value={site} onChange={event => { setLocalSite(event.target.value as DashboardSite); setExpanded(false) }} className="ml-2 min-h-11 rounded-lg border border-slate-300 bg-white px-3"><option value="all">Todas las sedes</option><option value="tiabaya">Tiabaya</option><option value="umacollo">Umacollo</option></select></label>}
    </div>
    {query.isPending && <p role="status" className="mt-4 text-sm text-slate-600">Cargando horarios…</p>}
    {query.isError && <div role="alert" className="mt-4 text-sm text-rose-700">No se pudo cargar la disponibilidad. <button className="underline" onClick={() => void query.refetch()}>Reintentar</button></div>}
    {!query.isPending && !query.isError && (rows.length === 0
      ? <p className="mt-4 text-sm text-slate-600">No hay turnos próximos para esta selección.</p>
      : <ul id="dashboard-capacity-rows" className="mt-3 divide-y divide-slate-100">
          {visibleRows.map(row => <li key={row.sessionId} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
            <div>
              <p className="font-semibold text-slate-900">{row.name} · {dateTime.format(new Date(row.start))} – {time.format(new Date(row.end))}</p>
              <p className="text-xs text-slate-600">{row.occupied} {row.occupied === 1 ? 'reserva' : 'reservas'} en horarios coincidentes</p>
            </div>
            <span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-800">
              {row.site === 'umacollo'
                ? `${Math.max(4 - row.occupied, 0)} de 4 espacios físicos`
                : row.unknownBowUsage
                  ? 'Uso de arco por confirmar'
                  : `Estimado: ${Math.max(6 - row.academyBowsInUse, 0)} de 6 cupos de academia`}
            </span>
          </li>)}
        </ul>)}
    <p className="mt-4 text-xs leading-5 text-slate-600">Límite operativo estimado: los horarios superpuestos se cuentan juntos. Confirma la disponibilidad y compatibilidad del arco antes de reservar. En Tiabaya, los arcos propios no tienen un límite fijo.</p>
    <div className="mt-2 flex flex-wrap items-center gap-x-4">
      {!query.isError && rows.length > 3 && <button type="button" aria-controls="dashboard-capacity-rows" aria-expanded={expanded} onClick={() => setExpanded(!expanded)} className="min-h-11 text-sm font-semibold text-blue-700 hover:underline">{expanded ? 'Ver menos horarios' : `Ver los ${rows.length} horarios`}</button>}
      <Link href="/admin/sesiones" className="inline-flex min-h-11 items-center text-sm font-semibold text-blue-700 hover:underline">Gestionar turnos</Link>
    </div>
  </section>
}
