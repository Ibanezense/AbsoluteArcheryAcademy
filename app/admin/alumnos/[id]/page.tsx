'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import AdminGuard from '@/components/AdminGuard'
import { useToast } from '@/components/ui/ToastProvider'
import { useConfirm } from '@/components/ui/ConfirmDialog'

export default function StudentProfile({ params }: { params: { id: string } }) {
  const router = useRouter()
  const toast = useToast()
  const confirm = useConfirm()
  const [profile, setProfile] = useState<any>(null)
  const [reservas, setReservas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const id = params.id

  useEffect(() => {
    (async () => {
      setLoading(true)
      const { data: p, error: e1 } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle()
      if (e1) { toast.push({ message: e1.message, type: 'error' }); setLoading(false); return }
      setProfile(p)

      // reservas del alumno (historial) - consultamos la tabla bookings
      const { data: b, error: e2 } = await supabase
        .from('bookings')
        .select('id,status,distance_m,sessions(start_at,end_at)')
        .eq('user_id', id)
        .order('id', { ascending: true })

      if (e2) { toast.push({ message: e2.message, type: 'error' }); setLoading(false); return }
      setReservas((b || []).map((r: any) => ({ id: r.id, status: r.status, start_at: r.sessions?.start_at, end_at: r.sessions?.end_at, distance_m: r.distance_m })))

      setLoading(false)
    })()
  }, [id])

  if (loading) return <div className="p-5">Cargando…</div>

  if (!profile) return <div className="p-5">Perfil no encontrado</div>

  function statusBadge(status: string) {
    const cls = status === 'attended' ? 'bg-emerald-600 text-white' : status === 'no_show' ? 'bg-rose-600 text-white' : status === 'cancelled' ? 'bg-gray-500 text-white' : 'bg-yellow-500 text-black'
    const label = status === 'attended' ? 'Asistió' : status === 'no_show' ? 'No asistió' : status === 'cancelled' ? 'Cancelada' : 'Reservada'
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{label}</span>
  }

  return (
    <AdminGuard>
      <div className="min-h-screen p-4 flex justify-center bg-neutral-900">
        <div className="w-full max-w-md">
          {/* Top nav */}
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => router.back()} className="p-2 rounded-md bg-card border border-white/4">
              {/* left arrow */}
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.707 15.707a1 1 0 01-1.414 0L6.586 11l4.707-4.707a1 1 0 011.414 1.414L9.414 11l3.293 3.293a1 1 0 010 1.414z" clipRule="evenodd"/></svg>
            </button>
            <h1 className="flex-1 text-center font-semibold">Perfil</h1>
            <Link href={`/admin/alumnos/editar/${id}`} className="p-2 rounded-md bg-card border border-white/4">
              {/* edit icon */}
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 010 2.828l-9.9 9.9a1 1 0 01-.464.263l-4 1a1 1 0 01-1.213-1.213l1-4a1 1 0 01.263-.464l9.9-9.9a2 2 0 012.828 0z"/></svg>
            </Link>
          </div>

          {/* Profile top card */}
          <div className="bg-card border border-white/6 rounded-2xl p-6 relative overflow-hidden">
            <div className="absolute -top-8 right-4 w-20 h-20 rounded-lg overflow-hidden shadow-inner">
              {/* small thumbnail decorative */}
              <img src="/target-thumb.jpg" alt="diana" className="w-full h-full object-cover opacity-70" />
            </div>

            <div className="flex flex-col items-center">
              <div className="mx-auto w-28 h-28 rounded-full overflow-hidden ring-4 ring-white/6 shadow-md">
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt={profile.full_name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-white/6 grid place-items-center text-2xl font-semibold">{(profile.full_name||'A').split(' ').map((s: string)=>s[0]).slice(0,2).join('')}</div>
                )}
              </div>

              <h2 className="mt-4 text-xl font-bold">{profile.full_name}</h2>
              <p className="text-sm text-textsec mt-1">{profile.email || ''}{profile.phone ? ` · ${profile.phone}` : ''}</p>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-3">
              <div className="text-center">
                <p className="text-xs text-textsec">Clases</p>
                <p className="font-semibold">{profile.classes_remaining ?? 0}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-textsec">Inicio</p>
                <p className="font-semibold">{profile.membership_start ? new Date(profile.membership_start).toLocaleDateString() : '—'}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-textsec">Vence</p>
                <p className="font-semibold">{profile.membership_end ? new Date(profile.membership_end).toLocaleDateString() : '—'}</p>
              </div>
            </div>
          </div>

          {/* Memberships list */}
          <div className="mt-4 space-y-3">
            <div className="bg-card border border-white/6 rounded-lg p-4 flex gap-3 items-center">
              <div className="flex-1">
                <p className="text-xs text-textsec">Membresía</p>
                <p className="font-medium">{profile.membership_type || '—'}</p>
                <p className="text-sm text-textsec">Vence el {profile.membership_end ? new Date(profile.membership_end).toLocaleDateString() : '—'}</p>
              </div>
              <div className="w-20 h-20 rounded-lg overflow-hidden">
                <img src="/target-thumb.jpg" alt="thumb" className="w-full h-full object-cover" />
              </div>
            </div>

            <button className="w-full bg-card border border-white/6 rounded-lg p-3 flex items-center justify-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-textsec" viewBox="0 0 20 20" fill="currentColor"><path d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z"/></svg>
              <span className="text-sm">Añadir Membresía</span>
            </button>
          </div>

          {/* Reservations */}
          <div className="mt-6">
            <h2 className="text-lg font-semibold">Reservas</h2>
            <div className="mt-3 space-y-3">
              {reservas.length === 0 && <div className="text-textsec">No tiene reservas.</div>}
              {reservas.map(r => (
                <div key={r.id} className="bg-card border border-white/6 rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <div className="font-medium">{r.start_at ? `${new Date(r.start_at).toLocaleDateString()} · ${new Date(r.start_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}` : '—'}</div>
                    <div className="text-sm text-textsec">{r.distance_m ? `${r.distance_m} m` : '—'}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    {statusBadge(r.status)}
                    <Link className="px-4 py-2 border border-white/6 rounded-lg" href={`/reserva/${r.id}`}>Ver</Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AdminGuard>
  )
}
