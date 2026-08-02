'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import {
  AlertTriangle,
  ArrowRight,
  BadgeDollarSign,
  CalendarClock,
  CalendarDays,
  Clock3,
  CreditCard,
  ChevronDown,
  Copy,
  Edit3,
  Eye,
  EyeOff,
  KeyRound,
  MoreHorizontal,
  Plus,
  Save,
  ShieldAlert,
  Target,
  Trash2,
  UserRound,
  WalletCards,
  X,
  XCircle,
} from 'lucide-react'
import { AdminContentPanel, AdminPageHeader } from '@/components/admin/AdminVisualSystem'
import { EmptyOperationalState, OperationalStatusBadge } from '@/components/admin/AdminOperationalComponents'
import Avatar from '@/components/ui/Avatar'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/ToastProvider'
import { useStudentDetail, type StudentDetailData, type StudentMembershipSummary } from '@/lib/hooks/useStudentDetail'
import { membershipPlanKeys, useMembershipPlans, type MembershipPlan } from '@/lib/hooks/useMembershipPlans'
import { studentKeys } from '@/lib/queries/studentQueries'
import { supabase } from '@/lib/supabaseClient'
import { calculateAge } from '@/lib/utils/dateUtils'
import {
  buildMembershipDeletionConfirmation,
  formatMembershipDeletionSuccess,
  isPersistedMembership,
  parseMembershipDeletionPreview,
  parseMembershipDeletionResult,
} from '@/lib/utils/adminMembershipDeletion'
import {
  buildPaymentDocumentRows,
  filterAttendance,
  getBowFlags,
  getMembershipDisplayFields,
  getStudentBowUsage,
  selectPendingBookings,
  summarizeAttendance,
  type AttendanceFilter,
  type StudentBowUsageType,
} from '@/lib/utils/adminStudentProfile'
import { getStudentOperationalStatus } from '@/lib/utils/studentOperationalStatus'
import { getLimaDateKey, MEMBERSHIP_TIMEZONE } from '@/lib/utils/membershipCycles'
import { buildStudentAttendanceHistory } from '@/lib/utils/studentAttendanceHistory'

type MembershipEditorState = {
  id: string
  action: MembershipAction
  membership_plan_id: string
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
  payment_type: string
  billing_date: string
  discount_type: 'none' | 'amount' | 'percentage'
  discount_value: string
  frozen_until: string
}

type MembershipAction = 'info' | 'cancel' | 'dates' | 'plan' | 'payment_type' | 'billing_date' | 'discount' | 'freeze'

type MembershipAssignmentFormState = {
  membership_plan_id: string
  start_date: string
  payment_type: string
  payment_received: boolean
  payment_amount: string
  discount_type: 'none' | 'amount' | 'percentage'
  discount_value: string
  billing_date: string
  notes: string
}

type ProfileFormState = {
  full_name: string
  avatar_url: string
  gender: string
  email: string
  phone: string
  dni: string
  date_of_birth: string
  guardian_name: string
  guardian_email: string
  guardian_phone: string
}

type SportsFormState = {
  division: string
  category: string
  level: string
  dominant_hand: string
  current_distance_m: string
  bow_usage_type: StudentBowUsageType
  bow_poundage: string
}

type TabId = 'profile' | 'sports' | 'attendance' | 'membership' | 'payments' | 'bookings'
type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'
type AccountMode = 'student_only' | 'guardian_only' | 'student_and_guardian'

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'profile', label: 'Perfil' },
  { id: 'sports', label: 'Datos deportivos' },
  { id: 'attendance', label: 'Asistencias' },
  { id: 'membership', label: 'Membresía' },
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

function daysBetweenToday(value: string | null | undefined, serviceDate: string) {
  if (!value) return null
  return dayjs(value).startOf('day').diff(dayjs(serviceDate).startOf('day'), 'day')
}

function useLimaBoundaryClock(bookings: StudentDetailData['bookings'] | undefined) {
  const [now, setNow] = useState(() => new Date())
  const nextBoundaryAt = useMemo(() => {
    const nowMs = now.getTime()
    const nextLimaMidnight = dayjs(now)
      .tz(MEMBERSHIP_TIMEZONE)
      .add(1, 'day')
      .startOf('day')
      .valueOf()
    let boundary = nextLimaMidnight

    for (const booking of bookings || []) {
      if (booking.status !== 'reserved' || !booking.start_at) continue
      const startsAt = new Date(booking.start_at).getTime()
      if (Number.isFinite(startsAt) && startsAt > nowMs && startsAt < boundary) {
        boundary = startsAt
      }
    }

    return boundary
  }, [bookings, now])

  useEffect(() => {
    const delay = Math.max(nextBoundaryAt - Date.now() + 50, 50)
    const timer = setTimeout(() => setNow(new Date()), delay)
    return () => clearTimeout(timer)
  }, [nextBoundaryAt])

  return now
}

function statusLabel(status: string | null | undefined) {
  const labels: Record<string, string> = {
    current: 'En consumo',
    scheduled: 'Programada',
    queued: 'En espera',
    active: 'Activa',
    expiring: 'Por vencer',
    paused: 'En pausa',
    expired: 'Vencido',
    inactive: 'Inactivo',
    consumed: 'Consumida',
    historical: 'Histórica',
    cancelled: 'Cancelada',
    draft: 'Borrador',
    reserved: 'Confirmada',
    attended: 'Asistió',
    no_show: 'No asistió',
    paid: 'Pagado',
    pending: 'Pendiente',
    late: 'Atrasado',
    waived: 'Cortesía',
    blocked: 'Bloqueado',
    suspended: 'Suspendido',
    retired: 'Retirado',
    withdrawn: 'Retirado',
  }

  return labels[status || ''] || status || 'Sin estado'
}

function statusTone(status: string | null | undefined): BadgeTone {
  if (status === 'active' || status === 'current' || status === 'attended' || status === 'paid') return 'success'
  if (status === 'reserved' || status === 'pending' || status === 'draft' || status === 'expiring' || status === 'queued' || status === 'scheduled') return 'warning'
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

function profileFormFromData(data: StudentDetailData): ProfileFormState {
  return {
    full_name: data.full_name,
    avatar_url: data.avatar_url || '',
    gender: data.gender || '',
    email: data.email || data.self_account?.email || '',
    phone: data.phone || data.self_account?.phone || '',
    dni: data.dni || '',
    date_of_birth: data.date_of_birth || '',
    guardian_name: data.guardian?.full_name || '',
    guardian_email: data.guardian?.email || '',
    guardian_phone: data.guardian?.phone || '',
  }
}

function sportsFormFromData(data: StudentDetailData): SportsFormState {
  return {
    division: data.division || '',
    category: data.category || '',
    level: data.level || '',
    dominant_hand: data.dominant_hand || '',
    current_distance_m: data.current_distance_m ? String(data.current_distance_m) : '',
    bow_usage_type: getStudentBowUsage({
      hasOwnBow: data.has_own_bow,
      assignedBow: data.assigned_bow,
      bowPoundage: data.bow_poundage,
    }).type,
    bow_poundage: data.bow_poundage ? String(data.bow_poundage) : '',
  }
}

function accountModeForData(data: StudentDetailData, hasGuardian: boolean): AccountMode {
  if (data.self_account && hasGuardian) return 'student_and_guardian'
  if (hasGuardian) return 'guardian_only'
  return 'student_only'
}

function membershipEditorFromSummary(membership: StudentMembershipSummary): MembershipEditorState {
  return {
    id: membership.id,
    action: 'info',
    membership_plan_id: membership.membership_plan_id || '',
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
    payment_type: membership.payment_type || 'manual',
    billing_date: membership.billing_date || '',
    discount_type: (membership.discount_type || 'none') as MembershipEditorState['discount_type'],
    discount_value: String(membership.discount_value || ''),
    frozen_until: membership.frozen_until || '',
  }
}

function emptyMembershipAssignment(): MembershipAssignmentFormState {
  const today = dayjs().format('YYYY-MM-DD')
  return {
    membership_plan_id: '',
    start_date: today,
    payment_type: 'manual',
    payment_received: false,
    payment_amount: '',
    discount_type: 'none',
    discount_value: '',
    billing_date: today,
    notes: '',
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
          {isRevealed ? code || 'Sin código' : '••••••'}
        </span>
        <button
          type="button"
          onClick={() => onToggle(accountId)}
          className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-700 transition hover:border-accent/40 hover:text-accent"
        >
          {isRevealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {isRevealed ? 'Ocultar código' : 'Ver código'}
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
  const queryClient = useQueryClient()
  const router = useRouter()
  const confirm = useConfirm()
  const toast = useToast()
  const membershipDeletionLockRef = useRef(false)
  const detailQuery = useStudentDetail(params.id)
  const plansQuery = useMembershipPlans()
  const { data, isLoading, error } = detailQuery
  const boundaryClock = useLimaBoundaryClock(data?.bookings)
  const serviceDate = getLimaDateKey(boundaryClock)

  const [activeTab, setActiveTab] = useState<TabId>('profile')
  const [revealedAccessTarget, setRevealedAccessTarget] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [membershipEditor, setMembershipEditor] = useState<MembershipEditorState | null>(null)
  const [membershipSaving, setMembershipSaving] = useState(false)
  const [membershipPreviewingId, setMembershipPreviewingId] = useState<string | null>(null)
  const [membershipDeletingId, setMembershipDeletingId] = useState<string | null>(null)
  const [profileForm, setProfileForm] = useState<ProfileFormState | null>(null)
  const [sportsForm, setSportsForm] = useState<SportsFormState | null>(null)
  const [studentSaving, setStudentSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [generalActionsOpen, setGeneralActionsOpen] = useState(false)
  const [membershipMenuId, setMembershipMenuId] = useState<string | null>(null)
  const [assignmentOpen, setAssignmentOpen] = useState(false)
  const [assignmentForm, setAssignmentForm] = useState<MembershipAssignmentFormState>(emptyMembershipAssignment)
  const [assignmentSaving, setAssignmentSaving] = useState(false)

  const upcomingBookings = useMemo(() => (data?.bookings || [])
    .filter((booking) => booking.status === 'reserved' && booking.start_at && dayjs(booking.start_at).isAfter(boundaryClock))
    .sort((left, right) => new Date(left.start_at || '').getTime() - new Date(right.start_at || '').getTime()), [boundaryClock, data])

  useEffect(() => {
    if (!data) return
    setProfileForm(profileFormFromData(data))
    setSportsForm(sportsFormFromData(data))
  }, [data])

  async function refreshStudentData() {
    await queryClient.invalidateQueries({ queryKey: studentKeys.all })
  }

  async function uploadAvatar(file?: File) {
    if (!file || !profileForm || uploadingAvatar) return

    try {
      setUploadingAvatar(true)
      const extension = file.name.split('.').pop() || 'jpg'
      const path = `avatars/${crypto.randomUUID()}.${extension}`
      const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, {
        cacheControl: '3600',
        upsert: false,
      })

      if (uploadError) throw uploadError
      const { data: publicImage } = supabase.storage.from('avatars').getPublicUrl(path)
      setProfileForm((current) => current ? { ...current, avatar_url: publicImage.publicUrl } : current)
      toast.push({ message: 'Foto preparada. Guarda los cambios para aplicarla.', type: 'success' })
    } catch (uploadError: any) {
      toast.push({ message: uploadError.message || 'No se pudo subir la foto.', type: 'error' })
    } finally {
      setUploadingAvatar(false)
    }
  }

  async function handleSaveStudentProfile() {
    if (!data || !profileForm || !sportsForm || studentSaving) return

    if (!profileForm.full_name.trim()) {
      toast.push({ message: 'El nombre del alumno es obligatorio.', type: 'error' })
      return
    }

    const hasGuardian = Boolean(
      data.guardian ||
      profileForm.guardian_name.trim() ||
      profileForm.guardian_email.trim() ||
      profileForm.guardian_phone.trim(),
    )

    if (hasGuardian && (!profileForm.guardian_name.trim() || !profileForm.guardian_email.trim())) {
      toast.push({ message: 'Para agregar un tutor completa su nombre y email.', type: 'error' })
      return
    }

    const accountMode = accountModeForData(data, hasGuardian)
    if (accountMode !== 'guardian_only' && !profileForm.email.trim()) {
      toast.push({ message: 'El email del alumno es obligatorio porque tiene acceso propio.', type: 'error' })
      return
    }

    try {
      setStudentSaving(true)
      const { data: refreshed } = await supabase.auth.refreshSession()
      const accessToken = refreshed.session?.access_token
      if (!accessToken) throw new Error('Sesión expirada. Vuelve a iniciar sesión.')

      const bowFlags = getBowFlags(sportsForm.bow_usage_type)
      const response = await fetch('/api/admin/create-student', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          studentId: data.id,
          accountMode,
          student: {
            full_name: profileForm.full_name.trim(),
            avatar_url: profileForm.avatar_url || null,
            date_of_birth: profileForm.date_of_birth || null,
            dni: profileForm.dni || null,
            phone: profileForm.phone || null,
            email: profileForm.email || null,
            medical_notes: data.medical_notes,
            current_distance_m: sportsForm.current_distance_m ? Number(sportsForm.current_distance_m) : null,
            division: sportsForm.division || null,
            gender: profileForm.gender || null,
            category: sportsForm.category || null,
            level: sportsForm.level || null,
            dominant_hand: sportsForm.dominant_hand || null,
            has_own_bow: bowFlags.hasOwnBow,
            assigned_bow: bowFlags.assignedBow,
            bow_poundage: sportsForm.bow_poundage ? Number(sportsForm.bow_poundage) : null,
            is_active: data.is_active,
            is_country_club_tiabaya_member: data.is_country_club_tiabaya_member,
          },
          guardian: hasGuardian
            ? {
                full_name: profileForm.guardian_name.trim(),
                email: profileForm.guardian_email.trim(),
                phone: profileForm.guardian_phone || null,
                dni: data.guardian?.dni || null,
                relationship: data.guardian?.relationship || 'Tutor',
              }
            : null,
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'No se pudo actualizar el alumno.')

      toast.push({ message: 'Información del alumno actualizada.', type: 'success' })
      await refreshStudentData()
    } catch (saveError: any) {
      toast.push({ message: saveError.message || 'No se pudo actualizar el alumno.', type: 'error' })
    } finally {
      setStudentSaving(false)
    }
  }

  async function handleDeleteStudent() {
    if (!data || deleting) return

    const accepted = await confirm(
      `Se eliminará al alumno ${data.full_name}. Esta acción quitará su ficha, membresías, pagos y acceso propio.`,
      { title: 'Eliminar alumno' }
    )

    if (!accepted) return

    try {
      setDeleting(true)
      const { data: refreshed } = await supabase.auth.refreshSession()
      const accessToken = refreshed.session?.access_token

      if (!accessToken) throw new Error('Sesión expirada. Vuelve a iniciar sesión.')

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

    try {
      setMembershipSaving(true)
      const action = membershipEditor.action === 'freeze' && data?.memberships.find((row) => row.id === membershipEditor.id)?.frozen_at
        ? 'unfreeze'
        : membershipEditor.action
      const payload = action === 'dates'
        ? { start_date: membershipEditor.start_date, end_date: membershipEditor.end_date }
        : action === 'plan'
          ? { membership_plan_id: membershipEditor.membership_plan_id }
          : action === 'payment_type'
            ? { payment_type: membershipEditor.payment_type }
            : action === 'billing_date'
              ? { billing_date: membershipEditor.billing_date }
              : action === 'discount'
                ? { discount_type: membershipEditor.discount_type, discount_value: membershipEditor.discount_value }
                : action === 'freeze'
                  ? { frozen_until: membershipEditor.frozen_until }
                  : {}

      const { error: updateError } = await supabase.rpc('admin_manage_student_membership', {
        p_membership_id: membershipEditor.id,
        p_action: action,
        p_payload: payload,
      })

      if (updateError) throw updateError

      toast.push({ message: 'Membresía actualizada.', type: 'success' })
      setMembershipEditor(null)
      await refreshStudentData()
    } catch (membershipError: any) {
      toast.push({ message: membershipError.message || 'No se pudo actualizar la membresía.', type: 'error' })
    } finally {
      setMembershipSaving(false)
    }
  }

  async function handleToggleStudentBlock() {
    if (!data) return
    const nextActive = !data.is_active
    try {
      const { error: studentError } = await supabase
        .from('students')
        .update({ is_active: nextActive, updated_at: new Date().toISOString() })
        .eq('id', data.id)
      if (studentError) throw studentError

      if (data.self_account?.id) {
        const { error: profileError } = await supabase.from('profiles').update({ is_active: nextActive }).eq('id', data.self_account.id)
        if (profileError) throw profileError
      }

      toast.push({ message: nextActive ? 'Alumno reactivado.' : 'Alumno bloqueado.', type: 'success' })
      setGeneralActionsOpen(false)
      await refreshStudentData()
    } catch (blockError: any) {
      toast.push({ message: blockError.message || 'No se pudo cambiar el acceso del alumno.', type: 'error' })
    }
  }

  async function handleAssignMembership() {
    if (!data || assignmentSaving) return
    const selectedPlan = (plansQuery.data || []).find((plan) => plan.id === assignmentForm.membership_plan_id)
    if (!selectedPlan) {
      toast.push({ message: 'Selecciona un plan de membresía.', type: 'error' })
      return
    }

    const discountValue = Math.max(Number(assignmentForm.discount_value || 0), 0)
    const basePrice = selectedPlan.base_price || 0
    const discountAmount = assignmentForm.discount_type === 'percentage'
      ? Math.min(basePrice, basePrice * discountValue / 100)
      : assignmentForm.discount_type === 'amount'
        ? Math.min(basePrice, discountValue)
        : 0
    const finalAmount = Math.max(basePrice - discountAmount, 0)

    try {
      setAssignmentSaving(true)
      const { error: assignmentError } = await supabase.rpc('admin_assign_membership_from_profile', {
        p_student_id: data.id,
        p_membership_plan_id: selectedPlan.id,
        p_start_date: assignmentForm.start_date || null,
        p_total_amount: finalAmount,
        p_payment_amount: assignmentForm.payment_received ? Number(assignmentForm.payment_amount || finalAmount) : null,
        p_payment_type: assignmentForm.payment_type,
        p_discount_type: assignmentForm.discount_type,
        p_discount_value: discountValue,
        p_billing_date: assignmentForm.billing_date || null,
        p_notes: assignmentForm.notes.trim() || null,
      })
      if (assignmentError) throw assignmentError

      toast.push({ message: 'Membresía asignada correctamente.', type: 'success' })
      setAssignmentOpen(false)
      setAssignmentForm(emptyMembershipAssignment())
      await refreshStudentData()
    } catch (assignmentError: any) {
      toast.push({ message: assignmentError.message || 'No se pudo asignar la membresía.', type: 'error' })
    } finally {
      setAssignmentSaving(false)
    }
  }

  async function handleDeleteMembership(membership: StudentMembershipSummary) {
    if (!data || membershipDeletionLockRef.current || membershipPreviewingId || membershipDeletingId) return
    if (!isPersistedMembership(membership)) {
      toast.push({ message: 'No se encontro una membresia guardada para eliminar.', type: 'error' })
      return
    }

    membershipDeletionLockRef.current = true
    setMembershipPreviewingId(membership.id)

    try {
      const { data: rawPreviewData, error: previewError } = await supabase.rpc('admin_get_membership_deletion_preview', {
        p_membership_id: membership.id,
      })

      if (previewError) {
        toast.push({ message: previewError.message || 'No se pudo verificar la membresia.', type: 'error' })
        return
      }
      const previewData = parseMembershipDeletionPreview(rawPreviewData)
      if (!previewData.can_delete) {
        toast.push({ message: previewData.reason || 'El servidor no permite eliminar esta membresia.', type: 'error' })
        return
      }

      const accepted = await confirm(
        buildMembershipDeletionConfirmation(membership.custom_name, previewData),
        {
          title: 'Eliminar membresia',
          description: 'Esta accion es irreversible.',
          confirmLabel: 'Eliminar membresia',
          cancelLabel: 'Cancelar',
          tone: 'danger',
        },
      )

      if (!accepted) return

      setMembershipDeletingId(membership.id)
      const { data: rawDeleteData, error: deleteError } = await supabase.rpc('admin_delete_student_membership', {
        p_membership_id: membership.id,
      })

      if (deleteError) throw deleteError
      const deleteData = parseMembershipDeletionResult(rawDeleteData)
      if (!deleteData?.success) throw new Error(deleteData?.error || 'No se pudo eliminar la membresia.')

      toast.push({ message: formatMembershipDeletionSuccess(deleteData), type: 'success' })
      if (membershipEditor?.id === membership.id) setMembershipEditor(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: membershipPlanKeys.all }),
        queryClient.invalidateQueries({ queryKey: studentKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['admin-students'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-bookings'] }),
        queryClient.invalidateQueries({ queryKey: ['weekly-attendance-review'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-dashboard-operational'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-student-search'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-membership-renewal-requests'] }),
      ])
      await refreshStudentData()
    } catch (membershipError: any) {
      toast.push({ message: membershipError.message || 'No se pudo eliminar la membresia.', type: 'error' })
    } finally {
      membershipDeletionLockRef.current = false
      setMembershipPreviewingId(null)
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
  const membershipEndDelta = daysBetweenToday(activeMembership?.end_date, serviceDate)
  const membershipStatusesById = data.membership_statuses_by_id
  const currentFreeBalance = activeMembership
    ? data.available_classes_by_id[activeMembership.id] || 0
    : 0
  const nextBooking = upcomingBookings[0] || null
  const recentClasses = data.bookings.filter((booking) => booking.status !== 'reserved')
  const pendingPayments = data.payments.filter((payment) => payment.payment_status === 'pending' || payment.payment_status === 'late')
  const recentNoShows = data.bookings.filter((booking) => {
    if (booking.status !== 'no_show' || !booking.start_at) return false
    return dayjs(booking.start_at).isAfter(dayjs().subtract(14, 'day'))
  })
  const renewalWarning = 'Se creará un ciclo independiente. Los saldos anteriores se conservan y se consumen primero en orden cronológico.'

  const alerts = [
    activeMembership && membershipEndDelta !== null && membershipEndDelta < 0
      ? {
        title: 'Membresía vencida',
        description: `Vencio ${formatDate(activeMembership.end_date)}. No deberia reservar hasta renovar.`,
        action: 'Renovar ahora',
        href: '#membership',
        tone: 'danger',
        icon: <ShieldAlert className="h-6 w-6" />,
      }
      : null,
    activeMembership && membershipEndDelta !== null && membershipEndDelta >= 0 && membershipEndDelta <= 7
      ? {
        title: 'Membresía por vencer',
        description: `Vence en ${membershipEndDelta} días (${formatDate(activeMembership.end_date)}).`,
        action: 'Renovar ahora',
        href: '#membership',
        tone: 'warning',
        icon: <AlertTriangle className="h-6 w-6" />,
      }
      : null,
    activeMembership && data.usable_classes <= 0
      ? {
        title: 'Sin clases disponibles',
        description: 'El alumno no tiene saldo libre para nuevas reservas.',
        action: 'Asignar plan',
        href: '#membership',
        tone: 'danger',
        icon: <XCircle className="h-6 w-6" />,
      }
      : null,
    activeMembership && data.usable_classes === 1
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
        description: `${recentNoShows.length} falta(s) en los últimos 14 días.`,
        action: 'Revisar',
        href: '#attendance',
        tone: 'danger',
        icon: <ShieldAlert className="h-6 w-6" />,
      }
      : null,
    !nextBooking
      ? {
        title: 'Sin próxima reserva',
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
      <button type="button" onClick={() => { setAssignmentOpen(true); setActiveTab('membership') }} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-accent px-4 text-sm font-black text-white shadow-[0_16px_35px_rgba(249,115,22,0.24)]">
        <WalletCards className="h-4 w-4" />
        Asignar membresía
      </button>
      <div className="relative">
        <button type="button" aria-label="Acciones del alumno" aria-expanded={generalActionsOpen} onClick={() => setGeneralActionsOpen((open) => !open)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:border-accent/40 hover:text-accent">
          Acciones <ChevronDown className="h-4 w-4" />
        </button>
        {generalActionsOpen && (
          <div className="absolute right-0 top-full z-40 mt-2 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
            <button type="button" className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-bold text-slate-700 hover:bg-slate-50" onClick={() => { setAssignmentOpen(true); setActiveTab('membership'); setGeneralActionsOpen(false) }}><WalletCards className="h-4 w-4" /> Asignar membresía</button>
            <Link href="/admin/sesiones" className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50" onClick={() => setGeneralActionsOpen(false)}><CalendarDays className="h-4 w-4" /> Reservar clase</Link>
            <button type="button" className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-bold text-slate-700 hover:bg-slate-50" onClick={handleToggleStudentBlock}><ShieldAlert className="h-4 w-4" /> {data.is_active ? 'Bloquear alumno' : 'Reactivar alumno'}</button>
            <button type="button" className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-bold text-rose-600 hover:bg-rose-50" onClick={handleDeleteStudent} disabled={deleting}><Trash2 className="h-4 w-4" /> {deleting ? 'Eliminando…' : 'Eliminar alumno'}</button>
          </div>
        )}
      </div>
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
                <span><strong className="text-slate-950">Categoría:</strong> {data.category || 'No definida'}</span>
                <span><strong className="text-slate-950">Nivel:</strong> {data.level || 'No definido'}</span>
                <span><strong className="text-slate-950">Distancia:</strong> {data.current_distance_m ? `${data.current_distance_m} metros` : 'No definida'}</span>
                <span><strong className="text-slate-950">Equipo:</strong> {getStudentBowUsage({ hasOwnBow: data.has_own_bow, assignedBow: data.assigned_bow, bowPoundage: data.bow_poundage }).label}</span>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <KpiCard icon={<WalletCards className="h-5 w-5" />} label="Total abierto" value={data.total_open_classes} helper={`${data.open_membership_count} membresías abiertas`} tone="border border-orange-200 bg-orange-50 text-accent" />
            <KpiCard icon={<Target className="h-5 w-5" />} label="Clases disponibles" value={data.usable_classes} helper={`Utilizable hoy · ${currentFreeBalance} libres en el ciclo vigente`} tone="border border-emerald-200 bg-emerald-50 text-emerald-600" />
            <KpiCard icon={<CalendarDays className="h-5 w-5" />} label="Reservas próximas" value={upcomingBookings.length} helper={nextBooking ? `Próxima: ${formatDate(nextBooking.start_at)}` : 'Sin agenda'} tone="border border-blue-200 bg-blue-50 text-blue-600" />
            <KpiCard icon={<Clock3 className="h-5 w-5" />} label="Vence" value={membershipEndDelta ?? '-'} helper={activeMembership?.end_date ? `${membershipEndDelta === 1 ? 'día' : 'días'} - ${formatDate(activeMembership.end_date)}` : 'Sin fecha'} tone="border border-orange-200 bg-orange-50 text-accent" />
            <KpiCard icon={<BadgeDollarSign className="h-5 w-5" />} label="Pagos pendientes" value={pendingPayments.length} helper={pendingPayments[0] ? formatMoney(pendingPayments[0].amount, pendingPayments[0].currency) : 'Al dia'} tone="border border-amber-200 bg-amber-50 text-amber-600" />
            <KpiCard icon={<ShieldAlert className="h-5 w-5" />} label="Inasistencias recientes" value={recentNoShows.length} helper="Últimos 14 días" tone="border border-rose-200 bg-rose-50 text-rose-600" />
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
                  if (alert.href === '#membership') { setActiveTab('membership'); setAssignmentOpen(true) }
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
            form={profileForm}
            setForm={setProfileForm}
            saving={studentSaving}
            uploadingAvatar={uploadingAvatar}
            onUploadAvatar={uploadAvatar}
            onSave={handleSaveStudentProfile}
          />
        )}

      {activeTab === 'membership' && (
        <MembershipTab
          studentName={data.full_name}
          memberships={data.memberships}
          membershipStatusesById={membershipStatusesById}
          availableClassesById={data.available_classes_by_id}
          plans={(plansQuery.data || []).filter((plan) => plan.is_active)}
          plansLoading={plansQuery.isLoading}
          membershipEditor={membershipEditor}
          membershipSaving={membershipSaving}
          membershipPreviewingId={membershipPreviewingId}
          membershipDeletingId={membershipDeletingId}
          membershipMenuId={membershipMenuId}
          setMembershipEditor={setMembershipEditor}
          setMembershipMenuId={setMembershipMenuId}
          handleSaveMembership={handleSaveMembership}
          handleDeleteMembership={handleDeleteMembership}
          assignmentOpen={assignmentOpen}
          setAssignmentOpen={setAssignmentOpen}
          assignmentForm={assignmentForm}
          setAssignmentForm={setAssignmentForm}
          assignmentSaving={assignmentSaving}
          handleAssignMembership={handleAssignMembership}
        />
      )}

      {activeTab === 'bookings' && <BookingsTab bookings={data.bookings} />}
      {activeTab === 'attendance' && (
        <AttendanceTab bookings={buildStudentAttendanceHistory(data.bookings, data.weekly_attendance)} />
      )}
      {activeTab === 'payments' && <PaymentsTab payments={data.payments} />}
        {activeTab === 'sports' && (
          <SportsProfileSection
            data={data}
            form={sportsForm}
            setForm={setSportsForm}
            saving={studentSaving}
            onSave={handleSaveStudentProfile}
          />
        )}
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
  form,
  setForm,
  saving,
  uploadingAvatar,
  onUploadAvatar,
  onSave,
}: {
  data: StudentDetailData
  age: number | null
  operationalStatus: string
  revealedAccessTarget: string | null
  setRevealedAccessTarget: (value: string | null) => void
  form: ProfileFormState | null
  setForm: (value: ProfileFormState | null) => void
  saving: boolean
  uploadingAvatar: boolean
  onUploadAvatar: (file?: File) => void
  onSave: () => void
}) {
  const account = data.self_account
  const target = account ? `student-${account.id}` : 'student-no-account'
  const revealed = revealedAccessTarget === target

  if (!form) return <StudentDetailSkeleton />

  return (
    <div className="grid gap-5 xl:grid-cols-[20rem_minmax(0,1fr)]">
      <SectionShell title="Perfil del alumno">
        <div className="flex flex-col items-center text-center">
          <Avatar name={form.full_name || data.full_name} url={form.avatar_url || null} size="lg" className="h-32 w-32 border-4 border-white shadow-[0_18px_45px_rgba(15,23,42,0.16)]" />
          <label className="mt-4 inline-flex min-h-10 cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 transition hover:border-accent/40 hover:text-accent">
            {uploadingAvatar ? 'Subiendo foto…' : 'Cambiar foto'}
            <input type="file" accept="image/*" className="hidden" disabled={uploadingAvatar} onChange={(event) => onUploadAvatar(event.target.files?.[0])} />
          </label>
          <h2 className="mt-5 text-2xl font-black tracking-tight text-slate-950">{form.full_name || data.full_name}</h2>
          <div className="mt-3">
            <OperationalStatusBadge label={statusLabel(operationalStatus)} tone={statusTone(operationalStatus)} />
          </div>
        </div>
        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Código de acceso</p>
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="font-mono text-base font-black tracking-[0.25em] text-slate-950">
              {revealed ? account?.access_code || 'Sin código' : '••••••'}
            </span>
            <div className="flex gap-2">
              <button type="button" aria-label={revealed ? 'Ocultar código' : 'Mostrar código'} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600" onClick={() => setRevealedAccessTarget(revealed ? null : target)}>
                {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              <button type="button" aria-label="Copiar código" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 disabled:opacity-40" disabled={!account?.access_code} onClick={() => account?.access_code && navigator.clipboard.writeText(account.access_code)}>
                <Copy className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </SectionShell>

      <SectionShell title="Información general" description="Edita los datos personales y de contacto sin salir de la ficha.">
        <div className="grid gap-6">
          <div>
            <div className="mb-4 flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-2xl bg-orange-50 text-accent"><UserRound className="h-5 w-5" /></div><div><h3 className="font-black text-slate-950">Datos del alumno</h3><p className="text-xs text-slate-500">Identidad y contacto principal</p></div></div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <FormInput label="Nombre completo" value={form.full_name} onChange={(value) => setForm({ ...form, full_name: value })} />
              <label className="grid gap-2 text-sm font-bold text-slate-700">Género<select className={formControlClass} value={form.gender} onChange={(event) => setForm({ ...form, gender: event.target.value })}><option value="">Seleccionar</option><option value="damas">Damas</option><option value="varones">Varones</option></select></label>
              <FormInput label="Email" type="email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} />
              <FormInput label="Número de teléfono" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} />
              <FormInput label="Número de DNI" value={form.dni} onChange={(value) => setForm({ ...form, dni: value })} />
              <FormInput label="Fecha de nacimiento" type="date" value={form.date_of_birth} onChange={(value) => setForm({ ...form, date_of_birth: value })} />
              <ReadOnlyField label="Edad" value={age !== null ? `${age} años` : 'Se calcula al indicar la fecha'} />
              <ReadOnlyField label="Fecha de ingreso" value={formatDate(data.created_at)} />
            </div>
          </div>
          <div className="border-t border-slate-200 pt-6">
            <div className="mb-4 flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-2xl bg-blue-50 text-blue-600"><UserRound className="h-5 w-5" /></div><div><h3 className="font-black text-slate-950">Tutor responsable</h3><p className="text-xs text-slate-500">Disponible aunque todavía no exista un tutor.</p></div></div>
            <div className="grid gap-4 md:grid-cols-3">
              <FormInput label="Nombre del tutor" value={form.guardian_name} onChange={(value) => setForm({ ...form, guardian_name: value })} />
              <FormInput label="Email del tutor" type="email" value={form.guardian_email} onChange={(value) => setForm({ ...form, guardian_email: value })} />
              <FormInput label="Teléfono del tutor" value={form.guardian_phone} onChange={(value) => setForm({ ...form, guardian_phone: value })} />
            </div>
          </div>
          <div className="flex justify-end border-t border-slate-200 pt-5"><button type="button" className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-accent px-6 text-sm font-black text-white shadow-[0_14px_30px_rgba(249,115,22,0.22)] disabled:opacity-60" onClick={onSave} disabled={saving}><Save className="h-4 w-4" /> {saving ? 'Guardando…' : 'Guardar cambios'}</button></div>
        </div>
      </SectionShell>
    </div>
  )
}

const formControlClass = 'min-h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-950 outline-none transition focus:border-accent/50 focus:bg-white focus:ring-4 focus:ring-orange-100'

function FormInput({ label, value, onChange, type = 'text', placeholder }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string }) {
  return (
    <label className="grid gap-2 text-sm font-bold text-slate-700">
      {label}
      <input type={type} className={formControlClass} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return <div className="grid gap-2 text-sm font-bold text-slate-700"><span>{label}</span><div className="flex min-h-12 items-center rounded-2xl border border-slate-200 bg-slate-100 px-4 text-sm font-semibold text-slate-500">{value}</div></div>
}

function SportsProfileSection({ data, form, setForm, saving, onSave }: { data: StudentDetailData; form: SportsFormState | null; setForm: (value: SportsFormState | null) => void; saving: boolean; onSave: () => void }) {
  if (!form) return <StudentDetailSkeleton />
  const currentBow = getStudentBowUsage({ hasOwnBow: data.has_own_bow, assignedBow: data.assigned_bow, bowPoundage: data.bow_poundage })

  return (
    <SectionShell title="Perfil deportivo" description="Configuración técnica utilizada para entrenamientos y reservas.">
      <div className="grid gap-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <label className="grid gap-2 text-sm font-bold text-slate-700">Disciplina<select className={formControlClass} value={form.division} onChange={(event) => setForm({ ...form, division: event.target.value })}><option value="">Seleccionar</option><option value="Recurvo">Recurvo</option><option value="Compuesto">Compuesto</option><option value="Raso">Raso</option></select></label>
          <FormInput label="Categoría" value={form.category} onChange={(value) => setForm({ ...form, category: value })} placeholder="Ej. U18 Recurvo Damas" />
          <FormInput label="Nivel" value={form.level} onChange={(value) => setForm({ ...form, level: value })} placeholder="Ej. Inicial" />
          <label className="grid gap-2 text-sm font-bold text-slate-700">Mano dominante<select className={formControlClass} value={form.dominant_hand} onChange={(event) => setForm({ ...form, dominant_hand: event.target.value })}><option value="">Seleccionar</option><option value="right">Derecha</option><option value="left">Izquierda</option><option value="ambidextrous">Ambidiestro</option></select></label>
          <FormInput label="Distancia de entrenamiento (m)" type="number" value={form.current_distance_m} onChange={(value) => setForm({ ...form, current_distance_m: value })} />
          <FormInput label="Libraje del arco (lb)" type="number" value={form.bow_poundage} onChange={(value) => setForm({ ...form, bow_poundage: value })} />
        </div>

        <div className="border-t border-slate-200 pt-6">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-4"><div><h3 className="font-black text-slate-950">Tipo de arco para reservas</h3><p className="mt-1 text-sm text-slate-500">Cada alumno utiliza exactamente una modalidad.</p></div><span className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-600">Actual: {currentBow.label}</span></div>
          <div className="grid gap-3 md:grid-cols-3">
            {([
              { value: 'own', title: 'Arco propio', helper: 'El alumno lleva su propio equipo.' },
              { value: 'assigned', title: 'Arco asignado', helper: 'Tiene un arco específico reservado por la academia.' },
              { value: 'academy', title: 'Arco de academia', helper: 'Usa inventario compartido según disponibilidad.' },
            ] as Array<{ value: StudentBowUsageType; title: string; helper: string }>).map((option) => (
              <label key={option.value} className={`cursor-pointer rounded-[1.2rem] border p-4 transition ${form.bow_usage_type === option.value ? 'border-accent bg-orange-50 shadow-[0_12px_30px_rgba(249,115,22,0.12)]' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                <input type="radio" name="bow-usage-type" className="sr-only" value={option.value} checked={form.bow_usage_type === option.value} onChange={() => setForm({ ...form, bow_usage_type: option.value })} />
                <div className="flex items-center gap-3"><span className={`grid h-5 w-5 place-items-center rounded-full border ${form.bow_usage_type === option.value ? 'border-accent' : 'border-slate-300'}`}>{form.bow_usage_type === option.value && <span className="h-2.5 w-2.5 rounded-full bg-accent" />}</span><span className="font-black text-slate-950">{option.title}</span></div>
                <p className="mt-3 text-sm leading-5 text-slate-500">{option.helper}</p>
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end border-t border-slate-200 pt-5"><button type="button" className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-accent px-6 text-sm font-black text-white disabled:opacity-60" onClick={onSave} disabled={saving}><Save className="h-4 w-4" /> {saving ? 'Guardando…' : 'Guardar cambios'}</button></div>
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

function LegacyMembershipTab({
  activeMembership,
  latestMembership,
  memberships,
  payments,
  renewalWarning,
  membershipEditor,
  membershipSaving,
  membershipPreviewingId,
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
  membershipPreviewingId: string | null
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
        description="Los ciclos conservan sus saldos por separado y se consumen en orden cronológico."
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
              <InfoRow label="Saldo registrado" value={activeMembership.classes_remaining} danger={activeMembership.classes_remaining <= 1} />
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
                    <td className="px-4 py-4"><div className="flex flex-wrap gap-2"><button type="button" className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700" onClick={() => setMembershipEditor(membershipEditorFromSummary(membership))}>Informacion y cambios</button>{isPersistedMembership(membership) && <button type="button" className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-black text-rose-700 disabled:cursor-not-allowed disabled:opacity-60" onClick={() => handleDeleteMembership(membership)} disabled={membershipPreviewingId === membership.id || membershipDeletingId === membership.id} aria-busy={membershipPreviewingId === membership.id || membershipDeletingId === membership.id}>{membershipPreviewingId === membership.id ? 'Verificando...' : membershipDeletingId === membership.id ? 'Eliminando...' : 'Eliminar membresia'}</button>}</div></td>
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

function MembershipTab({
  studentName,
  memberships,
  membershipStatusesById,
  availableClassesById,
  plans,
  plansLoading,
  membershipEditor,
  membershipSaving,
  membershipPreviewingId,
  membershipDeletingId,
  membershipMenuId,
  setMembershipEditor,
  setMembershipMenuId,
  handleSaveMembership,
  handleDeleteMembership,
  assignmentOpen,
  setAssignmentOpen,
  assignmentForm,
  setAssignmentForm,
  assignmentSaving,
  handleAssignMembership,
}: {
  studentName: string
  memberships: StudentMembershipSummary[]
  membershipStatusesById: Record<string, string>
  availableClassesById: Record<string, number>
  plans: MembershipPlan[]
  plansLoading: boolean
  membershipEditor: MembershipEditorState | null
  membershipSaving: boolean
  membershipPreviewingId: string | null
  membershipDeletingId: string | null
  membershipMenuId: string | null
  setMembershipEditor: (value: MembershipEditorState | null) => void
  setMembershipMenuId: (value: string | null) => void
  handleSaveMembership: () => void
  handleDeleteMembership: (membership: StudentMembershipSummary) => void
  assignmentOpen: boolean
  setAssignmentOpen: (value: boolean) => void
  assignmentForm: MembershipAssignmentFormState
  setAssignmentForm: (value: MembershipAssignmentFormState) => void
  assignmentSaving: boolean
  handleAssignMembership: () => void
}) {
  function openAction(membership: StudentMembershipSummary, action: MembershipAction) {
    setMembershipEditor({ ...membershipEditorFromSummary(membership), action })
    setMembershipMenuId(null)
  }

  return (
    <>
      <SectionShell
        title="Membresías"
        description="Historial completo de ciclos, documentos y condiciones comerciales del alumno."
        action={
          <button type="button" onClick={() => setAssignmentOpen(true)} className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-accent px-5 text-sm font-black text-white shadow-[0_14px_30px_rgba(249,115,22,0.2)]">
            <Plus className="h-4 w-4" /> Asignar membresía
          </button>
        }
      >
        {memberships.length === 0 ? (
          <EmptyOperationalState title="Sin membresías" description="Asigna el primer plan para habilitar reservas y saldo de clases." action={<button type="button" onClick={() => setAssignmentOpen(true)} className="rounded-2xl bg-accent px-5 py-3 text-sm font-black text-white">Asignar membresía</button>} />
        ) : (
          <div className="overflow-x-auto rounded-[1.2rem] border border-slate-200 bg-white">
            <table className="min-w-[1080px] w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/80 text-[0.7rem] font-black uppercase tracking-[0.1em] text-slate-500">
                <tr>
                  <th className="px-5 py-4">Membresía</th>
                  <th className="px-5 py-4">Fecha de inicio</th>
                  <th className="px-5 py-4">Fecha de finalización</th>
                  <th className="px-5 py-4">Número de documento</th>
                  <th className="px-5 py-4">Estado</th>
                  <th className="px-5 py-4">Origen</th>
                  <th className="px-5 py-4">Tipo de pago</th>
                  <th className="px-5 py-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {memberships.map((membership) => {
                  const display = getMembershipDisplayFields(membership)
                  const queueStatus = membershipStatusesById[membership.id] || membership.status
                  const availableClasses = availableClassesById[membership.id] || 0
                  return (
                    <tr key={membership.id} className="group bg-white transition hover:bg-slate-50/70">
                      <td className="px-5 py-5"><p className="font-black text-slate-950">{membership.custom_name}</p><p className="mt-1 text-xs text-slate-500">{availableClasses} libres de {membership.classes_remaining} restantes · {membership.classes_total} totales</p></td>
                      <td className="whitespace-nowrap px-5 py-5 font-semibold text-slate-700">{formatDate(membership.start_date)}</td>
                      <td className="whitespace-nowrap px-5 py-5 font-semibold text-slate-700">{formatDate(membership.end_date)}</td>
                      <td className="whitespace-nowrap px-5 py-5 font-mono text-xs font-black text-blue-600">{display.documentNumber}</td>
                      <td className="px-5 py-5"><div className="flex flex-wrap gap-2"><OperationalStatusBadge label={statusLabel(queueStatus)} tone={statusTone(queueStatus)} />{display.frozen && <OperationalStatusBadge label="Congelada" tone="info" />}</div></td>
                      <td className="px-5 py-5"><OperationalStatusBadge label={membership.membership_origin === 'gift' ? 'Obsequio' : 'Pagada'} tone={membership.membership_origin === 'gift' ? 'info' : 'neutral'} /></td>
                      <td className="whitespace-nowrap px-5 py-5 font-semibold text-slate-700">{display.paymentType}</td>
                      <td className="relative px-5 py-5 text-right">
                        <button type="button" aria-label={`Acciones de ${membership.custom_name}`} aria-expanded={membershipMenuId === membership.id} onClick={() => setMembershipMenuId(membershipMenuId === membership.id ? null : membership.id)} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-accent/40 hover:text-accent ml-auto"><MoreHorizontal className="h-5 w-5" /></button>
                        {membershipMenuId === membership.id && (
                          <div className="absolute right-5 top-14 z-30 w-80 rounded-2xl border border-slate-200 bg-white p-2 text-left shadow-[0_24px_60px_rgba(15,23,42,0.2)]">
                            {([
                              ['info', 'Información del plan'],
                              ['cancel', 'Cancelar membresía'],
                              ['dates', 'Cambiar fecha de inicio/finalización'],
                              ['plan', 'Cambiar de plan'],
                              ['payment_type', 'Cambiar el tipo de pago'],
                              ['billing_date', 'Cambiar la fecha de facturación'],
                              ['discount', 'Cambiar descuento'],
                              ['freeze', display.frozen ? 'Reactivar la membresía' : 'Congelar la membresía'],
                            ] as Array<[MembershipAction, string]>).map(([action, label]) => (
                              <button key={action} type="button" className={`block w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition hover:bg-slate-50 ${action === 'cancel' ? 'text-rose-600' : 'text-slate-700'}`} onClick={() => openAction(membership, action)}>{label}</button>
                            ))}
                            {isPersistedMembership(membership) && (
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-black text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                                onClick={() => handleDeleteMembership(membership)}
                                disabled={membershipPreviewingId === membership.id || membershipDeletingId === membership.id}
                                aria-busy={membershipPreviewingId === membership.id || membershipDeletingId === membership.id}
                              >
                                <Trash2 className="h-4 w-4" />
                                {membershipPreviewingId === membership.id
                                  ? 'Verificando...'
                                  : membershipDeletingId === membership.id
                                    ? 'Eliminando...'
                                    : 'Eliminar membresia'}
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionShell>

      {membershipEditor && (
        <MembershipActionDialog
          editor={membershipEditor}
          plans={plans}
          saving={membershipSaving}
          frozen={Boolean(memberships.find((membership) => membership.id === membershipEditor.id)?.frozen_at)}
          onChange={setMembershipEditor}
          onClose={() => setMembershipEditor(null)}
          onSave={handleSaveMembership}
        />
      )}

      <MembershipAssignmentDrawer
        open={assignmentOpen}
        studentName={studentName}
        plans={plans}
        plansLoading={plansLoading}
        form={assignmentForm}
        saving={assignmentSaving}
        onChange={setAssignmentForm}
        onClose={() => setAssignmentOpen(false)}
        onSubmit={handleAssignMembership}
      />
    </>
  )
}

function MembershipActionDialog({ editor, plans, saving, frozen, onChange, onClose, onSave }: { editor: MembershipEditorState; plans: MembershipPlan[]; saving: boolean; frozen: boolean; onChange: (value: MembershipEditorState | null) => void; onClose: () => void; onSave: () => void }) {
  const titles: Record<MembershipAction, string> = {
    info: 'Información del plan', cancel: 'Cancelar membresía', dates: 'Cambiar fechas', plan: 'Cambiar de plan', payment_type: 'Cambiar el tipo de pago', billing_date: 'Cambiar la fecha de facturación', discount: 'Cambiar descuento', freeze: frozen ? 'Reactivar la membresía' : 'Congelar la membresía',
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4 backdrop-blur-[2px]" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={titles[editor.action]} className="w-full max-w-xl rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-[0_32px_90px_rgba(15,23,42,0.28)]" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-accent">Membresía</p><h3 className="mt-2 text-xl font-black text-slate-950">{titles[editor.action]}</h3><p className="mt-1 text-sm text-slate-500">{editor.custom_name}</p></div><button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-500"><X className="h-4 w-4" /></button></div>
        <div className="mt-6 grid gap-4">
          {editor.action === 'info' && <div className="grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2"><ReadOnlyField label="Plan" value={editor.custom_name} /><ReadOnlyField label="Estado" value={statusLabel(editor.status)} /><ReadOnlyField label="Clases" value={`${editor.classes_remaining} de ${editor.classes_total}`} /><ReadOnlyField label="Importe" value={formatMoney(Number(editor.total_amount), editor.currency)} /><ReadOnlyField label="Facturación" value={editor.billing_date ? formatDate(editor.billing_date) : 'Sin fecha'} /><ReadOnlyField label="Descuento" value={getMembershipDisplayFields({ id: editor.id, document_number: null, payment_type: editor.payment_type, billing_date: editor.billing_date, discount_type: editor.discount_type, discount_value: Number(editor.discount_value || 0), frozen_at: frozen ? new Date().toISOString() : null }).discountLabel} /></div>}
          {editor.action === 'cancel' && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-700">La membresía dejará de estar disponible para reservas. Esta acción conserva el historial y los pagos asociados.</div>}
          {editor.action === 'dates' && <div className="grid gap-4 sm:grid-cols-2"><EditorInput label="Fecha de inicio" type="date" value={editor.start_date} onChange={(value) => onChange({ ...editor, start_date: value })} /><EditorInput label="Fecha de finalización" type="date" value={editor.end_date} onChange={(value) => onChange({ ...editor, end_date: value })} /></div>}
          {editor.action === 'plan' && <label className="grid gap-2 text-sm font-bold text-slate-700">Nuevo plan<select className={formControlClass} value={editor.membership_plan_id} onChange={(event) => onChange({ ...editor, membership_plan_id: event.target.value })}><option value="">Seleccionar</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label>}
          {editor.action === 'payment_type' && <PaymentTypeSelect value={editor.payment_type} onChange={(value) => onChange({ ...editor, payment_type: value })} />}
          {editor.action === 'billing_date' && <EditorInput label="Fecha de facturación" type="date" value={editor.billing_date} onChange={(value) => onChange({ ...editor, billing_date: value })} />}
          {editor.action === 'discount' && <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm font-bold text-slate-700">Tipo<select className={formControlClass} value={editor.discount_type} onChange={(event) => onChange({ ...editor, discount_type: event.target.value as MembershipEditorState['discount_type'] })}><option value="none">Sin descuento</option><option value="amount">Monto</option><option value="percentage">Porcentaje</option></select></label><EditorInput label="Valor" type="number" value={editor.discount_value} onChange={(value) => onChange({ ...editor, discount_value: value })} /></div>}
          {editor.action === 'freeze' && !frozen && <EditorInput label="Congelada hasta (opcional)" type="date" value={editor.frozen_until} onChange={(value) => onChange({ ...editor, frozen_until: value })} />}
          {editor.action === 'freeze' && frozen && <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-700">Al reactivar, el alumno podrá volver a crear reservas con el saldo disponible.</div>}
        </div>
        <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-black text-slate-700">Cerrar</button>{editor.action !== 'info' && <button type="button" onClick={onSave} disabled={saving} className={`rounded-2xl px-5 py-3 text-sm font-black text-white disabled:opacity-60 ${editor.action === 'cancel' ? 'bg-rose-600' : 'bg-accent'}`}>{saving ? 'Guardando…' : editor.action === 'cancel' ? 'Cancelar membresía' : 'Guardar cambios'}</button>}</div>
      </div>
    </div>
  )
}

function PaymentTypeSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <label className="grid gap-2 text-sm font-bold text-slate-700">Tipo de pago<select className={formControlClass} value={value} onChange={(event) => onChange(event.target.value)}><option value="manual">Manual</option><option value="cash">Efectivo</option><option value="card">Tarjeta</option><option value="transfer">Transferencia</option><option value="yape">Yape</option><option value="plin">Plin</option></select></label>
}

function MembershipAssignmentDrawer({ open, studentName, plans, plansLoading, form, saving, onChange, onClose, onSubmit }: { open: boolean; studentName: string; plans: MembershipPlan[]; plansLoading: boolean; form: MembershipAssignmentFormState; saving: boolean; onChange: (value: MembershipAssignmentFormState) => void; onClose: () => void; onSubmit: () => void }) {
  const selectedPlan = useMemo(() => plans.find((plan) => plan.id === form.membership_plan_id) || null, [form.membership_plan_id, plans])
  const discountValue = Math.max(Number(form.discount_value || 0), 0)
  const basePrice = selectedPlan?.base_price || 0
  const discountAmount = form.discount_type === 'percentage' ? Math.min(basePrice, basePrice * discountValue / 100) : form.discount_type === 'amount' ? Math.min(basePrice, discountValue) : 0
  const total = Math.max(basePrice - discountAmount, 0)
  const endDate = selectedPlan?.duration_days ? dayjs(form.start_date).add(selectedPlan.duration_days - 1, 'day').format('DD MMM YYYY') : 'Sin fecha fija'

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-[2px]" onMouseDown={onClose}>
      <aside role="dialog" aria-modal="true" aria-label={`Asignar membresía a ${studentName}`} className="absolute inset-y-0 right-0 flex w-full max-w-[560px] flex-col bg-white shadow-[-28px_0_80px_rgba(15,23,42,0.22)]" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-accent">Nueva venta</p><h2 className="mt-1 text-xl font-black text-slate-950">Asignar membresía a: {studentName}</h2></div><button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-500"><X className="h-4 w-4" /></button></div>
        <div className="flex-1 space-y-7 overflow-y-auto px-6 py-6">
          <section><h3 className="text-lg font-black text-slate-950">Información del alumno</h3><p className="mt-1 text-sm text-slate-500">La membresía se asignará directamente a esta ficha.</p><ReadOnlyField label="Alumno seleccionado" value={studentName} /></section>
          <section className="border-t border-slate-200 pt-6"><h3 className="text-lg font-black text-slate-950">Detalles de membresía</h3><div className="mt-4 grid gap-4"><EditorInput label="Fecha de inicio" type="date" value={form.start_date} onChange={(value) => onChange({ ...form, start_date: value, billing_date: form.billing_date || value })} /><label className="grid gap-2 text-sm font-bold text-slate-700">Plan de membresía<select className={formControlClass} value={form.membership_plan_id} onChange={(event) => onChange({ ...form, membership_plan_id: event.target.value })} disabled={plansLoading}><option value="">{plansLoading ? 'Cargando planes…' : 'Seleccionar plan'}</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {formatMoney(plan.base_price, plan.currency)}</option>)}</select></label></div></section>
          <section className="border-t border-slate-200 pt-6"><h3 className="text-lg font-black text-slate-950">Información de pago</h3><div className="mt-4 grid gap-4"><PaymentTypeSelect value={form.payment_type} onChange={(value) => onChange({ ...form, payment_type: value })} /><label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-black text-slate-700"><input type="checkbox" className="h-5 w-5 accent-orange-500" checked={form.payment_received} onChange={(event) => onChange({ ...form, payment_received: event.target.checked, payment_amount: event.target.checked && !form.payment_amount ? String(total) : form.payment_amount })} /> Pago recibido</label>{form.payment_received && <EditorInput label="Cantidad recibida" type="number" value={form.payment_amount} onChange={(value) => onChange({ ...form, payment_amount: value })} />}<div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm font-bold text-slate-700">Descuento<select className={formControlClass} value={form.discount_type} onChange={(event) => onChange({ ...form, discount_type: event.target.value as MembershipAssignmentFormState['discount_type'], discount_value: event.target.value === 'none' ? '' : form.discount_value })}><option value="none">Sin descuento</option><option value="amount">Monto</option><option value="percentage">Porcentaje</option></select></label><EditorInput label="Valor del descuento" type="number" value={form.discount_value} onChange={(value) => onChange({ ...form, discount_value: value })} /></div><EditorInput label="Fecha de facturación" type="date" value={form.billing_date} onChange={(value) => onChange({ ...form, billing_date: value })} /></div></section>
          <section className="border-t border-slate-200 pt-6"><h3 className="text-lg font-black text-slate-950">Resumen de precios</h3><div className="mt-4 grid gap-2 rounded-[1.2rem] bg-slate-950 p-5 text-sm text-white"><div className="flex justify-between"><span className="text-slate-400">Precio base</span><strong>{formatMoney(basePrice, selectedPlan?.currency)}</strong></div><div className="flex justify-between"><span className="text-slate-400">Descuento</span><strong>- {formatMoney(discountAmount, selectedPlan?.currency)}</strong></div><div className="mt-2 flex justify-between border-t border-white/10 pt-4 text-lg"><span className="font-black">Total</span><strong className="text-orange-300">{formatMoney(total, selectedPlan?.currency)}</strong></div><div className="mt-2 text-xs text-slate-400">Finalización estimada: {endDate}</div></div></section>
        </div>
        <div className="flex justify-end gap-3 border-t border-slate-200 bg-white px-6 py-5"><button type="button" onClick={onClose} className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-black text-slate-700">Cancelar</button><button type="button" onClick={onSubmit} disabled={saving || !form.membership_plan_id} className="rounded-2xl bg-accent px-6 py-3 text-sm font-black text-white disabled:opacity-50">{saving ? 'Asignando…' : 'Asignar membresía'}</button></div>
      </aside>
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
    <SectionShell title="Reservas" description="Reservas activas que aún no se convirtieron en asistencia, cancelación o inasistencia.">
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
            <tbody className="divide-y divide-slate-100">{attendanceRows.map((booking) => <tr key={booking.id} className="bg-white"><td className="whitespace-nowrap px-4 py-4 font-bold text-slate-950">{formatDate(booking.start_at)}</td><td className="px-4 py-4 text-slate-600">{booking.source === 'weekly' ? '-' : booking.start_at ? dayjs(booking.start_at).format('HH:mm') : '-'}</td><td className="px-4 py-4 text-slate-600">{booking.distance_m ? `${booking.distance_m} m` : '-'}</td><td className="px-4 py-4"><OperationalStatusBadge label={statusLabel(booking.status)} tone={statusTone(booking.status)} /></td><td className="max-w-xs px-4 py-4 text-slate-600">{booking.source === 'weekly' ? 'Inasistencia semanal (jueves a domingo)' : booking.admin_notes || '-'}</td></tr>)}</tbody>
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
      <SectionShell title="Registros de pago" description="Referencias internas de los pagos existentes. La numeración de documentos se incorporará en el módulo de comprobantes.">
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
          <div className="overflow-x-auto rounded-2xl border border-slate-200"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs font-black uppercase text-slate-500"><tr><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Cantidad</th><th className="px-4 py-3">Método de pago</th><th className="px-4 py-3">Acción</th><th className="px-4 py-3">Documento</th></tr></thead><tbody className="divide-y divide-slate-100">{payments.map((payment) => <tr key={payment.id} className="bg-white"><td className="whitespace-nowrap px-4 py-4 text-slate-600">{formatDateTime(payment.paid_at)}</td><td className="px-4 py-4 font-black text-slate-950">{formatMoney(payment.amount, payment.currency)}</td><td className="px-4 py-4 text-slate-600">{payment.payment_method || 'No definido'}</td><td className="px-4 py-4"><OperationalStatusBadge label={statusLabel(payment.payment_status)} tone={statusTone(payment.payment_status)} /></td><td className="px-4 py-4 font-bold text-blue-600">Pago {payment.id.slice(0, 8).toUpperCase()}</td></tr>)}</tbody></table></div>
        )}
      </SectionShell>
    </div>
  )
}
