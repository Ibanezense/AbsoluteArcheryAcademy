'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, type ReactNode } from 'react'
import dayjs from 'dayjs'
import {
  AlertTriangle,
  ArrowRight,
  BadgeDollarSign,
  CalendarClock,
  CalendarDays,
  Clock3,
  CreditCard,
  Edit3,
  Eye,
  EyeOff,
  KeyRound,
  Plus,
  ShieldAlert,
  Target,
  Trash2,
  WalletCards,
  XCircle,
} from 'lucide-react'
import { AdminContentPanel, AdminPageHeader } from '@/components/admin/AdminVisualSystem'
import { EmptyOperationalState, OperationalStatusBadge } from '@/components/admin/AdminOperationalComponents'
import Avatar from '@/components/ui/Avatar'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/ToastProvider'
import { useStudentDetail, type StudentDetailData, type StudentMembershipSummary } from '@/lib/hooks/useStudentDetail'
import { supabase } from '@/lib/supabaseClient'
import { calculateAge } from '@/lib/utils/dateUtils'
import { canDeleteExpiredMembership } from '@/lib/utils/adminMembershipDeletion'

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

type TabId = 'summary' | 'membership' | 'bookings' | 'attendance' | 'payments' | 'sports' | 'notes'
type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'summary', label: 'Resumen' },
  { id: 'membership', label: 'Membresia' },
  { id: 'bookings', label: 'Reservas' },
  { id: 'attendance', label: 'Asistencia' },
  { id: 'payments', label: 'Pagos' },
  { id: 'sports', label: 'Perfil deportivo' },
  { id: 'notes', label: 'Notas' },
]

const PROTECTED_STUDENT_STATUSES = new Set(['retired', 'withdrawn', 'blocked', 'suspended'])

function formatDate(value: string | null | undefined) {
  if (!value) return 'No definido'
  return dayjs(value).format('DD MMM YYYY')
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'No definido'
  return dayjs(value).format('DD MMM YYYY, HH:mm')
}

function formatMoney(amount: number | null | undefined, currency = 'PEN') {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: currency || 'PEN',
    minimumFractionDigits: 2,
  }).format(amount || 0)
}

function daysBetweenToday(value: string | null | undefined) {
  if (!value) return null
  return dayjs(value).startOf('day').diff(dayjs().startOf('day'), 'day')
}

function bowLabel(hasOwnBow: boolean, assignedBow: boolean, bowPoundage: number | null) {
  if (hasOwnBow) return 'Arco propio'
  if (assignedBow) return 'Arco asignado'
  if (bowPoundage) return `Arco academia ${bowPoundage} lb`
  return 'Equipo no configurado'
}

function statusLabel(status: string | null | undefined) {
  const labels: Record<string, string> = {
    active: 'Activa',
    paused: 'Pausado',
    expired: 'Vencido',
    consumed: 'Consumida',
    historical: 'Historica',
    cancelled: 'Cancelada',
    draft: 'Borrador',
    reserved: 'Confirmada',
    attended: 'Asistio',
    no_show: 'No asistio',
    paid: 'Pagado',
    pending: 'Pendiente',
    late: 'Atrasado',
    waived: 'Cortesia',
    blocked: 'Bloqueado',
    suspended: 'Suspendido',
    retired: 'Retirado',
    withdrawn: 'Retirado',
  }

  return labels[status || ''] || status || 'Sin estado'
}

function statusTone(status: string | null | undefined): BadgeTone {
  if (status === 'active' || status === 'attended' || status === 'paid') return 'success'
  if (status === 'reserved' || status === 'pending' || status === 'draft') return 'warning'
  if (status === 'no_show' || status === 'late' || status === 'expired' || status === 'consumed' || status === 'blocked' || status === 'suspended') return 'danger'
  if (status === 'waived') return 'info'
  return 'neutral'
}

function getLatestMembership(memberships: StudentMembershipSummary[]) {
  return [...memberships].sort((left, right) => {
    const leftDate = left.end_date || left.start_date || left.created_at
    const rightDate = right.end_date || right.start_date || right.created_at
    return new Date(rightDate).getTime() - new Date(leftDate).getTime()
  })[0] || null
}

function getOperationalStatus(data: StudentDetailData) {
  if (data.operational_status && PROTECTED_STUDENT_STATUSES.has(data.operational_status)) {
    return data.operational_status
  }

  const activeMembership = data.active_membership
  if (activeMembership?.status === 'active' && activeMembership.classes_remaining > 0) {
    const endDelta = daysBetweenToday(activeMembership.end_date)
    if (endDelta === null || endDelta >= 0) return 'active'
    return endDelta < -14 ? 'paused' : 'expired'
  }

  const latestMembership = getLatestMembership(data.memberships)
  const latestEndDelta = daysBetweenToday(latestMembership?.end_date)

  if (!data.is_active && latestEndDelta !== null && latestEndDelta < -14) return 'paused'
  if (!data.is_active && !latestMembership) return 'paused'
  if (latestEndDelta !== null && latestEndDelta < -14) return 'paused'
  if (latestMembership) return 'expired'
  return data.is_active ? 'active' : 'paused'
}

function membershipEditorFromSummary(membership: StudentMembershipSummary): MembershipEditorState {
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

function SectionShell({ title, description, children, action }: { title: string; description?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <AdminContentPanel className="p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-black text-slate-950">{title}</h2>
          {description && <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>}
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </AdminContentPanel>
  )
}

function InfoRow({ label, value, danger = false }: { label: string; value: ReactNode; danger?: boolean }) {
  return (
    <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-3 border-b border-slate-100 py-3 last:border-b-0">
      <span className="text-sm font-semibold text-slate-500">{label}</span>
      <span className={`text-sm font-bold ${danger ? 'text-accent' : 'text-slate-900'}`}>{value}</span>
    </div>
  )
}

function KpiCard({ icon, label, value, helper, tone }: { icon: ReactNode; label: string; value: string | number; helper: string; tone: string }) {
  return (
    <article className="rounded-[1.25rem] border border-slate-200 bg-white p-4 shadow-[0_16px_42px_rgba(15,23,42,0.05)]">
      <div className={`grid h-11 w-11 place-items-center rounded-2xl ${tone}`}>{icon}</div>
      <p className="mt-4 text-sm font-black text-slate-700">{label}</p>
      <p className="mt-2 font-heading text-4xl font-black leading-none tracking-[-0.055em] text-slate-950">{value}</p>
      <p className="mt-2 text-xs leading-5 text-slate-500">{helper}</p>
    </article>
  )
}

function AccessCodeCard({
  title,
  accountId,
  email,
  phone,
  code,
  revealedTarget,
  onToggle,
}: {
  title: string
  accountId: string
  email: string | null
  phone: string | null
  code: string | null
  revealedTarget: string | null
  onToggle: (target: string) => void
}) {
  const isRevealed = revealedTarget === accountId

  return (
    <div className="rounded-[1.15rem] border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-black text-slate-950">{title}</p>
          <p className="mt-1 truncate text-xs text-slate-500">{email || phone || 'Sin contacto registrado'}</p>
        </div>
        <KeyRound className="h-5 w-5 text-slate-400" />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3">
        <span className="font-mono text-sm font-black tracking-[0.28em] text-slate-950">
          {isRevealed ? code || 'Sin codigo' : '••••••'}
        </span>
        <button
          type="button"
          onClick={() => onToggle(accountId)}
          className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-700 transition hover:border-accent/40 hover:text-accent"
        >
          {isRevealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {isRevealed ? 'Ocultar codigo' : 'Ver codigo'}
        </button>
      </div>
    </div>
  )
}

function StudentDetailSkeleton() {
  return (
    <div className="space-y-5">
      <div className="h-24 animate-pulse rounded-[1.5rem] bg-slate-100" />
      <div className="grid gap-4 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="h-36 animate-pulse rounded-[1.25rem] bg-slate-100" />
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="h-72 animate-pulse rounded-[1.5rem] bg-slate-100" />
        <div className="h-72 animate-pulse rounded-[1.5rem] bg-slate-100" />
      </div>
    </div>
  )
}

export default function AdminAlumnoDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const confirm = useConfirm()
  const toast = useToast()
  const detailQuery = useStudentDetail(params.id)
  const { data, isLoading, error } = detailQuery

  const [activeTab, setActiveTab] = useState<TabId>('summary')
  const [revealedAccessTarget, setRevealedAccessTarget] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [membershipEditor, setMembershipEditor] = useState<MembershipEditorState | null>(null)
  const [membershipSaving, setMembershipSaving] = useState(false)
  const [membershipDeletingId, setMembershipDeletingId] = useState<string | null>(null)

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

      if (!accessToken) throw new Error('Sesion expirada. Vuelve a iniciar sesion.')

      const response = await fetch(`/api/admin/create-student?studentId=${data.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const payload = await response.json()

      if (!response.ok) throw new Error(payload.error || 'No se pudo eliminar el alumno.')

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

  async function handleDeleteMembership(membership: StudentMembershipSummary) {
    if (!data || membershipDeletingId) return
    if (!canDeleteExpiredMembership(membership)) {
      toast.push({ message: 'Solo se puede eliminar una membresia vencida, historica, cancelada o consumida.', type: 'error' })
      return
    }

    const accepted = await confirm(
      'Se eliminara la membresia vencida seleccionada sin afectar la membresia activa nueva del alumno.',
      { title: 'Eliminar membresia vencida', confirmLabel: 'Eliminar vencida', tone: 'danger' }
    )

    if (!accepted) return

    try {
      setMembershipDeletingId(membership.id)
      const { data: result, error: deleteError } = await supabase.rpc('admin_delete_student_membership', {
        p_membership_id: membership.id,
      })

      if (deleteError) throw deleteError
      if (!result?.success) throw new Error(result?.error || 'No se pudo eliminar la membresia.')

      toast.push({ message: 'Membresia eliminada.', type: 'success' })
      if (membershipEditor?.id === membership.id) setMembershipEditor(null)
      await detailQuery.refetch()
    } catch (membershipError: any) {
      toast.push({ message: membershipError.message || 'No se pudo eliminar la membresia.', type: 'error' })
    } finally {
      setMembershipDeletingId(null)
    }
  }

  if (isLoading) return <StudentDetailSkeleton />

  if (error || !data) {
    return (
      <EmptyOperationalState
        title="Alumno no encontrado"
        description={error instanceof Error ? error.message : 'No se pudo cargar la ficha solicitada.'}
        action={
          <button type="button" className="rounded-2xl bg-accent px-5 py-3 text-sm font-black text-white" onClick={() => router.push('/admin/alumnos')}>
            Volver al listado
          </button>
        }
      />
    )
  }

  const age = calculateAge(data.date_of_birth)
  const operationalStatus = getOperationalStatus(data)
  const activeMembership = data.active_membership
  const latestMembership = getLatestMembership(data.memberships)
  const membershipEndDelta = daysBetweenToday(activeMembership?.end_date)
  const upcomingBookings = data.bookings
    .filter((booking) => booking.status === 'reserved' && booking.start_at && dayjs(booking.start_at).isAfter(dayjs()))
    .sort((left, right) => new Date(left.start_at || '').getTime() - new Date(right.start_at || '').getTime())
  const nextBooking = upcomingBookings[0] || null
  const recentClasses = data.bookings.filter((booking) => booking.status !== 'reserved')
  const pendingPayments = data.payments.filter((payment) => payment.payment_status === 'pending' || payment.payment_status === 'late')
  const recentNoShows = data.bookings.filter((booking) => {
    if (booking.status !== 'no_show' || !booking.start_at) return false
    return dayjs(booking.start_at).isAfter(dayjs().subtract(14, 'day'))
  })
  const reservedAgainstBalance = upcomingBookings.length
  const committedFreeBalance = Math.max((activeMembership?.classes_remaining || 0) - reservedAgainstBalance, 0)
  const renewalWarning = 'Esta accion reemplazara la membresia actual del alumno. La membresia anterior pasara al historial y el nuevo plan iniciara un ciclo independiente. Las clases restantes no se acumularan automaticamente.'

  const alerts = [
    activeMembership && membershipEndDelta !== null && membershipEndDelta < 0
      ? {
        title: 'Membresia vencida',
        description: `Vencio ${formatDate(activeMembership.end_date)}. No deberia reservar hasta renovar.`,
        action: 'Renovar ahora',
        href: '/admin/membresias',
        tone: 'danger',
        icon: <ShieldAlert className="h-6 w-6" />,
      }
      : null,
    activeMembership && membershipEndDelta !== null && membershipEndDelta >= 0 && membershipEndDelta <= 7
      ? {
        title: 'Membresia por vencer',
        description: `Vence en ${membershipEndDelta} dias (${formatDate(activeMembership.end_date)}).`,
        action: 'Renovar ahora',
        href: '/admin/membresias',
        tone: 'warning',
        icon: <AlertTriangle className="h-6 w-6" />,
      }
      : null,
    activeMembership && activeMembership.classes_remaining <= 0
      ? {
        title: 'Sin clases disponibles',
        description: 'El alumno no tiene saldo libre para nuevas reservas.',
        action: 'Asignar plan',
        href: '/admin/membresias',
        tone: 'danger',
        icon: <XCircle className="h-6 w-6" />,
      }
      : null,
    activeMembership && activeMembership.classes_remaining === 1
      ? {
        title: '1 clase disponible',
        description: 'Aprovecha la clase antes de que venza el ciclo.',
        action: 'Ver clases',
        href: '/admin/sesiones',
        tone: 'warning',
        icon: <CalendarClock className="h-6 w-6" />,
      }
      : null,
    pendingPayments.length > 0
      ? {
        title: 'Pago pendiente',
        description: `${pendingPayments.length} movimiento(s) requieren seguimiento.`,
        action: 'Ver pagos',
        href: '/admin/finanzas',
        tone: 'warning',
        icon: <BadgeDollarSign className="h-6 w-6" />,
      }
      : null,
    recentNoShows.length > 0
      ? {
        title: 'No-shows recientes',
        description: `${recentNoShows.length} falta(s) en los ultimos 14 dias.`,
        action: 'Revisar',
        href: '#attendance',
        tone: 'danger',
        icon: <ShieldAlert className="h-6 w-6" />,
      }
      : null,
    !nextBooking
      ? {
        title: 'Sin proxima reserva',
        description: 'No tiene reservas programadas esta semana.',
        action: 'Reservar ahora',
        href: '/admin/sesiones',
        tone: 'danger',
        icon: <CalendarDays className="h-6 w-6" />,
      }
      : null,
  ].filter(Boolean) as Array<{ title: string; description: string; action: string; href: string; tone: string; icon: ReactNode }>

  const headerActions = (
    <>
      <Link href="/admin/membresias" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:border-accent/40 hover:text-accent">
        <WalletCards className="h-4 w-4" />
        Renovar membresia
      </Link>
      <Link href="/admin/sesiones" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-accent px-4 text-sm font-black text-white shadow-[0_16px_35px_rgba(249,115,22,0.24)]">
        <Plus className="h-4 w-4" />
        Nueva reserva
      </Link>
      <Link href="/admin/finanzas" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:border-accent/40 hover:text-accent">
        <CreditCard className="h-4 w-4" />
        Registrar pago
      </Link>
      <Link href={`/admin/alumnos/editar/${data.id}`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:border-accent/40 hover:text-accent">
        <Edit3 className="h-4 w-4" />
        Editar alumno
      </Link>
    </>
  )

  return (
    <div className="space-y-6 pb-8">
      <AdminPageHeader
        title={data.full_name}
        description={`Alumno desde el ${formatDate(data.created_at)} - ID: ${data.id.slice(0, 8).toUpperCase()}`}
        actions={headerActions}
      />

      <AdminContentPanel className="p-5 sm:p-6">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,2.2fr)] xl:items-center">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <Avatar name={data.full_name} url={data.avatar_url} size="lg" className="h-28 w-28 border-4 border-white shadow-[0_18px_40px_rgba(15,23,42,0.18)]" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <OperationalStatusBadge label={statusLabel(operationalStatus)} tone={statusTone(operationalStatus)} />
                {data.is_country_club_tiabaya_member && <OperationalStatusBadge label="Country Club" tone="info" />}
              </div>
              <div className="mt-4 grid gap-2 text-sm text-slate-600">
                <span><strong className="text-slate-950">Disciplina:</strong> {data.division || 'No definida'}</span>
                <span><strong className="text-slate-950">Categoria:</strong> {data.category || 'No definida'}</span>
                <span><strong className="text-slate-950">Nivel:</strong> {data.level || 'No definido'}</span>
                <span><strong className="text-slate-950">Distancia:</strong> {data.current_distance_m ? `${data.current_distance_m} metros` : 'No definida'}</span>
                <span><strong className="text-slate-950">Equipo:</strong> {bowLabel(data.has_own_bow, data.assigned_bow, data.bow_poundage)}</span>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <KpiCard icon={<Target className="h-5 w-5" />} label="Clases disponibles" value={activeMembership?.classes_remaining ?? 0} helper={`de ${activeMembership?.classes_total ?? 0}`} tone="border border-emerald-200 bg-emerald-50 text-emerald-600" />
            <KpiCard icon={<CalendarDays className="h-5 w-5" />} label="Reservas proximas" value={upcomingBookings.length} helper={nextBooking ? `Proxima: ${formatDate(nextBooking.start_at)}` : 'Sin agenda'} tone="border border-blue-200 bg-blue-50 text-blue-600" />
            <KpiCard icon={<Clock3 className="h-5 w-5" />} label="Vence" value={membershipEndDelta ?? '-'} helper={activeMembership?.end_date ? `${membershipEndDelta === 1 ? 'dia' : 'dias'} - ${formatDate(activeMembership.end_date)}` : 'Sin fecha'} tone="border border-orange-200 bg-orange-50 text-accent" />
            <KpiCard icon={<BadgeDollarSign className="h-5 w-5" />} label="Pagos pendientes" value={pendingPayments.length} helper={pendingPayments[0] ? formatMoney(pendingPayments[0].amount, pendingPayments[0].currency) : 'Al dia'} tone="border border-amber-200 bg-amber-50 text-amber-600" />
            <KpiCard icon={<ShieldAlert className="h-5 w-5" />} label="No-shows recientes" value={recentNoShows.length} helper="Ultimos 14 dias" tone="border border-rose-200 bg-rose-50 text-rose-600" />
          </div>
        </div>
      </AdminContentPanel>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-black text-slate-950">Alertas prioritarias</h2>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </div>
          {alerts.length > 3 && <button className="text-sm font-black text-accent" type="button">Ver todas las alertas</button>}
        </div>
        {alerts.length === 0 ? (
          <AdminContentPanel className="p-5 text-sm font-bold text-slate-500">No hay alertas operativas para este alumno.</AdminContentPanel>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            {alerts.slice(0, 3).map((alert) => (
              <Link
                key={alert.title}
                href={alert.href}
                onClick={() => {
                  if (alert.href === '#attendance') setActiveTab('attendance')
                }}
                className={`group rounded-[1.25rem] border p-5 shadow-[0_18px_45px_rgba(15,23,42,0.055)] transition hover:-translate-y-0.5 ${
                  alert.tone === 'danger'
                    ? 'border-rose-200 bg-rose-50 text-rose-700'
                    : 'border-amber-200 bg-amber-50 text-amber-700'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className="rounded-2xl bg-white p-3">{alert.icon}</div>
                  <div className="min-w-0">
                    <p className="font-black text-slate-950">{alert.title}</p>
                    <p className="mt-1 text-sm leading-5 text-slate-700">{alert.description}</p>
                    <span className="mt-5 inline-flex items-center gap-2 text-sm font-black text-accent">
                      {alert.action} <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <AdminContentPanel className="overflow-hidden">
        <div className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-3 pt-3">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`min-h-12 whitespace-nowrap border-b-2 px-4 text-sm font-black transition ${
                activeTab === tab.id
                  ? 'border-accent text-accent'
                  : 'border-transparent text-slate-500 hover:text-slate-950'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </AdminContentPanel>

      {activeTab === 'summary' && (
        <div className="grid gap-5 xl:grid-cols-2">
          <SectionShell title="Proxima reserva">
            {nextBooking ? (
              <div className="rounded-[1.15rem] border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-lg font-black text-slate-950">{formatDate(nextBooking.start_at)}</h3>
                  <OperationalStatusBadge label={statusLabel(nextBooking.status)} tone={statusTone(nextBooking.status)} />
                </div>
                <div className="mt-4 grid gap-3 text-sm font-semibold text-slate-600 sm:grid-cols-3">
                  <span>{dayjs(nextBooking.start_at).format('HH:mm')} - {dayjs(nextBooking.end_at).format('HH:mm')}</span>
                  <span>{nextBooking.distance_m ? `${nextBooking.distance_m} metros` : 'Sin distancia'}</span>
                  <span>{nextBooking.bow_usage_type || 'Equipo no definido'}</span>
                </div>
              </div>
            ) : (
              <EmptyOperationalState title="Sin proxima reserva" description="El alumno no tiene reservas futuras activas." />
            )}
          </SectionShell>

          <SectionShell title="Membresia actual">
            {activeMembership ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-black text-slate-950">{activeMembership.custom_name}</p>
                    <p className="mt-1 text-sm text-slate-500">ID: {activeMembership.id.slice(0, 8).toUpperCase()}</p>
                  </div>
                  <OperationalStatusBadge label={statusLabel(activeMembership.status)} tone={statusTone(activeMembership.status)} />
                </div>
                <div className="rounded-2xl border border-slate-200">
                  <InfoRow label="Inicio" value={formatDate(activeMembership.start_date)} />
                  <InfoRow label="Vencimiento" value={formatDate(activeMembership.end_date)} danger={membershipEndDelta !== null && membershipEndDelta <= 7} />
                  <InfoRow label="Clases totales" value={activeMembership.classes_total} />
                  <InfoRow label="Usadas" value={activeMembership.classes_used} />
                  <InfoRow label="Disponibles" value={activeMembership.classes_remaining} />
                  <InfoRow label="Reservadas a futuro" value={reservedAgainstBalance} />
                  <InfoRow label="Saldo libre estimado" value={committedFreeBalance} />
                </div>
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-800">
                  {renewalWarning}
                </div>
              </div>
            ) : (
              <EmptyOperationalState title="Sin membresia activa" description="No hay un ciclo activo disponible para reservar." />
            )}
          </SectionShell>

          <RecentClassesList bookings={recentClasses} />
          <ContactAndAccessSection data={data} revealedAccessTarget={revealedAccessTarget} setRevealedAccessTarget={setRevealedAccessTarget} />
          <SportsProfileSection data={data} age={age} />
          <PaymentsAndLedgerSection data={data} />
        </div>
      )}

      {activeTab === 'membership' && (
        <MembershipTab
          activeMembership={activeMembership}
          latestMembership={latestMembership}
          memberships={data.memberships}
          renewalWarning={renewalWarning}
          membershipEditor={membershipEditor}
          membershipSaving={membershipSaving}
          membershipDeletingId={membershipDeletingId}
          setMembershipEditor={setMembershipEditor}
          setActiveTab={setActiveTab}
          handleSaveMembership={handleSaveMembership}
          handleDeleteMembership={handleDeleteMembership}
        />
      )}

      {activeTab === 'bookings' && <BookingsTab bookings={data.bookings} />}
      {activeTab === 'attendance' && <AttendanceTab bookings={data.bookings} />}
      {activeTab === 'payments' && <PaymentsTab payments={data.payments} ledger={data.ledger} />}
      {activeTab === 'sports' && <SportsProfileSection data={data} age={age} expanded />}

      {activeTab === 'notes' && (
        <SectionShell
          title="Notas internas"
          description="Contexto operativo visible para administracion."
          action={
            <Link href={`/admin/alumnos/editar/${data.id}`} className="inline-flex min-h-10 items-center gap-2 rounded-2xl border border-slate-200 px-4 text-sm font-black text-slate-700">
              Editar nota
            </Link>
          }
        >
          <div className="rounded-[1.15rem] border border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-slate-700">
            {data.medical_notes || 'Sin notas internas registradas.'}
          </div>
          <div className="mt-5 rounded-[1.15rem] border border-rose-200 bg-rose-50 p-4">
            <p className="text-sm font-black text-rose-800">Zona sensible</p>
            <p className="mt-1 text-sm text-rose-700">Eliminar conserva las protecciones existentes del backend y requiere confirmacion.</p>
            <button
              type="button"
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-2xl border border-rose-300 bg-white px-4 text-sm font-black text-rose-700"
              onClick={handleDeleteStudent}
              disabled={deleting}
            >
              <Trash2 className="h-4 w-4" />
              {deleting ? 'Eliminando...' : 'Eliminar alumno'}
            </button>
          </div>
        </SectionShell>
      )}
    </div>
  )
}

function RecentClassesList({ bookings }: { bookings: StudentDetailData['bookings'] }) {
  return (
    <SectionShell title="Ultimas clases">
      {bookings.length === 0 ? (
        <EmptyOperationalState title="Sin clases registradas" description="Aun no hay asistencias, inasistencias o cancelaciones recientes." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          {bookings.slice(0, 6).map((booking) => (
            <div key={booking.id} className="grid gap-3 border-b border-slate-100 p-4 text-sm last:border-b-0 sm:grid-cols-[7rem_5rem_minmax(0,1fr)_auto] sm:items-center">
              <span className="font-bold text-slate-700">{formatDate(booking.start_at)}</span>
              <span className="text-slate-500">{booking.start_at ? dayjs(booking.start_at).format('HH:mm') : '-'}</span>
              <span className="text-slate-600">{booking.distance_m ? `${booking.distance_m} m` : 'Sin distancia'}</span>
              <OperationalStatusBadge label={statusLabel(booking.status)} tone={statusTone(booking.status)} />
            </div>
          ))}
        </div>
      )}
    </SectionShell>
  )
}

function ContactAndAccessSection({
  data,
  revealedAccessTarget,
  setRevealedAccessTarget,
}: {
  data: StudentDetailData
  revealedAccessTarget: string | null
  setRevealedAccessTarget: (value: string | null) => void
}) {
  const toggleAccessTarget = (target: string) => {
    setRevealedAccessTarget(revealedAccessTarget === target ? null : target)
  }

  return (
    <SectionShell title="Datos de contacto">
      <div className="space-y-3">
        <InfoRow label="Telefono" value={data.phone || 'No definido'} />
        <InfoRow label="Email" value={data.email || 'No definido'} />
        <InfoRow label="Tutor / Responsable" value={data.guardian?.full_name || 'Sin tutor vinculado'} />
        <InfoRow label="DNI" value={data.dni || 'No definido'} />
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {data.self_account && (
          <AccessCodeCard
            title="Acceso alumno"
            accountId={`student-${data.self_account.id}`}
            email={data.self_account.email}
            phone={data.self_account.phone}
            code={data.self_account.access_code}
            revealedTarget={revealedAccessTarget}
            onToggle={toggleAccessTarget}
          />
        )}
        {data.guardian && (
          <AccessCodeCard
            title="Acceso tutor"
            accountId={`guardian-${data.guardian.id}`}
            email={data.guardian.email}
            phone={data.guardian.phone}
            code={data.guardian.access_code}
            revealedTarget={revealedAccessTarget}
            onToggle={toggleAccessTarget}
          />
        )}
      </div>
    </SectionShell>
  )
}

function SportsProfileSection({ data, age, expanded = false }: { data: StudentDetailData; age: number | null; expanded?: boolean }) {
  return (
    <SectionShell title="Perfil deportivo" description={expanded ? 'Datos tecnicos usados para asignar turnos, distancias y equipo.' : undefined}>
      <div className="rounded-2xl border border-slate-200">
        <InfoRow label="Edad" value={age !== null ? `${age} anos` : 'No definida'} />
        <InfoRow label="Disciplina" value={data.division || 'No definida'} />
        <InfoRow label="Categoria" value={data.category || 'No definida'} />
        <InfoRow label="Nivel" value={data.level || 'No definido'} />
        <InfoRow label="Distancia de entrenamiento" value={data.current_distance_m ? `${data.current_distance_m} metros` : 'No definida'} />
        <InfoRow label="Genero" value={data.gender || 'No definido'} />
        <InfoRow label="Arco propio" value={data.has_own_bow ? 'Si' : 'No'} />
        <InfoRow label="Equipo asignado" value={bowLabel(data.has_own_bow, data.assigned_bow, data.bow_poundage)} />
      </div>
    </SectionShell>
  )
}

function PaymentsAndLedgerSection({ data }: { data: StudentDetailData }) {
  return (
    <SectionShell title="Ultimos pagos / movimientos">
      <div className="space-y-2">
        {data.payments.slice(0, 5).map((payment) => (
          <div key={payment.id} className="grid gap-3 rounded-2xl border border-slate-200 p-3 text-sm sm:grid-cols-[7rem_minmax(0,1fr)_auto_auto] sm:items-center">
            <span className="text-slate-500">{formatDate(payment.paid_at)}</span>
            <span className="font-bold text-slate-700">{payment.notes || payment.payment_method || 'Pago de membresia'}</span>
            <span className="font-black text-slate-950">{formatMoney(payment.amount, payment.currency)}</span>
            <OperationalStatusBadge label={statusLabel(payment.payment_status)} tone={statusTone(payment.payment_status)} />
          </div>
        ))}
        {data.payments.length === 0 && data.ledger.length === 0 && (
          <EmptyOperationalState title="Sin movimientos" description="No hay pagos ni movimientos de credito recientes." />
        )}
      </div>
    </SectionShell>
  )
}

function MembershipTab({
  activeMembership,
  latestMembership,
  memberships,
  renewalWarning,
  membershipEditor,
  membershipSaving,
  membershipDeletingId,
  setMembershipEditor,
  setActiveTab,
  handleSaveMembership,
  handleDeleteMembership,
}: {
  activeMembership: StudentMembershipSummary | null
  latestMembership: StudentMembershipSummary | null
  memberships: StudentMembershipSummary[]
  renewalWarning: string
  membershipEditor: MembershipEditorState | null
  membershipSaving: boolean
  membershipDeletingId: string | null
  setMembershipEditor: (value: MembershipEditorState | null) => void
  setActiveTab: (tab: TabId) => void
  handleSaveMembership: () => void
  handleDeleteMembership: (membership: StudentMembershipSummary) => void
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <SectionShell
        title="Membresia actual"
        description="El ciclo activo no acumula saldo al renovarse; una nueva venta reemplaza el ciclo anterior."
        action={<OperationalStatusBadge label={statusLabel(activeMembership?.status || latestMembership?.status)} tone={statusTone(activeMembership?.status || latestMembership?.status)} />}
      >
        {activeMembership ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200">
              <InfoRow label="Plan" value={activeMembership.custom_name} />
              <InfoRow label="Inicio" value={formatDate(activeMembership.start_date)} />
              <InfoRow label="Vencimiento" value={formatDate(activeMembership.end_date)} />
              <InfoRow label="Clases totales" value={activeMembership.classes_total} />
              <InfoRow label="Usadas" value={activeMembership.classes_used} />
              <InfoRow label="Disponibles" value={activeMembership.classes_remaining} danger={activeMembership.classes_remaining <= 1} />
              <InfoRow label="Monto" value={formatMoney(activeMembership.total_amount, activeMembership.currency)} />
              <InfoRow label="Notas" value={activeMembership.notes || 'Sin notas'} />
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-800">
              {renewalWarning}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-slate-200 px-4 text-sm font-black text-slate-700" onClick={() => setMembershipEditor(membershipEditorFromSummary(activeMembership))}>
                <Edit3 className="h-4 w-4" />
                Editar membresia
              </button>
              <Link href="/admin/membresias" className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-accent px-4 text-sm font-black text-white">
                <Plus className="h-4 w-4" />
                Renovar membresia
              </Link>
            </div>
          </div>
        ) : (
          <EmptyOperationalState
            title="Sin membresia activa"
            description="El alumno no puede reservar hasta que tenga un ciclo activo con saldo."
            action={<Link href="/admin/membresias" className="rounded-2xl bg-accent px-5 py-3 text-sm font-black text-white">Asignar plan</Link>}
          />
        )}
      </SectionShell>

      <SectionShell title="Historial de membresias" action={<button type="button" className="text-sm font-black text-accent" onClick={() => setActiveTab('payments')}>Ver pagos</button>}>
        {memberships.length === 0 ? (
          <EmptyOperationalState title="Sin historial" description="No hay membresias registradas para este alumno." />
        ) : (
          <div className="space-y-3">
            {memberships.map((membership) => (
              <div key={membership.id} className="rounded-[1.15rem] border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-black text-slate-950">{membership.custom_name}</p>
                    <p className="mt-1 text-sm text-slate-500">{formatDate(membership.start_date)} - {formatDate(membership.end_date)}</p>
                  </div>
                  <OperationalStatusBadge label={statusLabel(membership.status)} tone={statusTone(membership.status)} />
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <p className="text-xs font-bold text-slate-500">Total</p>
                    <p className="mt-1 font-black text-slate-950">{membership.classes_total}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <p className="text-xs font-bold text-slate-500">Usadas</p>
                    <p className="mt-1 font-black text-slate-950">{membership.classes_used}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <p className="text-xs font-bold text-slate-500">Restantes</p>
                    <p className="mt-1 font-black text-slate-950">{membership.classes_remaining}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-700" onClick={() => setMembershipEditor(membershipEditorFromSummary(membership))}>
                    Editar
                  </button>
                  {canDeleteExpiredMembership(membership) && (
                    <button type="button" className="rounded-2xl border border-rose-200 px-4 py-2 text-sm font-black text-rose-700 disabled:opacity-60" onClick={() => handleDeleteMembership(membership)} disabled={membershipDeletingId === membership.id}>
                      {membershipDeletingId === membership.id ? 'Eliminando...' : 'Eliminar vencida'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionShell>

      {membershipEditor && (
        <AdminContentPanel className="p-5 sm:p-6 xl:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-950">Editar membresia</h2>
              <p className="mt-1 text-sm text-slate-500">Cambios manuales protegidos por RPC admin y validaciones de backend.</p>
            </div>
            <button type="button" className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-700" onClick={() => setMembershipEditor(null)}>
              Cerrar
            </button>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <EditorInput label="Nombre" value={membershipEditor.custom_name} onChange={(value) => setMembershipEditor({ ...membershipEditor, custom_name: value })} />
            <EditorInput label="Inicio" type="date" value={membershipEditor.start_date} onChange={(value) => setMembershipEditor({ ...membershipEditor, start_date: value })} />
            <EditorInput label="Fin" type="date" value={membershipEditor.end_date} onChange={(value) => setMembershipEditor({ ...membershipEditor, end_date: value })} />
            <label className="grid gap-2 text-sm font-bold text-slate-600">
              Estado
              <select className="min-h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-950 outline-none focus:border-accent" value={membershipEditor.status} onChange={(event) => setMembershipEditor({ ...membershipEditor, status: event.target.value })}>
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="expired">Expired</option>
                <option value="cancelled">Cancelled</option>
                <option value="consumed">Consumed</option>
                <option value="historical">Historical</option>
              </select>
            </label>
            <EditorInput label="Clases totales" type="number" value={membershipEditor.classes_total} onChange={(value) => setMembershipEditor({ ...membershipEditor, classes_total: value })} />
            <EditorInput label="Clases usadas" type="number" value={membershipEditor.classes_used} onChange={(value) => setMembershipEditor({ ...membershipEditor, classes_used: value })} />
            <EditorInput label="Clases restantes" type="number" value={membershipEditor.classes_remaining} onChange={(value) => setMembershipEditor({ ...membershipEditor, classes_remaining: value })} />
            <EditorInput label="Monto total" type="number" value={membershipEditor.total_amount} onChange={(value) => setMembershipEditor({ ...membershipEditor, total_amount: value })} />
            <EditorInput label="Moneda" value={membershipEditor.currency} onChange={(value) => setMembershipEditor({ ...membershipEditor, currency: value.toUpperCase() })} />
            <label className="grid gap-2 text-sm font-bold text-slate-600 sm:col-span-2 xl:col-span-3">
              Notas
              <textarea className="min-h-28 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-950 outline-none focus:border-accent" value={membershipEditor.notes} onChange={(event) => setMembershipEditor({ ...membershipEditor, notes: event.target.value })} />
            </label>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" className="rounded-2xl bg-accent px-5 py-3 text-sm font-black text-white" onClick={handleSaveMembership} disabled={membershipSaving}>
              {membershipSaving ? 'Guardando...' : 'Guardar membresia'}
            </button>
            <button type="button" className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-black text-slate-700" onClick={() => setMembershipEditor(null)}>
              Cancelar
            </button>
          </div>
        </AdminContentPanel>
      )}
    </div>
  )
}

function EditorInput({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <label className="grid gap-2 text-sm font-bold text-slate-600">
      {label}
      <input
        type={type}
        min={type === 'number' ? 0 : undefined}
        step={type === 'number' ? '0.01' : undefined}
        className="min-h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-950 outline-none focus:border-accent"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

function BookingsTab({ bookings }: { bookings: StudentDetailData['bookings'] }) {
  return (
    <SectionShell title="Reservas" description="Reservas recientes y futuras asociadas al alumno.">
      {bookings.length === 0 ? (
        <EmptyOperationalState title="Sin reservas" description="No hay reservas registradas para este alumno." />
      ) : (
        <div className="grid gap-3">
          {bookings.map((booking) => (
            <div key={booking.id} className="grid gap-4 rounded-[1.15rem] border border-slate-200 bg-white p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="min-w-0">
                <p className="font-black text-slate-950">{formatDateTime(booking.start_at)}</p>
                <p className="mt-1 text-sm text-slate-500">{booking.distance_m ? `${booking.distance_m} metros` : 'Sin distancia'} - {booking.bow_usage_type || 'Equipo no definido'}</p>
                {booking.admin_notes && <p className="mt-2 text-sm font-semibold text-amber-700">{booking.admin_notes}</p>}
              </div>
              <OperationalStatusBadge label={statusLabel(booking.status)} tone={statusTone(booking.status)} />
            </div>
          ))}
        </div>
      )}
    </SectionShell>
  )
}

function AttendanceTab({ bookings }: { bookings: StudentDetailData['bookings'] }) {
  const attendanceRows = bookings.filter((booking) => booking.status === 'attended' || booking.status === 'no_show' || booking.status === 'cancelled')

  return (
    <SectionShell title="Asistencia" description="Historial operativo de asistencia, inasistencias y cancelaciones.">
      {attendanceRows.length === 0 ? (
        <EmptyOperationalState title="Sin asistencia registrada" description="Aun no hay clases cerradas para este alumno." />
      ) : (
        <div className="grid gap-3">
          {attendanceRows.map((booking) => (
            <div key={booking.id} className="grid gap-4 rounded-[1.15rem] border border-slate-200 bg-white p-4 sm:grid-cols-[8rem_minmax(0,1fr)_auto] sm:items-center">
              <span className="font-black text-slate-950">{booking.start_at ? dayjs(booking.start_at).format('DD MMM') : '-'}</span>
              <span className="text-sm font-semibold text-slate-600">{booking.start_at ? dayjs(booking.start_at).format('HH:mm') : '-'} - {booking.distance_m ? `${booking.distance_m} metros` : 'Sin distancia'}</span>
              <OperationalStatusBadge label={statusLabel(booking.status)} tone={statusTone(booking.status)} />
            </div>
          ))}
        </div>
      )}
    </SectionShell>
  )
}

function PaymentsTab({ payments, ledger }: { payments: StudentDetailData['payments']; ledger: StudentDetailData['ledger'] }) {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <SectionShell title="Pagos">
        {payments.length === 0 ? (
          <EmptyOperationalState title="Sin pagos" description="No hay pagos registrados para este alumno." />
        ) : (
          <div className="space-y-3">
            {payments.map((payment) => (
              <div key={payment.id} className="rounded-[1.15rem] border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-black text-slate-950">{formatMoney(payment.amount, payment.currency)}</p>
                    <p className="mt-1 text-sm text-slate-500">{formatDate(payment.paid_at)} - {payment.payment_method || 'Metodo no definido'}</p>
                  </div>
                  <OperationalStatusBadge label={statusLabel(payment.payment_status)} tone={statusTone(payment.payment_status)} />
                </div>
                {payment.notes && <p className="mt-3 text-sm text-slate-600">{payment.notes}</p>}
              </div>
            ))}
          </div>
        )}
      </SectionShell>

      <SectionShell title="Movimientos de credito">
        {ledger.length === 0 ? (
          <EmptyOperationalState title="Sin movimientos" description="No hay consumo o devoluciones registradas." />
        ) : (
          <div className="space-y-3">
            {ledger.map((entry) => (
              <div key={entry.id} className="rounded-[1.15rem] border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-black text-slate-950">{entry.reason}</p>
                    <p className="mt-1 text-sm text-slate-500">{formatDateTime(entry.created_at)} - saldo {entry.balance_after ?? '-'}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-black ${entry.delta >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                    {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionShell>
    </div>
  )
}
