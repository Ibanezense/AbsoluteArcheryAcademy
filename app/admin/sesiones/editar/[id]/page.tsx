'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import { AdminPageHeader } from '@/components/admin/AdminVisualSystem'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/ToastProvider'
import { supabase } from '@/lib/supabaseClient'
import { saveAdminSessionWithAllocations, type AdminSessionAllocationInput } from '@/lib/services/adminSessionsService'
import { useAcademyLocations } from '@/lib/infrastructureQueries'
import { operationalDate } from '@/lib/utils/adminCalendar'
import { limaSessionInput, limaSessionTime, sessionSite, sessionsHref, type SessionSite } from '@/lib/utils/adminSessionPlanning'

const distances = [10, 15, 20, 30, 40, 50, 60, 70]
type SessionForm = {
  start_at: string; end_at: string; status: 'scheduled' | 'cancelled'
  notes: string; weekly_template_id: string | null; location_id: string
}
type EditorContext = { date: string; site: SessionSite; hasDate: boolean }

function defaultSession(date: string, hasDate: boolean): SessionForm {
  const now = Date.now()
  return {
    start_at: hasDate ? `${date}T16:00` : limaSessionInput(new Date(now + 60 * 60 * 1000)),
    end_at: hasDate ? `${date}T17:00` : limaSessionInput(new Date(now + 2 * 60 * 60 * 1000)),
    status: 'scheduled', notes: '', weekly_template_id: null, location_id: '',
  }
}

async function countBookings(id: string, activeOnly = false) {
  let query = supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('session_id', id)
  if (activeOnly) query = query.eq('status', 'reserved')
  const { count, error } = await query
  if (error || count === null) throw new Error('No se pudieron comprobar las reservas del turno.')
  return count
}

export default function EditarSesionPage() {
  const router = useRouter()
  const client = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const { id } = useParams<{ id: string }>()
  const isNew = id === 'new'
  const [context, setContext] = useState<EditorContext | null>(null)
  const [session, setSession] = useState<SessionForm | null>(null)
  const [original, setOriginal] = useState<SessionForm | null>(null)
  const [allocations, setAllocations] = useState<AdminSessionAllocationInput[]>([])
  const [hasHistory, setHasHistory] = useState(true)
  const [readError, setReadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const actionLock = useRef(false)
  const { data: locations = [], isLoading: locationsLoading, error: locationsError } = useAcademyLocations()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const date = operationalDate(params.get('date'))
    const hasDate = params.get('date') === date
    setContext({ date, site: sessionSite(params.get('location')), hasDate })
    if (isNew) setSession(defaultSession(date, hasDate))
  }, [isNew])

  useEffect(() => {
    if (isNew || !context || locationsLoading || locationsError) return
    let active = true
    async function load() {
      try {
        const [row, allocationRows, bookings] = await Promise.all([
          supabase.from('sessions').select('start_at,end_at,status,notes,weekly_template_id,location_id').eq('id', id).single(),
          supabase.from('session_distance_allocations').select('distance_m,slot_capacity,targets').eq('session_id', id),
          countBookings(id),
        ])
        if (row.error || allocationRows.error || !row.data) throw new Error('No se pudo cargar el turno.')
        if (!active) return
        const saved: SessionForm = {
          ...row.data, start_at: limaSessionInput(row.data.start_at), end_at: limaSessionInput(row.data.end_at), notes: row.data.notes ?? '',
        }
        setSession(saved)
        setOriginal(saved)
        setHasHistory(bookings > 0)
        setAllocations((allocationRows.data ?? []).map(item => ({
          distanceM: item.distance_m, targets: item.targets ?? 0, slotCapacity: item.slot_capacity ?? (item.targets ?? 0) * 4,
        })))
      } catch (error) {
        if (active) setReadError(error instanceof Error ? error.message : 'No se pudo cargar el turno.')
      }
    }
    void load()
    return () => { active = false }
  }, [context, id, isNew, locationsLoading, locationsError])

  const requestedLocation = isNew && context?.site !== 'all' ? locations.find(location => location.is_active && location.code === context?.site) : undefined
  const locationId = session?.location_id || requestedLocation?.id || ''
  const location = locations.find(item => item.id === locationId)
  const returnDate = context?.hasDate ? context.date : session?.start_at.slice(0, 10) || operationalDate()
  const returnHref = sessionsHref(returnDate, context?.site ?? 'all', isNew ? undefined : id)
  const cancelled = session?.status === 'cancelled'
  const distanceOptions = [...new Set([...distances, ...allocations.map(item => item.distanceM)])].sort((a, b) => a - b)

  function updateTargets(distanceM: number, raw: string) {
    const targets = Math.max(0, Math.trunc(Number(raw) || 0))
    setAllocations(current => [
      ...current.filter(item => item.distanceM !== distanceM),
      { distanceM, targets, slotCapacity: targets * 4 },
    ])
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!session || cancelled || actionLock.current) return
    const startAt = limaSessionTime(session.start_at)
    const endAt = limaSessionTime(session.end_at)
    if (!startAt || !endAt || endAt <= startAt) {
      toast.push({ message: 'Indica un inicio y fin válidos. El fin debe ser posterior al inicio.', type: 'error' })
      return
    }
    if (!locationId) {
      toast.push({ message: 'Selecciona la sede del turno.', type: 'error' })
      return
    }
    const configured = allocations.filter(item => item.targets > 0 && item.slotCapacity > 0)
    if (configured.length === 0) {
      toast.push({ message: 'Configura al menos una paca por distancia.', type: 'error' })
      return
    }

    actionLock.current = true
    setSaving(true)
    try {
      if (original && (original.start_at !== session.start_at || original.end_at !== session.end_at || original.location_id !== locationId)) {
        const affected = await countBookings(id, true)
        if (affected > 0 && !(await confirm(
          `Horario nuevo: ${session.start_at.replace('T', ' ')} → ${session.end_at.replace('T', ' ')} · hora de Lima\nSede: ${location?.name ?? ''}\nReservas que pasarán al nuevo horario o sede: ${affected}`,
          { title: 'Cambiar un turno con reservas', confirmLabel: 'Guardar cambio', tone: 'warning' },
        ))) return
      }

      await saveAdminSessionWithAllocations({
        sessionId: isNew ? null : id, startAt, endAt, status: 'scheduled',
        notes: session.notes.trim() || null, weeklyTemplateId: session.weekly_template_id,
        isManualOverride: true, locationId, allocations: configured,
      })
      await client.invalidateQueries({ queryKey: ['admin-session-calendar'] })
      toast.push({ message: 'Turno guardado.', type: 'success' })
      router.push(returnHref)
    } catch (error) {
      toast.push({ message: error instanceof Error ? error.message : 'No se pudo guardar el turno.', type: 'error' })
    } finally {
      setSaving(false)
      actionLock.current = false
    }
  }

  async function remove() {
    if (isNew || hasHistory || actionLock.current) return
    actionLock.current = true
    setSaving(true)
    try {
      if (await countBookings(id) > 0) {
        setHasHistory(true)
        throw new Error('El turno ya tiene historial y no se puede eliminar.')
      }
      if (!(await confirm('Se eliminará este turno vacío.', { title: 'Eliminar turno', confirmLabel: 'Eliminar', tone: 'danger' }))) return
      const { error } = await supabase.rpc('admin_delete_empty_session', { p_session_id: id })
      if (error) throw new Error(error.code === 'PGRST202' ? 'La eliminación de turnos vacíos aún no está habilitada en esta base.' : error.message)
      await client.invalidateQueries({ queryKey: ['admin-session-calendar'] })
      toast.push({ message: 'Turno eliminado.', type: 'success' })
      router.push(sessionsHref(returnDate, context?.site ?? 'all'))
    } catch (error) {
      toast.push({ message: error instanceof Error ? error.message : 'No se pudo eliminar el turno.', type: 'error' })
    } finally {
      setSaving(false)
      actionLock.current = false
    }
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader title={isNew ? 'Nuevo turno manual' : 'Editar turno'} eyebrow="Turnos · hora de Lima"
        actions={<Link href={returnHref} className="btn-outline btn-sm">Volver a turnos</Link>} />
      {readError || locationsError ? <p role="alert" className="card p-4 text-danger">{readError || 'No se pudieron cargar las sedes.'}</p>
        : !context || !session || locationsLoading ? <p role="status" className="card p-4">Cargando turno…</p>
          : <form onSubmit={save} className="space-y-4 rounded-2xl border border-blue-100 bg-white p-4 sm:p-5">
            <fieldset disabled={saving || cancelled} className="space-y-5">
              {cancelled && <p className="font-bold text-rose-800">Turno cancelado</p>}
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="text-sm font-bold" htmlFor="session-location">Sede</label>
                  <select id="session-location" className="input mt-1" value={locationId} onChange={event => setSession(current => current && ({ ...current, location_id: event.target.value }))} required>
                    <option value="" disabled>Selecciona una sede</option>
                    {locations.filter(item => item.is_active || item.id === locationId).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </div>
                {([['start_at', 'Inicio'], ['end_at', 'Fin']] as const).map(([key, label]) => (
                  <label key={key} className="text-sm font-bold">{label} · Lima
                    <input className="input mt-1" type="datetime-local" value={session[key]} required onChange={event => setSession(current => current && ({ ...current, [key]: event.target.value }))} />
                  </label>
                ))}
              </div>
              <section className="rounded-xl border border-blue-100 p-3 sm:p-4" aria-labelledby="allocations-title">
                <h2 id="allocations-title" className="text-base font-bold">Pacas por distancia</h2>
                <p className="mt-1 text-sm text-slate-600">Al cambiar una paca se recalcula la configuración de esa distancia. La disponibilidad operativa depende de la sede.</p>
                {location?.code === 'umacollo' && <p className="mt-2 text-sm font-semibold text-[#0758aa]">Umacollo tiene cuatro espacios físicos compartidos.</p>}
                {location?.code === 'tiabaya' && <p className="mt-2 text-sm font-semibold text-[#0758aa]">Tiabaya tiene hasta seis cupos con arco de academia. El arco propio no tiene límite fijo de sede.</p>}
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {distanceOptions.map(distance => <label key={distance} className="rounded-lg bg-slate-50 p-2 text-sm font-bold">{distance} m
                    <input className="input mt-1" type="number" min="0" step="1" value={allocations.find(item => item.distanceM === distance)?.targets ?? 0}
                      onChange={event => updateTargets(distance, event.target.value)} />
                  </label>)}
                </div>
              </section>
              <label className="block text-sm font-bold">Notas del turno
                <textarea className="input mt-1 min-h-20" value={session.notes} onChange={event => setSession(current => current && ({ ...current, notes: event.target.value }))} />
              </label>
              {session.weekly_template_id && <p className="text-xs text-slate-600">Este turno viene de una plantilla. Los cambios se guardan solo para este turno.</p>}
            </fieldset>
            <div className="flex flex-wrap items-center gap-2 border-t border-blue-100 pt-4">
              {!cancelled && <button type="submit" className="btn btn-sm" disabled={saving}>{saving ? 'Guardando…' : 'Guardar turno'}</button>}
              {!isNew && !cancelled && <Link className="btn-outline btn-sm" href={returnHref}>Gestionar cancelación en Turnos</Link>}
              {!isNew && !hasHistory && <button type="button" className="btn-outline btn-sm ml-auto border-rose-200 text-rose-800" disabled={saving} onClick={() => void remove()}>Eliminar turno vacío</button>}
            </div>
          </form>}
    </div>
  )
}
