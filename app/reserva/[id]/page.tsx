'use client'
import { useEffect, useState } from 'react'
import { useToast } from '@/components/ui/ToastProvider'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import Link from 'next/link'

type BookingDetail = {
  id: string
  status: 'reserved' | 'cancelled' | 'attended' | 'no_show'
  start_at: string
  end_at: string
  distance_m: number | null
}

export default function ReservaConfirm() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [data, setData] = useState<BookingDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const toast = useToast()
  const confirm = useConfirm()

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      const { data, error } = await supabase
        .from('booking_detail')
        .select('id,status,start_at,end_at,distance_m')
        .eq('id', id)
        .single()
  if (error) { toast.push({ message: error.message, type: 'error' }); return }
      setData(data as BookingDetail)
      setLoading(false)
    })()
  }, [id, router])

  if (loading || !data) return <div className="p-5">Cargando…</div>

  const start = new Date(data.start_at)
  const end = new Date(data.end_at)
  const canCancel = data.status === 'reserved' && start.getTime() > Date.now()

  const cancelar = async () => {
  if (!(await confirm('¿Seguro que deseas cancelar esta reserva?'))) return
    setWorking(true)
    const { data: cancelData, error } = await supabase.rpc('cancel_booking', { p_booking: data.id })
    setWorking(false)
  if (error) { toast.push({ message: error.message, type: 'error' }); return }
    setData(cancelData as any)
  toast.push({ message: 'Reserva cancelada. Si cancelaste con al menos 8 horas de anticipación, tu crédito fue devuelto.', type: 'success' })
  }

  return (
    <div className="p-5 space-y-6">
      <header><h1 className="text-lg font-semibold">
        {data.status === 'reserved' ? 'Reserva confirmada' : 'Reserva cancelada'}
      </h1></header>

      <div className="card p-5">
        <div className={`h-10 w-10 grid place-items-center rounded-full mb-2 ${data.status === 'reserved' ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
          {data.status === 'reserved' ? '✅' : '✖️'}
        </div>

        <h2 className="text-xl font-semibold mb-4">
          {data.status === 'reserved' ? '¡Tu clase está reservada!' : 'Tu reserva se canceló'}
        </h2>

        <div className="grid gap-3 text-sm">
          <div className="card p-3">
            <p className="text-textsec">Fecha</p>
            <p className="font-medium">{start.toLocaleDateString()}</p>
          </div>
          <div className="card p-3">
            <p className="text-textsec">Hora</p>
            <p className="font-medium">
              {start.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
              {' – '}
              {end.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
            </p>
          </div>
          <div className="card p-3">
            <p className="text-textsec">Distancia</p>
            <p className="font-medium">{data.distance_m ? `${data.distance_m} m` : '—'}</p>
          </div>
        </div>

        <div className="mt-4 grid gap-3">
          {canCancel && (
            <button className="btn-outline w-full" disabled={working} onClick={cancelar}>
              {working ? 'Cancelando…' : 'Cancelar reserva'}
            </button>
          )}
          <Link className="btn w-full" href="/">Volver al panel de control</Link>
          <Link className="btn-outline w-full" href="/reservar">Ver calendario</Link>
        </div>

        <p className="mt-4 text-xs text-textsec">
          Recuerda llegar 10 minutos antes para el calentamiento. Si cancelas con menos de 8 horas, el crédito se mantiene consumido.
        </p>
      </div>
    </div>
  )
}
