import { supabase } from '@/lib/supabaseClient'
import { getLimaDateKey } from '@/lib/utils/membershipCycles'

export type PendingMembershipPayment = {
  id: string
  student_id: string
  amount: number
  currency: string
  due_date: string | null
  created_at: string
  payment_status: string
  student: { full_name: string } | null
  membership: { custom_name: string; purchase?: { purchased_at: string } | null } | null
}

export const collectionMethods = [
  ['cash', 'Efectivo'], ['yape', 'Yape'], ['plin', 'Plin'],
  ['transfer', 'Transferencia'], ['card', 'Tarjeta'],
] as const

export async function getPendingMembershipPayments(studentId?: string): Promise<PendingMembershipPayment[]> {
  const rows: PendingMembershipPayment[] = []
  for (let offset = 0; ; offset += 500) {
    let query = supabase.from('student_membership_payments')
      .select('id,student_id,amount,currency,due_date,created_at,payment_status,student:students(full_name),membership:student_memberships(custom_name,purchase:membership_purchases(purchased_at))')
      .in('payment_status', ['pending', 'late']).neq('source', 'migration')
      .order('due_date', { ascending: true, nullsFirst: false }).order('id', { ascending: true })
    if (studentId) query = query.eq('student_id', studentId)
    const { data, error } = await query.range(offset, offset + 499)
    if (error) throw error
    rows.push(...(data || []) as unknown as PendingMembershipPayment[])
    if ((data || []).length < 500) return rows
  }
}

export async function collectMembershipPayment(input: {
  paymentId: string; studentId: string; expectedAmount: number; amount: string; method: string; date: string
}) {
  const amount = Number(input.amount)
  if (!/^\d+(\.\d{1,2})?$/.test(input.amount) || !Number.isFinite(amount) || amount <= 0 || amount > 99999999.99) {
    throw new Error('Indica el importe recibido, mayor que cero y con hasta dos decimales.')
  }
  if (!collectionMethods.some(([value]) => value === input.method)) throw new Error('Selecciona el método de pago recibido.')
  if (!Number.isFinite(input.expectedAmount) || input.expectedAmount < 0) throw new Error('Actualiza el pago antes de registrar el cobro.')
  if (input.expectedAmount > 0 && Math.round(amount * 100) !== Math.round(input.expectedAmount * 100)) throw new Error('Para cerrar este pago debes registrar el importe completo pendiente.')
  const parsed = new Date(`${input.date}T12:00:00-05:00`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !Number.isFinite(parsed.getTime()) || getLimaDateKey(parsed) !== input.date || input.date > getLimaDateKey()) {
    throw new Error('Indica una fecha de cobro válida que no sea futura.')
  }
  if (!input.paymentId || !input.studentId) throw new Error('El pago no está disponible.')
  const { data: actor, error: authError } = await supabase.auth.getUser()
  if (authError) throw authError
  if (!actor.user) throw new Error('Tu sesión venció. Vuelve a ingresar.')
  // RLS permits admin writes only. The status predicate makes concurrent confirmations mutually exclusive.
  const { data, error } = await supabase.from('student_membership_payments').update({
    amount, payment_method: input.method, payment_status: 'paid',
    paid_at: `${input.date}T12:00:00-05:00`, recorded_by_profile_id: actor.user.id,
  }).eq('id', input.paymentId).eq('student_id', input.studentId).eq('amount', input.expectedAmount)
    .in('payment_status', ['pending', 'late']).neq('source', 'migration').select('id').maybeSingle()
  if (error) throw error
  if (!data) throw new Error('No se actualizó el pago. Puede haber sido procesado por otro administrador o no tienes permiso. Actualiza la lista.')
}
