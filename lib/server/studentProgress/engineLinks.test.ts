import { describe, it, expect, vi } from 'vitest'
import { executeEngineOperation } from './engineLinks'
const student = '20000000-0000-4000-8000-000000000001'
const operation = {
  id: '40000000-0000-4000-8000-000000000001',
  link_id: 'link',
  student_id: student,
  external_id: 'cmp_alpha',
  action: 'confirm' as const,
  state: 'pending' as const,
  generation: 1,
  last_error_code: null,
  requested_at: '2026-10-20T15:00:00Z',
  updated_at: '2026-10-20T15:00:00Z',
}
const link = {
  id: 'link',
  student_id: student,
  source: 'tournament_engine' as const,
  external_id: 'cmp_alpha',
  status: 'pending' as const,
  revision: 1,
  evidence_reference: 'checked',
  confirmed_at: null,
  updated_at: '2026-10-20T15:00:00Z',
}
const receipt = (applied: boolean) => ({
  contract_version: 'te-academy-identity-v1' as const,
  checked_at: '2026-10-20T15:00:00Z',
  namespace: 'academy_reservas_student' as const,
  competitor_id: 'cmp_alpha',
  external_id: student,
  generation: applied ? 1 : null,
  link_status: applied ? ('confirmed' as const) : ('absent' as const),
  verified_at: applied ? '2026-10-20T15:00:00Z' : null,
  request: applied
    ? {
        request_id: operation.id,
        action: 'confirm' as const,
        generation: 1,
        status: 'applied' as const,
        applied_at: '2026-10-20T15:00:00Z',
      }
    : null,
})
function dependencies() {
  return {
    claim: vi.fn().mockResolvedValue({
      link,
      operation,
      lease: { token: 'lease', actor_id: 'admin' },
      evidence: 'Identity checked',
    }),
    verify: vi.fn().mockResolvedValue(undefined),
    status: vi.fn().mockResolvedValue(receipt(true)),
    command: vi.fn(),
    finalize: vi.fn().mockResolvedValue({
      link: { ...link, status: 'confirmed' },
      operation: { ...operation, state: 'completed' },
    }),
    fail: vi.fn(),
    guard: vi.fn().mockResolvedValue(undefined),
  }
}
describe('idempotent TE identity coordination', () => {
  it('recovers a lost ACK by status without sending a second confirmation', async () => {
    const d = dependencies()
    const result = await executeEngineOperation(student, operation.id, d)
    expect(result.operation.state).toBe('completed')
    expect(d.command).not.toHaveBeenCalled()
    expect(d.finalize).toHaveBeenCalledTimes(1)
  })
  it('keeps pending if source is down without finalizer calls', async () => {
    const d = dependencies()
    d.status.mockRejectedValue(Error('source down'))
    const result = await executeEngineOperation(student, operation.id, d)
    expect(result.operation.state).toBe('pending')
    expect(d.fail).toHaveBeenCalledWith('remote_unavailable')
    expect(d.finalize).not.toHaveBeenCalled()
  })
  it('verifies status again when POST succeeded remotely but response was lost', async () => {
    const d = dependencies()
    d.status
      .mockResolvedValueOnce(receipt(false))
      .mockResolvedValueOnce(receipt(true))
    d.command.mockRejectedValue(Error('lost ACK'))
    const result = await executeEngineOperation(student, operation.id, d)
    expect(result.operation.state).toBe('completed')
    expect(d.command).toHaveBeenCalledTimes(1)
    expect(d.status).toHaveBeenCalledTimes(2)
  })
  it('keeps accepted human decision pending when the local finalizer is unavailable', async () => {
    const d = dependencies()
    d.finalize.mockRejectedValue(Error('DB temporarily unavailable'))
    const result = await executeEngineOperation(student, operation.id, d)
    expect(result.operation.state).toBe('pending')
    expect(d.fail).toHaveBeenCalledWith('remote_unavailable')
  })
  it('never calls source when role is lost after claim', async () => {
    const d = dependencies()
    d.guard.mockRejectedValue(Error('forbidden'))
    await expect(
      executeEngineOperation(student, operation.id, d)
    ).rejects.toThrow('forbidden')
    expect(d.status).not.toHaveBeenCalled()
    expect(d.finalize).not.toHaveBeenCalled()
  })
  it('does not finalize a stale applied proof from an older generation', async () => {
    const d = dependencies()
    d.status.mockResolvedValue({ ...receipt(true), generation: 2 })
    await expect(
      executeEngineOperation(student, operation.id, d)
    ).rejects.toMatchObject({ status: 409 })
    expect(d.finalize).not.toHaveBeenCalled()
  })
})

describe('administrator revoked during remote processing', () => {
  it('does not finalize when admin role is lost while status is in flight', async () => {
    const d = dependencies()
    let stages = 0
    d.guard.mockImplementation(async () => {
      if (++stages >= 3) throw Error('forbidden')
    })
    await expect(
      executeEngineOperation(student, operation.id, d)
    ).rejects.toThrow('forbidden')
    expect(d.status).toHaveBeenCalledTimes(1)
    expect(d.command).not.toHaveBeenCalled()
    expect(d.finalize).not.toHaveBeenCalled()
  })
  it('does not finalize or read another status when admin role is lost while command is in flight', async () => {
    const d = dependencies()
    let stages = 0
    d.status.mockResolvedValue(receipt(false))
    d.guard.mockImplementation(async () => {
      if (++stages >= 4) throw Error('forbidden')
    })
    await expect(
      executeEngineOperation(student, operation.id, d)
    ).rejects.toThrow('forbidden')
    expect(d.command).toHaveBeenCalledTimes(1)
    expect(d.status).toHaveBeenCalledTimes(1)
    expect(d.finalize).not.toHaveBeenCalled()
  })
})
