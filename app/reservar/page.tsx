'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'



type Profile = {
  group_type: 'children'|'youth'|'adult'|'assigned'|'ownbow'|null
  has_own_bow: boolean
  assigned_bow: boolean
  current_distance: number | null
}

type SessionRow = {
  id: string
  start_at: string
  end_at: string
  status: 'scheduled' | 'cancelled'
  // capacidades y spots por grupo (desde la view sessions_with_availability)
  capacity_children: number
  capacity_youth: number
  capacity_adult: number
  capacity_assigned: number
  capacity_ownbow: number
  spots_children: number
  spots_youth: number
  spots_adult: number
  spots_assigned: number
  spots_ownbow: number
}

type DistRow = {
  session_id: string
  distance_m: number
  spots_distance: number
}

function sameYMD(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth()+1, 0) }
function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth()+n, 1) }
function toISOStart(d: Date) { const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 0,0,0)); return x.toISOString() }
function toISOEnd(d: Date) { const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 23,59,59)); return x.toISOString() }

export default function ReservarPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [month, setMonth] = useState<Date>(startOfMonth(new Date()))
  const [selected, setSelected] = useState<Date>(new Date())
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [distSpots, setDistSpots] = useState<Record<string, number>>({}) // session_id -> spots para la distancia del alumno
  const [loading, setLoading] = useState(true)
  const today = new Date()

  // 1) Cargar perfil y sesiones del mes
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }

      // perfil
      const { data: p, error: e1 } = await supabase
        .from('profiles')
        .select('group_type, has_own_bow, assigned_bow, current_distance')
        .eq('id', user.id)
        .single()
      if (e1) { alert(e1.message); return }
      const prof = p as Profile
      setProfile(prof)

      // sesiones del mes (view con status y spots por grupo)
      const mStart = startOfMonth(month)
      const mEnd = endOfMonth(month)
      const { data: s, error: e2 } = await supabase
        .from('sessions_with_availability')
        .select('*')
        .gte('start_at', toISOStart(mStart))
        .lte('start_at', toISOEnd(mEnd))
        .order('start_at', { ascending: true })
      if (e2) { alert(e2.message); return }
      setSessions((s || []) as SessionRow[])

      // spots por distancia SOLO para la distancia del alumno
      if (prof?.current_distance) {
        const { data: dists, error: e3 } = await supabase
          .from('session_distance_availability')
          .select('session_id,distance_m,spots_distance')
          .eq('distance_m', prof.current_distance)
          .gte('start_at', toISOStart(mStart))
          .lte('start_at', toISOEnd(mEnd))
        if (e3) { alert(e3.message); return }
        const map: Record<string, number> = {}
        ;(dists || []).forEach((r: any) => { map[r.session_id] = r.spots_distance })
        setDistSpots(map)
      } else {
        setDistSpots({})
      }

      setLoading(false)
    })()
  }, [month, router])

  // 2) Mapa de días: para colorear el calendario
  const dayInfo = useMemo(() => {
    const info: Record<string, {scheduled:number, cancelled:number}> = {}
    sessions.forEach(s => {
      const d = new Date(s.start_at)
      const key = d.toISOString().slice(0,10)
      if (!info[key]) info[key] = { scheduled:0, cancelled:0 }
      if (s.status === 'scheduled') info[key].scheduled++
      else info[key].cancelled++
    })
    return info
  }, [sessions])

  // 3) Sesiones del día seleccionado
  const sessionsOfSelected = useMemo(() => {
    return sessions.filter(s => sameYMD(new Date(s.start_at), selected))
  }, [sessions, selected])

  // 4) Cálculo de cupos para ESTE usuario (grupo + distancia)
  function spotsForUser(s: SessionRow): number {
    if (!profile) return 0
    let groupSpots = 0
    if (profile.has_own_bow) groupSpots = s.spots_ownbow
    else if (profile.assigned_bow) groupSpots = s.spots_assigned
    else {
      switch (profile.group_type) {
        case 'children': groupSpots = s.spots_children; break
        case 'youth': groupSpots = s.spots_youth; break
        case 'adult': groupSpots = s.spots_adult; break
        case 'ownbow': groupSpots = s.spots_ownbow; break
        case 'assigned': groupSpots = s.spots_assigned; break
        default: groupSpots = 0
      }
    }
    const dist = profile.current_distance ?? null
    const distSp = dist ? (distSpots[s.id] ?? Infinity) : Infinity
    // cupo real = mínimo entre cupo de su grupo y cupo de su distancia
    return Math.min(groupSpots, distSp)
  }

  async function reservar(sessionId: string) {
    const { data, error } = await supabase.rpc('book_session', { p_session: sessionId })
    if (error) { alert(error.message); return }
    router.push(`/reserva/${data.id}`)
  }

  // construir calendario (6 filas × 7 columnas)
  const first = startOfMonth(month)
  const last = endOfMonth(month)
  const firstWeekday = new Date(first).getDay() // 0=Dom
  const grid: Date[] = []
  // días del mes anterior para completar inicio
  for (let i = 0; i < firstWeekday; i++) {
    const d = new Date(first)
    d.setDate(d.getDate() - (firstWeekday - i))
    grid.push(d)
  }
  // días del mes actual
  for (let d = 1; d <= last.getDate(); d++) grid.push(new Date(month.getFullYear(), month.getMonth(), d))
  // completar hasta 42
  while (grid.length < 42) {
    const d = new Date(grid[grid.length-1])
    d.setDate(d.getDate() + 1)
    grid.push(d)
  }

  if (loading) return <div className="p-5">Cargando…</div>

  const monthName = month.toLocaleDateString('es', { month: 'long', year: 'numeric' })

  return (
    <div className="p-5 space-y-5">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Reservar Clase</h1>
        <div className="flex gap-2">
          <button className="btn-outline" onClick={() => setMonth(addMonths(month, -1))}>◀</button>
          <button className="btn-outline" onClick={() => setMonth(addMonths(month, 1))}>▶</button>
        </div>
      </header>

      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="font-medium capitalize">{monthName}</span>
        </div>

        <div className="grid grid-cols-7 text-center text-xs text-textsec mb-2">
          <div>D</div><div>L</div><div>M</div><div>M</div><div>J</div><div>V</div><div>S</div>
        </div>

        <div className="grid grid-cols-7 gap-2">
          {grid.map((d, idx) => {
            const inMonth = d.getMonth() === month.getMonth()
            const key = d.toISOString().slice(0,10)
            const info = dayInfo[key]
            const isToday = sameYMD(d, today)
            const isSelected = sameYMD(d, selected)

            let bg = 'bg-card'
            let ring = ''
            let text = inMonth ? 'text-textpri' : 'text-textsec/40'
            if (inMonth && info?.cancelled && !info?.scheduled) {
              bg = 'bg-danger/20'
            } else if (inMonth && info?.scheduled) {
              bg = 'bg-info/20'
            }
            if (isToday) {
              ring = 'ring-2 ring-accent'
            }
            if (isSelected) {
              ring = 'ring-2 ring-white/30'
            }

            return (
              <button
                key={idx}
                onClick={() => setSelected(d)}
                className={`h-10 grid place-items-center rounded-xl ${bg} ${text} ${ring}`}
              >
                {d.getDate()}
              </button>
            )
          })}
        </div>

        <div className="mt-3 flex gap-3 text-xs text-textsec">
          <span className="inline-flex items-center gap-1"><i className="h-3 w-3 rounded bg-accent/80 inline-block"></i> Hoy</span>
          <span className="inline-flex items-center gap-1"><i className="h-3 w-3 rounded bg-info/80 inline-block"></i> Con turnos</span>
          <span className="inline-flex items-center gap-1"><i className="h-3 w-3 rounded bg-danger/70 inline-block"></i> Cancelado</span>
        </div>
      </div>

      <section>
        <h2 className="font-medium mb-2">Horarios disponibles</h2>
        <div className="grid gap-3">
          {sessionsOfSelected.length === 0 && (
            <div className="text-sm text-textsec">No hay turnos para este día.</div>
          )}

          {sessionsOfSelected.map(s => {
            const start = new Date(s.start_at)
            const end = new Date(s.end_at)
            const spots = spotsForUser(s)
            const isPast = start.getTime() <= Date.now()
            const disabled = s.status !== 'scheduled' || spots <= 0 || isPast

            return (
              <div key={s.id} className="card p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium">
                    {start.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                    {' – '}
                    {end.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                  </p>
                  <p className={`text-sm ${spots>0 ? 'text-success' : 'text-textsec'}`}>
                    {s.status === 'cancelled' ? 'Cancelado' :
                      spots > 0 ? `${spots} ${spots===1?'cupo':'cupos'} disponibles` : 'Completo'}
                  </p>
                </div>
                <button
                  className={`btn ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
                  onClick={() => reservar(s.id)}
                >
                  Reservar
                </button>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
