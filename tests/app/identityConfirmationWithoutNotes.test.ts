import { afterEach, describe, expect, it, vi } from 'vitest'
import * as auth from '@/lib/server/studentProgress/auth'
import * as source from '@/lib/server/studentProgress/source'
import * as engine from '@/lib/server/studentProgress/engineLinks'
import { POST as controls } from '@/app/api/admin/student-progress-links/route'
import { POST as competitions } from '@/app/api/admin/student-progress-competitions/route'
const studentId = '11111111-1111-4111-8111-111111111111'
const externalId = '22222222-2222-4222-8222-222222222222'
afterEach(() => vi.restoreAllMocks())
describe('identity confirmation without handwritten evidence', () => {
  for (const kind of ['controls', 'competitions'] as const) {
    it(`${kind} records a server-generated note with the existing authorized audit RPC`, async () => {
      const rpc = vi.fn().mockResolvedValue({ data: { operation: { id: externalId } }, error: null })
      vi.spyOn(auth, 'authorize').mockResolvedValue({ rpc } as never)
      vi.spyOn(auth, 'readContext').mockResolvedValue({ student_id: studentId, assigned_distance_m: 40, link: null })
      vi.spyOn(engine, 'readAdminEngineContext').mockResolvedValue({ student_id: studentId, links: [], operations: [] })
      vi.spyOn(source, 'readControls').mockResolvedValue({ student: { id: externalId, name: 'Fixture', active: 1 }, controls: [], complete: true, checked_at: '2026-10-20T00:00:00Z', contract_version: 'academy-student-controls-v1' })
      vi.spyOn(engine, 'runEngineOperation').mockResolvedValue({} as never)
      const body = { action: kind === 'controls' ? 'confirm' : 'beginConfirm', studentId, externalId, identityVerified: true, requestId: externalId, expectedLinkId: null, expectedRevision: null }
      const handler = kind === 'controls' ? controls : competitions
      const response = await handler(new Request('http://localhost/api/admin/link', { method: 'POST', body: JSON.stringify(body) }))
      expect(response.status).toBe(200)
      expect(rpc).toHaveBeenCalledWith(kind === 'controls' ? 'admin_confirm_progress_link' : 'admin_request_engine_link', expect.objectContaining({ p_student_id: studentId, p_evidence: expect.stringContaining('confirmada manualmente') }))
      rpc.mockClear()
      const rejected = await handler(new Request('http://localhost/api/admin/link', { method: 'POST', body: JSON.stringify({ ...body, identityVerified: false }) }))
      expect(rejected.status).toBe(400)
      expect(rpc).not.toHaveBeenCalled()
    })
  }
})
