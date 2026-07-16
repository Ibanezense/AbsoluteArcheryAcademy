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
  Copy,
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
import { buildPaymentDocumentRows, filterAttendance, selectPendingBookings, summarizeAttendance, type AttendanceFilter } from '@/lib/utils/adminStudentProfile'
import { getStudentOperationalStatus } from '@/lib/utils/studentOperationalStatus'

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

type TabId = 'profile' | 'sports' | 'attendance' | 'membership' | 'payments' | 'bookings'
type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'profile', label: 'Perfil' },
  { id: 'sports', label: 'Datos deportivos' },
  { id: 'attendance', label: 'Asistencias' },
  { id: 'membership', label: 'Membresia' },
  { id: 'payments', label: 'Pagos' },
  { id: 'bookings', label: 'Reservas' },
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
    expiring: 'Por vencer',
    paused: 'En pausa',
    expired: 'Vencido',
    inactive: 'Inactivo',
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
  if (status === 'reserved' || status === 'pending' || status === 'draft' || status === 'expiring') return 'warning'
  if (status === 'no_show' || status === 'late' || status === 'expired' || status === 'inactive' || status === 'consumed' || status === 'blocked' || status === 'suspended') return 'danger'
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
  const latestMembership = data.active_membership || getLatestMembership(data.memberships)
  return getStudentOperationalStatus({
    membershipStatus: latestMembership?.status || null,
    classesRemaining: latestMembership?.classes_remaining || 0,
    membershipEnd: latestMembership?.end_date || null,
    membershipExpiredAt: latestMembership?.expired_at || null,
    effectiveStatus: data.operational_status,
    hasMembership: Boolean(latestMembership),
    isActive: data.is_active,
  })
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

  const [activeTab, setActiveTab] = useState<TabId>('profile')
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
        <div role="tablist" aria-label="Secciones del perfil del alumno" className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-3 pt-3">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`student-tab-${tab.id}`}
              aria-selected={activeTab === tab.id}
              aria-controls={`student-panel-${tab.id}`}
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

      <div role="tabpanel" id={`student-panel-${activeTab}`} aria-labelledby={`student-tab-${activeTab}`}>
        {activeTab === 'profile' && (
          <ProfileTab
            data={data}
            age={age}
            operationalStatus={operationalStatus}
            revealedAccessTarget={revealedAccessTarget}
            setRevealedAccessTarget={setRevealedAccessTarget}
          />
        )}

      {activeTab === 'membership' && (
        <MembershipTab
          activeMembership={activeMembership}
          latestMembership={latestMembership}
          memberships={data.memberships}
          payments={data.payments}
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
      {activeTab === 'payments' && <PaymentsTab payments={data.payments} />}
        {activeTab === 'sports' && <SportsProfileSection data={data} age={age} expanded />}
      </div>
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

function ProfileTab({
  data,
  age,
  operationalStatus,
  revealedAccessTarget,
  setRevealedAccessTarget,
}: {
  data: StudentDetailData
  age: number | null
  operationalStatus: string
  revealedAccessTarget: string | null
  setRevealedAccessTarget: (value: string | null) => void
}) {
  const account = data.self_account
  const target = account ? `student-${account.id}` : 'student-no-account'
  const revealed = revealedAccessTarget === target

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(18rem,0.72fr)_minmax(0,1.55fr)]">
      <SectionShell title="Perfil del alumno">
        <div className="flex flex-col items-center text-center">
          <Avatar name={data.full_name} url={data.avatar_url} size="lg" className="h-32 w-32 border-4 border-white shadow-[0_18px_45px_rgba(15,23,42,0.16)]" />
          <h2 className="mt-5 text-2xl font-black tracking-tight text-slate-950">{data.full_name}</h2>
          <div className="mt-3">
            <OperationalStatusBadge label={statusLabel(operationalStatus)} tone={statusTone(operationalStatus)} />
          </div>
        </div>
        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Codigo de acceso</p>
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="font-mono text-base font-black tracking-[0.25em] text-slate-950">
              {revealed ? account?.access_code || 'Sin codigo' : '••••••'}
            </span>
            <div className="flex gap-2">
              <button type="button" aria-label={revealed ? 'Ocultar codigo' : 'Mostrar codigo'} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600" onClick={() => setRevealedAccessTarget(revealed ? null : target)}>
                {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              <button type="button" aria-label="Copiar codigo" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 disabled:opacity-40" disabled={!account?.access_code} onClick={() => account?.access_code && navigator.clipboard.writeText(account.access_code)}>
                <Copy className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
        <Link href={`/admin/alumnos/editar/${data.id}`} className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-accent px-4 text-sm font-black text-white">
          <Edit3 className="h-4 w-4" /> Editar perfil
        </Link>
      </SectionShell>

      <SectionShell title="Informacion general" description="Datos personales y de contacto registrados en la academia.">
        <div className="grid overflow-hidden rounded-2xl border border-slate-200 sm:grid-cols-2 xl:grid-cols-3">
          <ProfileField label="Nombre completo" value={data.full_name} />
          <ProfileField label="Genero" value={data.gender || 'No definido'} />
          <ProfileField label="Correo electronico" value={data.email || data.self_account?.email || 'No definido'} />
          <ProfileField label="Numero de telefono" value={data.phone || data.self_account?.phone || 'No definido'} />
          <ProfileField label="DNI" value={data.dni || 'No definido'} />
          <ProfileField label="Fecha de nacimiento" value={formatDate(data.date_of_birth)} />
          <ProfileField label="Edad" value={age !== null ? `${age} anos` : 'No definida'} />
          <ProfileField label="Fecha de ingreso" value={formatDate(data.created_at)} />
          <ProfileField label="Tutor responsable" value={data.guardian?.full_name || 'Sin tutor vinculado'} />
        </div>
      </SectionShell>
    </div>
  )
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-h-24 border-b border-r border-slate-200 bg-white p-4">
      <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <p className="mt-2 break-words text-sm font-bold text-slate-950">{value}</p>
    </div>
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
        <InfoRow label="Mano dominante" value={data.dominant_hand === 'right' ? 'Derecha' : data.dominant_hand === 'left' ? 'Izquierda' : data.dominant_hand === 'ambidextrous' ? 'Ambidiestro' : 'No definida'} />
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
  payments,
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
  payments: StudentDetailData['payments']
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
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Membresia</th><th className="px-4 py-3">Inicio</th><th className="px-4 py-3">Finalizacion</th><th className="px-4 py-3">Referencia</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Tipo de pago</th><th className="px-4 py-3">Importe</th><th className="px-4 py-3">Acciones</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {memberships.map((membership) => (
                  <tr key={membership.id} className="bg-white align-top">
                    <td className="px-4 py-4"><p className="font-black text-slate-950">{membership.custom_name}</p><p className="mt-1 text-xs text-slate-500">{membership.classes_remaining} de {membership.classes_total} clases</p></td>
                    <td className="whitespace-nowrap px-4 py-4 text-slate-600">{formatDate(membership.start_date)}</td>
                    <td className="whitespace-nowrap px-4 py-4 text-slate-600">{formatDate(membership.end_date)}</td>
                    <td className="whitespace-nowrap px-4 py-4 text-slate-500">MEM-{membership.id.slice(0, 8).toUpperCase()}</td>
                    <td className="px-4 py-4"><OperationalStatusBadge label={statusLabel(membership.status)} tone={statusTone(membership.status)} /></td>
                    <td className="whitespace-nowrap px-4 py-4 text-slate-600">{payments.find((payment) => payment.student_membership_id === membership.id)?.payment_method || 'Sin registro'}</td>
                    <td className="whitespace-nowrap px-4 py-4 font-bold text-slate-950">{formatMoney(membership.total_amount, membership.currency)}</td>
                    <td className="px-4 py-4"><div className="flex flex-wrap gap-2"><button type="button" className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700" onClick={() => setMembershipEditor(membershipEditorFromSummary(membership))}>Informacion y cambios</button>{canDeleteExpiredMembership(membership) && <button type="button" className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-black text-rose-700 disabled:opacity-60" onClick={() => handleDeleteMembership(membership)} disabled={membershipDeletingId === membership.id}>{membershipDeletingId === membership.id ? 'Eliminando...' : 'Cancelar / eliminar'}</button>}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
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
  const pendingBookings = selectPendingBookings(bookings)

  return (
    <SectionShell title="Reservas" description="Reservas activas que aun no se convirtieron en asistencia, cancelacion o inasistencia.">
      {pendingBookings.length === 0 ? (
        <EmptyOperationalState title="Sin reservas pendientes" description="No hay reservas activas para este alumno." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Horario</th><th className="px-4 py-3">Distancia</th><th className="px-4 py-3">Arco</th><th className="px-4 py-3">Estado</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {pendingBookings.map((booking) => (
                <tr key={booking.id} className="bg-white">
                  <td className="whitespace-nowrap px-4 py-4 font-bold text-slate-950">{formatDate(booking.start_at)}</td>
                  <td className="whitespace-nowrap px-4 py-4 text-slate-600">{booking.start_at ? dayjs(booking.start_at).format('HH:mm') : '-'} - {booking.end_at ? dayjs(booking.end_at).format('HH:mm') : '-'}</td>
                  <td className="px-4 py-4 text-slate-600">{booking.distance_m ? `${booking.distance_m} m` : 'No definida'}</td>
                  <td className="px-4 py-4 text-slate-600">{booking.bow_usage_type || 'No definido'}</td>
                  <td className="px-4 py-4"><OperationalStatusBadge label="Confirmada" tone="warning" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionShell>
  )
}

function AttendanceTab({ bookings }: { bookings: StudentDetailData['bookings'] }) {
  const [filter, setFilter] = useState<AttendanceFilter>('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const summary = summarizeAttendance(bookings)
  const attendanceRows = filterAttendance(bookings, filter, from, to)

  return (
    <SectionShell title="Asistencias" description="Historial operativo de asistencias, inasistencias y cancelaciones.">
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <AttendanceKpi label="Asistencias" value={summary.attended} tone="bg-emerald-50 text-emerald-700" />
        <AttendanceKpi label="Inasistencias" value={summary.noShow} tone="bg-rose-50 text-rose-700" />
        <AttendanceKpi label="Cancelaciones" value={summary.cancelled} tone="bg-amber-50 text-amber-700" />
      </div>
      <div className="mb-5 flex flex-wrap gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <select aria-label="Filtrar asistencias" className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700" value={filter} onChange={(event) => setFilter(event.target.value as AttendanceFilter)}>
          <option value="all">Todos los resultados</option><option value="attended">Asistencias</option><option value="no_show">Inasistencias</option><option value="cancelled">Cancelaciones</option>
        </select>
        <input aria-label="Fecha inicial" type="date" className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700" value={from} onChange={(event) => setFrom(event.target.value)} />
        <input aria-label="Fecha final" type="date" className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700" value={to} onChange={(event) => setTo(event.target.value)} />
      </div>
      {attendanceRows.length === 0 ? (
        <EmptyOperationalState title="Sin resultados" description="No hay registros que coincidan con los filtros seleccionados." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs font-black uppercase text-slate-500"><tr><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Hora</th><th className="px-4 py-3">Distancia</th><th className="px-4 py-3">Resultado</th><th className="px-4 py-3">Nota</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{attendanceRows.map((booking) => <tr key={booking.id} className="bg-white"><td className="whitespace-nowrap px-4 py-4 font-bold text-slate-950">{formatDate(booking.start_at)}</td><td className="px-4 py-4 text-slate-600">{booking.start_at ? dayjs(booking.start_at).format('HH:mm') : '-'}</td><td className="px-4 py-4 text-slate-600">{booking.distance_m ? `${booking.distance_m} m` : '-'}</td><td className="px-4 py-4"><OperationalStatusBadge label={statusLabel(booking.status)} tone={statusTone(booking.status)} /></td><td className="max-w-xs px-4 py-4 text-slate-600">{booking.admin_notes || '-'}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </SectionShell>
  )
}

function AttendanceKpi({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <div className={`rounded-2xl p-4 ${tone}`}><p className="text-xs font-black uppercase tracking-wide">{label}</p><p className="mt-2 text-3xl font-black">{value}</p></div>
}

function PaymentsTab({ payments }: { payments: StudentDetailData['payments'] }) {
  const documents = buildPaymentDocumentRows(payments)
  return (
    <div className="grid gap-5">
      <SectionShell title="Registros de pago" description="Referencias internas de los pagos existentes. La numeracion de documentos se incorporara en el modulo de comprobantes.">
        {documents.length === 0 ? (
          <EmptyOperationalState title="Sin registros de pago" description="No hay documentos o pagos registrados para este alumno." />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs font-black uppercase text-slate-500"><tr><th className="px-4 py-3">Referencia</th><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Estado</th></tr></thead><tbody className="divide-y divide-slate-100">{documents.map((document) => <tr key={document.id} className="bg-white"><td className="px-4 py-4 font-black text-blue-600">{document.reference}</td><td className="px-4 py-4 text-slate-600">{formatDateTime(document.date)}</td><td className="px-4 py-4"><OperationalStatusBadge label={statusLabel(document.status)} tone={statusTone(document.status)} /></td></tr>)}</tbody></table>
          </div>
        )}
      </SectionShell>

      <SectionShell title="Transacciones">
        {payments.length === 0 ? (
          <EmptyOperationalState title="Sin transacciones" description="No hay transacciones registradas para este alumno." />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs font-black uppercase text-slate-500"><tr><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Cantidad</th><th className="px-4 py-3">Metodo de pago</th><th className="px-4 py-3">Accion</th><th className="px-4 py-3">Documento</th></tr></thead><tbody className="divide-y divide-slate-100">{payments.map((payment) => <tr key={payment.id} className="bg-white"><td className="whitespace-nowrap px-4 py-4 text-slate-600">{formatDateTime(payment.paid_at)}</td><td className="px-4 py-4 font-black text-slate-950">{formatMoney(payment.amount, payment.currency)}</td><td className="px-4 py-4 text-slate-600">{payment.payment_method || 'No definido'}</td><td className="px-4 py-4"><OperationalStatusBadge label={statusLabel(payment.payment_status)} tone={statusTone(payment.payment_status)} /></td><td className="px-4 py-4 font-bold text-blue-600">Pago {payment.id.slice(0, 8).toUpperCase()}</td></tr>)}</tbody></table></div>
        )}
      </SectionShell>
    </div>
  )
}
