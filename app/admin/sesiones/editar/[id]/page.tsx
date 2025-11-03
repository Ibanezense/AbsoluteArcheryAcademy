'use client'
import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import AdminGuard from '@/components/AdminGuard'
import { supabase } from '@/lib/supabaseClient'
import { toLocalDateTimeInput, fromLocalDateTimeInput } from '@/lib/utils/dateUtils'

const DISTANCES = [10, 15, 20, 30, 40, 50, 60, 70] as const
const ALLOWED_DISTANCES = new Set<number>(DISTANCES as unknown as number[])
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
        start_at: toLocalDateTimeInput(s.start_at),
        end_at: toLocalDateTimeInput(s.end_at),
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

    // 1) Guardar sesión (insert o update explícito para evitar 400 con upsert)
    const sessPayload = {
      start_at: fromLocalDateTimeInput(session.start_at),
      end_at: fromLocalDateTimeInput(session.end_at),
      status: session.status,
      capacity_children: session.capacity_children ?? 0,
      capacity_youth: session.capacity_youth ?? 0,
      capacity_adult: session.capacity_adult ?? 0,
      capacity_assigned: session.capacity_assigned ?? 0,
      capacity_ownbow: session.capacity_ownbow ?? 0,
    }

    let sret: any | null = null
    let es: any | null = null
    if (isNew) {
      // Debug: payload exacto que se enviará al INSERT
      console.log('🛰️ INSERT sessPayload:', JSON.stringify(sessPayload, null, 2))
      const { data, error } = await supabase
        .from('sessions')
        .insert(sessPayload)
        .select()
        .single()
      sret = data
      es = error
      if (error) {
        console.error('❌ Error en INSERT:', error)
      }
    } else {
      // Debug: payload exacto que se enviará al UPDATE
      console.log('🛰️ UPDATE sessPayload (id=' + id + '):', JSON.stringify(sessPayload, null, 2))
      const { data, error } = await supabase
        .from('sessions')
        .update(sessPayload)
        .eq('id', id)
        .select()
        .single()
      sret = data
      es = error
      if (error) {
        console.error('❌ Error en UPDATE:', error)
      }
    }
    if (es) {
      setSaving(false)
      alert(es.message)
      return
    }
    const sid = sret.id as string

    // 2) Upsert allocations con targets > 0
    const toUpsert = DISTANCES
      .filter((d) => (alloc[d] ?? 0) > 0)
      .map((d) => {
        const targets = Math.max(0, Math.min(8, Number(alloc[d] ?? 0)))
        return {
          session_id: sid,
          distance_m: Number(d),
          targets: targets,
        }
      })
      .filter((r) => ALLOWED_DISTANCES.has(r.distance_m) && r.targets > 0 && r.targets <= 8)

    // Log para debugging - JSON exacto que se enviará
    console.log('📊 Allocations a insertar:', JSON.stringify(toUpsert, null, 2))

    // Validación extra: asegurarse de que todo sea válido
    const invalid = toUpsert.filter(
      (r) => !ALLOWED_DISTANCES.has(r.distance_m) || r.targets < 1 || r.targets > 8
    )
    if (invalid.length) {
      console.error('❌ Asignaciones inválidas detectadas:', JSON.stringify(invalid, null, 2))
      alert('Error: Hay valores inválidos. Revisa la consola del navegador (F12).')
      setSaving(false)
      return
    }

    if (toUpsert.length === 0) {
      alert('Define al menos una paca en alguna distancia')
      setSaving(false)
      return
    }

    // Estrategia más simple: borrar todas las allocations de esta sesión y volver a insertarlas
    // Esto evita problemas con upsert y constraints
    const { error: delErr } = await supabase
      .from('session_distance_allocations')
      .delete()
      .eq('session_id', sid)
    
    if (delErr) {
      console.error('Error al limpiar allocations anteriores:', delErr)
      setSaving(false)
      alert('Error al actualizar asignaciones de distancias')
      return
    }

    // Ahora insertar las nuevas (solo las que tienen targets > 0)
    if (toUpsert.length) {
      console.log('🔄 Insertando allocations en DB...')
      const { error: insErr } = await supabase
        .from('session_distance_allocations')
        .insert(toUpsert)
      
      if (insErr) {
        setSaving(false)
        console.error('❌ Error al insertar allocations:', {
          payload: JSON.stringify(toUpsert, null, 2),
          error: insErr,
          code: insErr.code,
          details: insErr.details,
          hint: insErr.hint
        })
        alert(`Error al guardar asignaciones de distancias: ${insErr.message}\n\nRevisa la consola (F12) para más detalles.`)
        return
      }
      
      console.log('✅ Allocations guardadas correctamente')
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
                      max={8}
                      className="input w-24 text-right"
                      value={alloc[d] ?? 0}
                      onChange={(e) =>
                        setAlloc((prev) => ({
                          ...prev,
                          [d]: Math.max(0, Math.min(8, Number(e.target.value || 0))),
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
