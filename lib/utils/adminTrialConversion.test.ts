import { describe, expect, it } from 'vitest'
import { buildTrialConversionReport, matchesPersonSearch, type TrialConversionData } from './adminTrialConversion'

const data: TrialConversionData = {
  attendees: [{ introClientId: 'i1', fullName: 'José Pérez', phone: null, firstAttendedAt: '2026-09-01T15:00:00Z' }, { introClientId: 'i2', fullName: 'Ana León', phone: '9', firstAttendedAt: '2026-09-12T15:00:00Z' }],
  students: [{ id: 's1', fullName: 'José Pérez', dni: null, phone: null, firstMembershipDate: '2026-09-05' }],
  links: [{ id: 'l1', introClientId: 'i1', studentId: 's1', version: 1, confirmedAt: '2026-10-01', confirmedBy: 'a1' }], linksAvailable: true,
}
const period = { fromDate: '2026-09-01', toDate: '2026-09-30', asOf: '2026-10-19' }
describe('trial conversion cohorts', () => {
  it('counts only explicit confirmed links; name search preserves denominator', () => {
    const report = buildTrialConversionReport(data, { ...period, search: 'perez jose' })
    expect(report.rows).toHaveLength(1)
    expect(report.attended).toBe(2)
    expect(report.converted).toBe(1)
    expect(report.conversionRate).toBe(50)
  })
  it('does not infer identity from identical names', () => {
    expect(buildTrialConversionReport({ ...data, links: [] }, period).converted).toBe(0)
  })
  it('retains an auditable link to a deleted student without counting conversion', () => {
    const report = buildTrialConversionReport({ ...data, links: [{ ...data.links[0], studentId: null }] }, period)
    expect(report.converted).toBe(0)
    expect(report.rows.find(row => row.introClientId === 'i1')?.link?.id).toBe('l1')
    expect(report.rows.find(row => row.introClientId === 'i1')?.student).toBeNull()
  })
  it('does not fabricate zero when the migration is unavailable', () => {
    const report = buildTrialConversionReport({ ...data, links: [], linksAvailable: false }, period)
    expect(report.converted).toBeNull()
    expect(report.conversionRate).toBeNull()
  })
  it('rejects first memberships preceding the trial or after the reference date', () => {
    for (const firstMembershipDate of ['2026-08-31', '2026-10-20']) {
      expect(buildTrialConversionReport({ ...data, students: [{ ...data.students[0], firstMembershipDate }] }, period).converted).toBe(0)
    }
  })
  it('uses the Lima civil day and excludes trials outside the period', () => {
    const report = buildTrialConversionReport({ ...data, attendees: [{ ...data.attendees[0], firstAttendedAt: '2026-10-01T02:00:00Z' }] }, period)
    expect(report.attended).toBe(1)
    expect(report.converted).toBe(0)
  })
  it('has no percentage with an empty cohort and rejects invalid dates', () => {
    expect(buildTrialConversionReport({ ...data, attendees: [] }, period).conversionRate).toBeNull()
    expect(() => buildTrialConversionReport(data, { ...period, fromDate: '2026-02-30' })).toThrow()
  })
  it('searches all name tokens in any order, ignoring accents and case', () => {
    expect(matchesPersonSearch('José Luis Pérez', 'PEREZ jose')).toBe(true)
    expect(matchesPersonSearch('José Luis Pérez', 'perez ana')).toBe(false)
  })
})
