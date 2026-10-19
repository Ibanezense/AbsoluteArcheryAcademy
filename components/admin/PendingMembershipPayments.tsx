'use client'

import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { collectionMethods, collectMembershipPayment, getPendingMembershipPayments, type PendingMembershipPayment } from '@/lib/services/adminPaymentService'
import { getLimaDateKey } from '@/lib/utils/membershipCycles'
import { studentKeys } from '@/lib/queries/studentQueries'
import { formatAdminDate } from '@/lib/utils/adminPresentation'

const money = (amount: number, currency: string) => new Intl.NumberFormat('es-PE', { style: 'currency', currency }).format(amount)

export function PendingMembershipPayments({ studentId, onCollected }: { studentId?: string; onCollected?: () => void }) {
  const queryClient = useQueryClient()
  const pending = useQuery({ queryKey: ['admin-pending-payments', studentId || 'all'], queryFn: () => getPendingMembershipPayments(studentId) })
  const [selected, setSelected] = useState<PendingMembershipPayment | null>(null)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('')
  const [date, setDate] = useState(getLimaDateKey())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [limit, setLimit] = useState(25)
  const locked = useRef(false)
  const amountInput = useRef<HTMLInputElement>(null)
  const trigger = useRef('')
  const sectionRef = useRef<HTMLElement>(null)
  useEffect(() => { if (selected) amountInput.current?.focus() }, [selected])

  function close() {
    if (locked.current) return
    setSelected(null)
    requestAnimationFrame(() => document.getElementById(trigger.current)?.focus())
  }

  async function collect(event: React.FormEvent) {
    event.preventDefault()
    if (!selected || locked.current) return
    locked.current = true
    setSaving(true)
    setError('')
    try {
      await collectMembershipPayment({ paymentId: selected.id, studentId: selected.student_id, expectedAmount: Number(selected.amount), amount, method, date })
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No pudimos registrar el cobro. Revisa el estado antes de reintentar.')
      locked.current = false
      setSaving(false)
      return
    }
    locked.current = false
    setSaving(false)
    setSelected(null)
    setSuccess('Cobro registrado. El pago está pagado.')
    sectionRef.current?.focus()
    // A refresh failure must never invite the administrator to submit an already saved collection again.
    await Promise.allSettled([
      queryClient.invalidateQueries({ queryKey: ['admin-pending-payments'] }),
      queryClient.invalidateQueries({ queryKey: studentKeys.all }),
      queryClient.invalidateQueries({ queryKey: ['admin-dashboard-operational'] }),
    ])
    onCollected?.()
  }

  return <section ref={sectionRef} tabIndex={-1} className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 sm:p-5" aria-label="Pagos pendientes de membresías">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-lg font-semibold text-slate-950">Pagos pendientes de membresías</h2><p className="mt-1 text-sm text-slate-500">Todos los pendientes y atrasados, aunque no tengan vencimiento. Registra únicamente un cobro recibido. Los movimientos históricos importados se consultan en la ficha del alumno.</p></div>
      <button type="button" disabled={saving || pending.isFetching} onClick={() => void pending.refetch()} className="min-h-11 rounded-lg border border-slate-200 px-3 text-sm font-semibold">Actualizar pendientes</button>
    </div>
    {success && <p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{success}</p>}
    {pending.isLoading ? <p role="status" className="mt-4 text-sm">Cargando pagos pendientes…</p> : pending.isError ? <p role="alert" className="mt-4 text-sm text-rose-700">No pudimos cargar los pendientes. Usa Actualizar pendientes para reintentar.</p> : <>
      <p className="mt-4 text-sm text-slate-500">{pending.data?.length || 0} pagos pendientes</p>
      <div className="mt-3 grid min-w-0 grid-cols-1 gap-3">
        {(pending.data || []).slice(0, limit).map(payment => <article key={payment.id} className="min-w-0 rounded-lg border border-slate-200 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="break-words font-semibold text-slate-950">{payment.student?.full_name || 'Alumno'}</p><p className="text-sm text-slate-600">{payment.membership?.custom_name || 'Membresía'}</p><p className="mt-1 text-xs text-slate-500">{payment.due_date ? `Vencimiento: ${payment.due_date.split('-').reverse().join('/')}` : 'Sin fecha de vencimiento'}</p></div><p className="text-sm font-semibold">{Number(payment.amount) > 0 ? money(Number(payment.amount), payment.currency) : 'Importe por confirmar'}</p></div>
          {selected?.id !== payment.id ? <button id={`collect-${payment.id}`} type="button" disabled={saving} onClick={event => { trigger.current = event.currentTarget.id; setSelected(payment); setAmount(Number(payment.amount) > 0 ? String(payment.amount) : ''); setMethod(''); setDate(getLimaDateKey()); setError(''); setSuccess('') }} className="mt-3 min-h-11 rounded-lg bg-accent px-4 text-sm font-semibold text-white">Registrar cobro</button> : <form onSubmit={collect} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); close() } }} className="mt-4 border-t border-slate-200 pt-4">
            <fieldset disabled={saving} className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="grid min-w-0 gap-1 text-sm font-medium">Importe recibido ({payment.currency})<input ref={amountInput} required readOnly={Number(payment.amount) > 0} type="number" min="0.01" max="99999999.99" step="0.01" inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} className="input" /></label>
              <label className="grid min-w-0 gap-1 text-sm font-medium">Método de pago<select required value={method} onChange={event => setMethod(event.target.value)} className="input"><option value="">Seleccionar método</option>{collectionMethods.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="grid min-w-0 gap-1 text-sm font-medium">Fecha de cobro<input required type="date" max={getLimaDateKey()} value={date} onChange={event => setDate(event.target.value)} className="input" /></label>
            </fieldset>
            <p className="mt-3 text-sm text-slate-600">Al confirmar, este registro se marcará como pagado. El ingreso corresponde a la venta del {formatAdminDate(payment.membership?.purchase?.purchased_at || payment.created_at)}; la fecha de cobro se conserva por separado. Las clases y las fechas de la membresía se conservan.</p>
            {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
            <div className="mt-3 flex flex-wrap gap-2"><button disabled={saving} type="submit" className="min-h-11 rounded-lg bg-accent px-4 text-sm font-semibold text-white">{saving ? 'Registrando…' : 'Confirmar cobro'}</button><button disabled={saving} type="button" onClick={close} className="min-h-11 rounded-lg border border-slate-200 px-4 text-sm font-semibold">Cancelar</button></div>
          </form>}
        </article>)}
      </div>
      {(pending.data?.length || 0) > limit && <button className="mt-3 min-h-11 rounded-lg border px-4 text-sm font-semibold" type="button" onClick={() => setLimit(current => current + 25)}>Ver más pendientes</button>}
    </>}
  </section>
}
