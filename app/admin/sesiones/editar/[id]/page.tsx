'use client'
import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import AdminGuard from '@/components/AdminGuard'
import { supabase } from '@/lib/supabaseClient'

const DISTANCES = [10, 15, 20, 30, 40, 50, 60, 70] as const
type Dist = typeof DISTANCES[number]

type Session = {
  id?: string
  start_at: string
  end_at: string
  status: 'scheduled' | 'cancelled'
  capacity_children: number
  capacity_youth: number
  capacity_adult: number
  capacity_assigned: number
  capacity_ownbow: number
}

type Allocation = { session_id?: string; distance_m: Dist; targets: number }

export default function EditarSesion() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const isNew = id === 'new'

  const [session, setSession] = useState<Session>({
    start_at: new Date(Date.now() + 3600e3).toISOString().slice(0, 16), // yyyy-mm-ddThh:mm
    end_at: new Date(Date.now() + 2 * 3600e3).toISOString().slice(0, 16),
    status: 'scheduled',
    capacity_children: 2,
    capacity_youth: 4,
    capacity_adult: 6,
    capacity_assigned: 3,
    capacity_ownbow: 17,
  })
  const [alloc, setAlloc] = useState<Record<Dist, number>>(
    Object.fromEntries(DISTANCES.map((d) => [d, 0])) as Record<Dist, number>
  )
  const [saving, setSaving] = useState(false)

  // Cargar datos si es edición
  useEffect(() => {
    ;(async () => {
      if (isNew) return
      const { data: s, error: e1 } = await supabase
        .from('sessions')
        .select('*')
        .eq('id', id)
        .single()
      if (e1) {
        alert(e1.message)
        return
      }
      setSession({
        ...s,
        start_at: new Date(s.start_at).toISOString().slice(0, 16),
        end_at: new Date(s.end_at).toISOString().slice(0, 16),
      })
      const { data: a, error: e2 } = await supabase
        .from('session_distance_allocations')
        .select('distance_m, targets')
        .eq('session_id', id)
      if (e2) {
        alert(e2.message)
        return
      }
      const map: any = Object.fromEntries(DISTANCES.map((d) => [d, 0]))
      ;(a || []).forEach((r: any) => {
        map[r.distance_m] = r.targets
      })
      setAlloc(map)
    })()
  }, [id, isNew])

  const totalCap = useMemo(
    () =>
      (session.capacity_children ?? 0) +
      (session.capacity_youth ?? 0) +
      (session.capacity_adult ?? 0) +
      (session.capacity_assigned ?? 0) +
      (session.capacity_ownbow ?? 0),
    [session]
  )

  const save = async () => {
    // Validaciones
    if (totalCap > 32) {
      alert('La suma de cupos no puede superar 32')
      return
    }
    const start = new Date(session.start_at),
      end = new Date(session.end_at)
    if (end <= start) {
      alert('La hora de fin debe ser posterior a la de inicio')
      return
    }
    if (Object.values(alloc).reduce((a, b) => a + b, 0) === 0) {
      alert('Define al menos una paca en alguna distancia')
      return
    }

    setSaving(true)

    // 1) Upsert session
    const sessPayload = {
      id: isNew ? undefined : id,
      start_at: new Date(session.start_at).toISOString(),
      end_at: new Date(session.end_at).toISOString(),
      status: session.status,
      capacity_children: session.capacity_children ?? 0,
      capacity_youth: session.capacity_youth ?? 0,
      capacity_adult: session.capacity_adult ?? 0,
      capacity_assigned: session.capacity_assigned ?? 0,
      capacity_ownbow: session.capacity_ownbow ?? 0,
    }

    const { data: sret, error: es } = await supabase
      .from('sessions')
      .upsert(sessPayload, { onConflict: 'id' })
      .select()
      .single()
    if (es) {
      setSaving(false)
      alert(es.message)
      return
    }
    const sid = sret.id as string

    // 2) Upsert allocations con targets > 0
    const toUpsert = DISTANCES.filter((d) => (alloc[d] ?? 0) > 0).map((d) => ({
      session_id: sid,
      distance_m: d,
      targets: alloc[d] ?? 0,
    }))

    if (toUpsert.length) {
      const { error: ea } = await supabase
        .from('session_distance_allocations')
        .upsert(toUpsert, { onConflict: 'session_id,distance_m' })
      if (ea) {
        setSaving(false)
        alert(ea.message)
        return
      }
    }

    // 3) Borrar allocations que quedaron en 0
    const zeros = DISTANCES.filter((d) => (alloc[d] ?? 0) === 0)
    if (zeros.length) {
      const { error: ed } = await supabase
        .from('session_distance_allocations')
        .delete()
        .eq('session_id', sid)
        .in('distance_m', zeros as number[])
      if (ed) {
        setSaving(false)
        alert(ed.message)
        return
      }
    }

    setSaving(false)
    alert('Sesión guardada')
    location.href = '/admin/sesiones'
  }

  return (
    <AdminGuard>
      <div className="p-5 space-y-5">
        <h1 className="text-lg font-semibold">
          {isNew ? 'Nueva sesión' : 'Editar sesión'}
        </h1>

        <div className="card p-4 grid gap-4">
          <div className="grid gap-2">
            <label className="text-sm text-textsec">Inicio</label>
            <input
              type="datetime-local"
              className="input"
              value={session.start_at}
              onChange={(e) =>
                setSession((s) => ({ ...s, start_at: e.target.value }))
              }
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm text-textsec">Fin</label>
            <input
              type="datetime-local"
              className="input"
              value={session.end_at}
              onChange={(e) =>
                setSession((s) => ({ ...s, end_at: e.target.value }))
              }
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm text-textsec">Estado</label>
            <select
              className="input"
              value={session.status}
              onChange={(e) =>
                setSession((s) => ({
                  ...s,
                  status: e.target.value as Session['status'],
                }))
              }
            >
              <option value="scheduled">Programada</option>
              <option value="cancelled">Cancelada</option>
            </select>
          </div>

          {/* APILADAS: primero Cupos, luego Pacas */}
          <div className="grid grid-cols-1 gap-3">
            {/* Cupos por tipo */}
            <div className="card p-3">
              <p className="text-sm font-medium mb-2">
                Cupos por tipo (máx 32)
              </p>
              <div className="grid gap-2">
                {[
                  ['Niños', 'capacity_children'],
                  ['Jóvenes', 'capacity_youth'],
                  ['Adultos', 'capacity_adult'],
                  ['Asignados', 'capacity_assigned'],
                  ['Arco propio', 'capacity_ownbow'],
                ].map(([label, key]) => (
                  <div
                    key={key as string}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="text-sm text-textsec">{label}</span>
                    <input
                      type="number"
                      min={0}
                      className="input w-24 text-right"
                      value={(session as any)[key] ?? 0}
                      onChange={(e) =>
                        setSession((s) => ({
                          ...s,
                          [key as any]: Number(e.target.value || 0),
                        }))
                      }
                    />
                  </div>
                ))}
                <div
                  className={`text-sm ${
                    totalCap > 32 ? 'text-danger' : 'text-textsec'
                  }`}
                >
                  Total: {totalCap} / 32
                </div>
              </div>
            </div>

            {/* Pacas por distancia */}
            <div className="card p-3">
              <p className="text-sm font-medium mb-2">
                Pacas por distancia (cada paca = 4 plazas)
              </p>
              <div className="grid grid-cols-2 gap-2">
                {DISTANCES.map((d) => (
                  <div
                    key={d}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="text-sm text-textsec">{d} m</span>
                    <input
                      type="number"
                      min={0}
                      className="input w-24 text-right"
                      value={alloc[d] ?? 0}
                      onChange={(e) =>
                        setAlloc((prev) => ({
                          ...prev,
                          [d]: Number(e.target.value || 0),
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button className="btn" disabled={saving} onClick={save}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
            <button
              className="btn-outline"
              onClick={() => router.push('/admin/sesiones')}
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </AdminGuard>
  )
}
