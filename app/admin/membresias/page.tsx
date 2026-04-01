'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CreditCard, RefreshCw, Sparkles, Wallet } from 'lucide-react'
import AdminGuard from '@/components/AdminGuard'
import Avatar from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/Spinner'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/ToastProvider'
import { supabase } from '@/lib/supabaseClient'
import { studentKeys, useStudents } from '@/lib/queries/studentQueries'
import {
  useMembershipPlans,
  useRecentStudentMemberships,
  type MembershipPlan,
} from '@/lib/hooks/useMembershipPlans'

type PlanFormState = {
  name: string
  description: string
  classes_included: string
  duration_days: string
  base_price: string
  currency: string
  is_active: boolean
}

type AssignmentFormState = {
  student_id: string
  membership_plan_id: string
  start_date: string
  discount_type: 'none' | 'amount' | 'percentage'
  discount_value: string
  payment_amount: string
  notes: string
}

function emptyPlanForm(): PlanFormState {
  return {
    name: '',
    description: '',
    classes_included: '8',
    duration_days: '30',
    base_price: '',
    currency: 'PEN',
    is_active: true,
  }
}

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

function formatMoney(amount: number | null | undefined, currency: string | null | undefined) {
  if (amount === null || amount === undefined) return 'Sin precio'
  return `${currency || 'PEN'} ${Number(amount).toFixed(2)}`
}

function planFormFromPlan(plan: MembershipPlan): PlanFormState {
  return {
    name: plan.name,
    description: plan.description || '',
    classes_included: String(plan.classes_included),
    duration_days: plan.duration_days ? String(plan.duration_days) : '',
    base_price: plan.base_price !== null ? String(plan.base_price) : '',
    currency: plan.currency || 'PEN',
    is_active: plan.is_active,
  }
}

export default function AdminMembershipsPage() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const { data: plans = [], isLoading: plansLoading, error: plansError, refetch: refetchPlans } = useMembershipPlans()
  const {
    data: recentMemberships = [],
    isLoading: membershipsLoading,
    error: membershipsError,
    refetch: refetchRecentMemberships,
  } = useRecentStudentMemberships()
  const { data: students = [], isLoading: studentsLoading, error: studentsError, refetch: refetchStudents } = useStudents()

  const [showPlanForm, setShowPlanForm] = useState(false)
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null)
  const [planForm, setPlanForm] = useState<PlanFormState>(emptyPlanForm)
  const [planSaving, setPlanSaving] = useState(false)

  const [assignmentForm, setAssignmentForm] = useState<AssignmentFormState>(emptyAssignmentForm)
  const [assignmentSaving, setAssignmentSaving] = useState(false)

  const activeStudents = useMemo(
    () => students.filter((student) => student.is_active),
    [students]
  )

  const activePlans = useMemo(
    () => plans.filter((plan) => plan.is_active),
    [plans]
  )

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.id === assignmentForm.membership_plan_id) || null,
    [assignmentForm.membership_plan_id, plans]
  )

  const selectedStudent = useMemo(
    () => activeStudents.find((student) => student.id === assignmentForm.student_id) || null,
    [activeStudents, assignmentForm.student_id]
  )

  const basePrice = selectedPlan?.base_price ?? null
  const discountValueNumber = assignmentForm.discount_value.trim() ? Number(assignmentForm.discount_value) : 0
  const normalizedDiscountValue = Number.isFinite(discountValueNumber) ? discountValueNumber : 0

  const computedDiscountAmount = useMemo(() => {
    if (basePrice === null || normalizedDiscountValue <= 0) return 0
    if (assignmentForm.discount_type === 'percentage') {
      return Math.min(basePrice, (basePrice * normalizedDiscountValue) / 100)
    }
    if (assignmentForm.discount_type === 'amount') {
      return Math.min(basePrice, normalizedDiscountValue)
    }
    return 0
  }, [assignmentForm.discount_type, basePrice, normalizedDiscountValue])

  const finalAmount = useMemo(() => {
    if (basePrice === null) return null
    return Math.max(0, basePrice - computedDiscountAmount)
  }, [basePrice, computedDiscountAmount])

  const prevFinalAmountRef = useRef<number | null>(null)

  useEffect(() => {
    if (finalAmount !== null) {
      if (
        assignmentForm.payment_amount === '' ||
        assignmentForm.payment_amount === String(prevFinalAmountRef.current)
      ) {
        setAssignmentForm((current) => ({
          ...current,
          payment_amount: finalAmount.toString(),
        }))
      }
    }
    prevFinalAmountRef.current = finalAmount
  }, [finalAmount, assignmentForm.payment_amount])

  function resetPlanForm() {
    setPlanForm(emptyPlanForm())
    setEditingPlanId(null)
    setShowPlanForm(false)
  }

  function resetAssignmentForm() {
    setAssignmentForm(emptyAssignmentForm())
  }

  async function refreshAll() {
    await Promise.all([refetchPlans(), refetchRecentMemberships(), refetchStudents()])
  }

  async function savePlan() {
    if (!planForm.name.trim()) {
      toast.push({ message: 'El nombre del plan es obligatorio.', type: 'error' })
      return
    }

    if (!planForm.classes_included.trim() || Number(planForm.classes_included) < 0) {
      toast.push({ message: 'Define una cantidad valida de clases.', type: 'error' })
      return
    }

    setPlanSaving(true)

    try {
      const payload = {
        name: planForm.name.trim(),
        description: planForm.description.trim() || null,
        classes_included: Number(planForm.classes_included),
        duration_days: planForm.duration_days.trim() ? Number(planForm.duration_days) : null,
        base_price: planForm.base_price.trim() ? Number(planForm.base_price) : null,
        currency: planForm.currency.trim() || 'PEN',
        is_active: planForm.is_active,
      }

      const query = editingPlanId
        ? supabase.from('membership_plans').update(payload).eq('id', editingPlanId)
        : supabase.from('membership_plans').insert(payload)

      const { error } = await query
      if (error) throw error

      toast.push({
        message: editingPlanId ? 'Plan actualizado.' : 'Plan creado correctamente.',
        type: 'success',
      })

      resetPlanForm()
      await refetchPlans()
    } catch (error: any) {
      toast.push({ message: error.message || 'No se pudo guardar el plan.', type: 'error' })
    } finally {
      setPlanSaving(false)
    }
  }

  async function removePlan(plan: MembershipPlan) {
    if (!(await confirm(`Se eliminara el plan ${plan.name}. Continuar?`))) return

    try {
      const { error } = await supabase.from('membership_plans').delete().eq('id', plan.id)
      if (error) throw error
      toast.push({ message: 'Plan eliminado.', type: 'success' })
      await refetchPlans()
    } catch (error: any) {
      toast.push({ message: error.message || 'No se pudo eliminar el plan.', type: 'error' })
    }
  }

  async function assignMembership() {
    if (!assignmentForm.student_id || !assignmentForm.membership_plan_id) {
      toast.push({ message: 'Selecciona alumno y plan.', type: 'error' })
      return
    }

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
              : `${selectedPlan?.currency || 'PEN'} ${normalizedDiscountValue.toFixed(2)}`
            }. Precio final: ${selectedPlan?.currency || 'PEN'} ${finalAmount.toFixed(2)}.`
            : null,
        ].filter(Boolean).join(' | ') || null,
      })

      if (error) throw error

      toast.push({
        message: 'Membresia asignada correctamente.',
        type: 'success',
      })

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: studentKeys.all }),
        queryClient.invalidateQueries({ queryKey: studentKeys.detail(assignmentForm.student_id) }),
      ])

      resetAssignmentForm()
      await Promise.all([refetchRecentMemberships(), refetchStudents()])
    } catch (error: any) {
      toast.push({ message: error.message || 'No se pudo asignar la membresia.', type: 'error' })
    } finally {
      setAssignmentSaving(false)
    }
  }

  return (
    <AdminGuard>
      <div className="space-y-6">
        <section className="rounded-3xl border border-white/10 bg-card p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-accent">Comercial</p>
              <h1 className="mt-2 text-3xl font-bold text-textpri">Membresias</h1>
              <p className="mt-2 text-sm text-textsec">
                Gestiona planes V2 y vende o renueva membresias reales para cada alumno.
              </p>
            </div>

            <button className="btn-outline inline-flex items-center justify-center gap-2" onClick={refreshAll}>
              <RefreshCw className="h-4 w-4" />
              Actualizar
            </button>
          </div>
        </section>

        {(plansError || membershipsError || studentsError) && (
          <div className="rounded-2xl border border-danger/20 bg-danger/10 p-4 text-sm text-danger">
            {String(plansError || membershipsError || studentsError)}
          </div>
        )}

        <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-6">
            <div className="rounded-3xl border border-white/10 bg-card p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm uppercase tracking-[0.18em] text-accent">Planes</p>
                  <h2 className="mt-2 text-xl font-semibold text-textpri">Catalogo de planes</h2>
                </div>
                {!showPlanForm && (
                  <button className="btn" onClick={() => setShowPlanForm(true)}>
                    Nuevo plan
                  </button>
                )}
              </div>

              {showPlanForm && (
                <div className="mt-5 grid gap-4 rounded-2xl border border-white/10 bg-bg/40 p-4">
                  <div className="grid gap-2">
                    <label className="text-sm text-textsec">Nombre</label>
                    <input
                      className="input"
                      value={planForm.name}
                      onChange={(event) => setPlanForm((current) => ({ ...current, name: event.target.value }))}
                    />
                  </div>
                  <div className="grid gap-2">
                    <label className="text-sm text-textsec">Descripcion</label>
                    <textarea
                      className="input min-h-24 resize-y"
                      value={planForm.description}
                      onChange={(event) => setPlanForm((current) => ({ ...current, description: event.target.value }))}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="grid gap-2">
                      <label className="text-sm text-textsec">Clases</label>
                      <input
                        type="number"
                        min={0}
                        className="input"
                        value={planForm.classes_included}
                        onChange={(event) => setPlanForm((current) => ({ ...current, classes_included: event.target.value }))}
                      />
                    </div>
                    <div className="grid gap-2">
                      <label className="text-sm text-textsec">Duracion (dias)</label>
                      <input
                        type="number"
                        min={1}
                        className="input"
                        value={planForm.duration_days}
                        onChange={(event) => setPlanForm((current) => ({ ...current, duration_days: event.target.value }))}
                      />
                    </div>
                    <div className="grid gap-2">
                      <label className="text-sm text-textsec">Precio base</label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className="input"
                        value={planForm.base_price}
                        onChange={(event) => setPlanForm((current) => ({ ...current, base_price: event.target.value }))}
                      />
                    </div>
                    <div className="grid gap-2">
                      <label className="text-sm text-textsec">Moneda</label>
                      <input
                        className="input"
                        value={planForm.currency}
                        onChange={(event) => setPlanForm((current) => ({ ...current, currency: event.target.value.toUpperCase() }))}
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-3 text-sm text-textpri">
                    <input
                      type="checkbox"
                      checked={planForm.is_active}
                      onChange={(event) => setPlanForm((current) => ({ ...current, is_active: event.target.checked }))}
                    />
                    Plan activo
                  </label>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <button className="btn" onClick={savePlan} disabled={planSaving}>
                      {planSaving ? 'Guardando...' : editingPlanId ? 'Guardar cambios' : 'Crear plan'}
                    </button>
                    <button className="btn-outline" onClick={resetPlanForm}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {plansLoading ? (
                  <div className="rounded-2xl border border-white/10 bg-bg/30 p-6 text-center text-textsec">
                    <Spinner />
                  </div>
                ) : plans.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-bg/30 p-6 text-center text-textsec">
                    No hay planes cargados.
                  </div>
                ) : (
                  plans.map((plan) => (
                    <div key={plan.id} className="rounded-2xl border border-white/10 bg-bg/30 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-lg font-semibold text-textpri">{plan.name}</p>
                          <p className="mt-1 text-sm text-textsec">
                            {plan.classes_included} clases
                            {plan.duration_days ? ` · ${plan.duration_days} dias` : ' · sin vencimiento'}
                          </p>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs ${plan.is_active ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'}`}>
                          {plan.is_active ? 'Activo' : 'Inactivo'}
                        </span>
                      </div>
                      {plan.description && (
                        <p className="mt-3 text-sm text-textsec">{plan.description}</p>
                      )}
                      <div className="mt-4 flex items-center justify-between gap-3">
                        <div className="text-sm font-medium text-textpri">
                          {formatMoney(plan.base_price, plan.currency)}
                        </div>
                        <div className="flex gap-2">
                          <button
                            className="btn-outline px-3 py-2 text-sm"
                            onClick={() => {
                              setEditingPlanId(plan.id)
                              setPlanForm(planFormFromPlan(plan))
                              setShowPlanForm(true)
                            }}
                          >
                            Editar
                          </button>
                          <button
                            className="btn-outline px-3 py-2 text-sm text-danger"
                            onClick={() => removePlan(plan)}
                          >
                            Eliminar
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-card p-5">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-accent/12 p-3 text-accent">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-textpri">Venta o renovacion</h2>
                  <p className="mt-1 text-sm text-textsec">
                    Activa un plan para un alumno. Si ya tiene una membresia activa, las clases nuevas se acumulan sobre el saldo actual.
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-4">
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="grid gap-2">
                    <label className="text-sm text-textsec">Alumno</label>
                    <select
                      className="input"
                      value={assignmentForm.student_id}
                      onChange={(event) => setAssignmentForm((current) => ({ ...current, student_id: event.target.value }))}
                      disabled={studentsLoading}
                    >
                      <option value="">Selecciona un alumno</option>
                      {activeStudents.map((student) => (
                        <option key={student.id} value={student.id}>
                          {student.full_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-2">
                    <label className="text-sm text-textsec">Plan</label>
                    <select
                      className="input"
                      value={assignmentForm.membership_plan_id}
                      onChange={(event) => setAssignmentForm((current) => ({ ...current, membership_plan_id: event.target.value }))}
                    >
                      <option value="">Selecciona un plan</option>
                      {activePlans.map((plan) => (
                        <option key={plan.id} value={plan.id}>
                          {plan.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {(selectedStudent || selectedPlan) && (
                  <div className="grid gap-4 rounded-2xl border border-white/10 bg-bg/40 p-4 lg:grid-cols-2">
                    <div>
                      <p className="text-xs uppercase tracking-[0.14em] text-textsec">Alumno</p>
                      {selectedStudent ? (
                        <div className="mt-3 flex items-center gap-3">
                          <Avatar
                            name={selectedStudent.full_name}
                            url={selectedStudent.avatar_url}
                            size="md"
                          />
                          <div>
                            <p className="font-medium text-textpri">{selectedStudent.full_name}</p>
                            <p className="text-sm text-textsec">
                              {selectedStudent.membership_name || 'Sin membresia activa'} · {selectedStudent.classes_remaining} clases
                            </p>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-3 text-sm text-textsec">Selecciona un alumno.</p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.14em] text-textsec">Plan seleccionado</p>
                      {selectedPlan ? (
                        <div className="mt-3">
                          <p className="font-medium text-textpri">{selectedPlan.name}</p>
                          <p className="text-sm text-textsec">
                            {selectedPlan.classes_included} clases · {selectedPlan.duration_days ? `${selectedPlan.duration_days} dias` : 'sin vencimiento'}
                          </p>
                          <p className="mt-2 text-sm font-medium text-textpri">
                            {formatMoney(selectedPlan.base_price, selectedPlan.currency)}
                          </p>
                        </div>
                      ) : (
                        <p className="mt-3 text-sm text-textsec">Selecciona un plan.</p>
                      )}
                    </div>
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                  <div className="grid min-w-0 gap-2">
                    <label className="text-sm text-textsec">Inicio</label>
                    <input
                      type="date"
                      className="input min-w-0"
                      value={assignmentForm.start_date}
                      onChange={(event) => setAssignmentForm((current) => ({ ...current, start_date: event.target.value }))}
                    />
                  </div>
                  <div className="grid min-w-0 gap-2">
                    <label className="text-sm text-textsec">Descuento</label>
                    <select
                      className="input min-w-0"
                      value={assignmentForm.discount_type}
                      onChange={(event) =>
                        setAssignmentForm((current) => ({
                          ...current,
                          discount_type: event.target.value as AssignmentFormState['discount_type'],
                          discount_value: event.target.value === 'none' ? '' : current.discount_value,
                        }))
                      }
                    >
                      <option value="none">Sin descuento</option>
                      <option value="amount">Monto</option>
                      <option value="percentage">Porcentaje</option>
                    </select>
                  </div>
                  <div className="grid min-w-0 gap-2">
                    <label className="text-sm text-textsec">Valor descuento</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      className="input min-w-0"
                      value={assignmentForm.discount_value}
                      onChange={(event) => setAssignmentForm((current) => ({ ...current, discount_value: event.target.value }))}
                      disabled={assignmentForm.discount_type === 'none'}
                    />
                  </div>
                  <div className="grid min-w-0 gap-2">
                    <label className="text-sm text-textsec">Pago inicial</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      className="input min-w-0"
                      value={assignmentForm.payment_amount}
                      onChange={(event) => setAssignmentForm((current) => ({ ...current, payment_amount: event.target.value }))}
                    />
                  </div>
                  <div className="grid min-w-0 gap-2">
                    <label className="text-sm text-textsec">Moneda</label>
                    <input
                      className="input min-w-0"
                      value={selectedPlan?.currency || 'PEN'}
                      disabled
                    />
                  </div>
                </div>

                <div className="grid gap-4 rounded-2xl border border-white/10 bg-bg/40 p-4 sm:grid-cols-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.14em] text-textsec">Precio base</p>
                    <p className="mt-2 text-lg font-semibold text-textpri">
                      {formatMoney(basePrice, selectedPlan?.currency)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.14em] text-textsec">Descuento aplicado</p>
                    <p className="mt-2 text-lg font-semibold text-textpri">
                      {selectedPlan
                        ? formatMoney(computedDiscountAmount, selectedPlan.currency)
                        : 'Sin plan'}
                    </p>
                    {assignmentForm.discount_type === 'percentage' && assignmentForm.discount_value.trim() && (
                      <p className="mt-1 text-xs text-textsec">{assignmentForm.discount_value}% sobre el precio base</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.14em] text-textsec">Precio final</p>
                    <p className="mt-2 text-xl font-bold text-accent">
                      {formatMoney(finalAmount, selectedPlan?.currency)}
                    </p>
                  </div>
                </div>

                <div className="grid gap-2">
                  <label className="text-sm text-textsec">Notas internas</label>
                  <textarea
                    className="input min-h-24 resize-y"
                    value={assignmentForm.notes}
                    onChange={(event) => setAssignmentForm((current) => ({ ...current, notes: event.target.value }))}
                  />
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <button className="btn inline-flex items-center justify-center gap-2" onClick={assignMembership} disabled={assignmentSaving}>
                    <CreditCard className="h-4 w-4" />
                    {assignmentSaving ? 'Procesando...' : 'Activar membresia'}
                  </button>
                  <button className="btn-outline" onClick={resetAssignmentForm}>
                    Limpiar
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl border border-white/10 bg-card p-5">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-accent/12 p-3 text-accent">
                  <Wallet className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-textpri">Ultimas membresias activadas</h2>
                  <p className="mt-1 text-sm text-textsec">
                    Vista rapida de ventas y renovaciones recientes sobre el modelo V2.
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {membershipsLoading ? (
                  <div className="rounded-2xl border border-white/10 bg-bg/30 p-6 text-center text-textsec">
                    <Spinner />
                  </div>
                ) : recentMemberships.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-bg/30 p-6 text-center text-textsec">
                    Aun no hay membresias V2 registradas.
                  </div>
                ) : (
                  recentMemberships.map((membership) => (
                    <div key={membership.id} className="rounded-2xl border border-white/10 bg-bg/30 p-4">
                      <div className="flex items-start gap-3">
                        <Avatar
                          name={membership.student?.full_name || 'Alumno'}
                          url={membership.student?.avatar_url || null}
                          size="md"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-medium text-textpri">
                              {membership.student?.full_name || 'Alumno eliminado'}
                            </p>
                            <span className={`rounded-full px-3 py-1 text-xs ${membership.status === 'active'
                              ? 'bg-success/15 text-success'
                              : 'bg-slate-200 text-textsec'
                              }`}>
                              {membership.status}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-textpri">{membership.custom_name}</p>
                          <p className="mt-1 text-sm text-textsec">
                            {membership.classes_remaining}/{membership.classes_total} clases disponibles
                          </p>
                          <p className="mt-1 text-sm text-textsec">
                            Inicio {membership.start_date}
                            {membership.end_date ? ` · vence ${membership.end_date}` : ' · sin vencimiento'}
                          </p>
                          <p className="mt-2 text-sm font-medium text-textpri">
                            {formatMoney(membership.total_amount, membership.currency)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </AdminGuard>
  )
}
