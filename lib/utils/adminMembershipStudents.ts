type MembershipSaleSelectableStudent = {
  is_active: boolean
  operational_status: string | null
}

const RENEWABLE_INACTIVE_STATUSES = new Set(['expired', 'paused'])
const PROTECTED_OPERATIONAL_STATUSES = new Set(['retired', 'withdrawn', 'blocked', 'suspended'])

export function isStudentSelectableForMembershipSale(student: MembershipSaleSelectableStudent) {
  const operationalStatus = student.operational_status || null

  if (operationalStatus && PROTECTED_OPERATIONAL_STATUSES.has(operationalStatus)) {
    return false
  }

  if (student.is_active) {
    return true
  }

  return operationalStatus !== null && RENEWABLE_INACTIVE_STATUSES.has(operationalStatus)
}
