'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import AppContainer from '@/components/AppContainer'
import { useToast } from '@/components/ui/ToastProvider'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { supabase } from '@/lib/supabaseClient'
import { useStudentContext } from '@/lib/hooks/useStudentContext'

type Row = {
  booking_id: string
  status: 'reserved' | 'cancelled' | 'attended' | 'no_show'
  group_type: 'children' | 'youth' | 'adult' | 'assigned' | 'ownbow' | null
  distance_m: number | null
  bow_usage_type: 'shared_inventory' | 'assigned' | 'own' | null
  bow_poundage: number | null
  start_at: string
  end_at: string
}

function labelBowUsage(row: Row) {
  if (row.bow_usage_type === 'own' || row.group_type === 'ownbow') return 'Arco propio'
  if (row.bow_usage_type === 'assigned' || row.group_type === 'assigned') return 'Arco asignado'
  if (row.bow_poundage) return `Arco academia ${row.bow_poundage} lb`
  return 'Arco academia'
}

const statusStyle: Record<Row['status'], { label: string; card: string; badge: string }> = {
  reserved: {
    label: 'Reservada',
    card: 'border-l-4 border-accent bg-gray-900/50',
    badge: 'bg-accent/15 text-black border border-accent/30',
  },
  cancelled: {
    label: 'Cancelada',
    card: 'border-l-4 border-danger bg-danger/5',
    badge: 'bg-danger/15 text-danger border border-danger/30',
  },
  attended: {
    label: 'Asistio',
    card: 'border-l-4 border-success bg-success/5',
    badge: 'bg-success/15 text-success border border-success/30',
  },
  no_show: {
    label: 'No-show',
    card: 'border-l-4 border-warning bg-warning/5',
    badge: 'bg-warning/15 text-warning border border-warning/30',
  },
}

export default function MisReservasPage() {
  const toast = useToast()
  const confirm = useConfirm()
  const { account, activeStudent, activeStudentId, loading: contextLoading } = useStudentContext()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadRows = async () => {
      if (!activeStudentId) {
        setRows([])
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        const { data, error } = await supabase.rpc('get_student_bookings', {
          p_student_id: activeStudentId,
        })

        if (error) {
          throw error
        }

        setRows((data || []) as Row[])
      } catch (loadError: any) {
        toast.push({ message: loadError?.message || 'No se pudo cargar las reservas.', type: 'error' })
      } finally {
        setLoading(false)
      }
    }

    loadRows()
  }, [activeStudentId, toast])

  const cancelar = async (id: string) => {
    if (!(await confirm('¿Cancelar esta reserva?'))) return

    const { error } = await supabase.rpc('cancel_booking', { p_booking: id })
    if (error) {
      toast.push({ message: error.message, type: 'error' })
      return
    }

    setRows(prev => prev.map(row => row.booking_id === id ? { ...row, status: 'cancelled' } : row))
    toast.push({ message: 'Reserva cancelada.', type: 'success' })
  }

  if (contextLoading || loading) {
    return <div className="p-5">Cargando...</div>
  }

  return (
    <AppContainer title="Mis reservas">
      <div className="p-5 space-y-4">
        {account?.role === 'guardian' && activeStudent && (
          <div className="card p-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-textsec">Viendo reservas de</p>
              <p className="font-medium">{activeStudent.full_name}</p>
            </div>
            <Link href="/hub" className="btn-outline">
              Cambiar
            </Link>
          </div>
        )}

        <h1 className="text-lg font-semibold">Mis reservas</h1>

        {!activeStudentId && (
          <p className="text-textsec text-sm">Selecciona un alumno antes de continuar.</p>
        )}

        {activeStudentId && rows.length === 0 && (
          <p className="text-textsec text-sm">Aun no tienes reservas.</p>
        )}

        <div className="grid gap-3">
          {rows.map(row => {
            const style = statusStyle[row.status]
            const start = new Date(row.start_at)
            const end = new Date(row.end_at)
            const cancelable = row.status === 'reserved' && start.getTime() > Date.now() + (4 * 60 * 60 * 1000)
            const editable = row.status === 'reserved' && start.getTime() > Date.now() + (12 * 60 * 60 * 1000)

            return (
              <div key={row.booking_id} className={`card p-4 ${style.card}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {start.toLocaleDateString()} · {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {' - '}
                      {end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <p className="text-sm text-textsec">
                      {labelBowUsage(row)}{row.distance_m ? ` · ${row.distance_m} m` : ''}
                    </p>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${style.badge}`}>
                    {style.label}
                  </span>
                </div>

                <div className="mt-3 flex gap-2">
                  <Link className="btn-outline" href={`/reserva/${row.booking_id}`}>
                    Ver
                  </Link>
                  {editable && (
                    <Link className="btn-outline" href={`/reserva/${row.booking_id}/editar`}>
                      Editar
                    </Link>
                  )}
                  {cancelable && (
                    <button className="btn-outline" onClick={() => cancelar(row.booking_id)}>
                      Cancelar
                    </button>
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
