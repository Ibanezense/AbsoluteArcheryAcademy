'use client'

import { useEffect, useState } from 'react'
import { useToast } from '@/components/ui/ToastProvider'
import { useParams, useRouter } from 'next/navigation'
import AdminGuard from '@/components/AdminGuard'
import { supabase } from '@/lib/supabaseClient'
import AdminBottomNav from '@/components/AdminBottomNav'
import { parseDateFromSupabase } from '@/lib/utils/dateUtils'

type GroupType = 'children' | 'youth' | 'adult' | 'assigned' | 'ownbow'

type Profile = {
  id?: string
  full_name: string
  email?: string | null
  phone?: string | null
  group_type?: GroupType | null
  distance_m?: number | null
  is_active?: boolean | null
  classes_remaining?: number | null
  membership_type?: string | null
  membership_start?: string | null // YYYY-MM-DD
  membership_end?: string | null   // YYYY-MM-DD
  avatar_url?: string | null
}

type MembershipTemplate = {
  id: string
  name: string
  default_classes: number
  is_active: boolean
}

type ProfileMembership = {
  id: string
  membership_id: string | null
  name: string
  classes_total: number
  classes_used: number
  start_date: string
  end_date: string | null
  status: 'active' | 'expired' | 'cancelled' | 'historical'
  created_at: string
}

const GRUPOS: { value: GroupType; label: string }[] = [
  { value: 'children', label: 'Niños (8–12)' },
  { value: 'youth',    label: 'Jóvenes (13–17)' },
  { value: 'adult',    label: 'Adultos' },
  { value: 'assigned', label: 'Asignados' },
  { value: 'ownbow',   label: 'Arco propio' },
]

const DISTANCIAS = [10, 15, 20, 30, 40, 50, 60, 70] as const

export default function AlumnoEditor() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const isNew = id === 'new'

  const [form, setForm] = useState<Profile>({
    full_name: '',
    email: '',
    phone: '',
    group_type: 'adult',
    distance_m: undefined,
    is_active: true,
    classes_remaining: 0,
    membership_type: '',
    membership_start: '',
    membership_end: '',
    avatar_url: '',
  })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  // ---- Membresías (templates + del alumno) ----
  const [templates, setTemplates] = useState<MembershipTemplate[]>([])
  const [pms, setPms] = useState<ProfileMembership[]>([])
  const loadTemplates = async () => {
    const { data, error } = await supabase
      .from('memberships')
      .select('id,name,default_classes,is_active')
      .order('name', { ascending: true })
    if (!error) setTemplates((data || []) as MembershipTemplate[])
  }
  const loadProfileMemberships = async (profileId: string) => {
    const { data, error } = await supabase
      .from('profile_memberships')
      .select('*')
      .eq('profile_id', profileId)
      .order('start_date', { ascending: false })
  if (error) return toast.push({ message: error.message, type: 'error' })
    setPms((data || []) as ProfileMembership[])
  }

  // Cargar si es edición
  useEffect(() => {
    (async () => {
      await loadTemplates()
      if (isNew) return
      setLoading(true)
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', id)
        .maybeSingle()
  setLoading(false)
  if (error) return toast.push({ message: error.message, type: 'error' })
  if (!data) return toast.push({ message: 'Alumno no encontrado', type: 'error' })
      const p = data as Profile
      setForm({
        id: p.id,
        full_name: p.full_name || '',
        email: p.email || '',
        phone: p.phone || '',
        group_type: (p.group_type as GroupType) || 'adult',
        distance_m: p.distance_m ?? null,
        is_active: p.is_active ?? true,
        classes_remaining: p.classes_remaining ?? 0,
        membership_type: p.membership_type || '',
        // Parsear fechas correctamente desde Supabase para evitar problemas de timezone
        membership_start: parseDateFromSupabase(p.membership_start),
        membership_end: parseDateFromSupabase(p.membership_end),
        avatar_url: p.avatar_url || '',
      })
      await loadProfileMemberships(p.id!)
    })()
  }, [id, isNew])

  // Subir avatar a Storage (solo admin; debes tener RLS del bucket como configuraste)
  const onAvatarChange = async (file?: File) => {
    if (!file) return
    const ext = file.name.split('.').pop()
    const path = `avatars/${crypto.randomUUID()}.${ext}`
    const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    })
  if (upErr) return toast.push({ message: upErr.message, type: 'error' })
    const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
    setForm(f => ({ ...f, avatar_url: pub.publicUrl }))
  }

  // Guardar datos generales del alumno
  const save = async () => {
    if (!form.full_name.trim()) return toast.push({ message: 'Ingresa el nombre completo', type: 'error' })
    setSaving(true)
    if (isNew) {
      toast.push({ message: 'Primero crea el alumno desde “Nuevo alumno” (pantalla de listado). Luego podrás asignar membresías.', type: 'error' })
      setSaving(false)
      return
    }
    // Preparar payload - enviar fechas como strings en formato YYYY-MM-DD
    // para evitar conversiones de zona horaria
    const payload: Partial<Profile> & { membership_start?: string; membership_end?: string } = {
      full_name: form.full_name,
      email: form.email || undefined,
      phone: form.phone || undefined,
      group_type: form.group_type || undefined,
      distance_m: form.distance_m ?? undefined,
      is_active: form.is_active ?? true,
      classes_remaining: form.classes_remaining ?? 0,
      membership_type: form.membership_type || undefined,
      // Las fechas ya vienen en formato YYYY-MM-DD del input type="date"
      // Se envían como strings para que PostgreSQL las interprete como date sin conversión
      membership_start: form.membership_start || undefined,
      membership_end: form.membership_end || undefined,
      avatar_url: form.avatar_url || undefined,
    }
    const { error } = await supabase.from('profiles').update(payload).eq('id', form.id)
    setSaving(false)
  if (error) return toast.push({ message: error.message, type: 'error' })
  toast.push({ message: 'Cambios guardados', type: 'success' })
    router.push('/admin/alumnos')
  }

  // -------------------------------------------------
  // UI / lógica para AGREGAR una membresía al alumno
  // -------------------------------------------------
  const [addOpen, setAddOpen] = useState(false)
  const [addTemplateId, setAddTemplateId] = useState<string>('')
  const [addName, setAddName] = useState('')
  const [addClasses, setAddClasses] = useState<number>(0)
  const [addStart, setAddStart] = useState<string>(() => {
    const today = new Date()
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  })
  const [addEnd, setAddEnd] = useState<string>('')
  const [addActive, setAddActive] = useState(true)
  const [addAmountPaid, setAddAmountPaid] = useState<number>(0)
  const [addSaving, setAddSaving] = useState(false)

  // al elegir plantilla, copiar nombre y clases (se puede sobreescribir)
  useEffect(() => {
    const t = templates.find(x => x.id === addTemplateId)
    if (t) {
      setAddName(t.name)
      setAddClasses(t.default_classes)
    }
  }, [addTemplateId, templates])

  const addMembership = async () => {
    if (!form.id) return
  if (!addName.trim()) return toast.push({ message: 'Nombre de membresía requerido', type: 'error' })
  if (addClasses < 0) return toast.push({ message: 'Clases debe ser ≥ 0', type: 'error' })
  if (addAmountPaid < 0) return toast.push({ message: 'Monto pagado debe ser ≥ 0', type: 'error' })
    setAddSaving(true)
    const { error } = await supabase.rpc('admin_add_membership', {
      p_profile: form.id,
      p_membership: addTemplateId || undefined,
      p_name: addName.trim(),
      p_classes: addClasses,
      p_start: addStart,
      p_end: addEnd || undefined,
      p_make_active: addActive,
      p_amount_paid: addAmountPaid,
    })
  setAddSaving(false)
  if (error) return toast.push({ message: error.message, type: 'error' })
    setAddOpen(false)
    await loadProfileMemberships(form.id)
    // si la hicimos activa, refrescamos encabezado del perfil
    if (addActive) {
      setForm(f => ({ ...f,
        membership_type: addName.trim(),
        membership_start: addStart,
        membership_end: addEnd || '',
        classes_remaining: addClasses
      }))
    }
  }

  // -------------------------------------------------
  // UI / lógica para EDITAR una membresía existente
  // -------------------------------------------------
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editClasses, setEditClasses] = useState<number>(0)
  const [editStart, setEditStart] = useState<string>('')
  const [editEnd, setEditEnd] = useState<string>('')
  const [editStatus, setEditStatus] = useState<'active'|'expired'|'cancelled'|'historical'>('active')
  const [editSaving, setEditSaving] = useState(false)

  const startEdit = (pm: ProfileMembership) => {
    setEditId(pm.id)
    setEditName(pm.name)
    setEditClasses(pm.classes_total)
    // Parsear fechas correctamente desde Supabase
    setEditStart(parseDateFromSupabase(pm.start_date))
    setEditEnd(parseDateFromSupabase(pm.end_date))
    setEditStatus(pm.status)
  }

  const saveEditMembership = async () => {
    if (!editId) return
  if (!editName.trim()) return toast.push({ message: 'Nombre requerido', type: 'error' })
  if (editClasses < 0) return toast.push({ message: 'Clases debe ser ≥ 0', type: 'error' })
    setEditSaving(true)
    const { error } = await supabase.rpc('admin_update_profile_membership', {
      p_id: editId,
      p_name: editName.trim(),
      p_classes: editClasses,
      p_start: editStart,
      p_end: editEnd || undefined,
      p_status: editStatus,
    })
  setEditSaving(false)
  if (error) return toast.push({ message: error.message, type: 'error' })
    setEditId(null)
    if (form.id) await loadProfileMemberships(form.id)
    // si quedó activa, reflejar encabezado
    if (editStatus === 'active') {
      setForm(f => ({ ...f,
        membership_type: editName.trim(),
        membership_start: editStart,
        membership_end: editEnd || '',
        classes_remaining: editClasses
      }))
    }
  }

  return (
    <AdminGuard>
      <div className="min-h-screen flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-bg/95 backdrop-blur border-b border-white/10 px-4 py-3 flex items-center gap-3">
          <a href="/admin/alumnos" className="btn-ghost !px-3">←</a>
          <h1 className="text-lg font-semibold">{isNew ? 'Nuevo alumno' : 'Editar alumno'}</h1>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 pb-28">
          {loading ? (
            <div className="p-4 text-textsec">Cargando…</div>
          ) : (
            <div className="card p-4 grid gap-4 mt-4">

              {/* Avatar */}
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 rounded-full bg-white/10 overflow-hidden grid place-items-center">
                  {form.avatar_url ? (
                    <img src={form.avatar_url} className="h-full w-full object-cover" alt="avatar" />
                  ) : (
                    <span className="text-sm text-textsec">Sin foto</span>
                  )}
                </div>
                <label className="btn-outline cursor-pointer">
                  Cambiar foto
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={e => onAvatarChange(e.target.files?.[0])}
                  />
                </label>
              </div>

              {/* Nombre */}
              <div className="grid gap-2">
                <label className="text-sm text-textsec">Nombre completo</label>
                <input
                  className="input"
                  value={form.full_name}
                  onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                />
              </div>

              {/* Email */}
              <div className="grid gap-2">
                <label className="text-sm text-textsec">Correo</label>
                <input
                  className="input"
                  value={form.email || ''}
                  disabled={isNew}
                  placeholder={isNew ? 'email@dominio.com' : undefined}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                />
              </div>

              {/* Teléfono */}
              <div className="grid gap-2">
                <label className="text-sm text-textsec">Teléfono</label>
                <input
                  className="input"
                  value={form.phone || ''}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                />
              </div>

              {/* Grupo + Distancia + Estado */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="grid gap-2">
                  <label className="text-sm text-textsec">Grupo</label>
                  <select
                    className="input"
                    value={form.group_type || 'adult'}
                    onChange={e => setForm(f => ({ ...f, group_type: e.target.value as GroupType }))}
                  >
                    {GRUPOS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                  </select>
                </div>

                <div className="grid gap-2">
                  <label className="text-sm text-textsec">Distancia de práctica</label>
                  <select
                    className="input"
                    value={form.distance_m ?? ''}
                    onChange={e => setForm(f => ({ ...f, distance_m: e.target.value ? Number(e.target.value) : null }))}
                  >
                    <option value="">Sin asignar</option>
                    {DISTANCIAS.map(d => <option key={d} value={d}>{d}m</option>)}
                  </select>
                </div>

                <div className="grid gap-2">
                  <label className="text-sm text-textsec">Estado</label>
                  <select
                    className="input"
                    value={String(form.is_active ?? true)}
                    onChange={e => setForm(f => ({ ...f, is_active: e.target.value === 'true' }))}
                  >
                    <option value="true">Activo</option>
                    <option value="false">Inactivo</option>
                  </select>
                </div>
              </div>

              {/* Clases restantes (ajuste manual si hace falta) */}
              <div className="grid gap-2">
                <label className="text-sm text-textsec">Clases restantes</label>
                <input
                  type="number"
                  min={0}
                  className="input w-32"
                  value={form.classes_remaining ?? 0}
                  onChange={e => setForm(f => ({ ...f, classes_remaining: Number(e.target.value || 0) }))}
                />
              </div>

              {/* Info de membresía activa (encabezado del perfil) */}
              <div className="grid gap-2">
                <label className="text-sm text-textsec">Membresía activa (en perfil)</label>
                <input
                  className="input"
                  value={form.membership_type || ''}
                  onChange={e => setForm(f => ({ ...f, membership_type: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <label className="text-sm text-textsec">Inicio membresía</label>
                  <input
                    type="date"
                    className="input"
                    value={form.membership_start || ''}
                    onChange={e => setForm(f => ({ ...f, membership_start: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm text-textsec">Vencimiento</label>
                  <input
                    type="date"
                    className="input"
                    value={form.membership_end || ''}
                    onChange={e => setForm(f => ({ ...f, membership_end: e.target.value }))}
                  />
                </div>
              </div>

              {/* Botones generales */}
              <div className="flex gap-2">
                <button className="btn" disabled={saving} onClick={save}>
                  {saving ? 'Guardando…' : 'Guardar cambios'}
                </button>
                <button className="btn-outline" onClick={() => router.push('/admin/alumnos')}>
                  Cancelar
                </button>
              </div>

              {/* ===================== Sección: Membresías del alumno ===================== */}
              {!isNew && (
                <div className="mt-6 grid gap-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold">Membresías del alumno</h2>
                    <button className="btn-outline" onClick={() => setAddOpen(v => !v)}>
                      {addOpen ? 'Cerrar' : 'Agregar membresía'}
                    </button>
                  </div>

                  {/* Form agregar */}
                  {addOpen && (
                    <div className="card p-4 grid gap-3">
                      <div className="grid md:grid-cols-2 gap-3">
                        <div className="grid gap-2">
                          <label className="text-sm text-textsec">Plantilla (opcional)</label>
                          <select
                            className="input"
                            value={addTemplateId}
                            onChange={e => setAddTemplateId(e.target.value)}
                          >
                            <option value="">— Elegir —</option>
                            {templates.map(t => (
                              <option key={t.id} value={t.id}>
                                {t.name} · {t.default_classes} clases
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="grid gap-2">
                          <label className="text-sm text-textsec">Nombre (editable)</label>
                          <input className="input" value={addName} onChange={e => setAddName(e.target.value)} />
                        </div>
                      </div>

                      <div className="grid md:grid-cols-2 gap-3">
                        <div className="grid gap-2">
                          <label className="text-sm text-textsec">Clases otorgadas</label>
                          <input
                            className="input"
                            type="number"
                            min={0}
                            value={addClasses}
                            onChange={e => setAddClasses(Number(e.target.value || 0))}
                          />
                        </div>
                        <div className="grid gap-2">
                          <label className="text-sm text-textsec">Monto Pagado (S/.)</label>
                          <input
                            className="input"
                            type="number"
                            min={0}
                            step={1}
                            value={addAmountPaid}
                            onChange={e => setAddAmountPaid(Number(e.target.value || 0))}
                          />
                        </div>
                      </div>

                      <div className="grid md:grid-cols-2 gap-3">
                        <div className="grid gap-2">
                          <label className="text-sm text-textsec">Inicio</label>
                          <input type="date" className="input" value={addStart}
                            onChange={e => setAddStart(e.target.value)} />
                        </div>
                        <div className="grid gap-2">
                          <label className="text-sm text-textsec">Fin (opcional)</label>
                          <input type="date" className="input" value={addEnd}
                            onChange={e => setAddEnd(e.target.value)} />
                        </div>
                      </div>

                      <label className="inline-flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={addActive} onChange={e => setAddActive(e.target.checked)} />
                        Hacer esta membresía activa ahora
                      </label>

                      <div className="flex gap-2">
                        <button className="btn" onClick={addMembership} disabled={addSaving}>
                          {addSaving ? 'Guardando…' : 'Agregar'}
                        </button>
                        <button className="btn-outline" onClick={() => setAddOpen(false)}>Cancelar</button>
                      </div>
                    </div>
                  )}

                  {/* Listado */}
                  <div className="grid gap-3">
                    {pms.length === 0 && <p className="text-textsec">Sin membresías registradas.</p>}

                    {pms.map(pm => (
                      <div key={pm.id} className="card p-4">
                        {editId === pm.id ? (
                          <div className="grid gap-3">
                            <div className="grid md:grid-cols-2 gap-3">
                              <div className="grid gap-2">
                                <label className="text-sm text-textsec">Nombre</label>
                                <input className="input" value={editName} onChange={e => setEditName(e.target.value)} />
                              </div>
                              <div className="grid gap-2">
                                <label className="text-sm text-textsec">Clases otorgadas</label>
                                <input className="input" type="number" min={0} value={editClasses}
                                  onChange={e => setEditClasses(Number(e.target.value || 0))} />
                              </div>
                            </div>
                            <div className="grid md:grid-cols-3 gap-3">
                              <div className="grid gap-2">
                                <label className="text-sm text-textsec">Inicio</label>
                                <input type="date" className="input" value={editStart}
                                  onChange={e => setEditStart(e.target.value)} />
                              </div>
                              <div className="grid gap-2">
                                <label className="text-sm text-textsec">Fin</label>
                                <input type="date" className="input" value={editEnd}
                                  onChange={e => setEditEnd(e.target.value)} />
                              </div>
                              <div className="grid gap-2">
                                <label className="text-sm text-textsec">Estado</label>
                                <select className="input" value={editStatus}
                                  onChange={e => setEditStatus(e.target.value as any)}>
                                  <option value="active">Activa</option>
                                  <option value="expired">Expirada</option>
                                  <option value="cancelled">Cancelada</option>
                                  <option value="historical">Histórica</option>
                                </select>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button className="btn" onClick={saveEditMembership} disabled={editSaving}>
                                {editSaving ? 'Guardando…' : 'Guardar'}
                              </button>
                              <button className="btn-outline" onClick={() => setEditId(null)}>Cancelar</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-medium">{pm.name}</p>
                              <p className="text-sm text-textsec">
                                {pm.status === 'active' ? 'Activa' : pm.status} · Clases: {pm.classes_total}
                                {pm.start_date ? ` · ${parseDateFromSupabase(pm.start_date)}` : ''}{pm.end_date ? ` → ${parseDateFromSupabase(pm.end_date)}` : ''}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <button className="btn-outline" onClick={() => startEdit(pm)}>Editar</button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* ===================== /Sección Membresías ===================== */}
            </div>
          )}
        </div>

        </div>
      <AdminBottomNav active="alumnos" />

    </AdminGuard>
  )
}
