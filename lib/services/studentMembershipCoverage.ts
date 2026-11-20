import { supabase } from '@/lib/supabaseClient'
import { MEMBERSHIP_COVERAGE_STATUSES } from '@/lib/utils/membershipCycles'

export async function fetchStudentMembershipCoverageEnd(studentId: string): Promise<string | null> {
  const { data, error } = await supabase.from('student_memberships')
    .select('end_date')
    .eq('student_id', studentId)
    .in('status', MEMBERSHIP_COVERAGE_STATUSES)
    .order('end_date', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data?.end_date ?? null
}

export async function fetchStudentNextMembership(studentId: string, today: string) {
  const { data, error } = await supabase.from('student_memberships')
    .select('custom_name, start_date, end_date')
    .eq('student_id', studentId)
    .eq('status', 'active')
    .gt('start_date', today)
    .order('start_date')
    .order('created_at')
    .order('id')
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data as { custom_name: string | null; start_date: string; end_date: string | null } | null
}

export async function fetchStudentMembershipBalance(studentId: string, today: string) {
  const { data, error } = await supabase.from('student_memberships')
    .select(`
      start_date, classes_remaining,
      membership_recovery_credits!membership_recovery_credits_student_membership_id_fkey(id, classes_remaining),
      bookings!bookings_active_membership_id_fkey(
        status, credit_kind, recovery_credit_id,
        booking_cancellations(review_status)
      )
    `)
    .eq('student_id', studentId)
    .eq('status', 'active')
    .or(`end_date.is.null,end_date.gte.${today}`)
    .in('bookings.status', ['reserved', 'cancelled'])
  if (error) throw error

  let current = 0
  let scheduled = 0
  for (const plan of data ?? []) {
    let reservedNormal = 0
    const reservedRecovery = new Map<string, number>()
    for (const booking of plan.bookings) {
      const reviews = booking.booking_cancellations as { review_status: string } | { review_status: string }[] | null
      const pending = Array.isArray(reviews)
        ? reviews.some(review => review.review_status === 'pending')
        : reviews?.review_status === 'pending'
      if (booking.status !== 'reserved' && !pending) continue
      if (booking.credit_kind === 'recovery') {
        const id = booking.recovery_credit_id
        if (id) reservedRecovery.set(id, (reservedRecovery.get(id) ?? 0) + 1)
      } else {
        reservedNormal++
      }
    }
    const normal = Math.max(0, (plan.classes_remaining ?? 0) - reservedNormal)
    const recovery = plan.membership_recovery_credits.reduce(
      (sum, credit) => sum + Math.max(0, (credit.classes_remaining ?? 0) - (reservedRecovery.get(credit.id) ?? 0)), 0,
    )
    if (plan.start_date > today) scheduled += normal + recovery
    else current += normal + recovery
  }
  return { current, scheduled, total: current + scheduled }
}
