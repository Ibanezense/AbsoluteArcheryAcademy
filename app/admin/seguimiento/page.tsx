'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { AdminPageHeader } from '@/components/admin/AdminVisualSystem'
import { supabase } from '@/lib/supabaseClient'
import { followUpWindow } from '@/lib/utils/adminFollowUp'
import { getLimaDateKey } from '@/lib/utils/membershipCycles'
import { formatAdminDate } from '@/lib/utils/adminPresentation'

type FollowUpRow = {
  id: string; student_id: string | null; intro_client_id: string | null; status: string;
  student: { full_name: string } | null; intro: { full_name: string } | null;
  session: { start_at: string; location: { name: string } | null };
}

function FollowUpContent() {
  const params = useSearchParams()
  const scope = followUpWindow(params.get('type'), getLimaDateKey())
  const [limit, setLimit] = useState(25)
  const query = useQuery({
    queryKey: ['admin-follow-up', scope.type, scope.from, scope.to],
    queryFn: async () => {
      const rows: FollowUpRow[] = []
      for (let offset = 0; ; offset += 500) {
        let request = supabase.from('bookings').select('id,student_id,intro_client_id,status,student:students(full_name),intro:intro_clients(full_name),session:sessions!inner(start_at,location:academy_locations(name))')
          .in('status', scope.statuses).gte('session.start_at', `${scope.from}T00:00:00-05:00`).lt('session.start_at', `${scope.to}T00:00:00-05:00`)
        if (scope.type === 'trial') request = request.not('intro_client_id', 'is', null)
        const { data, error } = await request.order('id').range(offset, offset + 499)
        if (error) throw error
        rows.push(...(data as unknown as FollowUpRow[]))
        if (data.length < 500) return rows.sort((a, b) => b.session.start_at.localeCompare(a.session.start_at))
      }
    },
  })
  return <div className="space-y-4">
    <AdminPageHeader title={scope.title} description={scope.type === 'trial' ? 'Últimos 30 días. Revisa si continuaron en la academia; esta lista no presupone que estén sin contactar.' : 'Inasistencias registradas durante los últimos 14 días, incluido hoy.'} actions={<Link href="/admin" className="btn-outline">Volver al inicio</Link>} />
    <p className="text-sm text-slate-600">Desde {formatAdminDate(scope.from)} · {query.data?.length ?? '—'} registros</p>
    {query.isLoading ? <p role="status">Cargando registros…</p> : query.isError ? <div role="alert" className="rounded-xl border border-rose-200 bg-white p-4"><p>No pudimos cargar los registros.</p><button className="btn-outline mt-3" onClick={() => query.refetch()}>Reintentar</button></div> : !query.data?.length ? <p className="rounded-xl border bg-white p-5">No hay registros en este periodo.</p> : <div className="divide-y rounded-xl border border-slate-200 bg-white">
      {query.data.slice(0, limit).map((row) => <article key={row.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div><h2 className="text-sm font-semibold">{row.student?.full_name || row.intro?.full_name || 'Sin nombre'}</h2><p className="mt-1 text-xs text-slate-500">{formatAdminDate(row.session.start_at)} · {row.session.location?.name || 'Sin sede'}</p></div>
        <Link className="btn-outline btn-sm" href={row.intro_client_id ? `/admin/intro?editBookingId=${row.id}` : `/admin/alumnos/${row.student_id}?tab=attendance`}>Ver registro</Link>
      </article>)}
      {limit < query.data.length && <button className="min-h-11 w-full text-sm font-semibold text-orange-800" onClick={() => setLimit(limit + 25)}>Mostrar más</button>}
    </div>}
  </div>
}

export default function FollowUpPage() { return <Suspense fallback={<p role="status">Cargando seguimiento…</p>}><FollowUpContent /></Suspense> }
