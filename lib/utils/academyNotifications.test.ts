import { describe, expect, it } from 'vitest'
import { notificationExpiry, validateNotification, nextStudentNotice } from './academyNotifications'

describe('academy notification rules', () => {
  it('requires a title, message and selected recipients when applicable', () => {
    expect(() => validateNotification({ title: ' ', body: 'Hola', audience: 'all', studentIds: [], endDate: '' })).toThrow()
    expect(() => validateNotification({ title: 'Aviso', body: 'Hola', audience: 'selected', studentIds: [], endDate: '' })).toThrow()
    expect(validateNotification({ title: ' Aviso ', body: ' Hola ', audience: 'selected', studentIds: ['a', 'a'], endDate: '' })).toMatchObject({ title: 'Aviso', body: 'Hola', studentIds: ['a'] })
  })
  it('uses the end of the selected Lima day and rejects impossible dates', () => {
    expect(notificationExpiry('2026-10-31')).toBe('2026-11-01T05:00:00.000Z')
    expect(() => notificationExpiry('2026-02-30')).toThrow()
    expect(notificationExpiry('')).toBeNull()
  })
  it('prioritizes expiration, suppresses it for this opening only, then shows unread messages', () => {
    const feed = { notices: [{ id: 'n1', title: 'Aviso', body: 'Hola' }], membership: { expired: true, state_key: 'm1' } }
    expect(nextStudentNotice(feed, [], [], 'opening1')?.kind).toBe('expired')
    expect(nextStudentNotice(feed, ['opening1:m1'], [], 'opening1')?.kind).toBe('announcement')
    expect(nextStudentNotice(feed, ['opening1:m1'], [], 'opening2')?.kind).toBe('expired')
    expect(nextStudentNotice({ ...feed, membership: { expired: false, state_key: '' } }, [], ['n1'], 'opening1')).toBeNull()
  })
})
