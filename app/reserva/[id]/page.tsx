'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/ToastProvider'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { supabase } from '@/lib/supabaseClient'
import { useStudentContext } from '@/lib/hooks/useStudentContext'

type BookingDetail = {
  booking_id: string
  student_id: string
  status: 'reserved' | 'cancelled' | 'attended' | 'no_show'
  start_at: string
  end_at: string
  distance_m: number | null
  group_type: string | null
  bow_usage_type: 'shared_inventory' | 'assigned' | 'own' | null
  bow_poundage: number | null
}

export default function ReservaConfirm() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const toast = useToast()
  const confirm = useConfirm()
  const { account, activeStudent } = useStudentContext()
  const [data, setData] = useState<BookingDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)

  useEffect(() => {
    const loadDetail = async () => {
      try {
        setLoading(true)
        const { data: detailData, error } = await supabase.rpc('get_booking_detail', {
          p_booking_id: id,
        })

        if (error) {
          throw error
        }

        setData((detailData?.[0] || null) as BookingDetail | null)
      } catch (loadError: any) {
        toast.push({ message: loadError?.message || 'No se pudo cargar la reserva.', type: 'error' })
      } finally {
        setLoading(false)
      }
    }

    loadDetail()
  }, [id, toast])

  if (loading || !data) {
    return <div className="p-5">Cargando...</div>
  }

  const start = new Date(data.start_at)
  const end = new Date(data.end_at)
  const canCancel = data.status === 'reserved' && start.getTime() > Date.now() + (4 * 60 * 60 * 1000)
  const usageLabel =
    data.bow_usage_type === 'own' || data.group_type === 'ownbow'
      ? 'Arco propio'
      : data.bow_usage_type === 'assigned' || data.group_type === 'assigned'
        ? 'Arco asignado'
        : data.bow_poundage
          ? `Arco academia ${data.bow_poundage} lb`
          : 'Arco academia'

  const cancelar = async () => {
    if (!(await confirm('¿Seguro que deseas cancelar esta reserva?'))) return

    setWorking(true)
    const { data: cancelData, error } = await supabase.rpc('cancel_booking', { p_booking: data.booking_id })
    setWorking(false)

    if (error) {
      toast.push({ message: error.message, type: 'error' })
      return
    }

    setData({
      booking_id: cancelData.id,
      student_id: cancelData.student_id,
      status: cancelData.status,
      start_at: data.start_at,
      end_at: data.end_at,
      distance_m: data.distance_m,
      group_type: data.group_type,
      bow_usage_type: data.bow_usage_type,
      bow_poundage: data.bow_poundage,
    })

    toast.push({ message: 'Reserva cancelada.', type: 'success' })
  }

  return (
    <div className="p-5 space-y-6">
      {account?.role === 'guardian' && activeStudent && (
        <div className="card p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-textsec">Reserva de</p>
            <p className="font-medium">{activeStudent.full_name}</p>
          </div>
          <Link href="/hub" className="btn-outline">
            Cambiar
          </Link>
        </div>
      )}

      <header>
        <h1 className="text-lg font-semibold">
          {data.status === 'reserved' ? 'Reserva confirmada' : 'Estado de reserva'}
        </h1>
      </header>

      <div className="card p-5">
        <div className={`h-10 w-10 grid place-items-center rounded-full mb-2 ${data.status === 'reserved' ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
          {data.status === 'reserved' ? 'OK' : 'X'}
        </div>

        <h2 className="text-xl font-semibold mb-4">
          {data.status === 'reserved' ? 'La clase esta reservada' : 'La reserva ya no esta activa'}
        </h2>

        <div className="grid gap-3 text-sm">
          <div className="card p-3">
            <p className="text-textsec">Fecha</p>
            <p className="font-medium">{start.toLocaleDateString()}</p>
          </div>
          <div className="card p-3">
            <p className="text-textsec">Hora</p>
            <p className="font-medium">
              {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              {' - '}
              {end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          <div className="card p-3">
            <p className="text-textsec">Distancia</p>
            <p className="font-medium">{data.distance_m ? `${data.distance_m} m` : '-'}</p>
          </div>
          <div className="card p-3">
            <p className="text-textsec">Equipo</p>
            <p className="font-medium">{usageLabel}</p>
          </div>
        </div>

        <div className="mt-4 grid gap-3">
          {canCancel && (
            <button className="btn-outline w-full" disabled={working} onClick={cancelar}>
              {working ? 'Cancelando...' : 'Cancelar reserva'}
            </button>
          )}
          <Link className="btn w-full" href="/">
            Volver al panel
          </Link>
          <Link className="btn-outline w-full" href="/reservar">
            Ver calendario
          </Link>
        </div>

        <p className="mt-4 text-xs text-textsec">
          Las cancelaciones desde la app solo estan permitidas hasta 4 horas antes del inicio de la clase.
        </p>
      </div>
    </div>
  )
}
