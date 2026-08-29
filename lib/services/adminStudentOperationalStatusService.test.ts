import { describe, expect, it, vi } from 'vitest'
import { setStudentManualInactive } from './adminStudentOperationalStatusService'

function rpcClient(data: unknown, error: { message?: string } | null = null) {
  return {
    rpc: vi.fn().mockResolvedValue({ data, error }),
  }
}

const validData = {
  student_id: 'student-1',
  operational_status: 'inactive',
  manual_inactive: true,
}

describe('setStudentManualInactive', () => {
  it('calls the exact RPC payload and maps a valid result', async () => {
    const client = rpcClient(validData)

    await expect(setStudentManualInactive(client, 'student-1', true)).resolves.toEqual({
      studentId: 'student-1',
      operationalStatus: 'inactive',
      manualInactive: true,
    })
    expect(client.rpc).toHaveBeenCalledWith('admin_set_student_inactive', {
      p_student_id: 'student-1',
      p_inactive: true,
    })
  })

  it('supports removing the protected manual inactive state', async () => {
    const client = rpcClient({
      student_id: 'student-1',
      operational_status: 'paused',
      manual_inactive: false,
    })

    await expect(setStudentManualInactive(client, 'student-1', false)).resolves.toEqual({
      studentId: 'student-1',
      operationalStatus: 'paused',
      manualInactive: false,
    })
  })

  it('surfaces the database error with administrative context', async () => {
    const client = rpcClient(null, { message: 'No autorizado' })

    await expect(setStudentManualInactive(client, 'student-1', true)).rejects.toEqual(
      new Error('No se pudo cambiar el estado operativo del alumno: No autorizado'),
    )
  })

  it.each([
    null,
    [],
    'invalid',
    { student_id: '', operational_status: 'inactive', manual_inactive: true },
    { student_id: 'student-1', operational_status: '', manual_inactive: true },
    { student_id: 'student-1', operational_status: 'inactive', manual_inactive: 'yes' },
  ])('rejects malformed RPC data (%j)', async (data) => {
    const client = rpcClient(data)

    await expect(setStudentManualInactive(client, 'student-1', true)).rejects.toEqual(
      new Error('El servidor devolvió un estado operativo inválido.'),
    )
  })

  it('rejects an empty student id before calling Supabase', async () => {
    const client = rpcClient(validData)

    await expect(setStudentManualInactive(client, '  ', true)).rejects.toEqual(
      new Error('El alumno es obligatorio.'),
    )
    expect(client.rpc).not.toHaveBeenCalled()
  })
})
