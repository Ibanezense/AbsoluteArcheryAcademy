'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  FilePenLine,
  Filter,
  Layers3,
  PackagePlus,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
  UserRound,
  UsersRound,
  Wallet,
  XCircle,
} from 'lucide-react'
import { AdminContentPanel, AdminPageHeader, AdminStatCard } from '@/components/admin/AdminVisualSystem'
import Avatar from '@/components/ui/Avatar'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/ToastProvider'
import { supabase } from '@/lib/supabaseClient'
import { studentKeys, useStudents, type StudentListRow } from '@/lib/queries/studentQueries'
import { isStudentSelectableForMembershipSale } from '@/lib/utils/adminMembershipStudents'
import {
  membershipPlanKeys,
  useAdminStudentMemberships,
  useMembershipPlans,
  type AdminStudentMembership,
  type MembershipPlan,
} from '@/lib/hooks/useMembershipPlans'

type MembershipTab = 'summary' | 'active' | 'plans'

type AssignmentFormState = {
  student_id: string
  membership_plan_id: string
  start_date: string
  discount_type: 'none' | 'amount' | 'percentage'
  discount_value: string
  payment_amount: string
  notes: string
}

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

type PlanEditorState = {
  id: string | null
  name: string
  description: string
  classes_included: string
  duration_days: string
  base_price: string
  currency: string
  is_active: boolean
}

type ActiveMembershipStatusFilter = 'all' | 'active' | 'expiring' | 'expired' | 'empty' | 'historical'
type MembershipSort = 'recent' | 'expiration' | 'balance'
type PlanFilter = 'all' | 'active' | 'inactive'

const replacementWarning =
  'Esta accion reemplazara la membresia actual del alumno. La membresia anterior pasara al historial y el nuevo plan iniciara un ciclo independiente. Las clases restantes no se acumularan automaticamente.'

function getTodayLocalISODate() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

function emptyAssignmentForm(): AssignmentFormState {
  return {
    student_id: '',
    membership_plan_id: '',
    start_date: getTodayLocalISODate(),
    discount_type: 'none',
    discount_value: '',
    payment_amount: '',
    notes: '',
  }
}

function emptyPlanForm(): PlanEditorState {
  return {
    id: null,
    name: '',
    description: '',
    classes_included: '',
    duration_days: '30',
    base_price: '',
    currency: 'PEN',
    is_active: true,
  }
}

function planFormFromPlan(plan: MembershipPlan): PlanEditorState {
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description || '',
    classes_included: String(plan.classes_included),
    duration_days: plan.duration_days ? String(plan.duration_days) : '',
    base_price: plan.base_price !== null && plan.base_price !== undefined ? String(plan.base_price) : '',
    currency: plan.currency || 'PEN',
    is_active: plan.is_active,
  }
}

function membershipEditorFromMembership(membership: AdminStudentMembership): MembershipEditorState {
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

function formatMoney(amount: number | null | undefined, currency: string | null | undefined) {
  if (amount === null || amount === undefined) return 'Sin precio'
  return `${currency || 'PEN'} ${Number(amount).toFixed(2)}`
}

function formatDate(date: string | null | undefined) {
  if (!date) return 'Sin vencimiento'
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'America/Lima',
  }).format(new Date(`${date}T00:00:00-05:00`))
}

function addDaysISODate(startDate: string, days: number | null | undefined) {
  if (!startDate || !days || days <= 0) return null
  const date = new Date(`${startDate}T00:00:00-05:00`)
  date.setDate(date.getDate() + days - 1)
  return date.toISOString().slice(0, 10)
}

function daysUntil(date: string | null | undefined) {
  if (!date) return null
  const today = new Date(`${getTodayLocalISODate()}T00:00:00-05:00`).getTime()
  const target = new Date(`${date}T00:00:00-05:00`).getTime()
  return Math.ceil((target - today) / 86400000)
}

function membershipOperationalStatus(membership: AdminStudentMembership) {
  const days = daysUntil(membership.end_date)

  if (membership.status === 'active' && days !== null && days < 0) return 'expired'
  if (membership.status === 'active' && membership.classes_remaining <= 0) return 'empty'
  if (membership.status === 'active' && days !== null && days <= 7) return 'expiring'
  return membership.status
}

function statusLabel(status: string) {
  if (status === 'active') return 'Activa'
  if (status === 'expiring') return 'Por vencer'
  if (status === 'expired') return 'Vencida'
  if (status === 'empty') return 'Sin clases'
  if (status === 'historical') return 'Historial'
  if (status === 'cancelled') return 'Cancelada'
  if (status === 'consumed') return 'Consumida'
  if (status === 'draft') return 'Borrador'
  return status
}

function statusBadgeClass(status: string) {
  if (status === 'active') return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
  if (status === 'expiring') return 'bg-amber-50 text-amber-700 ring-amber-200'
  if (status === 'expired' || status === 'empty' || status === 'cancelled') return 'bg-rose-50 text-rose-700 ring-rose-200'
  if (status === 'historical' || status === 'consumed') return 'bg-slate-100 text-slate-600 ring-slate-200'
  return 'bg-blue-50 text-blue-700 ring-blue-200'
}

function classUsagePercent(membership: AdminStudentMembership) {
  if (!membership.classes_total) return 0
  return Math.min(100, Math.max(0, (membership.classes_used / membership.classes_total) * 100))
}

function isSameMonth(date: string) {
  const current = getTodayLocalISODate().slice(0, 7)
  return date.slice(0, 7) === current
}

function currentMembershipForStudent(
  studentId: string,
  memberships: AdminStudentMembership[],
) {
  return memberships.find((membership) => membership.student?.id === studentId && membership.status === 'active')
    || memberships.find((membership) => membership.student?.id === studentId)
    || null
}

function shouldWarnReplacement(membership: AdminStudentMembership | null, student: StudentListRow | null) {
  if (!membership && !student) return false
  return membership?.status === 'active'
    || (membership?.classes_remaining ?? 0) > 0
    || student?.membership_status === 'active'
    || (student?.classes_remaining ?? 0) > 0
}

function MembershipTabs({
  activeTab,
  onChange,
}: {
  activeTab: MembershipTab
  onChange: (tab: MembershipTab) => void
}) {
  const tabs: Array<{ key: MembershipTab; label: string; helper: string }> = [
    { key: 'summary', label: 'Resumen', helper: 'Operacion diaria' },
    { key: 'active', label: 'Membresias activas', helper: 'Listado en siguiente bloque' },
    { key: 'plans', label: 'Catalogo de planes', helper: 'Gestion secundaria' },
  ]

  return (
    <AdminContentPanel className="p-2">
      <div className="grid gap-2 md:grid-cols-3">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={`min-h-14 rounded-[1.15rem] px-4 text-left transition ${
              activeTab === tab.key
                ? 'bg-accent text-white shadow-[0_14px_30px_rgba(249,115,22,0.24)]'
                : 'bg-white text-slate-600 hover:bg-orange-50 hover:text-accent'
            }`}
          >
            <span className="block text-sm font-black">{tab.label}</span>
            <span className={`mt-0.5 block text-xs ${activeTab === tab.key ? 'text-orange-50' : 'text-slate-400'}`}>
              {tab.helper}
            </span>
          </button>
        ))}
      </div>
    </AdminContentPanel>
  )
}

function MembershipAttentionCard({
  icon,
  title,
  value,
  helper,
  cta = 'Ver alumnos',
  tone = 'orange',
  onClick,
}: {
  icon: ReactNode
  title: string
  value: string | number
  helper: string
  cta?: string
  tone?: 'orange' | 'red' | 'amber' | 'blue'
  onClick?: () => void
}) {
  const toneClass =
    tone === 'red'
      ? 'border-rose-100 bg-rose-50 text-rose-600'
      : tone === 'amber'
        ? 'border-amber-100 bg-amber-50 text-amber-600'
        : tone === 'blue'
          ? 'border-blue-100 bg-blue-50 text-blue-600'
          : 'border-orange-100 bg-orange-50 text-accent'

  return (
    <article className="rounded-[1.35rem] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.055)]">
      <div className="flex items-start justify-between gap-4">
        <div className={`grid h-12 w-12 place-items-center rounded-2xl border ${toneClass}`}>{icon}</div>
        <p className="font-heading text-3xl font-black tracking-[-0.055em] text-slate-950">{value}</p>
      </div>
      <h3 className="mt-4 text-sm font-black text-slate-950">{title}</h3>
      <p className="mt-1 min-h-10 text-xs leading-5 text-slate-500">{helper}</p>
      <button
        type="button"
        onClick={onClick}
        className="mt-4 inline-flex items-center gap-1 text-sm font-black text-accent"
      >
        {cta} <ArrowRight className="h-4 w-4" />
      </button>
    </article>
  )
}

function SummaryLine({ label, value, accent = false }: { label: string; value: ReactNode; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className={`text-right font-black ${accent ? 'text-accent' : 'text-slate-950'}`}>{value}</span>
    </div>
  )
}

function MembershipSaleForm({
  form,
  selectedStudent,
  selectedPlan,
  currentMembership,
  activeStudents,
  activePlans,
  basePrice,
  computedDiscountAmount,
  finalAmount,
  newEndDate,
  isSaving,
  onPatch,
  onSubmit,
  onClear,
}: {
  form: AssignmentFormState
  selectedStudent: StudentListRow | null
  selectedPlan: MembershipPlan | null
  currentMembership: AdminStudentMembership | null
  activeStudents: StudentListRow[]
  activePlans: MembershipPlan[]
  basePrice: number | null
  computedDiscountAmount: number
  finalAmount: number | null
  newEndDate: string | null
  isSaving: boolean
  onPatch: (patch: Partial<AssignmentFormState>) => void
  onSubmit: () => void
  onClear: () => void
}) {
  const warnReplacement = shouldWarnReplacement(currentMembership, selectedStudent)
  const currentRemaining = currentMembership?.classes_remaining ?? selectedStudent?.classes_remaining ?? 0
  const actionLabel = warnReplacement ? 'Renovar membresia' : 'Activar membresia'

  return (
    <AdminContentPanel className="overflow-hidden p-0">
      <div className="relative overflow-hidden bg-[#07111d] p-5 text-white sm:p-6">
        <div className="pointer-events-none absolute right-0 top-0 h-44 w-44 rounded-full bg-accent/20 blur-3xl" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-200">Venta o renovacion</p>
            <h2 className="mt-2 font-heading text-3xl font-black tracking-[-0.055em]">Nuevo ciclo de membresia</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              Selecciona alumno y plan. Si existe un ciclo activo, el backend lo pasa a historial y crea una membresia nueva independiente.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-bold text-orange-100">
            Sin acumulacion automatica
          </div>
        </div>
      </div>

      <div className="grid gap-5 p-5 sm:p-6">
        <div className="grid gap-4 xl:grid-cols-2">
          <label className="grid gap-2">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Paso 1 · Alumno</span>
            <select
              className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-950 outline-none transition focus:border-accent/40 focus:ring-4 focus:ring-orange-100"
              value={form.student_id}
              onChange={(event) => onPatch({ student_id: event.target.value })}
            >
              <option value="">Selecciona un alumno</option>
              {activeStudents.map((student) => (
                <option key={student.id} value={student.id}>{student.full_name}</option>
              ))}
            </select>
          </label>

          <label className="grid gap-2">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Paso 2 · Plan</span>
            <select
              className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-950 outline-none transition focus:border-accent/40 focus:ring-4 focus:ring-orange-100"
              value={form.membership_plan_id}
              onChange={(event) => onPatch({ membership_plan_id: event.target.value })}
            >
              <option value="">Selecciona un plan</option>
              {activePlans.map((plan) => (
                <option key={plan.id} value={plan.id}>{plan.name}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-4 rounded-[1.35rem] border border-slate-200 bg-slate-50 p-4 xl:grid-cols-5">
          <label className="grid gap-2">
            <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Paso 3 · Inicio</span>
            <input
              type="date"
              className="h-12 min-w-0 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-950 outline-none focus:border-accent/40 focus:ring-4 focus:ring-orange-100"
              value={form.start_date}
              onChange={(event) => onPatch({ start_date: event.target.value })}
            />
          </label>

          <label className="grid gap-2">
            <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Descuento</span>
            <select
              className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-950 outline-none focus:border-accent/40 focus:ring-4 focus:ring-orange-100"
              value={form.discount_type}
              onChange={(event) => onPatch({
                discount_type: event.target.value as AssignmentFormState['discount_type'],
                discount_value: event.target.value === 'none' ? '' : form.discount_value,
              })}
            >
              <option value="none">Sin descuento</option>
              <option value="amount">Monto</option>
              <option value="percentage">Porcentaje</option>
            </select>
          </label>

          <label className="grid gap-2">
            <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Valor descuento</span>
            <input
              type="number"
              min={0}
              step="0.01"
              className="h-12 min-w-0 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-950 outline-none focus:border-accent/40 focus:ring-4 focus:ring-orange-100 disabled:text-slate-400"
              value={form.discount_value}
              onChange={(event) => onPatch({ discount_value: event.target.value })}
              disabled={form.discount_type === 'none'}
            />
          </label>

          <label className="grid gap-2">
            <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Pago inicial</span>
            <input
              type="number"
              min={0}
              step="0.01"
              className="h-12 min-w-0 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-950 outline-none focus:border-accent/40 focus:ring-4 focus:ring-orange-100"
              value={form.payment_amount}
              onChange={(event) => onPatch({ payment_amount: event.target.value })}
            />
          </label>

          <label className="grid gap-2">
            <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Moneda</span>
            <input
              className="h-12 min-w-0 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-500"
              value={selectedPlan?.currency || 'PEN'}
              disabled
            />
          </label>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1fr_0.85fr]">
          <div className="grid gap-3 rounded-[1.35rem] border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 text-sm font-black text-slate-950">
              <Sparkles className="h-4 w-4 text-accent" />
              Resumen del nuevo ciclo
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <SummaryLine label="Precio base" value={formatMoney(basePrice, selectedPlan?.currency)} />
              <SummaryLine label="Descuento aplicado" value={selectedPlan ? formatMoney(computedDiscountAmount, selectedPlan.currency) : 'Sin plan'} />
              <SummaryLine label="Precio final" value={formatMoney(finalAmount, selectedPlan?.currency)} accent />
              <SummaryLine label="Pago inicial" value={form.payment_amount ? formatMoney(Number(form.payment_amount), selectedPlan?.currency) : 'Sin pago'} />
              <SummaryLine label="Nuevo plan" value={selectedPlan?.name || 'Sin plan'} />
              <SummaryLine label="Clases del nuevo ciclo" value={selectedPlan ? selectedPlan.classes_included : 'Sin plan'} />
              <SummaryLine label="Fecha inicio" value={form.start_date ? formatDate(form.start_date) : 'Sin fecha'} />
              <SummaryLine label="Fecha vencimiento" value={formatDate(newEndDate)} />
            </div>
          </div>

          <div className="grid gap-3 rounded-[1.35rem] border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-3">
              {selectedStudent ? (
                <Avatar name={selectedStudent.full_name} url={selectedStudent.avatar_url} size="md" />
              ) : (
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400">
                  <UsersRound className="h-5 w-5" />
                </div>
              )}
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Membresia actual</p>
                <p className="text-sm font-black text-slate-950">{selectedStudent?.full_name || 'Selecciona un alumno'}</p>
              </div>
            </div>
            <div className="grid gap-2">
              <SummaryLine label="Plan actual" value={currentMembership?.custom_name || selectedStudent?.membership_name || 'Sin membresia previa'} />
              <SummaryLine label="Clases restantes del ciclo actual" value={currentRemaining} accent={currentRemaining > 0} />
              <SummaryLine label="Vencimiento actual" value={formatDate(currentMembership?.end_date || selectedStudent?.membership_end)} />
            </div>
            {warnReplacement && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                <p className="font-black">Advertencia de reemplazo</p>
                <p className="mt-1">{replacementWarning}</p>
                <p className="mt-2 font-bold">
                  Clases restantes del ciclo actual: {currentRemaining}. Estas clases no se trasladaran automaticamente al nuevo plan.
                </p>
              </div>
            )}
          </div>
        </div>

        <label className="grid gap-2">
          <span className="text-sm font-bold text-slate-600">Notas internas</span>
          <textarea
            className="min-h-24 resize-y rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-950 outline-none focus:border-accent/40 focus:ring-4 focus:ring-orange-100"
            value={form.notes}
            onChange={(event) => onPatch({ notes: event.target.value })}
            placeholder="Motivo comercial, descuento aplicado o contexto interno."
          />
        </label>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="button"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-accent px-5 text-sm font-black text-white shadow-[0_16px_35px_rgba(249,115,22,0.24)] transition hover:-translate-y-0.5 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            onClick={onSubmit}
            disabled={isSaving}
          >
            <CreditCard className="h-4 w-4" />
            {isSaving ? 'Procesando...' : actionLabel}
          </button>
          <button
            type="button"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 transition hover:border-accent/30 hover:text-accent"
            onClick={onClear}
          >
            <RotateCcw className="h-4 w-4" />
            Limpiar
          </button>
        </div>
      </div>
    </AdminContentPanel>
  )
}

function MembershipEditPanel({
  editor,
  isSaving,
  isDeleting,
  onPatch,
  onSave,
  onCancel,
  onDelete,
}: {
  editor: MembershipEditorState
  isSaving: boolean
  isDeleting: boolean
  onPatch: (patch: Partial<MembershipEditorState>) => void
  onSave: () => void
  onCancel: () => void
  onDelete: () => void
}) {
  return (
    <AdminContentPanel className="border-orange-200 bg-orange-50/60 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-accent">Edicion segura</p>
          <h3 className="mt-1 text-lg font-black text-slate-950">Ajustar membresia seleccionada</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            El backend bloqueara la eliminacion si existen reservas asociadas.
          </p>
        </div>
        <button type="button" onClick={onCancel} className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-600">
          Cerrar
        </button>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="grid gap-2 xl:col-span-2">
          <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Nombre</span>
          <input className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-accent/40 focus:ring-4 focus:ring-orange-100" value={editor.custom_name} onChange={(event) => onPatch({ custom_name: event.target.value })} />
        </label>
        <label className="grid gap-2">
          <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Inicio</span>
          <input type="date" className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-accent/40 focus:ring-4 focus:ring-orange-100" value={editor.start_date} onChange={(event) => onPatch({ start_date: event.target.value })} />
        </label>
        <label className="grid gap-2">
          <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Vencimiento</span>
          <input type="date" className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-accent/40 focus:ring-4 focus:ring-orange-100" value={editor.end_date} onChange={(event) => onPatch({ end_date: event.target.value })} />
        </label>
        <label className="grid gap-2">
          <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Estado operativo</span>
          <select className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-accent/40 focus:ring-4 focus:ring-orange-100" value={editor.status} onChange={(event) => onPatch({ status: event.target.value })}>
            <option value="active">Activa</option>
            <option value="expired">Vencida</option>
            <option value="consumed">Consumida</option>
            <option value="historical">Historial</option>
            <option value="cancelled">Cancelada</option>
            <option value="draft">Borrador</option>
          </select>
        </label>
        <label className="grid gap-2">
          <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Clases totales</span>
          <input type="number" min={0} className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-accent/40 focus:ring-4 focus:ring-orange-100" value={editor.classes_total} onChange={(event) => onPatch({ classes_total: event.target.value })} />
        </label>
        <label className="grid gap-2">
          <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Usadas</span>
          <input type="number" min={0} className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-accent/40 focus:ring-4 focus:ring-orange-100" value={editor.classes_used} onChange={(event) => onPatch({ classes_used: event.target.value })} />
        </label>
        <label className="grid gap-2">
          <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Restantes</span>
          <input type="number" min={0} className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-accent/40 focus:ring-4 focus:ring-orange-100" value={editor.classes_remaining} onChange={(event) => onPatch({ classes_remaining: event.target.value })} />
        </label>
        <label className="grid gap-2">
          <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Total</span>
          <input type="number" min={0} step="0.01" className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-accent/40 focus:ring-4 focus:ring-orange-100" value={editor.total_amount} onChange={(event) => onPatch({ total_amount: event.target.value })} />
        </label>
        <label className="grid gap-2">
          <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Moneda</span>
          <input className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm uppercase outline-none focus:border-accent/40 focus:ring-4 focus:ring-orange-100" value={editor.currency} onChange={(event) => onPatch({ currency: event.target.value.toUpperCase() })} />
        </label>
        <label className="grid gap-2 md:col-span-2 xl:col-span-4">
          <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Notas</span>
          <textarea className="min-h-24 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-accent/40 focus:ring-4 focus:ring-orange-100" value={editor.notes} onChange={(event) => onPatch({ notes: event.target.value })} />
        </label>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <button type="button" onClick={onSave} disabled={isSaving} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-accent px-5 text-sm font-black text-white shadow-[0_16px_35px_rgba(249,115,22,0.22)] disabled:opacity-60">
          <Save className="h-4 w-4" />
          {isSaving ? 'Guardando...' : 'Guardar cambios'}
        </button>
        <button type="button" onClick={onDelete} disabled={isDeleting} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-white px-5 text-sm font-black text-rose-600 disabled:opacity-60">
          <Trash2 className="h-4 w-4" />
          {isDeleting ? 'Eliminando...' : 'Eliminar membresia'}
        </button>
      </div>
    </AdminContentPanel>
  )
}

function MembershipsActiveTab({
  memberships,
  search,
  statusFilter,
  sort,
  editingMembership,
  savingMembership,
  deletingMembershipId,
  onSearchChange,
  onStatusFilterChange,
  onSortChange,
  onRenew,
  onEdit,
  onPatchEditor,
  onSaveEditor,
  onCancelEditor,
  onDelete,
}: {
  memberships: AdminStudentMembership[]
  search: string
  statusFilter: ActiveMembershipStatusFilter
  sort: MembershipSort
  editingMembership: MembershipEditorState | null
  savingMembership: boolean
  deletingMembershipId: string | null
  onSearchChange: (value: string) => void
  onStatusFilterChange: (value: ActiveMembershipStatusFilter) => void
  onSortChange: (value: MembershipSort) => void
  onRenew: (membership: AdminStudentMembership) => void
  onEdit: (membership: AdminStudentMembership) => void
  onPatchEditor: (patch: Partial<MembershipEditorState>) => void
  onSaveEditor: () => void
  onCancelEditor: () => void
  onDelete: (membership: AdminStudentMembership) => void
}) {
  const normalizedSearch = search.trim().toLowerCase()
  const filteredMemberships = useMemo(() => {
    return memberships
      .filter((membership) => {
        const status = membershipOperationalStatus(membership)
        const matchesSearch = !normalizedSearch
          || membership.custom_name.toLowerCase().includes(normalizedSearch)
          || (membership.student?.full_name || '').toLowerCase().includes(normalizedSearch)

        if (!matchesSearch) return false
        if (statusFilter === 'all') return true
        if (statusFilter === 'active') return status === 'active' || status === 'expiring' || status === 'empty'
        return status === statusFilter
      })
      .sort((left, right) => {
        if (sort === 'expiration') return (daysUntil(left.end_date) ?? 9999) - (daysUntil(right.end_date) ?? 9999)
        if (sort === 'balance') return left.classes_remaining - right.classes_remaining
        return new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
      })
  }, [memberships, normalizedSearch, sort, statusFilter])

  return (
    <div className="space-y-5">
      <AdminContentPanel className="p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-sm font-black text-slate-950">Membresias activas</p>
            <p className="mt-1 text-sm text-slate-500">Controla saldo, vencimiento y renovacion sin salir de la vista.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-3 xl:min-w-[760px]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm outline-none focus:border-accent/40 focus:ring-4 focus:ring-orange-100"
                placeholder="Buscar alumno o plan"
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
              />
            </label>
            <label className="relative">
              <Filter className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <select className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm outline-none focus:border-accent/40 focus:ring-4 focus:ring-orange-100" value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value as ActiveMembershipStatusFilter)}>
                <option value="all">Todos los estados</option>
                <option value="active">Activas</option>
                <option value="expiring">Por vencer</option>
                <option value="expired">Vencidas</option>
                <option value="empty">Sin clases</option>
                <option value="historical">Historial</option>
              </select>
            </label>
            <select className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-accent/40 focus:ring-4 focus:ring-orange-100" value={sort} onChange={(event) => onSortChange(event.target.value as MembershipSort)}>
              <option value="recent">Mas recientes</option>
              <option value="expiration">Vencimiento</option>
              <option value="balance">Menor saldo</option>
            </select>
          </div>
        </div>
      </AdminContentPanel>

      {editingMembership && (
        <MembershipEditPanel
          editor={editingMembership}
          isSaving={savingMembership}
          isDeleting={deletingMembershipId === editingMembership.id}
          onPatch={onPatchEditor}
          onSave={onSaveEditor}
          onCancel={onCancelEditor}
          onDelete={() => {
            const membership = memberships.find((item) => item.id === editingMembership.id)
            if (membership) onDelete(membership)
          }}
        />
      )}

      <AdminContentPanel className="p-0">
        <div className="hidden overflow-hidden rounded-[1.35rem] border border-slate-200 lg:block">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-xs font-black uppercase tracking-[0.16em] text-slate-400">
              <tr>
                <th className="px-5 py-4">Alumno</th>
                <th className="px-5 py-4">Plan</th>
                <th className="px-5 py-4">Estado operativo</th>
                <th className="px-5 py-4">Saldo</th>
                <th className="px-5 py-4">Vencimiento</th>
                <th className="px-5 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredMemberships.map((membership) => {
                const status = membershipOperationalStatus(membership)
                const usage = classUsagePercent(membership)

                return (
                  <tr key={membership.id} className="bg-white align-top transition hover:bg-orange-50/40">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <Avatar name={membership.student?.full_name || 'Alumno'} url={membership.student?.avatar_url || null} size="md" />
                        <div>
                          <p className="font-black text-slate-950">{membership.student?.full_name || 'Alumno eliminado'}</p>
                          <p className="mt-1 text-xs text-slate-500">Creada {formatDate(membership.created_at.slice(0, 10))}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-bold text-slate-800">{membership.custom_name}</p>
                      <p className="mt-1 text-xs text-slate-500">{formatMoney(membership.total_amount, membership.currency)}</p>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ring-1 ${statusBadgeClass(status)}`}>{statusLabel(status)}</span>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-black text-slate-950">{membership.classes_remaining}/{membership.classes_total}</p>
                      <div className="mt-2 h-2 w-32 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${usage}%` }} />
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-bold text-slate-800">{formatDate(membership.end_date)}</p>
                      <p className="mt-1 text-xs text-slate-500">{daysUntil(membership.end_date) ?? 'Sin'} dias</p>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => onRenew(membership)} className="rounded-xl bg-accent px-3 py-2 text-xs font-black text-white">Renovar</button>
                        <button type="button" onClick={() => onEdit(membership)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700">Editar</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="grid gap-3 p-4 lg:hidden">
          {filteredMemberships.map((membership) => {
            const status = membershipOperationalStatus(membership)

            return (
              <article key={membership.id} className="rounded-[1.25rem] border border-slate-200 bg-white p-4">
                <div className="flex items-start gap-3">
                  <Avatar name={membership.student?.full_name || 'Alumno'} url={membership.student?.avatar_url || null} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-slate-950">{membership.student?.full_name || 'Alumno eliminado'}</p>
                    <p className="mt-1 text-xs text-slate-500">{membership.custom_name}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-black ring-1 ${statusBadgeClass(status)}`}>{statusLabel(status)}</span>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-2xl bg-slate-50 p-3"><p className="font-black text-slate-950">{membership.classes_remaining}</p><p className="mt-1 text-slate-500">Restantes</p></div>
                  <div className="rounded-2xl bg-slate-50 p-3"><p className="font-black text-slate-950">{membership.classes_used}</p><p className="mt-1 text-slate-500">Usadas</p></div>
                  <div className="rounded-2xl bg-slate-50 p-3"><p className="font-black text-slate-950">{formatDate(membership.end_date)}</p><p className="mt-1 text-slate-500">Vence</p></div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => onRenew(membership)} className="rounded-2xl bg-accent px-3 py-3 text-sm font-black text-white">Renovar</button>
                  <button type="button" onClick={() => onEdit(membership)} className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-black text-slate-700">Editar</button>
                </div>
              </article>
            )
          })}
        </div>

        {filteredMemberships.length === 0 && (
          <div className="p-8 text-center">
            <UserRound className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm font-black text-slate-950">No hay membresias para este filtro.</p>
            <p className="mt-1 text-sm text-slate-500">Ajusta la busqueda o crea un nuevo ciclo desde Resumen.</p>
          </div>
        )}
      </AdminContentPanel>

      <p className="px-1 text-sm text-slate-500">
        Mostrando {filteredMemberships.length} de {memberships.length} membresias registradas.
      </p>
    </div>
  )
}

function PlanEditorModal({
  form,
  isSaving,
  onPatch,
  onSubmit,
  onCancel,
}: {
  form: PlanEditorState
  isSaving: boolean
  onPatch: (patch: Partial<PlanEditorState>) => void
  onSubmit: () => void
  onCancel: () => void
}) {
  const isEditing = !!form.id

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-hidden rounded-[1.8rem] border border-white/20 bg-white shadow-[0_35px_90px_rgba(2,6,23,0.38)]">
        <div className="flex max-h-[calc(100vh-2rem)] flex-col">
          <div className="relative overflow-hidden bg-[#07111d] p-6 text-white">
            <div className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full bg-accent/25 blur-3xl" />
            <div className="relative flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-200">{isEditing ? 'Editar plan' : 'Crear plan'}</p>
                <h3 className="mt-2 text-2xl font-black tracking-[-0.05em] sm:text-3xl">{isEditing ? 'Actualizar catalogo' : 'Nuevo plan de membresia'}</h3>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                  Completa los datos del plan. Se guardan en membership_plans y quedan protegidos por RLS admin.
                </p>
              </div>
              <button
                type="button"
                onClick={onCancel}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/10 text-white transition hover:bg-white/20"
                aria-label="Cerrar editor de plan"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="overflow-y-auto p-5 sm:p-6">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 md:col-span-2">
                <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Nombre del plan</span>
                <input className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-accent/40 focus:ring-4 focus:ring-orange-100" value={form.name} onChange={(event) => onPatch({ name: event.target.value })} />
              </label>
              <label className="grid gap-2">
                <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Clases incluidas</span>
                <input type="number" min={0} className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-accent/40 focus:ring-4 focus:ring-orange-100" value={form.classes_included} onChange={(event) => onPatch({ classes_included: event.target.value })} />
              </label>
              <label className="grid gap-2">
                <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Duracion en dias</span>
                <input type="number" min={1} className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-accent/40 focus:ring-4 focus:ring-orange-100" value={form.duration_days} onChange={(event) => onPatch({ duration_days: event.target.value })} />
              </label>
              <label className="grid gap-2">
                <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Precio base</span>
                <input type="number" min={0} step="0.01" className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-accent/40 focus:ring-4 focus:ring-orange-100" value={form.base_price} onChange={(event) => onPatch({ base_price: event.target.value })} />
              </label>
              <label className="grid gap-2">
                <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Moneda</span>
                <input className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm uppercase outline-none focus:border-accent/40 focus:ring-4 focus:ring-orange-100" value={form.currency} onChange={(event) => onPatch({ currency: event.target.value.toUpperCase() })} />
              </label>
              <label className="grid gap-2 md:col-span-2">
                <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Descripcion</span>
                <textarea className="min-h-28 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-accent/40 focus:ring-4 focus:ring-orange-100" value={form.description} onChange={(event) => onPatch({ description: event.target.value })} />
              </label>
              <label className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 md:col-span-2">
                <span>
                  <span className="block text-sm font-black text-slate-800">Plan activo</span>
                  <span className="mt-0.5 block text-xs text-slate-500">Disponible para nuevas ventas y renovaciones.</span>
                </span>
                <input type="checkbox" className="h-5 w-5 accent-orange-500" checked={form.is_active} onChange={(event) => onPatch({ is_active: event.target.checked })} />
              </label>
            </div>
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-slate-100 bg-white p-5 sm:flex-row sm:justify-end">
            <button type="button" onClick={onCancel} className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700">
              Cancelar
            </button>
            <button type="button" onClick={onSubmit} disabled={isSaving} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-accent px-5 text-sm font-black text-white shadow-[0_16px_35px_rgba(249,115,22,0.22)] disabled:opacity-60">
              <Save className="h-4 w-4" />
              {isSaving ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Crear plan'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function PlansCatalogTab({
  plans,
  memberships,
  planFilter,
  planEditor,
  savingPlan,
  deletingPlanId,
  onFilterChange,
  onNewPlan,
  onEditPlan,
  onPatchPlan,
  onSavePlan,
  onCancelPlan,
  onTogglePlan,
  onDeletePlan,
  onUsePlan,
}: {
  plans: MembershipPlan[]
  memberships: AdminStudentMembership[]
  planFilter: PlanFilter
  planEditor: PlanEditorState | null
  savingPlan: boolean
  deletingPlanId: string | null
  onFilterChange: (value: PlanFilter) => void
  onNewPlan: () => void
  onEditPlan: (plan: MembershipPlan) => void
  onPatchPlan: (patch: Partial<PlanEditorState>) => void
  onSavePlan: () => void
  onCancelPlan: () => void
  onTogglePlan: (plan: MembershipPlan) => void
  onDeletePlan: (plan: MembershipPlan) => void
  onUsePlan: (plan: MembershipPlan) => void
}) {
  const visiblePlans = plans.filter((plan) => {
    if (planFilter === 'active') return plan.is_active
    if (planFilter === 'inactive') return !plan.is_active
    return true
  })

  function usageForPlan(planId: string) {
    return memberships.filter((membership) => membership.membership_plan_id === planId).length
  }

  return (
    <div className="space-y-5">
      {planEditor && (
        <PlanEditorModal
          form={planEditor}
          isSaving={savingPlan}
          onPatch={onPatchPlan}
          onSubmit={onSavePlan}
          onCancel={onCancelPlan}
        />
      )}

      <div className="space-y-5">
        <AdminContentPanel className="p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-black text-slate-950">Catalogo de planes</p>
              <p className="mt-1 text-sm text-slate-500">Administra planes disponibles para nuevas ventas y renovaciones.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <select className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-accent/40 focus:ring-4 focus:ring-orange-100" value={planFilter} onChange={(event) => onFilterChange(event.target.value as PlanFilter)}>
                <option value="all">Todos los planes</option>
                <option value="active">Activos</option>
                <option value="inactive">Inactivos</option>
              </select>
              <button type="button" onClick={onNewPlan} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-accent px-5 text-sm font-black text-white">
                <Plus className="h-4 w-4" />
                Nuevo plan
              </button>
            </div>
          </div>
        </AdminContentPanel>

        <div className="grid gap-4 md:grid-cols-2">
          {visiblePlans.map((plan) => {
            const usage = usageForPlan(plan.id)

            return (
              <article key={plan.id} className="group rounded-[1.35rem] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.055)] transition hover:-translate-y-0.5 hover:border-accent/30">
                <div className="flex items-start justify-between gap-4">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl border border-orange-100 bg-orange-50 text-accent">
                    <PackagePlus className="h-5 w-5" />
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-black ring-1 ${plan.is_active ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-slate-100 text-slate-600 ring-slate-200'}`}>
                    {plan.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
                <h3 className="mt-4 text-lg font-black text-slate-950">{plan.name}</h3>
                <p className="mt-2 min-h-12 text-sm leading-6 text-slate-500">{plan.description || 'Sin descripcion operativa.'}</p>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-2xl bg-slate-50 p-3"><p className="font-heading text-2xl font-black text-slate-950">{plan.classes_included}</p><p className="text-slate-500">Clases</p></div>
                  <div className="rounded-2xl bg-slate-50 p-3"><p className="font-heading text-2xl font-black text-slate-950">{plan.duration_days || '-'}</p><p className="text-slate-500">Dias</p></div>
                  <div className="rounded-2xl bg-slate-50 p-3"><p className="font-heading text-lg font-black text-slate-950">{formatMoney(plan.base_price, plan.currency)}</p><p className="text-slate-500">Precio</p></div>
                </div>
                <p className="mt-4 text-xs font-bold text-slate-500">{usage} ciclos historicos o actuales asociados.</p>
                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                  <button type="button" onClick={() => onUsePlan(plan)} className="rounded-2xl bg-accent px-4 py-3 text-sm font-black text-white">Usar en venta</button>
                  <button type="button" onClick={() => onEditPlan(plan)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700">Editar</button>
                  <button type="button" onClick={() => onTogglePlan(plan)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-700">
                    {plan.is_active ? 'Desactivar plan' : 'Activar plan'}
                  </button>
                  <button type="button" onClick={() => onDeletePlan(plan)} disabled={deletingPlanId === plan.id} className="rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm font-black text-rose-600 disabled:opacity-60">
                    {deletingPlanId === plan.id ? 'Eliminando...' : 'Eliminar'}
                  </button>
                </div>
              </article>
            )
          })}
        </div>

        {visiblePlans.length === 0 && (
          <AdminContentPanel className="p-8 text-center">
            <Layers3 className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm font-black text-slate-950">No hay planes para este filtro.</p>
            <p className="mt-1 text-sm text-slate-500">Crea un plan o cambia el filtro de estado.</p>
          </AdminContentPanel>
        )}
      </div>

      <AdminContentPanel className="p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-4">
            <BadgeCheck className="mt-1 h-8 w-8 text-accent" />
            <div>
              <h3 className="text-lg font-black text-slate-950">Gestion segura de catalogo</h3>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
                La eliminacion se bloqueara si el plan esta asociado a ciclos existentes. Para planes usados, desactivalos en lugar de eliminarlos.
              </p>
            </div>
          </div>
          <button type="button" onClick={onNewPlan} className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-2xl bg-accent px-5 text-sm font-black text-white">
            <FilePenLine className="h-4 w-4" />
            Crear plan
          </button>
        </div>
      </AdminContentPanel>
    </div>
  )
}

function MembershipSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="h-36 animate-pulse rounded-[1.35rem] border border-slate-200 bg-white p-5">
          <div className="h-10 w-10 rounded-2xl bg-slate-100" />
          <div className="mt-5 h-4 w-28 rounded bg-slate-100" />
          <div className="mt-3 h-8 w-16 rounded bg-slate-100" />
        </div>
      ))}
    </div>
  )
}

export default function AdminMembershipsPage() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const saleRef = useRef<HTMLDivElement | null>(null)

  const { data: plans = [], isLoading: plansLoading, error: plansError, refetch: refetchPlans } = useMembershipPlans()
  const {
    data: allMemberships = [],
    isLoading: membershipsLoading,
    error: membershipsError,
    refetch: refetchMemberships,
  } = useAdminStudentMemberships()
  const { data: students = [], isLoading: studentsLoading, error: studentsError, refetch: refetchStudents } = useStudents()

  const [activeTab, setActiveTab] = useState<MembershipTab>('summary')
  const [attentionFilter, setAttentionFilter] = useState<'all' | 'expiring' | 'empty' | 'oneClass'>('all')
  const [assignmentForm, setAssignmentForm] = useState<AssignmentFormState>(emptyAssignmentForm)
  const [assignmentSaving, setAssignmentSaving] = useState(false)
  const [membershipSearch, setMembershipSearch] = useState('')
  const [membershipStatusFilter, setMembershipStatusFilter] = useState<ActiveMembershipStatusFilter>('active')
  const [membershipSort, setMembershipSort] = useState<MembershipSort>('expiration')
  const [membershipEditor, setMembershipEditor] = useState<MembershipEditorState | null>(null)
  const [membershipSaving, setMembershipSaving] = useState(false)
  const [membershipDeletingId, setMembershipDeletingId] = useState<string | null>(null)
  const [planFilter, setPlanFilter] = useState<PlanFilter>('all')
  const [planEditor, setPlanEditor] = useState<PlanEditorState | null>(null)
  const [planSaving, setPlanSaving] = useState(false)
  const [planDeletingId, setPlanDeletingId] = useState<string | null>(null)

  const activeStudents = useMemo(() => students.filter(isStudentSelectableForMembershipSale), [students])
  const activePlans = useMemo(() => plans.filter((plan) => plan.is_active), [plans])

  const selectedStudent = useMemo(
    () => activeStudents.find((student) => student.id === assignmentForm.student_id) || null,
    [activeStudents, assignmentForm.student_id],
  )

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.id === assignmentForm.membership_plan_id) || null,
    [assignmentForm.membership_plan_id, plans],
  )

  const currentMembership = useMemo(
    () => selectedStudent ? currentMembershipForStudent(selectedStudent.id, allMemberships) : null,
    [allMemberships, selectedStudent],
  )

  const basePrice = selectedPlan?.base_price ?? null
  const discountValueNumber = assignmentForm.discount_value.trim() ? Number(assignmentForm.discount_value) : 0
  const normalizedDiscountValue = Number.isFinite(discountValueNumber) ? discountValueNumber : 0

  const computedDiscountAmount = useMemo(() => {
    if (basePrice === null || normalizedDiscountValue <= 0) return 0
    if (assignmentForm.discount_type === 'percentage') return Math.min(basePrice, (basePrice * normalizedDiscountValue) / 100)
    if (assignmentForm.discount_type === 'amount') return Math.min(basePrice, normalizedDiscountValue)
    return 0
  }, [assignmentForm.discount_type, basePrice, normalizedDiscountValue])

  const finalAmount = useMemo(() => {
    if (basePrice === null) return null
    return Math.max(0, basePrice - computedDiscountAmount)
  }, [basePrice, computedDiscountAmount])

  const newEndDate = useMemo(
    () => addDaysISODate(assignmentForm.start_date, selectedPlan?.duration_days),
    [assignmentForm.start_date, selectedPlan?.duration_days],
  )

  useEffect(() => {
    if (finalAmount === null) return
    setAssignmentForm((current) => {
      if (current.payment_amount !== '' && current.payment_amount !== String(basePrice ?? '')) return current
      return { ...current, payment_amount: finalAmount.toString() }
    })
  }, [basePrice, finalAmount])

  const membershipKpis = useMemo(() => {
    const activeMemberships = allMemberships.filter((membership) => membership.status === 'active')
    const expiring = activeMemberships.filter((membership) => {
      const days = daysUntil(membership.end_date)
      return days !== null && days >= 0 && days <= 7
    })
    const withoutClasses = activeMemberships.filter((membership) => membership.classes_remaining <= 0)
    const oneClass = activeMemberships.filter((membership) => membership.classes_remaining === 1)
    const monthMemberships = allMemberships.filter((membership) => isSameMonth(membership.created_at))
    const monthIncome = monthMemberships.reduce((sum, membership) => sum + Number(membership.total_amount || 0), 0)

    return {
      activeMemberships,
      expiring,
      withoutClasses,
      oneClass,
      monthRenewals: monthMemberships.length,
      monthIncome,
    }
  }, [allMemberships])

  const visibleAttentionStudents = useMemo(() => {
    if (attentionFilter === 'expiring') {
      return activeStudents.filter((student) => {
        const days = daysUntil(student.membership_end)
        return student.membership_status === 'active' && days !== null && days >= 0 && days <= 7
      })
    }
    if (attentionFilter === 'empty') {
      return activeStudents.filter((student) => student.membership_status === 'active' && student.classes_remaining <= 0)
    }
    if (attentionFilter === 'oneClass') {
      return activeStudents.filter((student) => student.membership_status === 'active' && student.classes_remaining === 1)
    }
    return activeStudents.slice(0, 5)
  }, [activeStudents, attentionFilter])

  const recentMemberships = useMemo(() => allMemberships.slice(0, 6), [allMemberships])

  function patchAssignmentForm(patch: Partial<AssignmentFormState>) {
    setAssignmentForm((current) => ({ ...current, ...patch }))
  }

  function scrollToSaleForm() {
    setActiveTab('summary')
    window.setTimeout(() => {
      saleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 0)
  }

  async function refreshAll() {
    await Promise.all([refetchPlans(), refetchMemberships(), refetchStudents()])
  }

  async function assignMembership() {
    if (!assignmentForm.student_id || !assignmentForm.membership_plan_id) {
      toast.push({ message: 'Selecciona alumno y plan.', type: 'error' })
      return
    }

    if (!selectedPlan || !selectedStudent) {
      toast.push({ message: 'No pudimos preparar el resumen de la membresia.', type: 'error' })
      return
    }

    const warnReplacement = shouldWarnReplacement(currentMembership, selectedStudent)
    const currentRemaining = currentMembership?.classes_remaining ?? selectedStudent.classes_remaining ?? 0
    const confirmMessage = [
      warnReplacement ? replacementWarning : 'Se creara un nuevo ciclo de membresia para el alumno seleccionado.',
      '',
      'Resumen previo a la renovacion:',
      `Alumno: ${selectedStudent.full_name}`,
      `Plan actual: ${currentMembership?.custom_name || selectedStudent.membership_name || 'Sin membresia previa'}`,
      `Clases restantes que dejaran de estar activas: ${warnReplacement ? currentRemaining : 0}`,
      `Nuevo plan: ${selectedPlan.name}`,
      `Nuevo saldo de clases: ${selectedPlan.classes_included}`,
      `Nuevas fechas: ${formatDate(assignmentForm.start_date)} - ${formatDate(newEndDate)}`,
      `Total: ${formatMoney(finalAmount, selectedPlan.currency)}`,
    ].join('\n')

    const accepted = await confirm(confirmMessage, {
      title: warnReplacement ? 'Confirmar reemplazo de membresia' : 'Confirmar activacion de membresia',
      description: warnReplacement
        ? 'Esta confirmacion no acumula clases restantes ni extiende la vigencia anterior.'
        : 'Revisa el nuevo ciclo antes de activar la membresia.',
      confirmLabel: warnReplacement ? 'Renovar membresia' : 'Activar membresia',
      cancelLabel: 'Volver a revisar',
      tone: 'warning',
    })

    if (!accepted) return

    setAssignmentSaving(true)

    try {
      const { error } = await supabase.rpc('admin_assign_membership_plan', {
        p_student_id: assignmentForm.student_id,
        p_membership_plan_id: assignmentForm.membership_plan_id,
        p_start_date: assignmentForm.start_date || null,
        p_total_amount: finalAmount,
        p_payment_amount: assignmentForm.payment_amount.trim() ? Number(assignmentForm.payment_amount) : null,
        p_notes: [
          assignmentForm.notes.trim() || null,
          assignmentForm.discount_type !== 'none' && finalAmount !== null
            ? `Descuento aplicado: ${assignmentForm.discount_type === 'percentage'
              ? `${normalizedDiscountValue}%`
              : `${selectedPlan.currency || 'PEN'} ${normalizedDiscountValue.toFixed(2)}`
            }. Precio final: ${selectedPlan.currency || 'PEN'} ${finalAmount.toFixed(2)}.`
            : null,
        ].filter(Boolean).join(' | ') || null,
      })

      if (error) throw error

      toast.push({ message: warnReplacement ? 'Membresia renovada correctamente.' : 'Membresia activada correctamente.', type: 'success' })

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: studentKeys.all }),
        queryClient.invalidateQueries({ queryKey: studentKeys.detail(assignmentForm.student_id) }),
        queryClient.invalidateQueries({ queryKey: membershipPlanKeys.all }),
      ])

      setAssignmentForm(emptyAssignmentForm())
      await refreshAll()
    } catch (error: any) {
      toast.push({ message: error.message || 'No se pudo asignar la membresia.', type: 'error' })
    } finally {
      setAssignmentSaving(false)
    }
  }

  function selectMembershipForRenewal(membership: AdminStudentMembership) {
    setAssignmentForm((current) => ({
      ...current,
      student_id: membership.student?.id || current.student_id,
      membership_plan_id: membership.membership_plan_id || current.membership_plan_id,
      start_date: getTodayLocalISODate(),
    }))
    scrollToSaleForm()
  }

  function patchMembershipEditor(patch: Partial<MembershipEditorState>) {
    setMembershipEditor((current) => current ? { ...current, ...patch } : current)
  }

  async function saveMembershipEditor() {
    if (!membershipEditor || membershipSaving) return

    if (!membershipEditor.custom_name.trim()) {
      toast.push({ message: 'El nombre de la membresia es obligatorio.', type: 'error' })
      return
    }

    setMembershipSaving(true)

    try {
      const { error } = await supabase.rpc('admin_update_student_membership', {
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

      if (error) throw error

      toast.push({ message: 'Membresia actualizada.', type: 'success' })
      setMembershipEditor(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: membershipPlanKeys.all }),
        queryClient.invalidateQueries({ queryKey: studentKeys.all }),
      ])
      await refreshAll()
    } catch (error: any) {
      toast.push({ message: error.message || 'No se pudo actualizar la membresia.', type: 'error' })
    } finally {
      setMembershipSaving(false)
    }
  }

  async function deleteMembership(membership: AdminStudentMembership) {
    if (membershipDeletingId) return

    const accepted = await confirm(
      [
        `Se eliminara la membresia ${membership.custom_name}.`,
        'El backend bloqueara la eliminacion si existen reservas asociadas.',
        'Si solo quieres ocultarla de operacion diaria, cambia su estado a historial o cancelada.',
      ].join('\n'),
      {
        title: 'Eliminar membresia',
        description: 'Esta accion no debe usarse para corregir consumo de clases con reservas existentes.',
        confirmLabel: 'Eliminar membresia',
        cancelLabel: 'Cancelar',
        tone: 'danger',
      },
    )

    if (!accepted) return

    setMembershipDeletingId(membership.id)

    try {
      const { data, error } = await supabase.rpc('admin_delete_student_membership', {
        p_membership_id: membership.id,
      })

      if (error) throw error
      if (!data?.success) throw new Error(data?.error || 'No se pudo eliminar la membresia.')

      toast.push({ message: 'Membresia eliminada.', type: 'success' })
      if (membershipEditor?.id === membership.id) setMembershipEditor(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: membershipPlanKeys.all }),
        queryClient.invalidateQueries({ queryKey: studentKeys.all }),
      ])
      await refreshAll()
    } catch (error: any) {
      toast.push({ message: error.message || 'No se pudo eliminar la membresia.', type: 'error' })
    } finally {
      setMembershipDeletingId(null)
    }
  }

  function patchPlanEditor(patch: Partial<PlanEditorState>) {
    setPlanEditor((current) => current ? { ...current, ...patch } : current)
  }

  async function savePlanEditor() {
    if (!planEditor || planSaving) return

    const name = planEditor.name.trim()
    const classesIncluded = Number(planEditor.classes_included || 0)
    const durationDays = planEditor.duration_days.trim() ? Number(planEditor.duration_days) : null
    const basePrice = planEditor.base_price.trim() ? Number(planEditor.base_price) : null

    if (!name || !Number.isFinite(classesIncluded) || classesIncluded < 0) {
      toast.push({ message: 'Completa nombre y clases del plan.', type: 'error' })
      return
    }

    if ((durationDays !== null && (!Number.isFinite(durationDays) || durationDays <= 0)) || (basePrice !== null && (!Number.isFinite(basePrice) || basePrice < 0))) {
      toast.push({ message: 'Revisa dias y precio del plan.', type: 'error' })
      return
    }

    const planPayload = {
      name,
      description: planEditor.description.trim() || null,
      classes_included: classesIncluded,
      duration_days: durationDays,
      base_price: basePrice,
      currency: planEditor.currency.trim() || 'PEN',
      is_active: planEditor.is_active,
      updated_at: new Date().toISOString(),
    }

    setPlanSaving(true)

    try {
      if (planEditor.id) {
        const { error } = await supabase.from('membership_plans').update(planPayload).eq('id', planEditor.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('membership_plans').insert(planPayload)
        if (error) throw error
      }

      toast.push({ message: planEditor.id ? 'Plan actualizado.' : 'Plan creado.', type: 'success' })
      setPlanEditor(null)
      await queryClient.invalidateQueries({ queryKey: membershipPlanKeys.all })
      await refreshAll()
    } catch (error: any) {
      toast.push({ message: error.message || 'No se pudo guardar el plan.', type: 'error' })
    } finally {
      setPlanSaving(false)
    }
  }

  async function togglePlanStatus(plan: MembershipPlan) {
    try {
      const { error } = await supabase.from('membership_plans').update({ is_active: !plan.is_active, updated_at: new Date().toISOString() }).eq('id', plan.id)
      if (error) throw error

      toast.push({ message: plan.is_active ? 'Plan desactivado.' : 'Plan activado.', type: 'success' })
      await queryClient.invalidateQueries({ queryKey: membershipPlanKeys.all })
      await refreshAll()
    } catch (error: any) {
      toast.push({ message: error.message || 'No se pudo cambiar el estado del plan.', type: 'error' })
    }
  }

  async function deletePlan(plan: MembershipPlan) {
    if (planDeletingId) return

    const accepted = await confirm(
      [
        `Se eliminara el plan ${plan.name}.`,
        'La eliminacion se bloqueara si el plan esta asociado a ciclos existentes.',
        'Si el plan ya fue usado, desactivalo para conservar historial.',
      ].join('\n'),
      {
        title: 'Eliminar plan',
        description: 'Esta accion solo debe usarse para planes creados por error y sin uso.',
        confirmLabel: 'Eliminar plan',
        cancelLabel: 'Cancelar',
        tone: 'danger',
      },
    )

    if (!accepted) return

    setPlanDeletingId(plan.id)

    try {
      const { error } = await supabase.from('membership_plans').delete().eq('id', plan.id)
      if (error) throw error

      toast.push({ message: 'Plan eliminado.', type: 'success' })
      if (planEditor?.id === plan.id) setPlanEditor(null)
      await queryClient.invalidateQueries({ queryKey: membershipPlanKeys.all })
      await refreshAll()
    } catch (error: any) {
      toast.push({ message: error.message || 'No se pudo eliminar el plan.', type: 'error' })
    } finally {
      setPlanDeletingId(null)
    }
  }

  const isLoading = plansLoading || membershipsLoading || studentsLoading
  const loadError = plansError || membershipsError || studentsError

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Membresias"
        description="Gestiona planes, renovaciones y estado de cuenta de tus alumnos"
        actions={
          <>
            <button
              type="button"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 shadow-[0_10px_30px_rgba(15,23,42,0.04)] transition hover:border-accent/30 hover:text-accent"
              onClick={refreshAll}
            >
              <RefreshCw className="h-4 w-4" />
              Actualizar
            </button>
            <button
              type="button"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-accent px-5 text-sm font-black text-white shadow-[0_16px_35px_rgba(249,115,22,0.24)] transition hover:-translate-y-0.5 active:scale-[0.98]"
              onClick={scrollToSaleForm}
            >
              <CreditCard className="h-4 w-4" />
              Nueva venta o renovacion
            </button>
          </>
        }
      />

      {loadError && (
        <AdminContentPanel className="border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
          No pudimos cargar la informacion de membresias. {String(loadError)}
        </AdminContentPanel>
      )}

      {isLoading ? (
        <MembershipSkeleton />
      ) : (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <AdminStatCard label="Membresias activas" value={membershipKpis.activeMemberships.length} helper="Base actual" icon={<CheckCircle2 className="h-5 w-5" />} tone="green" />
          <AdminStatCard label="Por vencer" value={membershipKpis.expiring.length} helper="Proximos 7 dias" icon={<CalendarDays className="h-5 w-5" />} tone="orange" />
          <AdminStatCard label="Sin clases" value={membershipKpis.withoutClasses.length} helper="Requieren atencion" icon={<XCircle className="h-5 w-5" />} tone="red" />
          <AdminStatCard label="Una clase" value={membershipKpis.oneClass.length} helper="Renovacion cercana" icon={<AlertTriangle className="h-5 w-5" />} tone="amber" />
          <AdminStatCard label="Renovaciones" value={membershipKpis.monthRenewals} helper="Este mes" icon={<RotateCcw className="h-5 w-5" />} tone="blue" />
          <AdminStatCard label="Ingresos por membresias" value={formatMoney(membershipKpis.monthIncome, 'PEN')} helper="Este mes" icon={<Wallet className="h-5 w-5" />} tone="slate" />
        </section>
      )}

      <MembershipTabs activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === 'summary' && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            <div ref={saleRef}>
              <MembershipSaleForm
                form={assignmentForm}
                selectedStudent={selectedStudent}
                selectedPlan={selectedPlan}
                currentMembership={currentMembership}
                activeStudents={activeStudents}
                activePlans={activePlans}
                basePrice={basePrice}
                computedDiscountAmount={computedDiscountAmount}
                finalAmount={finalAmount}
                newEndDate={newEndDate}
                isSaving={assignmentSaving}
                onPatch={patchAssignmentForm}
                onSubmit={assignMembership}
                onClear={() => setAssignmentForm(emptyAssignmentForm())}
              />
            </div>

            <AdminContentPanel className="p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-black text-slate-950">Pendientes importantes</p>
                  <p className="mt-1 text-sm text-slate-500">Acciones operativas para renovacion y seguimiento.</p>
                </div>
                <button type="button" onClick={() => setAttentionFilter('all')} className="text-sm font-black text-accent">Limpiar filtros</button>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MembershipAttentionCard
                  icon={<CalendarDays className="h-5 w-5" />}
                  title="Membresias por vencer"
                  value={membershipKpis.expiring.length}
                  helper="Ciclos activos que vencen en los proximos 7 dias."
                  onClick={() => setAttentionFilter('expiring')}
                />
                <MembershipAttentionCard
                  icon={<XCircle className="h-5 w-5" />}
                  title="Alumnos sin clases"
                  value={membershipKpis.withoutClasses.length}
                  helper="Ciclos activos con saldo agotado."
                  tone="red"
                  onClick={() => setAttentionFilter('empty')}
                />
                <MembershipAttentionCard
                  icon={<ShieldAlert className="h-5 w-5" />}
                  title="Una clase restante"
                  value={membershipKpis.oneClass.length}
                  helper="Renovacion cercana antes de agotar saldo."
                  tone="amber"
                  onClick={() => setAttentionFilter('oneClass')}
                />
                <MembershipAttentionCard
                  icon={<Layers3 className="h-5 w-5" />}
                  title="Planes activos"
                  value={activePlans.length}
                  helper="Catalogo disponible para venta hoy."
                  tone="blue"
                  cta="Ver catalogo"
                  onClick={() => setActiveTab('plans')}
                />
              </div>

              <div className="mt-5 rounded-[1.35rem] border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-2 text-sm font-black text-slate-950">
                  <Search className="h-4 w-4 text-accent" />
                  Alumnos destacados
                </div>
                {visibleAttentionStudents.length === 0 ? (
                  <p className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
                    No hay membresias para los filtros seleccionados.
                  </p>
                ) : (
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {visibleAttentionStudents.map((student) => (
                      <div key={student.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3">
                        <Avatar name={student.full_name} url={student.avatar_url} size="md" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-black text-slate-950">{student.full_name}</p>
                          <p className="text-xs text-slate-500">{student.membership_name || 'Sin plan'} · {student.classes_remaining} clases</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            patchAssignmentForm({ student_id: student.id })
                            scrollToSaleForm()
                          }}
                          className="rounded-xl bg-orange-50 px-3 py-2 text-xs font-black text-accent"
                        >
                          Renovar
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </AdminContentPanel>
          </div>

          <aside className="space-y-6">
            <AdminContentPanel className="p-5">
              <h2 className="text-base font-black text-slate-950">Renovaciones recientes</h2>
              <p className="mt-1 text-sm text-slate-500">Ultimos ciclos registrados en V2.</p>
              <div className="mt-4 space-y-3">
                {recentMemberships.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-sm text-slate-500">
                    Todavia no hay membresias registradas.
                  </p>
                ) : (
                  recentMemberships.map((membership) => (
                    <article key={membership.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex items-start gap-3">
                        <Avatar name={membership.student?.full_name || 'Alumno'} url={membership.student?.avatar_url || null} size="md" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-black text-slate-950">{membership.student?.full_name || 'Alumno eliminado'}</p>
                          <p className="mt-1 text-xs text-slate-500">{membership.custom_name}</p>
                          <p className="mt-2 text-sm font-black text-accent">{formatMoney(membership.total_amount, membership.currency)}</p>
                        </div>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </AdminContentPanel>

            <AdminContentPanel className="p-5">
              <h2 className="text-base font-black text-slate-950">Acceso rapido a catalogo</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">Planes activos disponibles para venta o renovacion.</p>
              <div className="mt-4 grid gap-3">
                {activePlans.slice(0, 3).map((plan) => (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => {
                      patchAssignmentForm({ membership_plan_id: plan.id })
                      scrollToSaleForm()
                    }}
                    className="rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-accent/30 hover:bg-orange-50"
                  >
                    <p className="text-sm font-black text-slate-950">{plan.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{plan.classes_included} clases · {formatMoney(plan.base_price, plan.currency)}</p>
                  </button>
                ))}
              </div>
            </AdminContentPanel>
          </aside>
        </div>
      )}

      {activeTab === 'active' && (
        <MembershipsActiveTab
          memberships={allMemberships}
          search={membershipSearch}
          statusFilter={membershipStatusFilter}
          sort={membershipSort}
          editingMembership={membershipEditor}
          savingMembership={membershipSaving}
          deletingMembershipId={membershipDeletingId}
          onSearchChange={setMembershipSearch}
          onStatusFilterChange={setMembershipStatusFilter}
          onSortChange={setMembershipSort}
          onRenew={selectMembershipForRenewal}
          onEdit={(membership) => setMembershipEditor(membershipEditorFromMembership(membership))}
          onPatchEditor={patchMembershipEditor}
          onSaveEditor={saveMembershipEditor}
          onCancelEditor={() => setMembershipEditor(null)}
          onDelete={deleteMembership}
        />
      )}

      {activeTab === 'plans' && (
        <PlansCatalogTab
          plans={plans}
          memberships={allMemberships}
          planFilter={planFilter}
          planEditor={planEditor}
          savingPlan={planSaving}
          deletingPlanId={planDeletingId}
          onFilterChange={setPlanFilter}
          onNewPlan={() => setPlanEditor(emptyPlanForm())}
          onEditPlan={(plan) => setPlanEditor(planFormFromPlan(plan))}
          onPatchPlan={patchPlanEditor}
          onSavePlan={savePlanEditor}
          onCancelPlan={() => setPlanEditor(null)}
          onTogglePlan={togglePlanStatus}
          onDeletePlan={deletePlan}
          onUsePlan={(plan) => {
            setAssignmentForm((current) => ({ ...current, membership_plan_id: plan.id }))
            scrollToSaleForm()
          }}
        />
      )}
    </div>
  )
}
