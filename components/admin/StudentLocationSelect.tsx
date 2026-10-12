'use client'

import { useAcademyLocations } from '@/lib/infrastructureQueries'

export default function StudentLocationSelect({ value, onChange, disabled = false }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const { data: locations = [], isLoading, error } = useAcademyLocations()
  return <label className="grid gap-2 text-sm font-bold text-slate-700">Sede
    <select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled || isLoading || Boolean(error)} className="min-h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-950 outline-none focus:border-accent/50 focus:ring-4 focus:ring-orange-100 disabled:opacity-60">
      <option value="">Sin sede asignada</option>
      {value && !locations.some((location) => location.id === value) && <option value={value}>Sede actual</option>}
      {locations.filter((location) => location.is_active || location.id === value).map((location) => <option key={location.id} value={location.id}>{location.name}{!location.is_active ? ' (inactiva)' : ''}</option>)}
    </select>
    {error && <span className="text-xs font-medium text-rose-700">No se pudieron cargar las sedes.</span>}
  </label>
}
