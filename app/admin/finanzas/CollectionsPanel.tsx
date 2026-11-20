'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { paymentMethodLabel, formatAdminMoney } from '@/lib/utils/adminPresentation'
import { getLimaDateKey } from '@/lib/utils/membershipCycles'
import { Modal } from '@/components/ui/Modal'

type Movement = {
  payment_id: string; payment_kind: 'membership' | 'intro'; student_name: string; concept: string;
  paid_at: string; payment_method: string; amount: number; adjustment_id: string | null;
  kind: 'collection' | 'adjustment' | 'refund'; reason: string | null;
}
const methods = [['cash', 'Efectivo'], ['yape', 'Yape'], ['plin', 'Plin'], ['transfer', 'Transferencia'], ['card', 'Tarjeta']] as const
const dateLabel = (value: string) => new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeZone: 'America/Lima' }).format(new Date(value))

export default function CollectionsPanel() {
  const today = getLimaDateKey()
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`)
  const [until, setUntil] = useState(today)
  const [method, setMethod] = useState('')
  const [movements, setMovements] = useState<Movement[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [ledgerAvailable, setLedgerAvailable] = useState(true)
  const [selected, setSelected] = useState<Movement | null>(null)
  const [kind, setKind] = useState<'adjustment' | 'refund'>('adjustment')
  const [amount, setAmount] = useState('')
  const [refundMethod, setRefundMethod] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const lock = useRef(false)
  const requestId = useRef('')
  const generation = useRef(0)

  const load = useCallback(async () => {
    const request = ++generation.current
    setLoading(true); setError('')
    if (!from || !until || from > until) { setError('Revisa el rango de fechas.'); setLoading(false); return }
    const end = new Date(`${until}T12:00:00Z`); end.setUTCDate(end.getUTCDate() + 1)
    const endDate = end.toISOString().slice(0, 10)
    const all: Movement[] = []
    for (let offset = 0; ; offset += 500) {
      const { data, error: failure } = await supabase.rpc('admin_finance_collections', { p_from: from, p_until: endDate }).range(offset, offset + 499)
      if (request !== generation.current) return
      if (failure?.code === 'PGRST202' && offset === 0) {
        const startTimestamp = `${from}T00:00:00-05:00`
        const endTimestamp = `${endDate}T00:00:00-05:00`
        const fallback: Movement[] = []
        for (const source of ['membership', 'intro'] as const) {
          for (let index = 0; ; index += 500) {
            const query = source === 'membership'
              ? supabase.from('student_membership_payments').select('id,paid_at,payment_method,amount,source,student:students(full_name),membership:student_memberships(custom_name)')
              : supabase.from('intro_payments').select('id,paid_at,payment_method,amount,client:intro_clients(full_name)')
            const result = await query.eq('payment_status', 'paid').gte('paid_at', startTimestamp).lt('paid_at', endTimestamp)
              .order('paid_at', { ascending: false }).order('id').range(index, index + 499)
            if (request !== generation.current) return
            if (result.error || !Array.isArray(result.data)) { setError(result.error?.message || 'No se pudieron cargar los cobros.'); setLoading(false); return }
            for (const raw of result.data) {
              const row = raw as unknown as { id: string; paid_at: string; payment_method: string; amount: number; source?: string; student?: { full_name: string } | { full_name: string }[] | null; membership?: { custom_name: string } | { custom_name: string }[] | null; client?: { full_name: string } | { full_name: string }[] | null }
              if (source === 'membership' && row.source === 'migration') continue
              const student = Array.isArray(row.student) ? row.student[0] : row.student
              const membership = Array.isArray(row.membership) ? row.membership[0] : row.membership
              const client = Array.isArray(row.client) ? row.client[0] : row.client
              fallback.push({ payment_id: row.id, payment_kind: source, student_name: (student || client)?.full_name || 'Sin nombre', concept: membership?.custom_name || 'Clase de prueba', paid_at: row.paid_at, payment_method: row.payment_method, amount: row.amount, adjustment_id: null, kind: 'collection', reason: null })
            }
            if (result.data.length < 500) break
          }
        }
        fallback.sort((a, b) => b.paid_at.localeCompare(a.paid_at))
        setLedgerAvailable(false); setMovements(fallback); setLoading(false); return
      }
      if (failure || !Array.isArray(data)) { setError(failure?.message || 'No se pudieron cargar los cobros.'); setLoading(false); return }
      all.push(...data as Movement[])
      if (data.length < 500) break
    }
    setLedgerAvailable(true); setMovements(all); setLoading(false)
  }, [from, until])
  useEffect(() => {
    const currentGeneration = generation
    void load()
    return () => { currentGeneration.current++ }
  }, [load])
  const filtered = useMemo(() => movements.filter(row => !method || row.payment_method === method ||
    (method === 'cash' && row.payment_method === 'efectivo') ||
    (method === 'transfer' && row.payment_method === 'transferencia') ||
    (method === 'card' && row.payment_method === 'tarjeta')), [movements, method])
  const collected = filtered.filter(row => row.kind === 'collection').reduce((sum, row) => sum + Number(row.amount), 0)
  const adjustments = filtered.filter(row => row.kind === 'adjustment').reduce((sum, row) => sum + Number(row.amount), 0)
  const refunds = -filtered.filter(row => row.kind === 'refund').reduce((sum, row) => sum + Number(row.amount), 0)

  function open(row: Movement, next: 'adjustment' | 'refund') {
    setSelected(row); setKind(next); setAmount(''); setReason(''); setRefundMethod(''); setError('')
    requestId.current = crypto.randomUUID()
  }
  async function save(event: FormEvent) {
    event.preventDefault()
    if (!selected || lock.current || !reason.trim()) return
    const number = Number(amount)
    if (kind === 'adjustment' && (!/^-?\d+(\.\d{1,2})?$/.test(amount) || !Number.isFinite(number) || number === 0)) {
      setError('Indica el ajuste con hasta dos decimales.'); return
    }
    lock.current = true; setSaving(true); setError('')
    const { error: failure } = await supabase.rpc('admin_finance_adjust_collection', {
      p_payment_id: selected.payment_id, p_payment_kind: selected.payment_kind, p_kind: kind,
      p_amount: kind === 'adjustment' ? number : null, p_method: kind === 'refund' ? refundMethod : null,
      p_reason: reason.trim(), p_request_id: requestId.current,
    })
    lock.current = false; setSaving(false)
    if (failure) { setError(failure.message); return }
    setSelected(null); await load()
  }
  return <div className="space-y-4">
    <div className="grid gap-3 rounded-xl border border-blue-100 bg-white p-4 sm:grid-cols-3">
      <label className="text-sm font-semibold">Desde<input type="date" className="input mt-1 w-full" value={from} onChange={e => setFrom(e.target.value)} /></label>
      <label className="text-sm font-semibold">Hasta<input type="date" className="input mt-1 w-full" value={until} onChange={e => setUntil(e.target.value)} /></label>
      <label className="text-sm font-semibold">Medio de pago<select className="input mt-1 w-full" value={method} onChange={e => setMethod(e.target.value)}><option value="">Todos</option>{methods.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
    </div>
    {error && !selected && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-rose-800">No se pudieron cargar los cobros. {error}</p>}
    {loading ? <p role="status">Cargando cobros…</p> : !error && <>
      {!ledgerAvailable && <p role="status" className="rounded-xl bg-blue-50 p-4 text-sm text-blue-900">Cobros consultados en la base actual. El registro de ajustes y devoluciones estará disponible al actualizar la base.</p>}
      <div className="grid gap-3 sm:grid-cols-4">{[['Cobrado', collected], ['Ajustes', adjustments], ['Devuelto', refunds], ['Resultado', collected + adjustments - refunds]].map(([label, value]) => <div key={label} className="rounded-xl border border-blue-100 bg-white p-4"><p className="text-sm text-slate-600">{label}</p><p className="mt-1 text-xl font-bold text-[#101e3e]">{ledgerAvailable || label === 'Cobrado' ? formatAdminMoney(Number(value)) : 'No disponible'}</p></div>)}</div>
      <div className="overflow-x-auto rounded-xl border border-blue-100 bg-white"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-blue-50 text-[#084681]"><tr>{['Fecha', 'Alumno y concepto', 'Movimiento', 'Medio', 'Importe', 'Acciones'].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{filtered.map(row => <tr key={row.adjustment_id || row.payment_id}><td className="p-3">{dateLabel(row.paid_at)}</td><td className="p-3">{row.student_name}<span className="block text-xs text-slate-600">{row.concept}</span></td><td className="p-3">{row.kind === 'collection' ? 'Cobro' : row.kind === 'refund' ? 'Devolución' : 'Ajuste'}{row.reason && <span className="block text-xs text-slate-600">{row.reason}</span>}</td><td className="p-3">{paymentMethodLabel(row.payment_method)}</td><td className="p-3 font-semibold">{formatAdminMoney(Number(row.amount))}</td><td className="p-3">{row.kind === 'collection' && ledgerAvailable && <div className="flex gap-2"><button type="button" className="min-h-11 text-blue-800 underline" onClick={() => open(row, 'adjustment')}>Corregir</button><button type="button" className="min-h-11 text-blue-800 underline" onClick={() => open(row, 'refund')}>Devolver</button></div>}</td></tr>)}</tbody></table>{filtered.length === 0 && <p className="p-5 text-sm text-slate-600">No hay movimientos en este periodo.</p>}</div>
    </>}
    {selected && <Modal isOpen title={kind === 'refund' ? 'Registrar devolución completa' : 'Corregir cobro'} onClose={() => { if (!saving) { setSelected(null); setError('') } }}>
      <form onSubmit={save} className="space-y-4"><p className="text-sm">{selected.student_name} · {selected.concept} · Cobro original {formatAdminMoney(Number(selected.amount))}</p>
        {kind === 'adjustment' ? <label className="block text-sm font-semibold">Ajuste en soles<input required type="number" step="0.01" className="input mt-1 w-full" value={amount} onChange={e => setAmount(e.target.value)} /><span className="mt-1 block text-xs font-normal text-slate-600">Para corregir S/100 a S/80, escribe -20.</span></label>
          : <label className="block text-sm font-semibold">Medio de devolución<select required className="input mt-1 w-full" value={refundMethod} onChange={e => setRefundMethod(e.target.value)}><option value="">Selecciona un medio</option>{methods.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>}
        <label className="block text-sm font-semibold">Motivo obligatorio<textarea required className="input mt-1 w-full" value={reason} onChange={e => setReason(e.target.value)} /></label>
        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
        <button type="submit" disabled={saving} className="min-h-11 rounded-xl bg-[#0758aa] px-4 font-bold text-white disabled:opacity-50">{saving ? 'Guardando…' : 'Registrar movimiento'}</button>
      </form>
    </Modal>}
  </div>
}
