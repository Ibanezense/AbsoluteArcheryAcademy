'use client'
import { useEffect, useState } from 'react'
import { useToast } from '@/components/ui/ToastProvider'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { supabase } from '@/lib/supabaseClient'
import Link from 'next/link'
import AppContainer from '@/components/AppContainer'

type Row = {
  booking_id: string
  status: 'reserved' | 'cancelled' | 'attended' | 'no_show'
  group_type: 'children' | 'youth' | 'adult' | 'assigned' | 'ownbow' | null
  distance_m: number | null
  start_at: string
  end_at: string
}

function labelGroup(g?: Row['group_type']) {
  switch (g) {
    case 'children': return 'Niños (8–12)'
    case 'youth': return 'Jóvenes (13–17)'
    case 'adult': return 'Adultos'
    case 'assigned': return 'Arco asignado'
    case 'ownbow': return 'Arco propio'
    default: return '—'
  }
}

const statusStyle: Record<Row['status'], {label:string, card:string, badge:string}> = {
  reserved:  {
    label: 'Reservada',
    card:  'border-l-4 border-accent bg-gray-900/50',
    badge: 'bg-accent/15 text-black border border-accent/30'
  },
  cancelled: {
    label: 'Cancelada',
    card:  'border-l-4 border-danger bg-danger/5',
    badge: 'bg-danger/15 text-danger border border-danger/30'
  },
  attended:  {
    label: 'Asistió',
    card:  'border-l-4 border-success bg-success/5',
    badge: 'bg-success/15 text-success border border-success/30'
  },
  no_show:   {
    label: 'No-show',
    card:  'border-l-4 border-warning bg-warning/5',
    badge: 'bg-warning/15 text-warning border border-warning/30'
  },
}

export default function MisReservasPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const toast = useToast()
  const confirm = useConfirm()

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
  if (!user) { window.location.href = '/login'; return }
  const { data, error } = await supabase.from('user_booking_history').select('*')
  if (error) { toast.push({ message: error.message, type: 'error' }); return }
      setRows((data || []) as any)
      setLoading(false)
    })()
  }, [])

  const cancelar = async (id: string) => {
    if (!(await confirm('¿Cancelar esta reserva?'))) return
    const { error } = await supabase.rpc('cancel_booking', { p_booking: id })
    if (error) { toast.push({ message: error.message, type: 'error' }) }
    else { toast.push({ message: 'Reserva cancelada', type: 'success' }); location.reload() }
  }

  if (loading) return <div className="p-5">Cargando…</div>

  return (
    <AppContainer title="Mis reservas">
      <div className="p-5 space-y-4">
        <h1 className="text-lg font-semibold">Mis reservas</h1>

        {rows.length === 0 && <p className="text-textsec text-sm">Aún no tienes reservas.</p>}

        <div className="grid gap-3">
          {rows.map(r => {
            const st = statusStyle[r.status]
            const start = new Date(r.start_at)
            const end = new Date(r.end_at)
            const futura = start.getTime() > Date.now()
            const cancelable = r.status === 'reserved' && futura
            return (
              <div key={r.booking_id} className={`card p-4 ${st.card}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {start.toLocaleDateString()} · {start.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                      {' – '}
                      {end.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                    </p>
                    <p className="text-sm text-textsec">
                      {labelGroup(r.group_type)}{r.distance_m ? ` · ${r.distance_m} m` : ''}
                    </p>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${st.badge}`}>
                    {st.label}
                  </span>
                </div>

                <div className="mt-3 flex gap-2">
                  <Link className="btn-outline" href={`/reserva/${r.booking_id}`}>Ver</Link>
                  {cancelable && (
                    <button className="btn-outline" onClick={() => cancelar(r.booking_id)}>Cancelar</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </AppContainer>
  )
}
