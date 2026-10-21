import { ProgressError } from './auth'

export function identityConfirmationEvidence(
  body: Record<string, unknown>,
  source: 'controls' | 'competitions'
) {
  if (body.identityVerified === true) {
    return `Identidad de ${source === 'controls' ? 'Controles' : 'Competencias'} confirmada manualmente por el administrador desde la ficha del alumno.`
  }
  // Preserve old clients and their original notes while the new UI is rolling out.
  if (body.identityVerified === undefined && typeof body.evidence === 'string' &&
    body.evidence.trim().length >= (source === 'controls' ? 3 : 5) && body.evidence.length <= 1000) {
    return body.evidence.trim()
  }
  throw new ProgressError(400, 'invalid_request')
}
