import { expect, it } from 'vitest'
import { capacityForAdminSession, sessionEditorHref, limaSessionTime } from './adminSessionPlanning'

const target = { id: 'a', locationId: 'site', status: 'scheduled', startAt: '2026-11-20T10:00:00-05:00', endAt: '2026-11-20T12:00:00-05:00' }
const overlap = { ...target, id: 'b', startAt: '2026-11-20T11:00:00-05:00' }
const adjacent = { ...target, id: 'c', startAt: target.endAt, endAt: '2026-11-20T13:00:00-05:00' }

it('uses shared physical space at Umacollo and counts trial classes at Tiabaya', () => {
  const bookings = new Map([
    ['a', [{ bow_usage_type: 'own', intro_client_id: null }]],
    ['b', [{ bow_usage_type: null, intro_client_id: 'trial' }, { bow_usage_type: 'assigned', intro_client_id: null }]],
    ['c', [{ bow_usage_type: 'shared_inventory', intro_client_id: null }]],
  ])
  expect(capacityForAdminSession(target, 'umacollo', [target, overlap, adjacent], bookings)).toMatchObject({ free: 1, limit: 4 })
  expect(capacityForAdminSession(target, 'tiabaya', [target, overlap, adjacent], bookings)).toMatchObject({ free: 4, limit: 6 })
})

it('keeps the chosen civil day and location when opening an editor', () => {
  expect(sessionEditorHref('new', '2026-11-21', 'tiabaya')).toBe('/admin/sesiones/editar/new?date=2026-11-21&location=tiabaya')
  expect(limaSessionTime('2026-11-21T17:00')).toBe('2026-11-21T22:00:00.000Z')
})
