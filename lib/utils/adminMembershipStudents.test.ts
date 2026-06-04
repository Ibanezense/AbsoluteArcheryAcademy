import { describe, expect, it } from 'vitest'
import { isStudentSelectableForMembershipSale } from './adminMembershipStudents'

describe('admin membership student selection', () => {
  it('allows expired inactive students to be selected for renewal', () => {
    expect(isStudentSelectableForMembershipSale({
      is_active: false,
      operational_status: 'expired',
    })).toBe(true)
  })

  it('keeps protected operational statuses out of the membership sale selector', () => {
    expect(isStudentSelectableForMembershipSale({
      is_active: true,
      operational_status: 'blocked',
    })).toBe(false)
    expect(isStudentSelectableForMembershipSale({
      is_active: true,
      operational_status: 'suspended',
    })).toBe(false)
    expect(isStudentSelectableForMembershipSale({
      is_active: false,
      operational_status: 'withdrawn',
    })).toBe(false)
  })

  it('keeps active students selectable for normal sales', () => {
    expect(isStudentSelectableForMembershipSale({
      is_active: true,
      operational_status: 'active',
    })).toBe(true)
  })
})
