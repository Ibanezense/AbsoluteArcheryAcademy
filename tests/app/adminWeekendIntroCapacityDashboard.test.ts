import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('admin weekend intro capacity dashboard', () => {
  it('places the weekend capacity block before the Hoy section', () => {
    const dashboard = source('app/admin/page.tsx')

    expect(dashboard).toContain(
      "import WeekendIntroCapacity from '@/components/admin/WeekendIntroCapacity'",
    )
    expect(dashboard).toContain('<WeekendIntroCapacity />')
    expect(dashboard.indexOf('<WeekendIntroCapacity />')).toBeGreaterThan(
      dashboard.indexOf('{error && ('),
    )
    expect(dashboard.indexOf('<WeekendIntroCapacity />')).toBeLessThan(
      dashboard.indexOf('<SectionHeader title="Hoy"'),
    )
  })

  it('uses the capacity query and slot builder to render the two weekend groups', () => {
    const component = source('components/admin/WeekendIntroCapacity.tsx')

    expect(component).toContain("'use client'")
    expect(component).toContain('useAdminWeekendIntroCapacity(now)')
    expect(component).toContain('buildWeekendIntroSlots(sessions, now)')
    expect(component).toContain('Disponibilidad para clases de prueba')
    expect(component).toContain('6 arcos de academia de 20 lb')
    expect(component).toContain('2 arcos exclusivos de 18 lb')
    expect(component).toContain('Sábado')
    expect(component).toContain('Domingo')
    expect(component).toContain("slots.filter((slot) => slot.day === day.key)")
    expect(component).toContain('daySlots.map((slot) =>')
  })

  it('covers every state and only links actionable slots to intro management', () => {
    const component = source('components/admin/WeekendIntroCapacity.tsx')

    for (const label of [
      'cupos libres',
      'Último cupo',
      'Lleno',
      'Finalizado',
      'No programado',
    ]) {
      expect(component).toContain(label)
    }

    expect(component).toContain("href='/admin/intro'")
    expect(component).toContain("slot.status === 'available' || slot.status === 'last_spot'")
    expect(component).toMatch(/actionable\s*\?\s*\([\s\S]*?<Link[\s\S]*?href='\/admin\/intro'[\s\S]*?\)\s*:\s*\(/)
    expect(component).toContain('aria-label={ariaLabel}')
  })

  it('keeps loading and errors local to a seven-slot section', () => {
    const component = source('components/admin/WeekendIntroCapacity.tsx')

    expect(component).toContain('Array.from({ length: 7 })')
    expect(component).toContain('animate-pulse')
    expect(component).toContain('No se pudo cargar la disponibilidad de clases de prueba.')
    expect(component).toContain('Reintentar')
    expect(component).toContain('onClick={() => refetch()}')
  })
})
