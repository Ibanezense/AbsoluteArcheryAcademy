'use client'

import { useState } from 'react'
import { useToast } from '@/components/ui/ToastProvider'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { Spinner } from '@/components/ui/Spinner'
import { supabase } from '@/lib/supabaseClient'
import AdminGuard from '@/components/AdminGuard'
import { useMembershipTypes, type MembershipType } from '@/lib/hooks/useMembershipTypes'

export default function AdminMemberships() {
  const toast = useToast()
  const confirm = useConfirm()
  const { data: list, isLoading, error, refetch } = useMembershipTypes()
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [classes, setClasses] = useState<number>(4)
  const [saving, setSaving] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editClasses, setEditClasses] = useState<number>(0)
  const [editActive, setEditActive] = useState<boolean>(true)

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
    refetch()
  }

  const startEdit = (m: MembershipType) => {
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
    refetch()
  }

  const remove = async (id: string) => {
    if (!(await confirm('¿Eliminar esta membresía?'))) return
    const { error } = await supabase.from('memberships').delete().eq('id', id)
    if (error) return toast.push({ message: error.message, type: 'error' })
    refetch()
  }

  return (
    <AdminGuard>
      <div className="space-y-6">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-bg/95 backdrop-blur border-b border-white/10 -mx-4 lg:-mx-8 px-4 lg:px-8 py-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold">Membresías</h1>
            <button className="btn-outline" onClick={refetch}>Actualizar</button>
          </div>
        </div>

        {/* Estado de error */}
        {error && (
          <div className="card p-4 bg-danger/10 border-danger/20">
            <p className="text-danger text-sm">{error}</p>
          </div>
        )}

        {/* Formulario rápido para crear */}
        {showForm && (
          <div className="card p-4 grid gap-3">
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
                <button className="btn flex items-center justify-center gap-2" onClick={createMembership} disabled={saving}>
                  {saving ? (
                    <>
                      <Spinner />
                      Guardando…
                    </>
                  ) : (
                    'Guardar'
                  )}
                </button>
                <button className="btn-outline" onClick={() => setShowForm(false)}>Cancelar</button>
              </div>
            </div>
          )}

        {/* Grid de tarjetas de membresías */}
        <div>
          {isLoading && <p className="text-textsec">Cargando…</p>}
          {!isLoading && list.length === 0 && (
            <div className="card p-8 text-center">
              <p className="text-textsec mb-4">No hay membresías aún</p>
              <button className="btn" onClick={() => setShowForm(true)}>
                + Crear primera membresía
              </button>
            </div>
          )}

          {!isLoading && list.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
              {list.map(m => (
                <div key={m.id} className="card p-4 hover:bg-white/5 transition-colors">
                  {editingId === m.id ? (
                    <div className="grid gap-3">
                      <div className="grid gap-2">
                        <label className="text-xs text-textsec">Nombre</label>
                        <input className="input text-sm" value={editName} onChange={e => setEditName(e.target.value)} />
                      </div>
                      <div className="grid gap-2">
                        <label className="text-xs text-textsec">Clases</label>
                        <input
                          className="input w-full text-sm"
                          type="number"
                          min={0}
                          value={editClasses}
                          onChange={e => setEditClasses(Number(e.target.value || 0))}
                        />
                      </div>
                      <div className="grid gap-2">
                        <label className="text-xs text-textsec">Estado</label>
                        <select
                          className="input w-full text-sm"
                          value={String(editActive)}
                          onChange={e => setEditActive(e.target.value === 'true')}
                        >
                          <option value="true">Activa</option>
                          <option value="false">Inactiva</option>
                        </select>
                      </div>
                      <div className="flex gap-2">
                        <button className="btn text-xs flex-1" onClick={saveEdit}>Guardar</button>
                        <button className="btn-outline text-xs flex-1" onClick={() => setEditingId(null)}>Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <div className="text-center">
                        <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-accent/20 text-accent text-2xl font-bold mb-2">
                          {m.default_classes}
                        </div>
                        <p className="font-medium text-lg">{m.name}</p>
                        <p className="text-sm text-textsec mt-1">{m.default_classes} clases</p>
                        <span className={`inline-block mt-2 text-xs px-3 py-1 rounded-full ${
                          m.is_active ? 'bg-success/20 text-success' : 'bg-danger/20 text-danger'
                        }`}>
                          {m.is_active ? '● Activa' : '● Inactiva'}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <button className="btn-outline text-xs flex-1" onClick={() => startEdit(m)}>Editar</button>
                        <button className="btn-outline text-xs flex-1 text-danger" onClick={() => remove(m.id)}>Eliminar</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* FAB + */}
        {!showForm && (
          <button
            className="fixed bottom-24 right-6 lg:right-8 h-14 w-14 rounded-full bg-accent text-black text-3xl leading-none
                       flex items-center justify-center shadow-lg hover:brightness-110 transition-all z-50"
            title="Nueva membresía"
            onClick={() => setShowForm(true)}
          >
            +
          </button>
        )}
      </div>
    </AdminGuard>
  )
}
