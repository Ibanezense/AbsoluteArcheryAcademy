import { describe, expect, it } from 'vitest'
import type { MembershipRenewalAlert } from '@/lib/services/membershipRenewalAlertService'
import { getLimaRenewalDismissalKey } from './membershipRenewal'
import {
  getDismissedRenewalPrompt,
  getValidatedRenewalOptions,
  getVisibleRenewalAlert,
  setDismissedRenewalPrompt,
  shouldOpenMembershipRenewalPrompt,
} from './membershipRenewalPrompt'

function alert(
  alertState: MembershipRenewalAlert['alert_state'],
  stateKey = 'cycle-a',
): MembershipRenewalAlert {
  return {
    student_id: 'student-1',
    alert_state: alertState,
    remaining_unconsumed_classes: alertState === 'last_class' ? 1 : 0,
    has_current_membership: alertState === 'last_class',
    has_scheduled_membership: false,
    state_key: stateKey,
  }
}

const readyPrompt = {
  contextReady: true,
  queryReady: true,
  isAdmin: false,
  dismissalKey: 'daily-key',
  checkedDismissalKey: 'daily-key',
  dismissed: false,
  manualOpen: false,
}

describe('membership renewal prompt controller', () => {
  it('only identifies canonical visible alerts with a state key', () => {
    expect(getVisibleRenewalAlert(alert('none'))).toBeNull()
    expect(getVisibleRenewalAlert(alert('last_class'))?.alert_state).toBe('last_class')
    expect(getVisibleRenewalAlert(alert('expired'))?.alert_state).toBe('expired')
    expect(getVisibleRenewalAlert(alert('last_class', ''))).toBeNull()
    expect(getVisibleRenewalAlert({
      ...alert('last_class'),
      state_key: 42,
    } as unknown as MembershipRenewalAlert)).toBeNull()
    expect(getVisibleRenewalAlert(undefined)).toBeNull()
  })

  it('opens when ready and closes after the same daily key is dismissed', () => {
    const visibleAlert = getVisibleRenewalAlert(alert('last_class'))

    expect(shouldOpenMembershipRenewalPrompt({ ...readyPrompt, alert: visibleAlert })).toBe(true)
    expect(shouldOpenMembershipRenewalPrompt({
      ...readyPrompt,
      alert: visibleAlert,
      dismissed: true,
    })).toBe(false)
  })

  it('lets manual opening bypass dismissal but never missing readiness or alert', () => {
    const visibleAlert = getVisibleRenewalAlert(alert('expired'))

    expect(shouldOpenMembershipRenewalPrompt({
      ...readyPrompt,
      alert: visibleAlert,
      dismissed: true,
      manualOpen: true,
    })).toBe(true)
    expect(shouldOpenMembershipRenewalPrompt({
      ...readyPrompt,
      alert: null,
      manualOpen: true,
    })).toBe(false)
    expect(shouldOpenMembershipRenewalPrompt({
      ...readyPrompt,
      alert: visibleAlert,
      queryReady: false,
      manualOpen: true,
    })).toBe(false)
  })

  it('waits until the current state, cycle, or day key has been checked', () => {
    const visibleAlert = getVisibleRenewalAlert(alert('last_class'))

    expect(shouldOpenMembershipRenewalPrompt({
      ...readyPrompt,
      alert: visibleAlert,
      checkedDismissalKey: 'old-state-cycle-or-day-key',
    })).toBe(false)
    expect(shouldOpenMembershipRenewalPrompt({
      ...readyPrompt,
      alert: visibleAlert,
      dismissalKey: '',
    })).toBe(false)
  })

  it('treats a changed state, cycle, or Lima day as a new dismissal', () => {
    const visibleAlert = getVisibleRenewalAlert(alert('last_class', 'cycle-a'))
    const today = new Date('2026-08-20T09:00:00-05:00')
    const oldKey = getLimaRenewalDismissalKey('student-1', 'last_class', 'cycle-a', today)
    const changedKeys = [
      getLimaRenewalDismissalKey('student-1', 'expired', 'cycle-a', today),
      getLimaRenewalDismissalKey('student-1', 'last_class', 'cycle-b', today),
      getLimaRenewalDismissalKey(
        'student-1',
        'last_class',
        'cycle-a',
        new Date('2026-08-21T09:00:00-05:00'),
      ),
    ]

    for (const newKey of changedKeys) {
      expect(newKey).not.toBe(oldKey)
      expect(shouldOpenMembershipRenewalPrompt({
        ...readyPrompt,
        alert: visibleAlert,
        dismissalKey: newKey,
        checkedDismissalKey: newKey,
        dismissed: false,
      })).toBe(true)
    }
  })

  it('contains localStorage read and write exceptions', () => {
    const throwingStorage = {
      getItem: () => { throw new DOMException('blocked', 'SecurityError') },
      setItem: () => { throw new DOMException('blocked', 'SecurityError') },
    }

    expect(() => getDismissedRenewalPrompt(throwingStorage, 'daily-key')).not.toThrow()
    expect(getDismissedRenewalPrompt(throwingStorage, 'daily-key')).toBe(false)
    expect(() => setDismissedRenewalPrompt(throwingStorage, 'daily-key')).not.toThrow()
    expect(setDismissedRenewalPrompt(throwingStorage, 'daily-key')).toBe(false)

    const throwingProvider = () => {
      throw new DOMException('blocked', 'SecurityError')
    }
    expect(getDismissedRenewalPrompt(throwingProvider, 'daily-key')).toBe(false)
    expect(setDismissedRenewalPrompt(throwingProvider, 'daily-key')).toBe(false)
  })

  it('reads and writes a dismissal through injectable storage', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
    }

    expect(getDismissedRenewalPrompt(storage, 'daily-key')).toBe(false)
    expect(setDismissedRenewalPrompt(storage, 'daily-key')).toBe(true)
    expect(getDismissedRenewalPrompt(storage, 'daily-key')).toBe(true)
  })

  it('can remain dismissed in memory when persistent storage rejects the write', () => {
    const visibleAlert = getVisibleRenewalAlert(alert('expired'))
    const rejected = setDismissedRenewalPrompt({
      getItem: () => null,
      setItem: () => { throw new DOMException('blocked', 'SecurityError') },
    }, 'daily-key')

    expect(rejected).toBe(false)
    expect(shouldOpenMembershipRenewalPrompt({
      ...readyPrompt,
      alert: visibleAlert,
      dismissed: true,
    })).toBe(false)
  })

  it('accepts only complete and numerically safe renewal options', () => {
    const validOption = {
      plan_id: 'plan-1',
      name: '4 clases',
      classes_included: 4,
      duration_days: 30,
      regular_price: 160,
      country_club_price: 130,
      effective_price: 130,
      currency: 'PEN',
      is_country_club_member: true,
    }

    expect(getValidatedRenewalOptions([validOption])).toEqual({
      options: [validOption],
      malformed: false,
    })

    for (const invalid of [
      { ...validOption, plan_id: '  ' },
      { ...validOption, classes_included: 0 },
      { ...validOption, classes_included: 1.5 },
      { ...validOption, regular_price: Number.NaN },
      { ...validOption, effective_price: Number.POSITIVE_INFINITY },
      { ...validOption, country_club_price: Number.NaN },
      { ...validOption, is_country_club_member: 'yes' },
    ]) {
      expect(getValidatedRenewalOptions([invalid])).toEqual({ options: [], malformed: true })
    }
    expect(getValidatedRenewalOptions({ options: [validOption] })).toEqual({
      options: [],
      malformed: true,
    })
  })
})
