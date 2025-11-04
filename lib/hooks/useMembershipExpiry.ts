import { useMemo } from 'react'
import dayjs from 'dayjs'
import type { Profile } from './useProfile'

export function useMembershipExpiry(profile: Profile | null) {
  const expiryData = useMemo(() => {
    if (!profile?.membership_end) {
      return {
        daysUntilExpiry: null,
        isExpired: false,
        isExpiringSoon: false
      }
    }

    const now = dayjs().startOf('day')
    const expiryDate = dayjs(profile.membership_end)
    // diff() calcula la diferencia. Si es negativo, ya pasó.
    const daysUntilExpiry = expiryDate.diff(now, 'day')

    const isExpired = daysUntilExpiry <= 0
    const isExpiringSoon = daysUntilExpiry > 0 && daysUntilExpiry <= 7

    return { daysUntilExpiry, isExpired, isExpiringSoon }
  }, [profile]) // Se recalcula solo si el perfil cambia

  return expiryData
}
