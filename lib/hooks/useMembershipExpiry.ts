import { useMemo } from 'react'
import dayjs from 'dayjs'

type MembershipCarrier = {
  membership_end?: string | null
}

export function useMembershipExpiry(record: MembershipCarrier | null) {
  const expiryData = useMemo(() => {
    if (!record?.membership_end) {
      return {
        daysUntilExpiry: null,
        isExpired: false,
        isExpiringSoon: false,
      }
    }

    const now = dayjs().startOf('day')
    const expiryDate = dayjs(record.membership_end)
    const daysUntilExpiry = expiryDate.diff(now, 'day')

    const isExpired = daysUntilExpiry <= 0
    const isExpiringSoon = daysUntilExpiry > 0 && daysUntilExpiry <= 7

    return { daysUntilExpiry, isExpired, isExpiringSoon }
  }, [record])

  return expiryData
}
