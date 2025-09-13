'use client'

import { useEffect, useState } from 'react'
import { useToast } from '@/components/ui/ToastProvider'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { supabase } from '@/lib/supabaseClient'
import AdminGuard from '@/components/AdminGuard'
import AdminBottomNav from '@/components/AdminBottomNav'

type Membership = {
  id: string
  name: string
  default_classes: number
  is_active: boolean
  created_at: string
}

export default function AdminMemberships() {
  const toast = useToast()
  const confirm = useConfirm()
  const [list, setList] = useState<Membership[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [classes, setClasses] = useState<number>(4)
  const [saving, setSaving] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editClasses, setEditClasses] = useState<number>(0)
  const [editActive, setEditActive] = useState<boolean>(true)

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('memberships')
      .select('*')
      .order('created_at', { ascending: false })
  setLoading(false)
  if (error) return toast.push({ message: error.message, type: 'error' })
    setList((data || []) as Membership[])
  }

  useEffect(() => { load() }, [])

  const resetForm = () => {
    setName('')
    setClasses(4)
    setShowForm(false)
  }

  const createMembership = async () => {
  if (!name.trim()) return toast.push({ message: 'Ingresa un nombre', type: 'error' })
  if (classes < 0) return toast.push({ message: 'Las clases deben ser ≥ 0', type: 'error' })
    setSaving(true)
    const { error } = await supabase
      .from('memberships')
      .insert({ name: name.trim(), default_classes: classes })
    setSaving(false)
  if (error) return toast.push({ message: error.message, type: 'error' })
    resetForm()
    await load()
  }

  const startEdit = (m: Membership) => {
    setEditingId(m.id)
    setEditName(m.name)
    setEditClasses(m.default_classes)
    setEditActive(m.is_active)
  }

  const saveEdit = async () => {
  if (!editingId) return
  if (!editName.trim()) return toast.push({ message: 'Ingresa un nombre', type: 'error' })
  if (editClasses < 0) return toast.push({ message: 'Las clases deben ser ≥ 0', type: 'error' })
    const { error } = await supabase
      .from('memberships')
      .update({
        name: editName.trim(),
        default_classes: editClasses,
        is_active: editActive,
      })
      .eq('id', editingId)
  if (error) return toast.push({ message: error.message, type: 'error' })
    setEditingId(null)
    await load()
  }

  const remove = async (id: string) => {
    if (!(await confirm('¿Eliminar esta membresía?'))) return
    const { error } = await supabase.from('memberships').delete().eq('id', id)
    if (error) return toast.push({ message: error.message, type: 'error' })
    await load()
  }

  return (
    <AdminGuard>
      <div className="min-h-screen flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-bg/95 backdrop-blur border-b border-white/10 px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold">Membresías</h1>
          <button className="btn-outline" onClick={load}>Actualizar</button>
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto px-4 pb-28">
          {/* Formulario “rápido” para crear */}
          {showForm && (
            <div className="card p-4 mt-4 grid gap-3">
              <div className="grid gap-2">
                <label className="text-sm text-textsec">Nombre de la membresía</label>
                <input className="input" value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <label className="text-sm text-textsec">Clases predeterminadas</label>
                <input
                  className="input w-32"
                  type="number"
                  min={0}
                  value={classes}
                  onChange={e => setClasses(Number(e.target.value || 0))}
                />
              </div>
              <div className="flex gap-2">
                <button className="btn" onClick={createMembership} disabled={saving}>
                  {saving ? 'Guardando…' : 'Guardar'}
                </button>
                <button className="btn-outline" onClick={() => setShowForm(false)}>Cancelar</button>
              </div>
            </div>
          )}

          {/* Lista */}
          <div className="grid gap-3 mt-4">
            {loading && <p className="text-textsec">Cargando…</p>}
            {!loading && list.length === 0 && (
              <p className="text-textsec">No hay membresías aún. Crea una con el botón “+”.</p>
            )}

            {list.map(m => (
              <div key={m.id} className="card p-4">
                {editingId === m.id ? (
                  <div className="grid gap-3">
                    <div className="grid gap-2">
                      <label className="text-sm text-textsec">Nombre</label>
                      <input className="input" value={editName} onChange={e => setEditName(e.target.value)} />
                    </div>
                    <div className="grid gap-2">
                      <label className="text-sm text-textsec">Clases predeterminadas</label>
                      <input
                        className="input w-32"
                        type="number"
                        min={0}
                        value={editClasses}
                        onChange={e => setEditClasses(Number(e.target.value || 0))}
                      />
                    </div>
                    <div className="grid gap-2">
                      <label className="text-sm text-textsec">Estado</label>
                      <select
                        className="input w-40"
                        value={String(editActive)}
                        onChange={e => setEditActive(e.target.value === 'true')}
                      >
                        <option value="true">Activa</option>
                        <option value="false">Inactiva</option>
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button className="btn" onClick={saveEdit}>Guardar cambios</button>
                      <button className="btn-outline" onClick={() => setEditingId(null)}>Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{m.name}</p>
                      <p className="text-sm text-textsec">Clases: {m.default_classes} · {m.is_active ? 'Activa' : 'Inactiva'}</p>
                    </div>
                    <div className="flex gap-2">
                      <button className="btn-outline" onClick={() => startEdit(m)}>Editar</button>
                      <button className="btn-outline" onClick={() => remove(m.id)}>Eliminar</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* FAB + */}
        {!showForm && (
          <button
            className="fixed bottom-20 right-6 h-14 w-14 rounded-full bg-accent text-black text-3xl leading-none
                       flex items-center justify-center shadow-lg hover:brightness-110"
            title="Nueva membresía"
            onClick={() => setShowForm(true)}
          >
            +
          </button>
        )}

        <AdminBottomNav active="membresias" />
      </div>
    </AdminGuard>
  )
}
