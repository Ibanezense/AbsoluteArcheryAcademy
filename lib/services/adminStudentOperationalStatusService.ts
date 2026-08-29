export type StudentOperationalStatusResult = {
  studentId: string
  operationalStatus: string
  manualInactive: boolean
}

type RpcError = {
  message?: string
}

type StudentOperationalStatusRpcClient = {
  rpc: (
    functionName: 'admin_set_student_inactive',
    payload: { p_student_id: string; p_inactive: boolean },
  ) => PromiseLike<{ data: unknown; error: RpcError | null }>
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function normalizeResult(data: unknown): StudentOperationalStatusResult {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('El servidor devolvió un estado operativo inválido.')
  }

  const value = data as Record<string, unknown>
  if (
    !isNonEmptyString(value.student_id)
    || !isNonEmptyString(value.operational_status)
    || typeof value.manual_inactive !== 'boolean'
  ) {
    throw new Error('El servidor devolvió un estado operativo inválido.')
  }

  return {
    studentId: value.student_id,
    operationalStatus: value.operational_status,
    manualInactive: value.manual_inactive,
  }
}

export async function setStudentManualInactive(
  client: StudentOperationalStatusRpcClient,
  studentId: string,
  inactive: boolean,
): Promise<StudentOperationalStatusResult> {
  const normalizedStudentId = studentId.trim()
  if (!normalizedStudentId) {
    throw new Error('El alumno es obligatorio.')
  }

  const { data, error } = await client.rpc('admin_set_student_inactive', {
    p_student_id: normalizedStudentId,
    p_inactive: inactive,
  })

  if (error) {
    const detail = error.message?.trim()
    throw new Error(
      detail
        ? `No se pudo cambiar el estado operativo del alumno: ${detail}`
        : 'No se pudo cambiar el estado operativo del alumno.',
    )
  }

  return normalizeResult(data)
}
