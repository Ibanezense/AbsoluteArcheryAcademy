import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

function source(path: string) {
  return readFileSync(join(root, path), 'utf8')
}

describe('phase 1 UX and operational safeguards', () => {
  it('uses the real student cancellation rule copy and removes the stale end-of-class message', () => {
    const detail = source('app/reserva/[id]/page.tsx')

    expect(detail).toContain('Puedes cancelar desde la app hasta el inicio de la clase.')
    expect(detail).toContain('Esta reserva ya no está activa.')
    expect(detail).toContain(
      'La reserva se cancelará. Tu saldo de clases no cambiará porque el crédito solo se descuenta al registrar asistencia o inasistencia.'
    )
    expect(detail).not.toContain('mientras la clase no haya finalizado')
  })

  it('renders reusable student skeletons in the four student loading surfaces', () => {
    const skeleton = source('components/ui/StudentPageSkeleton.tsx')

    expect(skeleton).toContain('export function StudentPageSkeleton')
    expect(skeleton).toContain('animate-pulse')

    for (const path of ['app/page.tsx', 'app/membresias/page.tsx', 'app/mis-reservas/page.tsx', 'app/reservar/page.tsx']) {
      expect(source(path)).toContain('StudentPageSkeleton')
    }
  })

  it('keeps student and guardian access codes masked until a single row is revealed', () => {
    const alumnos = source('app/admin/alumnos/page.tsx')

    expect(alumnos).toContain('revealedAccessStudentId')
    expect(alumnos).toContain('••••••')
    expect(alumnos).toContain('Ver codigo')
    expect(alumnos).toContain('Ocultar codigo')
    expect(alumnos).not.toContain('Alumno ${student.access_code}')
    expect(alumnos).not.toContain('Tutor ${student.guardian_access_code}')
  })

  it('requires an impact confirmation before cancelling an admin session', () => {
    const sesiones = source('app/admin/sesiones/page.tsx')
    const confirmDialog = source('components/ui/ConfirmDialog.tsx')

    expect(sesiones).toContain('buildSessionCancellationImpact')
    expect(sesiones).toContain('Reservas afectadas')
    expect(sesiones).toContain('Devolucion de creditos')
    expect(sesiones).toContain('Esta accion cancelara el turno completo')
    expect(confirmDialog).toContain('confirmLabel')
    expect(confirmDialog).toContain('tone')
  })
})
