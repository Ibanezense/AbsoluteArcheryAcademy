import { describe, expect, it } from 'vitest'
import { getStudentRenewalDateState } from './studentRenewalDate'

describe('getStudentRenewalDateState', () => {
  const todayInLima = '2026-09-27'

  it('uses green when renewal is more than seven days away', () => {
    expect(getStudentRenewalDateState('2026-10-10', todayInLima)).toMatchObject({
      label: 'Renovación',
      value: '10 oct',
      tone: 'green',
    })
  })

  it('uses orange throughout the final seven days including the renewal day', () => {
    expect(getStudentRenewalDateState('2026-10-04', todayInLima)).toMatchObject({ tone: 'orange' })
    expect(getStudentRenewalDateState('2026-09-27', todayInLima)).toMatchObject({ tone: 'orange' })
  })

  it('uses red after the renewal date has passed', () => {
    expect(getStudentRenewalDateState('2026-09-26', todayInLima)).toMatchObject({ tone: 'red' })
  })

  it('uses a neutral missing-date state', () => {
    expect(getStudentRenewalDateState(null, todayInLima)).toMatchObject({
      label: 'Renovación',
      value: 'Sin fecha',
      tone: 'neutral',
    })
    expect(getStudentRenewalDateState('fecha-inválida', todayInLima)).toMatchObject({
      value: 'Sin fecha',
      tone: 'neutral',
    })
  })
})
