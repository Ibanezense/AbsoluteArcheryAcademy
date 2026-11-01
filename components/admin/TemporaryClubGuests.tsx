'use client'

import { useState, type FormEvent } from 'react'
import { Pencil, Trash2, UserPlus } from 'lucide-react'
import { validateTemporaryClubGuest, type DailyClubEntryRow, type TemporaryClubGuest } from '@/lib/reports/dailyClubEntryReport'

type Props = {
  guests: TemporaryClubGuest[]
  existingRows: DailyClubEntryRow[]
  disabled: boolean
  onChange: (guests: TemporaryClubGuest[]) => void
}

export default function TemporaryClubGuests({ guests, existingRows, disabled, onChange }: Props) {
  const [name, setName] = useState('')
  const [dni, setDni] = useState('')
  const [editing, setEditing] = useState<number | null>(null)
  const [error, setError] = useState('')
  function reset() { setName(''); setDni(''); setEditing(null); setError('') }
  function submit(event: FormEvent) {
    event.preventDefault()
    if (disabled) return
    try {
      const others: DailyClubEntryRow[] = guests.filter((_, index) => index !== editing).map(guest => ({ ...guest, type: 'guest' }))
      const guest = validateTemporaryClubGuest({ name, dni }, [...existingRows, ...others])
      onChange(editing === null ? [...guests, guest] : guests.map((current, index) => index === editing ? guest : current))
      reset()
    } catch (err) { setError(err instanceof Error ? err.message : 'Revisa los datos del invitado.') }
  }
  return (
    <section aria-labelledby="temporary-guests-title" className="space-y-4 border-t border-line pt-5">
      <div>
        <h3 id="temporary-guests-title" className="flex items-center gap-2 font-semibold text-textpri"><UserPlus size={18} aria-hidden="true" />Invitados para esta descarga</h3>
        <p className="mt-1 text-sm text-textsec">Solo se incluirán en este PDF. No se guardan y se borran al descargar o cambiar de fecha o sede.</p>
      </div>
      <form onSubmit={submit} noValidate className="space-y-3">
        <div>
          <label htmlFor="guest-name" className="mb-1 block text-sm font-medium">Nombre completo del invitado</label>
          <input id="guest-name" value={name} onChange={event => setName(event.target.value)} maxLength={120} disabled={disabled} className="input min-h-11" autoComplete="off" aria-describedby={error ? 'guest-error' : undefined} />
        </div>
        <div>
          <label htmlFor="guest-dni" className="mb-1 block text-sm font-medium">DNI del invitado</label>
          <input id="guest-dni" value={dni} onChange={event => setDni(event.target.value)} inputMode="numeric" maxLength={8} disabled={disabled} className="input min-h-11" autoComplete="off" aria-describedby={error ? 'guest-error' : undefined} />
        </div>
        {error && <p id="guest-error" role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={disabled} className="btn-outline min-h-11">{editing === null ? 'Agregar invitado' : 'Guardar invitado'}</button>
          {editing !== null && <button type="button" disabled={disabled} onClick={reset} className="btn-ghost min-h-11">Cancelar edición</button>}
        </div>
      </form>
      {guests.length > 0 && <ul className="space-y-2" aria-label="Invitados temporales">
        {guests.map((guest, index) => <li key={index} className="flex items-center justify-between gap-2 rounded-xl border border-orange-200 bg-orange-50 p-3">
          <div className="min-w-0"><p className="break-words text-sm font-semibold text-textpri">{guest.name}</p><p className="text-xs text-textsec">DNI: {guest.dni}</p></div>
          <div className="flex shrink-0">
            <button type="button" aria-label={`Editar invitado ${guest.name}`} disabled={disabled} onClick={() => { setName(guest.name); setDni(guest.dni); setEditing(index); setError('') }} className="grid h-11 w-11 place-items-center rounded-lg hover:bg-white focus-visible:ring-2 focus-visible:ring-accent"><Pencil size={16} aria-hidden="true" /></button>
            <button type="button" aria-label={`Quitar invitado ${guest.name}`} disabled={disabled} onClick={() => { onChange(guests.filter((_, current) => current !== index)); reset() }} className="grid h-11 w-11 place-items-center rounded-lg text-red-700 hover:bg-white focus-visible:ring-2 focus-visible:ring-accent"><Trash2 size={16} aria-hidden="true" /></button>
          </div>
        </li>)}
      </ul>}
    </section>
  )
}
