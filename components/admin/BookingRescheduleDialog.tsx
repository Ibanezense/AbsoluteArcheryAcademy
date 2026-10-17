'use client'

import { useCallback, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import IntroDialog from '@/app/admin/intro/components/IntroDialog'
import { supabase } from '@/lib/supabaseClient'
import { useAcademyLocations } from '@/lib/infrastructureQueries'
import type { StudentBookingSummary } from '@/lib/hooks/useStudentDetail'
import { adminRescheduleBooking } from '@/lib/services/adminBookingService'
import { useToast } from '@/components/ui/ToastProvider'

type MoveOption = {
  session_id: string
  start_at: string
  end_at: string
  location_id: string
  location_name: string
  available: boolean
  reason: string | null
}

const dateInLima = (value: string | Date) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date(value))
const hour = (value: string) => new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hour12: false,
}).format(new Date(value))

export default function BookingRescheduleDialog({ booking, onClose, onSaved }: {
  booking: StudentBookingSummary
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const { data: locations = [], error: locationsError } = useAcademyLocations()
  const [date, setDate] = useState(dateInLima(booking.start_at || new Date()))
  const [location, setLocation] = useState(booking.location_id || '')
  const [selected, setSelected] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const close = useCallback(() => { if (!saving) onClose() }, [saving, onClose])
  const options = useQuery({
    queryKey: ['booking-move-options', booking.id, date, location],
    enabled: Boolean(date),
    staleTime: 0,
    queryFn: async (): Promise<MoveOption[]> => {
      const { data, error } = await supabase.rpc('admin_get_booking_move_options', {
        p_booking_id: booking.id, p_date: date, p_location_id: location || null,
      })
      if (error) throw new Error(error.message)
      return ((data || []) as MoveOption[]).sort((a, b) => a.start_at.localeCompare(b.start_at) || a.location_name.localeCompare(b.location_name))
    },
  })
  const chosen = options.data?.find(option => option.session_id === selected && option.available)

  async function save() {
    if (!chosen || !booking.updated_at || saving) return
    setSaving(true)
    setSaveError('')
    try {
      await adminRescheduleBooking(supabase, {
        bookingId: booking.id, sessionId: chosen.session_id, expectedUpdatedAt: booking.updated_at,
      })
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'No se pudo cambiar el horario.')
      setSelected('')
      void options.refetch()
      setSaving(false)
      return
    }
    // The move has committed; a refresh failure must never invite a duplicate save.
    const keys = [
      ['students'], ['sessions'], ['admin-bookings'], ['admin-students'], ['upcoming_bookings'],
      ['student-dashboard'], ['intro-calendar'], ['intro-available-sessions'], ['admin-weekend-intro-capacity'],
      ['daily-club-entry-report'], ['admin-dashboard-operational'], ['booking-move-options'],
    ]
    await Promise.allSettled(keys.map(queryKey => queryClient.invalidateQueries({ queryKey })))
    try {
      await onSaved()
      toast.push({ message: 'Horario cambiado. La lista se actualizó por fecha.', type: 'success' })
    } catch {
      toast.push({ message: 'Horario cambiado. Actualiza el perfil para ver la lista.', type: 'success' })
    }
    onClose()
  }

  return <IntroDialog title="Cambiar horario de clase" onClose={close} busy={saving}>
    <div className="space-y-5 text-slate-900">
      <div className="rounded-xl bg-slate-50 p-4 text-sm">
        <p className="font-bold">Reserva actual</p>
        <p>{booking.start_at ? `${dateInLima(booking.start_at)} · ${hour(booking.start_at)}` : 'Sin horario'}{booking.location_name ? ` · ${booking.location_name}` : ''}</p>
        <p className="mt-2 text-slate-600">Se conserva la misma reserva y membresía, sin descontar otra clase.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-bold">Nueva fecha
          <input type="date" value={date} min={dateInLima(new Date())} disabled={saving} onChange={event => { setDate(event.target.value); setSelected(''); setSaveError('') }} className="min-h-12 rounded-xl border border-slate-200 px-3" />
        </label>
        <label className="grid gap-2 text-sm font-bold">Sede
          <select value={location} disabled={saving || Boolean(locationsError)} onChange={event => { setLocation(event.target.value); setSelected(''); setSaveError('') }} className="min-h-12 rounded-xl border border-slate-200 px-3">
            <option value="">Todas las sedes</option>
            {locations.filter(site => site.is_active).map(site => <option key={site.id} value={site.id}>{site.name}</option>)}
          </select>
        </label>
      </div>
      {locationsError && <p role="alert" className="text-sm text-rose-700">No se pudieron cargar las sedes.</p>}
      <fieldset disabled={saving} className="space-y-2">
        <legend className="mb-2 text-sm font-bold">Nuevo horario</legend>
        {options.isFetching ? <p role="status" className="text-sm text-slate-500">Consultando horarios y cupos…</p> : options.isError ? <div role="alert" className="text-sm text-rose-700">{options.error.message}<button type="button" onClick={() => void options.refetch()} className="ml-2 underline">Reintentar</button></div> : !options.data?.length ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No hay otros turnos para esta fecha y sede. Selecciona otra fecha o sede.</p> : options.data.map(option => <label key={option.session_id} className={`flex items-center gap-3 rounded-xl border p-3 ${!option.available ? 'border-slate-100 bg-slate-50 text-slate-400' : selected === option.session_id ? 'border-orange-400 bg-orange-50' : 'cursor-pointer border-slate-200'}`}>
          <input type="radio" name="new-session" value={option.session_id} checked={selected === option.session_id} disabled={!option.available} onChange={() => setSelected(option.session_id)} />
          <span className="text-sm"><span className="block font-bold">{hour(option.start_at)} – {hour(option.end_at)} · {option.location_name}</span><span>{option.available ? 'Disponible' : option.reason}</span></span>
        </label>)}
      </fieldset>
      {saveError && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{saveError}</p>}
      {!booking.updated_at && <p role="alert" className="text-sm text-rose-700">Actualiza el perfil antes de cambiar el horario.</p>}
      <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
        <button type="button" disabled={saving} onClick={close} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold">Cancelar</button>
        <button type="button" disabled={!chosen || !booking.updated_at || saving || options.isFetching || options.isError} onClick={() => void save()} className="rounded-xl bg-accent px-4 py-3 text-sm font-bold text-white disabled:opacity-40">{saving ? 'Guardando…' : 'Confirmar cambio'}</button>
      </div>
    </div>
  </IntroDialog>
}
