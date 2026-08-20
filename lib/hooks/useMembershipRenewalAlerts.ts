'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import {
  getMembershipRenewalAlerts,
  membershipRenewalAlertKeys,
} from '@/lib/services/membershipRenewalAlertService'

export { membershipRenewalAlertKeys }
export type {
  MembershipRenewalAlert,
  MembershipRenewalAlertMap,
} from '@/lib/services/membershipRenewalAlertService'

export function useMembershipRenewalAlerts(studentIds: readonly string[]) {
  const canonicalStudentIds = [...new Set(studentIds)].sort()

  return useQuery({
    queryKey: membershipRenewalAlertKeys.list(canonicalStudentIds),
    queryFn: () => getMembershipRenewalAlerts(supabase, canonicalStudentIds),
    enabled: canonicalStudentIds.length > 0,
  })
}
