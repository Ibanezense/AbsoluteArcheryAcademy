'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { formatAdminDate } from '@/lib/utils/adminPresentation'
import { localDashboardReadsEnabled, readLocalMemberships } from '@/lib/services/adminDashboardLocalReads'

type Followup = { student_id: string; full_name: string; end_date: string; category: 'expiring' | 'expired' }

export default function DashboardMembershipFollowups({ studentIds }: { studentIds?: ReadonlySet<string> }) {
  const query = useQuery({ queryKey: ['dashboard-membership-followups'], staleTime: 60_000, refetchInterval: 60_000, refetchOnWindowFocus: true, queryFn: async () => {
    const { data, error } = localDashboardReadsEnabled()
      ? { data: await readLocalMemberships(), error: null }
      : await supabase.rpc('admin_dashboard_membership_followups')
    if (error || !Array.isArray(data) || data.some((row: any) => !row || typeof row.student_id !== 'string' || typeof row.full_name !== 'string' || typeof row.end_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.end_date) || !['expiring','expired'].includes(row.category))) throw new Error('No se pudieron cargar las membresías.')
    return data as Followup[]
  } })
  return <section aria-labelledby="membership-followups-title" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <h2 id="membership-followups-title" className="font-heading text-xl font-bold text-slate-950">Seguimiento de membresías</h2>
    <p className="mt-1 text-sm text-slate-600">Próximos 7 días y vencidas durante los últimos 30 días</p>
    {query.isPending ? <p role="status" className="mt-4 text-sm text-slate-600">Cargando membresías…</p> : query.isError ? <div role="alert" className="mt-4 text-sm text-rose-700">No se pudieron cargar las membresías. <button className="underline" onClick={() => void query.refetch()}>Reintentar</button></div> : <div className="mt-4 grid gap-4 md:grid-cols-2">{([{ category: 'expiring', label: 'Por vencer' }, { category: 'expired', label: 'Vencidas sin renovar' }] as const).map(group => {
      const rows = (query.data ?? []).filter(row => row.category === group.category && (!studentIds || studentIds.has(row.student_id)))
      return <div key={group.category}><h3 className="text-sm font-bold text-slate-800">{group.label}</h3>{rows.length ? <ul className="mt-2 divide-y divide-slate-100">{rows.map(row => <li key={row.student_id}><Link href={`/admin/alumnos/${row.student_id}`} className="flex min-h-11 items-center justify-between gap-2 py-2 text-sm text-blue-800 hover:underline"><span>{row.full_name}</span><span className="shrink-0 text-slate-600">{formatAdminDate(row.end_date)}</span></Link></li>)}</ul> : <p className="mt-2 text-sm text-slate-600">No hay membresías en esta categoría.</p>}</div>
    })}</div>}
  </section>
}
