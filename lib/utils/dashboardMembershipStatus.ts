export type DashboardMembershipBadge = {
  status: 'active' | 'expiring' | 'scheduled' | 'expired' | 'no_classes' | 'no_membership'
  label: string
}

type DashboardMembershipBadgeInput = {
  membershipStatus: string | null | undefined
  membershipEnd?: string | null
  now?: Date
}

function dateOnly(value: string | null | undefined) {
  if (!value) return null

  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return null

  return new Date(year, month - 1, day)
}

export function getDashboardMembershipBadge({
  membershipStatus,
  membershipEnd,
  now = new Date(),
}: DashboardMembershipBadgeInput): DashboardMembershipBadge {
  const canonicalStatus = membershipStatus?.toLowerCase()

  if (canonicalStatus === 'scheduled') return { status: 'scheduled', label: 'Programada' }
  if (canonicalStatus === 'expired' || canonicalStatus === 'historical') {
    return { status: 'expired', label: 'Vencida' }
  }
  if (canonicalStatus === 'no_classes') return { status: 'no_classes', label: 'Sin clases' }
  if (!canonicalStatus || canonicalStatus === 'no_membership') {
    return { status: 'no_membership', label: 'Sin membresía' }
  }

  if (canonicalStatus === 'active') {
    const endDate = dateOnly(membershipEnd)
    if (endDate) {
      const today = new Date(now)
      today.setHours(0, 0, 0, 0)
      const daysUntilExpiry = Math.round((endDate.getTime() - today.getTime()) / 86_400_000)

      if (daysUntilExpiry < 0) return { status: 'expired', label: 'Vencida' }
      if (daysUntilExpiry <= 7) return { status: 'expiring', label: 'Próxima a vencer' }
    }

    return { status: 'active', label: 'Activa' }
  }

  return { status: 'no_membership', label: 'Sin membresía' }
}
