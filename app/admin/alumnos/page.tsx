'use client'

import { useMemo, useState } from 'react'
import { useToast } from '@/components/ui/ToastProvider'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import AdminGuard from '@/components/AdminGuard'
import { useStudents, useToggleStudentActive } from '@/lib/queries/studentQueries'
import Avatar from '@/components/ui/Avatar'
import { parseDateFromSupabase } from '@/lib/utils/dateUtils'

export default function AdminAlumnos() {
  const router = useRouter()
  const [q, setQ] = useState('')
  const toast = useToast()
  
  const { data: raw = [], isLoading: loading, refetch } = useStudents()
  const toggleActiveMutation = useToggleStudentActive()

  const list = useMemo(() => {
    const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
    const needle = norm(q)
    return raw.filter(p => {
      const name = norm(p.full_name || '')
      return needle === '' || name.includes(needle)
    })
  }, [raw, q])

  async function toggleActive(id: string, currentActive: boolean | null | undefined) {
    if (typeof currentActive === 'undefined' || currentActive === null) {
      toast.push({ 
        message: 'La columna profiles.is_active no existe.\n\nEjecuta en SQL:\nALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;', 
        type: 'error' 
      })
      return
    }
    
    try {
      await toggleActiveMutation.mutateAsync({ 
        id, 
        isActive: !currentActive 
      })
      refetch()
    } catch (error: any) {
      toast.push({ message: `Error: ${error.message}`, type: 'error' })
    }
  }

  // Calcular estadísticas
  const stats = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    const activeStudents = raw.filter(p => p.is_active !== false)
    const noClasses = activeStudents.filter(p => (p.classes_remaining ?? 0) === 0).length
    const expired = activeStudents.filter(p => {
      if (!p.membership_end) return false
      // Parsear fecha correctamente desde Supabase
      const dateStr = parseDateFromSupabase(p.membership_end)
      if (!dateStr) return false
      const [year, month, day] = dateStr.split('-').map(Number)
      const membershipDate = new Date(year, month - 1, day)
      return membershipDate < today
    }).length
    
    return { noClasses, expired, total: activeStudents.length }
  }, [raw])

  return (
    <AdminGuard>
      <div className="space-y-6">
        <div className="sticky top-0 z-10 bg-bg/95 backdrop-blur border-b border-white/10 -mx-4 lg:-mx-8 px-4 lg:px-8 py-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold">Alumnos</h1>
            <div className="flex gap-3 text-xs">
              {stats.expired > 0 && (
                <span className="px-2 py-1 rounded bg-red-500/20 text-red-400 font-semibold">
                  {stats.expired} vencida{stats.expired !== 1 ? 's' : ''}
                </span>
              )}
              {stats.noClasses > 0 && (
                <span className="px-2 py-1 rounded bg-yellow-500/20 text-yellow-400 font-semibold">
                  {stats.noClasses} sin clases
                </span>
              )}
            </div>
          </div>
        </div>

        <div>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Buscar alumnos..."
            className="input w-full"
          />
        </div>

        {/* Leyenda de estados */}
        <div className="card p-3 flex flex-wrap gap-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-red-500/60 rounded"></div>
            <span className="text-textsec">Membresía vencida</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-yellow-500/60 rounded"></div>
            <span className="text-textsec">Sin clases restantes</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-white/10 rounded"></div>
            <span className="text-textsec">Normal</span>
          </div>
        </div>

        {/* Grid de tarjetas compactas de alumnos */}
        <div>
          {loading && <div className="text-textsec">Cargando…</div>}
          {!loading && list.length === 0 && <div className="text-textsec">No hay alumnos que coincidan.</div>}

          {!loading && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
              {list.map(p => {
                const name = p.full_name || '—'
                const active = p.is_active !== false
                const classesRemaining = p.classes_remaining ?? 0
                const membershipEnd = p.membership_end
                
                // Determinar estado de alerta
                const today = new Date()
                today.setHours(0, 0, 0, 0)
                
                // Parsear fecha correctamente desde Supabase
                let isExpired = false
                if (membershipEnd) {
                  const dateStr = parseDateFromSupabase(membershipEnd)
                  if (dateStr) {
                    const [year, month, day] = dateStr.split('-').map(Number)
                    const membershipDate = new Date(year, month - 1, day)
                    isExpired = membershipDate < today
                  }
                }
                
                const hasNoClasses = classesRemaining === 0 && active
                
                // Determinar color del borde
                let borderColor = 'border-white/10' // Por defecto
                if (isExpired && active) {
                  borderColor = 'border-red-500/60 shadow-red-500/20' // Membresía expirada
                } else if (hasNoClasses) {
                  borderColor = 'border-yellow-500/60 shadow-yellow-500/20' // Sin clases
                }
                
                return (
                  <Link 
                    key={p.id} 
                    href={`/admin/alumnos/${p.id}`} 
                    className={`card p-4 flex flex-col items-center text-center gap-2 hover:bg-white/5 transition-all border-2 ${borderColor}`}
                  >
                    <Avatar name={name} url={p.avatar_url} size="lg" />
                    <div className="w-full min-w-0">
                      <div className="font-medium text-sm truncate">{name}</div>
                      <div className={`text-xs mt-1 ${active ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {active ? '● Activo' : '● Inactivo'}
                      </div>
                      {classesRemaining !== undefined && (
                        <div className={`text-xs mt-1 ${hasNoClasses ? 'text-yellow-400 font-semibold' : 'text-textsec'}`}>
                          {classesRemaining} clases
                        </div>
                      )}
                      {isExpired && active && (
                        <div className="text-xs text-red-400 font-semibold mt-1">
                          ⚠ Vencida
                        </div>
                      )}
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        <Link
          href="/admin/alumnos/editar/new"
          className="fixed bottom-24 right-6 lg:right-8 h-14 w-14 rounded-full bg-accent text-black text-3xl leading-none
                     flex items-center justify-center shadow-lg hover:brightness-110 transition-all z-50"
          title="Agregar alumno"
        >
          +
        </Link>
      </div>
    </AdminGuard>
  )
}
