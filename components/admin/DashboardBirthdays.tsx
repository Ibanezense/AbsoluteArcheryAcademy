'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import StudentBirthdayAction from './StudentBirthdayAction'
import { localDashboardReadsEnabled, readLocalBirthdays } from '@/lib/services/adminDashboardLocalReads'

type Birthday = { student_id: string; full_name: string; phone: string | null; day_offset: 0 | 1 }

export default function DashboardBirthdays({ studentIds }: { studentIds?: ReadonlySet<string> }) {
  const query = useQuery({ queryKey: ['dashboard-birthdays'], staleTime: 60_000, refetchInterval: 60_000, refetchOnWindowFocus: true, queryFn: async () => {
    const { data, error } = localDashboardReadsEnabled()
      ? { data: await readLocalBirthdays(), error: null }
      : await supabase.rpc('admin_dashboard_birthdays')
    if (error || !Array.isArray(data) || data.some((row: any) => !row || typeof row.student_id !== 'string' || typeof row.full_name !== 'string' || (row.phone !== null && typeof row.phone !== 'string') || ![0, 1].includes(row.day_offset))) throw new Error('No se pudieron cargar los cumpleaños.')
    return data as Birthday[]
  } })
  const rows = (query.data ?? []).filter(row => !studentIds || studentIds.has(row.student_id))
  return <section aria-labelledby="dashboard-birthdays-title" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <h2 id="dashboard-birthdays-title" className="font-heading text-xl font-bold text-slate-950">Cumpleaños</h2>
    <p className="mt-1 text-sm text-slate-600">Hoy y mañana · hora de Lima</p>
    {query.isPending ? <p role="status" className="mt-4 text-sm text-slate-600">Cargando cumpleaños…</p> : query.isError ? <div role="alert" className="mt-4 text-sm text-rose-700">No se pudieron cargar los cumpleaños. <button className="underline" onClick={() => void query.refetch()}>Reintentar</button></div> : !rows.length ? <p className="mt-4 text-sm text-slate-600">No hay cumpleaños registrados para hoy o mañana.</p> : <ul className="mt-3 divide-y divide-slate-100">{rows.map(row => <li key={row.student_id} className="flex flex-wrap items-center justify-between gap-2 py-3"><div><p className="font-semibold text-slate-900">{row.full_name}</p><p className="text-sm text-slate-600">{row.day_offset === 0 ? 'Hoy' : 'Mañana'}</p></div><StudentBirthdayAction studentId={row.student_id} studentName={row.full_name} phone={row.phone} /></li>)}</ul>}
  </section>
}
