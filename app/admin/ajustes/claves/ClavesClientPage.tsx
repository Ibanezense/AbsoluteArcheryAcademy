'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Copy, Key, RefreshCw, Search, Pencil, Check, X } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { useToast } from '@/components/ui/ToastProvider'
import { Spinner } from '@/components/ui/Spinner'

type AccessKeyRow = {
    profile_id: string
    full_name: string | null
    role: string
    access_code: string | null
    email: string | null
    is_active: boolean
    related_student_name: string | null
}

const ROLE_LABELS: Record<string, string> = {
    admin: 'Admin',
    guardian: 'Tutor',
    student: 'Alumno',
}

const ROLE_COLORS: Record<string, string> = {
    admin: 'bg-accent/15 text-accent',
    guardian: 'bg-info/15 text-info',
    student: 'bg-success/15 text-success',
}

export default function ClavesClientPage() {
    const toast = useToast()
    const [keys, setKeys] = useState<AccessKeyRow[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [search, setSearch] = useState('')
    const [roleFilter, setRoleFilter] = useState<string>('all')

    // Estado para edición inline
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editValue, setEditValue] = useState('')
    const [saving, setSaving] = useState<string | null>(null)

    const fetchKeys = useCallback(async () => {
        try {
            setLoading(true)
            setError(null)
            const { data, error: rpcError } = await supabase.rpc('admin_list_access_keys')
            if (rpcError) throw rpcError
            setKeys((data || []) as AccessKeyRow[])
        } catch (err: any) {
            setError(err?.message || 'Error al cargar claves.')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchKeys()
    }, [fetchKeys])

    const filtered = useMemo(() => {
        return keys.filter((row) => {
            if (roleFilter !== 'all' && row.role !== roleFilter) return false
            if (search) {
                const term = search.toLowerCase()
                const matchesName = row.full_name?.toLowerCase().includes(term)
                const matchesCode = row.access_code?.toLowerCase().includes(term)
                const matchesEmail = row.email?.toLowerCase().includes(term)
                const matchesStudent = row.related_student_name?.toLowerCase().includes(term)
                if (!matchesName && !matchesCode && !matchesEmail && !matchesStudent) return false
            }
            return true
        })
    }, [keys, search, roleFilter])

    const stats = useMemo(() => {
        const total = keys.length
        const withCode = keys.filter((k) => k.access_code).length
        const withoutCode = total - withCode
        const withEmail = keys.filter((k) => k.email).length
        return { total, withCode, withoutCode, withEmail }
    }, [keys])

    async function handleCopy(code: string) {
        try {
            await navigator.clipboard.writeText(code)
            toast.push({ message: 'Clave copiada al portapapeles.', type: 'success' })
        } catch {
            toast.push({ message: 'No se pudo copiar.', type: 'error' })
        }
    }

    async function handleGenerate(profileId: string) {
        try {
            setSaving(profileId)
            const { data, error: rpcError } = await supabase.rpc('admin_generate_access_code', {
                p_profile_id: profileId,
            })
            if (rpcError) throw rpcError

            // Actualizar localmente
            setKeys((current) =>
                current.map((k) => (k.profile_id === profileId ? { ...k, access_code: data as string } : k))
            )
            toast.push({ message: `Clave generada: ${data}`, type: 'success' })
        } catch (err: any) {
            toast.push({ message: err?.message || 'Error al generar clave.', type: 'error' })
        } finally {
            setSaving(null)
        }
    }

    function startEdit(row: AccessKeyRow) {
        setEditingId(row.profile_id)
        setEditValue(row.access_code || '')
    }

    function cancelEdit() {
        setEditingId(null)
        setEditValue('')
    }

    async function handleSaveEdit(profileId: string) {
        if (!editValue.trim()) {
            toast.push({ message: 'La clave no puede estar vacia.', type: 'error' })
            return
        }

        try {
            setSaving(profileId)
            const { error: rpcError } = await supabase.rpc('admin_upsert_access_code', {
                p_profile_id: profileId,
                p_new_code: editValue.trim(),
            })
            if (rpcError) throw rpcError

            const normalized = editValue.trim().toUpperCase()
            setKeys((current) =>
                current.map((k) => (k.profile_id === profileId ? { ...k, access_code: normalized } : k))
            )
            setEditingId(null)
            setEditValue('')
            toast.push({ message: 'Clave actualizada.', type: 'success' })
        } catch (err: any) {
            toast.push({ message: err?.message || 'Error al guardar clave.', type: 'error' })
        } finally {
            setSaving(null)
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Spinner />
            </div>
        )
    }

    if (error) {
        return (
            <div className="rounded-2xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
                {error}
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Resumen */}
            <div className="grid gap-4 sm:grid-cols-4">
                <div className="card p-4">
                    <p className="text-sm text-textsec">Total perfiles</p>
                    <p className="mt-1 text-2xl font-bold text-textpri">{stats.total}</p>
                </div>
                <div className="card p-4">
                    <p className="text-sm text-textsec">Con clave</p>
                    <p className="mt-1 text-2xl font-bold text-success">{stats.withCode}</p>
                </div>
                <div className="card p-4">
                    <p className="text-sm text-textsec">Sin clave</p>
                    <p className="mt-1 text-2xl font-bold text-danger">{stats.withoutCode}</p>
                </div>
                <div className="card p-4">
                    <p className="text-sm text-textsec">Con email</p>
                    <p className="mt-1 text-2xl font-bold text-info">{stats.withEmail}</p>
                </div>
            </div>

            {/* Filtros */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-textsec" />
                    <input
                        type="text"
                        placeholder="Buscar por nombre, clave o email..."
                        className="input pl-10 text-sm"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>

                <div className="flex items-center gap-2">
                    <select
                        className="input text-sm !w-auto"
                        value={roleFilter}
                        onChange={(e) => setRoleFilter(e.target.value)}
                    >
                        <option value="all">Todos los roles</option>
                        <option value="student">Alumnos</option>
                        <option value="guardian">Tutores</option>
                        <option value="admin">Admins</option>
                    </select>

                    <button onClick={fetchKeys} className="btn-outline btn-sm" title="Recargar">
                        <RefreshCw className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {/* Tabla */}
            <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-line bg-bg/40 text-left text-xs uppercase tracking-wider text-textsec">
                                <th className="px-4 py-3">Nombre</th>
                                <th className="px-4 py-3">Rol</th>
                                <th className="px-4 py-3">Clave</th>
                                <th className="px-4 py-3 hidden sm:table-cell">Vinculado a</th>
                                <th className="px-4 py-3 hidden md:table-cell">Email</th>
                                <th className="px-4 py-3 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/10">
                            {filtered.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-4 py-8 text-center text-textsec">
                                        No se encontraron resultados.
                                    </td>
                                </tr>
                            )}
                            {filtered.map((row) => (
                                <tr
                                    key={row.profile_id}
                                    className={`transition-colors hover:bg-white/5 ${!row.is_active ? 'opacity-50' : ''}`}
                                >
                                    {/* Nombre */}
                                    <td className="px-4 py-3">
                                        <div>
                                            <p className="font-medium text-textpri">{row.full_name || 'Sin nombre'}</p>
                                            {row.email && (
                                                <p className="mt-0.5 text-xs text-textsec">{row.email}</p>
                                            )}
                                        </div>
                                    </td>

                                    {/* Rol */}
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${ROLE_COLORS[row.role] || 'bg-line text-textsec'}`}>
                                            {ROLE_LABELS[row.role] || row.role}
                                        </span>
                                    </td>

                                    {/* Clave */}
                                    <td className="px-4 py-3">
                                        {editingId === row.profile_id ? (
                                            <div className="flex items-center gap-1">
                                                <input
                                                    type="text"
                                                    className="input !py-1 !px-2 text-sm font-mono w-28"
                                                    value={editValue}
                                                    onChange={(e) => setEditValue(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                                                    maxLength={8}
                                                    autoFocus
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') handleSaveEdit(row.profile_id)
                                                        if (e.key === 'Escape') cancelEdit()
                                                    }}
                                                />
                                                <button
                                                    onClick={() => handleSaveEdit(row.profile_id)}
                                                    disabled={saving === row.profile_id}
                                                    className="rounded-lg p-1.5 text-success hover:bg-success/10"
                                                    title="Guardar"
                                                >
                                                    <Check className="h-4 w-4" />
                                                </button>
                                                <button
                                                    onClick={cancelEdit}
                                                    className="rounded-lg p-1.5 text-textsec hover:bg-white/10"
                                                    title="Cancelar"
                                                >
                                                    <X className="h-4 w-4" />
                                                </button>
                                            </div>
                                        ) : row.access_code ? (
                                            <code className="rounded bg-bg/40 px-2 py-1 font-mono text-sm text-textpri">
                                                {row.access_code}
                                            </code>
                                        ) : (
                                            <span className="text-xs text-danger">Sin clave</span>
                                        )}
                                    </td>

                                    {/* Vinculado a (guardian → student name) */}
                                    <td className="px-4 py-3 hidden sm:table-cell">
                                        {row.related_student_name ? (
                                            <span className="text-xs text-textsec">{row.related_student_name}</span>
                                        ) : (
                                            <span className="text-xs text-textsec">—</span>
                                        )}
                                    </td>

                                    {/* Email */}
                                    <td className="px-4 py-3 hidden md:table-cell">
                                        {row.email ? (
                                            <span className="text-xs text-textsec">{row.email}</span>
                                        ) : (
                                            <span className="text-xs text-textsec">—</span>
                                        )}
                                    </td>

                                    {/* Acciones */}
                                    <td className="px-4 py-3">
                                        <div className="flex items-center justify-end gap-1">
                                            {row.access_code && editingId !== row.profile_id && (
                                                <>
                                                    <button
                                                        onClick={() => handleCopy(row.access_code!)}
                                                        className="rounded-lg p-1.5 text-textsec hover:bg-white/10 hover:text-textpri"
                                                        title="Copiar clave"
                                                    >
                                                        <Copy className="h-4 w-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => startEdit(row)}
                                                        className="rounded-lg p-1.5 text-textsec hover:bg-white/10 hover:text-textpri"
                                                        title="Editar clave"
                                                    >
                                                        <Pencil className="h-4 w-4" />
                                                    </button>
                                                </>
                                            )}
                                            {!row.access_code && editingId !== row.profile_id && (
                                                <button
                                                    onClick={() => handleGenerate(row.profile_id)}
                                                    disabled={saving === row.profile_id}
                                                    className="btn-sm btn-outline text-xs"
                                                >
                                                    {saving === row.profile_id ? (
                                                        <RefreshCw className="h-3 w-3 animate-spin" />
                                                    ) : (
                                                        <Key className="h-3 w-3" />
                                                    )}
                                                    Generar
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Total filtrado */}
            <p className="text-xs text-textsec text-right">
                Mostrando {filtered.length} de {keys.length} perfiles
            </p>
        </div>
    )
}
