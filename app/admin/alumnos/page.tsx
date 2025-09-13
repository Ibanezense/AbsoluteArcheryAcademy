'use client'

import { useEffect, useMemo, useState } from 'react'
import { useToast } from '@/components/ui/ToastProvider'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import AdminGuard from '@/components/AdminGuard'
import { supabase } from '@/lib/supabaseClient'
import AdminBottomNav from '@/components/AdminBottomNav'


type ProfileRow = {
  id: string
  full_name: string | null
  avatar_url?: string | null
  is_active?: boolean | null
}

export default function AdminAlumnos() {
  const router = useRouter()
  const [raw, setRaw] = useState<ProfileRow[]>([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const toast = useToast()
  const confirm = useConfirm()

  async function load() {
    setLoading(true)

    // Excluir admins
    const { data: admins, error: eA } = await supabase
      .from('admin_users')
      .select('user_id')
    if (eA) {
      toast.push({ message: `Error cargando admins: ${eA.message}`, type: 'error' })
      setLoading(false)
      return
    }
    const adminSet = new Set((admins || []).map(a => a.user_id))

    // Perfiles (hasta 500)
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('full_name', { ascending: true })
      .limit(500)

    if (error) {
      toast.push({ message: `Error cargando alumnos: ${error.message}`, type: 'error' })
      setLoading(false)
      return
    }

    const onlyStudents = (data || []).filter(p => !adminSet.has(p.id))
    setRaw(onlyStudents as ProfileRow[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const list = useMemo(() => {
    const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
    const needle = norm(q)
    return raw.filter(p => {
      const name = norm(p.full_name || '')
      return needle === '' || name.includes(needle)
    })
  }, [raw, q])

  async function toggleActive(p: ProfileRow) {
    if (!('is_active' in (p as any))) {
      toast.push({ message: 'La columna profiles.is_active no existe.\n\nEjecuta en SQL:\nALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;', type: 'error' })
      return
    }
    const want = !Boolean(p.is_active)
    const { error } = await supabase.from('profiles')
      .update({ is_active: want })
      .eq('id', p.id)
  if (error) { toast.push({ message: `No se pudo ${want ? 'activar' : 'desactivar'}: ${error.message}`, type: 'error' }); return }
    await load()
  }

  function Avatar({ name, url }: { name: string; url?: string | null }) {
    if (url) return <img src={url} alt={name} className="h-10 w-10 rounded-full object-cover" />
    const initials = name.split(' ').filter(Boolean).slice(0,2).map(s => s[0]?.toUpperCase()).join('') || 'A'
    return <div className="h-10 w-10 rounded-full bg-white/10 grid place-items-center"><span className="text-sm font-semibold">{initials}</span></div>
  }

  return (
    <AdminGuard>
      <div className="min-h-screen flex flex-col">
        <div className="sticky top-0 z-10 bg-bg/95 backdrop-blur border-b border-white/10 px-4 py-3">
          <h1 className="text-lg font-semibold">Alumnos</h1>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-28">
          <div className="mt-4">
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Buscar alumnos"
              className="input"
            />
          </div>

          <div className="mt-4 space-y-3">
            {loading && <div className="text-textsec">Cargando…</div>}
            {!loading && list.length === 0 && <div className="text-textsec">No hay alumnos que coincidan.</div>}

            {!loading && list.map(p => {
              const name = p.full_name || '—'
              const active = (p as any).is_active !== false
              return (
                <Link key={p.id} href={`/admin/alumnos/${p.id}`} className="card px-4 py-3 block">
                  <div className="flex items-center gap-3">
                    <Avatar name={name} url={p.avatar_url} />
                    <div className="flex-1">
                      <div className="font-medium">{name}</div>
                      <div className={`text-sm ${active ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {active ? 'Activo' : 'Inactivo'}
                      </div>
                    </div>
                    <div className="text-textsec text-sm">Ver perfil</div>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>

        <Link
          href="/admin/alumnos/editar/new"
          className="fixed bottom-24 right-6 h-14 w-14 rounded-full bg-accent text-black text-3xl leading-none
                     flex items-center justify-center shadow-lg hover:brightness-110"
          title="Agregar alumno"
        >
          +
        </Link>
      </div>
      <AdminBottomNav active="alumnos" />

    </AdminGuard>
  )
}
