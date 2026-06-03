import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

function source(path: string) {
  return readFileSync(join(root, path), 'utf8')
}

describe('student mobile redesign', () => {
  it('keeps the student shell mobile-only with dark header and bottom nav', () => {
    const layout = source('app/LayoutWrapper.tsx')
    const header = source('components/student/MobileStudentHeader.tsx')
    const nav = source('components/StudentBottomNav.tsx')

    expect(layout).toContain('max-w-[430px]')
    expect(layout).not.toContain('sm:max-w-2xl')
    expect(header).toContain('bg-[#020B14]')
    expect(header).toContain('AA%20ACADEMY%20logo%20blanco.png')
    expect(header).toContain('LogOut')
    expect(header).toContain('supabase.auth.signOut()')
    expect(header).toContain('Cerrar sesión')
    expect(nav).toContain('bg-[#020B14]')
    expect(nav).toContain('Membresías')
  })

  it('renders the required student home sections', () => {
    const home = source('app/page.tsx')

    expect(home).toContain('MobileStudentHeader showLogo')
    expect(home).toContain('Clases disponibles')
    expect(home).toContain('Reservar clase')
    expect(home).toContain('Puedes cancelar desde la app hasta el inicio de la clase.')
    expect(home).toContain('Próxima reserva')
    expect(home).toContain('Actividad reciente')
  })

  it('preserves the per-class booking flow on the booking page', () => {
    const reservar = source('app/reservar/page.tsx')
    const board = source('components/ui/ClassCardsBoard.tsx')

    expect(reservar).toContain('Mis clases disponibles')
    expect(reservar).toContain('Calendario de turnos')
    expect(reservar).toContain('Horarios disponibles')
    expect(board).toContain('CLASE {card.card_index}')
    expect(board).toContain('Fecha')
    expect(board).toContain('Turno')
    expect(board).toContain('Reservar esta clase')
    expect(board).toContain('cardStatusOrder')
    expect(board).toContain('orderedCards.map')
    expect(board).not.toContain('wizard')
  })

  it('adds reservation tabs and membership account filters', () => {
    const reservations = source('app/mis-reservas/page.tsx')
    const memberships = source('app/membresias/page.tsx')

    expect(reservations).toContain('Próximas')
    expect(reservations).toContain('Historial')
    expect(reservations).toContain('Cancelar reserva')
    expect(memberships).toContain('Estado de cuenta')
    expect(memberships).toContain('Vigencia del plan')
    expect(memberships).toContain('Resumen de uso')
    expect(memberships).toContain('Cargar más historial')
  })

  it('keeps booking detail copy tied to canStudentCancelBooking', () => {
    const detail = source('app/reserva/[id]/page.tsx')

    expect(detail).toContain('canStudentCancelBooking')
    expect(detail).toContain('Puedes cancelar desde la app hasta el inicio de la clase.')
    expect(detail).toContain('Esta reserva ya no puede cancelarse desde la app.')
    expect(detail).toContain('Esta reserva ya no está activa.')
  })
})
