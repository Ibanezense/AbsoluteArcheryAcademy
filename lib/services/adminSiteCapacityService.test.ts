import { describe, expect, it, vi } from 'vitest'
import { fetchAdminSiteCapacity } from './adminSiteCapacityService'

describe('site capacity reader', () => {
  it('loads and validates the administrator-only capacity summary', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ session_id: '1', location_code: 'tiabaya', location_name: 'Tiabaya', start_at: '2026-11-19T22:00:00Z', end_at: '2026-11-19T23:00:00Z', occupied_people: 2, academy_bows_in_use: 1, unknown_bow_usage: 0 }], error: null })
    const result = await fetchAdminSiteCapacity({ rpc })
    expect(rpc).toHaveBeenCalledWith('admin_dashboard_site_capacity')
    expect(result[0].academyBowsInUse).toBe(1)
  })
  it('rejects missing data instead of displaying false availability', async () => {
    await expect(fetchAdminSiteCapacity({ rpc: vi.fn().mockResolvedValue({ data: [{ location_code: 'tiabaya' }], error: null }) })).rejects.toThrow()
    await expect(fetchAdminSiteCapacity({ rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'unavailable' } }) })).rejects.toThrow()
  })
})
