'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import AdminGuard from '@/components/AdminGuard'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/ToastProvider'
import { supabase } from '@/lib/supabaseClient'
import { fromLocalDateTimeInput, toLocalDateTimeInput } from '@/lib/utils/dateUtils'

const DISTANCES = [10, 15, 20, 30, 40, 50, 60, 70] as const
type Distance = typeof DISTANCES[number]

type SessionForm = {
  start_at: string
  end_at: string
  status: 'scheduled' | 'cancelled'
  notes: string
  weekly_template_id: string | null
  is_manual_override: boolean
}

export default function EditarSesionPage() {
  const router = useRouter()
  const toast = useToast()
  const confirm = useConfirm()
  const { id } = useParams<{ id: string }>()
  const isNew = id === 'new'

  const [session, setSession] = useState<SessionForm>({
    start_at: new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16),
    end_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().slice(0, 16),
    status: 'scheduled',
    notes: '',
    weekly_template_id: null,
    is_manual_override: true,
  })
  const [distanceCaps, setDistanceCaps] = useState<Record<Distance, number>>(
    Object.fromEntries(DISTANCES.map((distance) => [distance, 0])) as Record<Distance, number>
  )
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const loadSession = async () => {
      if (isNew) return

      try {
        setLoading(true)

        const { data: sessionRow, error: sessionError } = await supabase
          .from('sessions')
          .select('id, start_at, end_at, status, notes, weekly_template_id, is_manual_override')
          .eq('id', id)
          .single()

        if (sessionError) {
          throw sessionError
        }

        setSession({
          start_at: toLocalDateTimeInput(sessionRow.start_at),
          end_at: toLocalDateTimeInput(sessionRow.end_at),
          status: sessionRow.status,
          notes: sessionRow.notes || '',
          weekly_template_id: sessionRow.weekly_template_id,
          is_manual_override: sessionRow.is_manual_override ?? true,
        })

        const { data: allocationRows, error: allocationsError } = await supabase
          .from('session_distance_allocations')
          .select('distance_m, slot_capacity, targets')
          .eq('session_id', id)

        if (allocationsError) {
          throw allocationsError
        }

        const nextCaps = Object.fromEntries(DISTANCES.map((distance) => [distance, 0])) as Record<Distance, number>
          ; (allocationRows || []).forEach((allocation: any) => {
            // Cargamos targets (pacas)
            nextCaps[allocation.distance_m as Distance] = allocation.targets || 0
          })
        setDistanceCaps(nextCaps)
      } catch (loadError: any) {
        toast.push({ message: loadError?.message || 'No se pudo cargar el turno.', type: 'error' })
      } finally {
        setLoading(false)
      }
    }

    loadSession()
  }, [id, isNew]) // Removed toast to avoid any potential loops

  const totalSlots = useMemo(
    () => Object.values(distanceCaps).reduce((sum, value) => sum + (value * 4), 0),
    [distanceCaps]
  )

  const save = async () => {
    const startAt = new Date(session.start_at)
    const endAt = new Date(session.end_at)

    if (endAt <= startAt) {
      toast.push({ message: 'La hora de fin debe ser posterior a la de inicio.', type: 'error' })
      return
    }

    if (!Object.values(distanceCaps).some((value) => value > 0)) {
      toast.push({ message: 'Configura al menos un cupo por distancia.', type: 'error' })
      return
    }

    try {
      setSaving(true)

      const sessionPayload = {
        start_at: fromLocalDateTimeInput(session.start_at),
        end_at: fromLocalDateTimeInput(session.end_at),
        status: session.status,
        notes: session.notes.trim() || null,
        weekly_template_id: session.weekly_template_id,
        is_manual_override: true,
      }

      const sessionMutation = isNew
        ? await supabase.from('sessions').insert(sessionPayload).select().single()
        : await supabase.from('sessions').update(sessionPayload).eq('id', id).select().single()

      if (sessionMutation.error) {
        throw sessionMutation.error
      }

      const sessionId = sessionMutation.data.id as string

      const { error: deleteError } = await supabase
        .from('session_distance_allocations')
        .delete()
        .eq('session_id', sessionId)

      if (deleteError) {
        throw deleteError
      }

      const rows = DISTANCES
        .filter((distance) => distanceCaps[distance] > 0)
        .map((distance) => ({
          session_id: sessionId,
          distance_m: Number(distance),
          slot_capacity: Number(distanceCaps[distance]) * 4, // 4 cupos por paca
          targets: Number(distanceCaps[distance]),
        }))

      const { error: insertError } = await supabase
        .from('session_distance_allocations')
        .insert(rows)

      if (insertError) {
        throw insertError
      }

      toast.push({ message: 'Turno guardado.', type: 'success' })
      router.push('/admin/sesiones')
    } catch (saveError: any) {
      toast.push({ message: saveError?.message || 'No se pudo guardar el turno.', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const deleteSession = async () => {
    const ok = await confirm('¿Estás seguro de que deseas eliminar este turno y todas sus reservas? Esta acción no se puede deshacer.')
    if (!ok) return

    try {
      setSaving(true)
      const { error } = await supabase.rpc('admin_delete_session', {
        p_session_id: id,
      })

      if (error) {
        throw error
      }

      toast.push({ message: 'Turno eliminado.', type: 'success' })
      router.push('/admin/sesiones')
    } catch (saveError: any) {
      toast.push({ message: saveError?.message || 'No se pudo eliminar el turno.', type: 'error' })
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <AdminGuard>
        <div className="p-5">Cargando...</div>
      </AdminGuard>
    )
  }

  return (
    <AdminGuard>
      <div className="space-y-6">
        <section className="rounded-3xl border border-white/10 bg-card p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-accent">Turnos</p>
              <h1 className="mt-2 text-3xl font-bold text-textpri">
                {isNew ? 'Nuevo turno manual' : 'Editar turno'}
              </h1>
              <p className="mt-2 text-sm text-textsec">
                Define el horario y los cupos directos por distancia para esta sesion.
              </p>
            </div>
            <button className="btn-outline" onClick={() => router.push('/admin/sesiones')}>
              Volver a turnos
            </button>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="card p-5 space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-textsec">Inicio</label>
                <input
                  type="datetime-local"
                  className="input"
                  value={session.start_at}
                  onChange={(event) => setSession((current) => ({ ...current, start_at: event.target.value }))}
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-textsec">Fin</label>
                <input
                  type="datetime-local"
                  className="input"
                  value={session.end_at}
                  onChange={(event) => setSession((current) => ({ ...current, end_at: event.target.value }))}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-textsec">Estado</label>
                <select
                  className="input"
                  value={session.status}
                  onChange={(event) =>
                    setSession((current) => ({
                      ...current,
                      status: event.target.value as SessionForm['status'],
                    }))
                  }
                >
                  <option value="scheduled">Programado</option>
                  <option value="cancelled">Cancelado</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-textsec">Origen</label>
                <div className="input flex items-center">
                  {session.weekly_template_id ? 'Sesion heredada de plantilla' : 'Sesion manual'}
                </div>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-textsec">Notas</label>
              <textarea
                className="input min-h-28"
                value={session.notes}
                onChange={(event) => setSession((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Observaciones del turno"
              />
            </div>

            <div className="rounded-2xl border border-white/10 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-textpri">Pacas por distancia</h2>
                  <p className="text-sm text-textsec">
                    Define el numero de pacas (targets). Cada paca habilita 4 cupos para alumnos.
                  </p>
                </div>
                <div className="flex flex-col items-end">
                  <span className="rounded-full bg-accent/10 px-3 py-1 text-sm text-accent">
                    Total {Object.values(distanceCaps).reduce((s, v) => s + v, 0)} pacas
                  </span>
                  <span className="mt-1 text-[10px] text-textsec uppercase">({totalSlots} cupos totales)</span>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                {DISTANCES.map((distance) => (
                  <div key={distance} className="rounded-xl border border-white/5 bg-bg/60 p-3">
                    <label className="mb-2 block text-sm font-medium text-textpri">{distance} m</label>
                    <input
                      type="number"
                      min="0"
                      className="input"
                      value={distanceCaps[distance]}
                      onChange={(event) =>
                        setDistanceCaps((current) => ({
                          ...current,
                          [distance]: Math.max(0, Number(event.target.value || 0)),
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button className="btn" disabled={saving} onClick={save}>
                {saving ? 'Guardando...' : 'Guardar turno'}
              </button>
              <button className="btn-outline" onClick={() => router.push('/admin/sesiones')}>
                Cancelar
              </button>
              {!isNew && (
                <button className="btn-outline border-danger text-danger hover:bg-danger/10 ml-auto" disabled={saving} onClick={deleteSession}>
                  Eliminar turno
                </button>
              )}
            </div>
          </div>

          <div className="card p-5 space-y-4">
            <h2 className="text-lg font-semibold text-textpri">Resumen del turno</h2>
            <div className="rounded-2xl border border-white/10 bg-bg/60 p-4">
              <p className="text-sm text-textsec">Horario</p>
              <p className="mt-1 font-medium text-textpri">
                {session.start_at ? new Date(session.start_at).toLocaleString() : '-'}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-bg/60 p-4">
              <p className="text-sm text-textsec">Total de cupos</p>
              <p className="mt-1 text-2xl font-semibold text-textpri">{totalSlots}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-bg/60 p-4 text-sm text-textsec">
              Si el turno viene de una plantilla, al guardar quedara marcado como ajuste manual para no perder el cambio puntual.
            </div>
          </div>
        </div>
      </div>
    </AdminGuard>
  )
}
