'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import dayjs from 'dayjs'
import { ArrowLeft, CalendarClock, CreditCard, KeyRound, Pencil, ShieldCheck, Target, Trash2, UserRound } from 'lucide-react'
import AdminGuard from '@/components/AdminGuard'
import Avatar from '@/components/ui/Avatar'
import { ClassCardsBoard } from '@/components/ui/ClassCardsBoard'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/ToastProvider'
import { useStudentDetail } from '@/lib/hooks/useStudentDetail'
import { useStudentClassCards } from '@/lib/hooks/useStudentClassCards'
import { supabase } from '@/lib/supabaseClient'
import { calculateAge } from '@/lib/utils/dateUtils'

type MembershipEditorState = {
  id: string
  custom_name: string
  start_date: string
  end_date: string
  status: string
  classes_total: string
  classes_used: string
  classes_remaining: string
  total_amount: string
  currency: string
  notes: string
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'No definido'
  return dayjs(value).format('DD/MM/YYYY')
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'No definido'
  return dayjs(value).format('DD/MM/YYYY · HH:mm')
}

function bowLabel(hasOwnBow: boolean, assignedBow: boolean, bowPoundage: number | null) {
  if (hasOwnBow) return 'Arco propio'
  if (assignedBow) return 'Arco asignado'
  if (bowPoundage) return `Arco academia ${bowPoundage} lb`
  return 'Equipo no configurado'
}

function statusTone(status: string) {
  if (status === 'active' || status === 'attended' || status === 'paid') return 'text-emerald-300 bg-emerald-500/15'
  if (status === 'reserved' || status === 'pending') return 'text-blue-300 bg-blue-500/15'
  if (status === 'no_show' || status === 'late') return 'text-red-300 bg-red-500/15'
  if (status === 'expired' || status === 'cancelled') return 'text-red-300 bg-red-500/15'
  return 'text-textsec bg-white/5'
}

function statusLabel(status: string) {
  if (status === 'attended') return 'asistió'
  if (status === 'no_show') return 'no asistió'
  return status
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-card p-5">
      <h2 className="text-lg font-semibold text-textpri">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function membershipEditorFromSummary(membership: {
  id: string
  custom_name: string
  start_date: string
  end_date: string | null
  status: string
  classes_total: number
  classes_used: number
  classes_remaining: number
  total_amount: number
  currency: string
  notes: string | null
}): MembershipEditorState {
  return {
    id: membership.id,
    custom_name: membership.custom_name,
    start_date: membership.start_date || '',
    end_date: membership.end_date || '',
    status: membership.status,
    classes_total: String(membership.classes_total),
    classes_used: String(membership.classes_used),
    classes_remaining: String(membership.classes_remaining),
    total_amount: String(membership.total_amount ?? 0),
    currency: membership.currency || 'PEN',
    notes: membership.notes || '',
  }
}

export default function AdminAlumnoDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const confirm = useConfirm()
  const toast = useToast()
  const [deleting, setDeleting] = useState(false)
  const [membershipEditor, setMembershipEditor] = useState<MembershipEditorState | null>(null)
  const [membershipSaving, setMembershipSaving] = useState(false)
  const [membershipDeletingId, setMembershipDeletingId] = useState<string | null>(null)
  const [membershipsPage, setMembershipsPage] = useState(1)
  const [paymentsPage, setPaymentsPage] = useState(1)
  const [ledgerPage, setLedgerPage] = useState(1)
  const [bookingsPage, setBookingsPage] = useState(1)
  const PAGE_SIZE = 5
  const detailQuery = useStudentDetail(params.id)
  const { data, isLoading, error } = detailQuery
  const age = calculateAge(data?.date_of_birth)
  const {
    cards: classCards,
    loading: classCardsLoading,
    error: classCardsError,
  } = useStudentClassCards(data?.id)

  async function handleDeleteStudent() {
    if (!data || deleting) return

    const accepted = await confirm(
      `Se eliminara al alumno ${data.full_name}. Esta accion quitara su ficha, membresias, pagos y acceso propio.`,
      { title: 'Eliminar alumno' }
    )

    if (!accepted) return

    try {
      setDeleting(true)
      const { data: refreshed } = await supabase.auth.refreshSession()
      const accessToken = refreshed.session?.access_token

      if (!accessToken) {
        throw new Error('Sesion expirada. Vuelve a iniciar sesion.')
      }

      const response = await fetch(`/api/admin/create-student?studentId=${data.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || 'No se pudo eliminar el alumno.')
      }

      toast.push({ message: 'Alumno eliminado.', type: 'success' })
      router.replace('/admin/alumnos')
    } catch (deleteError: any) {
      toast.push({ message: deleteError.message || 'No se pudo eliminar el alumno.', type: 'error' })
    } finally {
      setDeleting(false)
    }
  }

  async function handleSaveMembership() {
    if (!membershipEditor || membershipSaving) return

    if (!membershipEditor.custom_name.trim()) {
      toast.push({ message: 'El nombre de la membresia es obligatorio.', type: 'error' })
      return
    }

    try {
      setMembershipSaving(true)
      const { error: updateError } = await supabase.rpc('admin_update_student_membership', {
        p_membership_id: membershipEditor.id,
        p_custom_name: membershipEditor.custom_name.trim(),
        p_start_date: membershipEditor.start_date || null,
        p_end_date: membershipEditor.end_date || null,
        p_status: membershipEditor.status,
        p_classes_total: Number(membershipEditor.classes_total || 0),
        p_classes_used: Number(membershipEditor.classes_used || 0),
        p_classes_remaining: Number(membershipEditor.classes_remaining || 0),
        p_total_amount: Number(membershipEditor.total_amount || 0),
        p_currency: membershipEditor.currency.trim() || 'PEN',
        p_notes: membershipEditor.notes.trim() || null,
      })

      if (updateError) throw updateError

      toast.push({ message: 'Membresia actualizada.', type: 'success' })
      setMembershipEditor(null)
      await detailQuery.refetch()
    } catch (membershipError: any) {
      toast.push({ message: membershipError.message || 'No se pudo actualizar la membresia.', type: 'error' })
    } finally {
      setMembershipSaving(false)
    }
  }

  async function handleDeleteMembership(membershipId: string) {
    if (!data || membershipDeletingId) return

    const accepted = await confirm(
      'Se eliminara la membresia seleccionada. Si tiene reservas asociadas, el sistema bloqueara la eliminacion para proteger el historial.',
      { title: 'Eliminar membresia' }
    )

    if (!accepted) return

    try {
      setMembershipDeletingId(membershipId)
      const { data: result, error: deleteError } = await supabase.rpc('admin_delete_student_membership', {
        p_membership_id: membershipId,
      })

      if (deleteError) throw deleteError
      if (!result?.success) {
        throw new Error(result?.error || 'No se pudo eliminar la membresia.')
      }

      toast.push({ message: 'Membresia eliminada.', type: 'success' })
      if (membershipEditor?.id === membershipId) {
        setMembershipEditor(null)
      }
      await detailQuery.refetch()
    } catch (membershipError: any) {
      toast.push({ message: membershipError.message || 'No se pudo eliminar la membresia.', type: 'error' })
    } finally {
      setMembershipDeletingId(null)
    }
  }

  if (isLoading) {
    return (
      <AdminGuard>
        <div className="card p-8 text-center text-textsec">Cargando ficha del alumno...</div>
      </AdminGuard>
    )
  }

  if (error || !data) {
    return (
      <AdminGuard>
        <div className="card p-8 text-center">
          <p className="text-danger">{error instanceof Error ? error.message : 'Alumno no encontrado.'}</p>
          <button className="btn mt-4" onClick={() => router.push('/admin/alumnos')}>
            Volver al listado
          </button>
        </div>
      </AdminGuard>
    )
  }

  return (
    <AdminGuard>
      <div className="space-y-6">
        <section className="rounded-3xl border border-white/10 bg-card p-5 sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-4">
              <button
                type="button"
                className="btn-ghost mt-1 !px-3"
                onClick={() => router.push('/admin/alumnos')}
                aria-label="Volver"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>

              <Avatar name={data.full_name} url={data.avatar_url} size="lg" />

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold text-textpri sm:text-3xl">{data.full_name}</h1>
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${data.is_active ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}`}>
                    {data.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
                <p className="mt-2 text-sm text-textsec">
                  {data.current_distance_m ? `${data.current_distance_m} m` : 'Sin distancia'} · {data.level || 'Sin nivel'} · {data.category || 'Sin categoria'}
                </p>
                <p className="mt-1 text-sm text-textsec">{bowLabel(data.has_own_bow, data.assigned_bow, data.bow_poundage)}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link href={`/admin/alumnos/editar/${data.id}`} className="btn inline-flex items-center gap-2">
                <Pencil className="h-4 w-4" />
                Editar
              </Link>
              <Link href="/admin/membresias" className="btn-outline inline-flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Membresias
              </Link>
              <button
                type="button"
                className="btn-outline inline-flex items-center gap-2 border-red-200 text-red-600 hover:bg-red-50"
                onClick={handleDeleteStudent}
                disabled={deleting}
                title="Eliminar alumno"
              >
                <Trash2 className="h-4 w-4" />
                {deleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="card p-4">
            <p className="text-sm text-textsec">Clases restantes</p>
            <p className="mt-2 text-3xl font-bold text-textpri">{data.active_membership?.classes_remaining ?? 0}</p>
          </div>
          <div className="card p-4">
            <p className="text-sm text-textsec">Membresia activa</p>
            <p className="mt-2 text-lg font-semibold text-textpri">{data.active_membership?.custom_name || 'Sin plan'}</p>
          </div>
          <div className="card p-4">
            <p className="text-sm text-textsec">Cuenta alumno</p>
            <p className="mt-2 text-sm font-semibold text-textpri">{data.self_account?.email || 'Sin cuenta propia'}</p>
          </div>
          <div className="card p-4">
            <p className="text-sm text-textsec">Tutor</p>
            <p className="mt-2 text-sm font-semibold text-textpri">{data.guardian?.full_name || 'Sin tutor'}</p>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            <SectionCard title="Datos del alumno">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-textsec">Nacimiento</p>
                  <p className="mt-1 text-sm text-textpri">{formatDate(data.date_of_birth)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-textsec">Edad</p>
                  <p className="mt-1 text-sm text-textpri">{age !== null ? `${age} años` : 'No definida'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-textsec">DNI</p>
                  <p className="mt-1 text-sm text-textpri">{data.dni || 'No definido'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-textsec">Telefono</p>
                  <p className="mt-1 text-sm text-textpri">{data.phone || 'No definido'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-textsec">Email</p>
                  <p className="mt-1 text-sm text-textpri">{data.email || 'No definido'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-textsec">Distancia</p>
                  <p className="mt-1 text-sm text-textpri">{data.current_distance_m ? `${data.current_distance_m} metros` : 'No definida'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-textsec">Libraje</p>
                  <p className="mt-1 text-sm text-textpri">{data.bow_poundage ? `${data.bow_poundage} lb` : 'No definido'}</p>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-bg/40 p-4">
                <p className="text-xs uppercase tracking-wide text-textsec">Notas medicas</p>
                <p className="mt-2 text-sm text-textpri">{data.medical_notes || 'Sin notas registradas.'}</p>
              </div>
            </SectionCard>

            <SectionCard title="Clases del Mes">
              <ClassCardsBoard
                cards={classCards}
                loading={classCardsLoading}
                error={classCardsError}
                canReserve={!!data.active_membership && (data.active_membership.classes_remaining ?? 0) > 0}
                studentId={data.id}
              />
            </SectionCard>

            <SectionCard title="Membresías">
              {data.memberships.length === 0 ? (
                <p className="text-sm text-textsec">No hay membresías registradas.</p>
              ) : (
                <>
                  <div className="space-y-3">
                    {data.memberships.slice((membershipsPage - 1) * PAGE_SIZE, membershipsPage * PAGE_SIZE).map((membership) => (
                      <div key={membership.id} className="rounded-2xl border border-white/10 bg-bg/40 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-textpri">{membership.custom_name}</p>
                            <p className="mt-1 text-sm text-textsec">
                              {membership.classes_used}/{membership.classes_total} usadas · {membership.classes_remaining} restantes
                            </p>
                          </div>
                          <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusTone(membership.status)}`}>
                            {statusLabel(membership.status)}
                          </span>
                        </div>
                        <p className="mt-3 text-sm text-textsec">
                          {formatDate(membership.start_date)} → {formatDate(membership.end_date)}
                        </p>
                        <p className="mt-1 text-sm text-textsec">
                          Total: {membership.currency} {membership.total_amount.toLocaleString()}
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="btn-outline inline-flex items-center gap-2 px-3 py-2 text-sm"
                            onClick={() => setMembershipEditor(membershipEditorFromSummary(membership))}
                          >
                            <Pencil className="h-4 w-4" />
                            Editar membresía
                          </button>
                          <button
                            type="button"
                            className="btn-outline inline-flex items-center gap-2 border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                            onClick={() => handleDeleteMembership(membership.id)}
                            disabled={membershipDeletingId === membership.id}
                          >
                            <Trash2 className="h-4 w-4" />
                            {membershipDeletingId === membership.id ? 'Eliminando...' : 'Eliminar membresía'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {data.memberships.length > PAGE_SIZE && (
                    <div className="mt-4 flex items-center justify-between text-sm">
                      <span className="text-textsec">{membershipsPage}/{Math.ceil(data.memberships.length / PAGE_SIZE)}</span>
                      <div className="flex gap-2">
                        <button className="btn-outline !px-3 !py-1 text-xs" disabled={membershipsPage <= 1} onClick={() => setMembershipsPage(p => p - 1)}>← Ant</button>
                        <button className="btn-outline !px-3 !py-1 text-xs" disabled={membershipsPage >= Math.ceil(data.memberships.length / PAGE_SIZE)} onClick={() => setMembershipsPage(p => p + 1)}>Sig →</button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {membershipEditor && (
                <div className="mt-5 rounded-2xl border border-orange-200 bg-orange-50/70 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-textpri">Editar membresía</p>
                      <p className="mt-1 text-xs text-textsec">Ajusta nombre, fechas, saldo, estado y monto final.</p>
                    </div>
                    <button type="button" className="btn-ghost !px-3 text-sm" onClick={() => setMembershipEditor(null)}>
                      Cerrar
                    </button>
                  </div>

                  <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    <div className="grid gap-2">
                      <label className="text-sm text-textsec">Nombre</label>
                      <input
                        className="input"
                        value={membershipEditor.custom_name}
                        onChange={(event) =>
                          setMembershipEditor((current) => (current ? { ...current, custom_name: event.target.value } : current))
                        }
                      />
                    </div>
                    <div className="grid gap-2">
                      <label className="text-sm text-textsec">Inicio</label>
                      <input
                        type="date"
                        className="input"
                        value={membershipEditor.start_date}
                        onChange={(event) =>
                          setMembershipEditor((current) => (current ? { ...current, start_date: event.target.value } : current))
                        }
                      />
                    </div>
                    <div className="grid gap-2">
                      <label className="text-sm text-textsec">Fin</label>
                      <input
                        type="date"
                        className="input"
                        value={membershipEditor.end_date}
                        onChange={(event) =>
                          setMembershipEditor((current) => (current ? { ...current, end_date: event.target.value } : current))
                        }
                      />
                    </div>
                    <div className="grid gap-2">
                      <label className="text-sm text-textsec">Estado</label>
                      <select
                        className="input"
                        value={membershipEditor.status}
                        onChange={(event) =>
                          setMembershipEditor((current) => (current ? { ...current, status: event.target.value } : current))
                        }
                      >
                        <option value="draft">Draft</option>
                        <option value="active">Active</option>
                        <option value="expired">Expired</option>
                        <option value="cancelled">Cancelled</option>
                        <option value="consumed">Consumed</option>
                        <option value="historical">Historical</option>
                      </select>
                    </div>
                    <div className="grid gap-2">
                      <label className="text-sm text-textsec">Clases totales</label>
                      <input
                        type="number"
                        min={0}
                        className="input"
                        value={membershipEditor.classes_total}
                        onChange={(event) =>
                          setMembershipEditor((current) => (current ? { ...current, classes_total: event.target.value } : current))
                        }
                      />
                    </div>
                    <div className="grid gap-2">
                      <label className="text-sm text-textsec">Clases usadas</label>
                      <input
                        type="number"
                        min={0}
                        className="input"
                        value={membershipEditor.classes_used}
                        onChange={(event) =>
                          setMembershipEditor((current) => (current ? { ...current, classes_used: event.target.value } : current))
                        }
                      />
                    </div>
                    <div className="grid gap-2">
                      <label className="text-sm text-textsec">Clases restantes</label>
                      <input
                        type="number"
                        min={0}
                        className="input"
                        value={membershipEditor.classes_remaining}
                        onChange={(event) =>
                          setMembershipEditor((current) => (current ? { ...current, classes_remaining: event.target.value } : current))
                        }
                      />
                    </div>
                    <div className="grid gap-2">
                      <label className="text-sm text-textsec">Monto total</label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className="input"
                        value={membershipEditor.total_amount}
                        onChange={(event) =>
                          setMembershipEditor((current) => (current ? { ...current, total_amount: event.target.value } : current))
                        }
                      />
                    </div>
                    <div className="grid gap-2">
                      <label className="text-sm text-textsec">Moneda</label>
                      <input
                        className="input"
                        value={membershipEditor.currency}
                        onChange={(event) =>
                          setMembershipEditor((current) => (current ? { ...current, currency: event.target.value.toUpperCase() } : current))
                        }
                      />
                    </div>
                    <div className="grid gap-2 sm:col-span-2 xl:col-span-3">
                      <label className="text-sm text-textsec">Notas</label>
                      <textarea
                        className="input min-h-24 resize-y"
                        value={membershipEditor.notes}
                        onChange={(event) =>
                          setMembershipEditor((current) => (current ? { ...current, notes: event.target.value } : current))
                        }
                      />
                    </div>
                  </div>

                  <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                    <button type="button" className="btn" onClick={handleSaveMembership} disabled={membershipSaving}>
                      {membershipSaving ? 'Guardando...' : 'Guardar membresía'}
                    </button>
                    <button type="button" className="btn-outline" onClick={() => setMembershipEditor(null)}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </SectionCard>

            <SectionCard title="Pagos recientes">
              {data.payments.length === 0 ? (
                <p className="text-sm text-textsec">No hay pagos registrados.</p>
              ) : (
                <>
                  <div className="space-y-3">
                    {data.payments.slice((paymentsPage - 1) * PAGE_SIZE, paymentsPage * PAGE_SIZE).map((payment) => (
                      <div key={payment.id} className="rounded-2xl border border-white/10 bg-bg/40 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-textpri">
                              {payment.currency} {payment.amount.toLocaleString()}
                            </p>
                            <p className="mt-1 text-sm text-textsec">
                              Pago: {formatDateTime(payment.paid_at)}
                              {payment.due_date ? ` · vence ${formatDate(payment.due_date)}` : ''}
                            </p>
                          </div>
                          <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusTone(payment.payment_status)}`}>
                            {statusLabel(payment.payment_status)}
                          </span>
                        </div>
                        {(payment.payment_method || payment.reward_credits > 0 || payment.notes) && (
                          <p className="mt-3 text-sm text-textsec">
                            {[payment.payment_method, payment.reward_credits > 0 ? `Premio ${payment.reward_credits}` : null, payment.notes]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                  {data.payments.length > PAGE_SIZE && (
                    <div className="mt-4 flex items-center justify-between text-sm">
                      <span className="text-textsec">{paymentsPage}/{Math.ceil(data.payments.length / PAGE_SIZE)}</span>
                      <div className="flex gap-2">
                        <button className="btn-outline !px-3 !py-1 text-xs" disabled={paymentsPage <= 1} onClick={() => setPaymentsPage(p => p - 1)}>← Ant</button>
                        <button className="btn-outline !px-3 !py-1 text-xs" disabled={paymentsPage >= Math.ceil(data.payments.length / PAGE_SIZE)} onClick={() => setPaymentsPage(p => p + 1)}>Sig →</button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </SectionCard>
          </div>

          <div className="space-y-6">
            <SectionCard title="Cuentas asociadas">
              <div className="space-y-4">
                <div className="rounded-2xl border border-white/10 bg-bg/40 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-textpri">
                    <UserRound className="h-4 w-4 text-textsec" />
                    Cuenta del alumno
                  </div>
                  <p className="mt-3 text-sm text-textsec">{data.self_account?.email || 'Sin cuenta propia'}</p>
                  <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-xs text-textpri">
                    <KeyRound className="h-3 w-3 text-textsec" />
                    {data.self_account?.access_code || 'Sin codigo'}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-bg/40 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-textpri">
                    <ShieldCheck className="h-4 w-4 text-textsec" />
                    Tutor
                  </div>
                  <p className="mt-3 text-sm text-textpri">{data.guardian?.full_name || 'Sin tutor vinculado'}</p>
                  <p className="mt-1 text-sm text-textsec">{data.guardian?.email || ''}</p>
                  <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-xs text-textpri">
                    <KeyRound className="h-3 w-3 text-textsec" />
                    {data.guardian?.access_code || 'Sin codigo'}
                  </div>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Configuracion tecnica">
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-textsec">Equipo</span>
                  <span className="text-right text-textpri">{bowLabel(data.has_own_bow, data.assigned_bow, data.bow_poundage)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-textsec">División</span>
                  <span className="text-right text-textpri">{data.division || 'No definida'}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-textsec">Género</span>
                  <span className="text-right text-textpri">{data.gender || 'No definido'}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-textsec">Categoria</span>
                  <span className="text-right text-textpri">{data.category || 'No definida'}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-textsec">Nivel</span>
                  <span className="text-right text-textpri">{data.level || 'No definido'}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-textsec">Ultima actualizacion</span>
                  <span className="text-right text-textpri">{formatDateTime(data.updated_at)}</span>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Últimos movimientos">
              {data.ledger.length === 0 ? (
                <p className="text-sm text-textsec">No hay movimientos de clases registrados.</p>
              ) : (
                <>
                  <div className="space-y-3">
                    {data.ledger.slice((ledgerPage - 1) * PAGE_SIZE, ledgerPage * PAGE_SIZE).map((entry) => (
                      <div key={entry.id} className="rounded-2xl border border-white/10 bg-bg/40 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium text-textpri">{entry.reason}</p>
                          <span className={`rounded-full px-2 py-1 text-xs ${entry.delta >= 0 ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}`}>
                            {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
                          </span>
                        </div>
                        <p className="mt-2 text-xs text-textsec">
                          Saldo: {entry.balance_after ?? '-'} · {formatDateTime(entry.created_at)}
                        </p>
                      </div>
                    ))}
                  </div>
                  {data.ledger.length > PAGE_SIZE && (
                    <div className="mt-4 flex items-center justify-between text-sm">
                      <span className="text-textsec">{ledgerPage}/{Math.ceil(data.ledger.length / PAGE_SIZE)}</span>
                      <div className="flex gap-2">
                        <button className="btn-outline !px-3 !py-1 text-xs" disabled={ledgerPage <= 1} onClick={() => setLedgerPage(p => p - 1)}>← Ant</button>
                        <button className="btn-outline !px-3 !py-1 text-xs" disabled={ledgerPage >= Math.ceil(data.ledger.length / PAGE_SIZE)} onClick={() => setLedgerPage(p => p + 1)}>Sig →</button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </SectionCard>

            <SectionCard title="Reservas recientes">
              {data.bookings.length === 0 ? (
                <p className="text-sm text-textsec">No hay reservas registradas.</p>
              ) : (
                <>
                  <div className="space-y-3">
                    {data.bookings.slice((bookingsPage - 1) * PAGE_SIZE, bookingsPage * PAGE_SIZE).map((booking) => (
                      <div key={booking.id} className="rounded-2xl border border-white/10 bg-bg/40 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="flex items-center gap-2 text-sm font-medium text-textpri">
                              <CalendarClock className="h-4 w-4 text-textsec" />
                              {formatDateTime(booking.start_at)}
                            </p>
                            <p className="mt-1 text-xs text-textsec">
                              {booking.distance_m ? `${booking.distance_m} m` : 'Sin distancia'} · {booking.bow_usage_type || 'Sin equipo'}
                            </p>
                            {booking.admin_notes && <p className="mt-1 text-xs text-textsec">{booking.admin_notes}</p>}
                          </div>
                          <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusTone(booking.status)}`}>
                            {statusLabel(booking.status)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  {data.bookings.length > PAGE_SIZE && (
                    <div className="mt-4 flex items-center justify-between text-sm">
                      <span className="text-textsec">{bookingsPage}/{Math.ceil(data.bookings.length / PAGE_SIZE)}</span>
                      <div className="flex gap-2">
                        <button className="btn-outline !px-3 !py-1 text-xs" disabled={bookingsPage <= 1} onClick={() => setBookingsPage(p => p - 1)}>← Ant</button>
                        <button className="btn-outline !px-3 !py-1 text-xs" disabled={bookingsPage >= Math.ceil(data.bookings.length / PAGE_SIZE)} onClick={() => setBookingsPage(p => p + 1)}>Sig →</button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </SectionCard>
          </div>
        </section>

        <div className="lg:hidden">
          <div className="fixed bottom-24 right-6 flex flex-col gap-3">
            <button
              type="button"
              className="flex h-14 w-14 items-center justify-center rounded-full border border-red-200 bg-white text-red-600 shadow-lg"
              onClick={handleDeleteStudent}
              disabled={deleting}
              title="Eliminar alumno"
            >
              <Trash2 className="h-5 w-5" />
            </button>
            <Link href={`/admin/alumnos/editar/${data.id}`} className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-black shadow-lg">
              <Target className="h-6 w-6" />
            </Link>
          </div>
        </div>
      </div>
    </AdminGuard>
  )
}
