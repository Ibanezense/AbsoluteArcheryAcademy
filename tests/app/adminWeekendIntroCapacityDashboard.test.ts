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
    expect(component).toContain("{ key: 'saturday', label: 'Sábado', capacity: 4 }")
    expect(component).toContain("{ key: 'sunday', label: 'Domingo', capacity: 3 }")
    expect(component).toContain('Disponibilidad para clases de prueba')
    expect(component).toContain('6 arcos de academia de 20 lb')
    expect(component).toContain('2 arcos exclusivos de 18 lb')
    expect(component).toContain('Sábado')
    expect(component).toContain('Domingo')
    expect(component).toContain("slots.filter((slot) => slot.day === day.key)")
    expect(component).toContain('daySlots.map((slot) =>')
    expect(component).toMatch(
      /const daySlots = slots\.filter\(\(slot\) => slot\.day === day\.key\)[\s\S]*?daySlots\.map\(\(slot\) => \([\s\S]*?<SlotCard/,
    )
    expect(component.match(/<SlotCard\b/g) ?? []).toHaveLength(1)
  })

  it('advances and cleans up one live clock shared by the query and slot builder', () => {
    const component = source('components/admin/WeekendIntroCapacity.tsx')

    expect(component).toContain("import { useEffect, useState } from 'react'")
    expect(component).toContain('const [now, setNow] = useState(() => new Date())')
    expect(component).toContain(
      'const clock = window.setInterval(() => setNow(new Date()), 30_000)',
    )
    expect(component).toContain('return () => window.clearInterval(clock)')
    expect(component).toContain('useAdminWeekendIntroCapacity(now)')
    expect(component).toContain('buildWeekendIntroSlots(sessions, now)')
    expect(component).toContain('getWeekendDates(now)')
  })

  it('covers every state and only links actionable slots to intro management', () => {
    const component = source('components/admin/WeekendIntroCapacity.tsx')
    const slotCard = component.slice(
      component.indexOf('function SlotCard'),
      component.indexOf('function SectionHeading'),
    )

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
    expect(slotCard.match(/<Link\b/g) ?? []).toHaveLength(1)
    expect(slotCard).toMatch(
      /return actionable \? \(\s*<Link[\s\S]*?href='\/admin\/intro'[\s\S]*?<\/Link>\s*\) : \(\s*<article[\s\S]*?<\/article>\s*\)/,
    )
    expect(component).toContain('aria-label={ariaLabel}')
  })

  it('reports normal capacity and forced academy overbooking without changing availability', () => {
    const component = source('components/admin/WeekendIntroCapacity.tsx')

    expect(component).toContain(
      'slot.session.equipmentReserved + slot.session.spotsRemaining > slot.session.equipmentCapacity',
    )
    expect(component).toContain(
      '`${slot.session.spotsRemaining} cupos disponibles para prueba · academia sobreocupada`',
    )
    expect(component).toContain(
      '`${slot.session.spotsRemaining} de ${slot.session.equipmentCapacity} cupos libres`',
    )
  })

  it('keeps loading and errors local to a seven-slot section', () => {
    const component = source('components/admin/WeekendIntroCapacity.tsx')

    expect(component).toContain('Array.from({ length: 7 })')
    expect(component).toContain('animate-pulse')
    expect(component).toContain('No se pudo cargar la disponibilidad de clases de prueba.')
    expect(component).toContain('Reintentar')
    expect(component).toContain('onClick={() => refetch()}')
    expect(component).toContain('role="status"')
    expect(component).toMatch(
      /const statusText = isLoading\s*\? 'Cargando disponibilidad\.\.\.'\s*: isFetching\s*\? 'Actualizando\.\.\.'\s*: ''/,
    )
    expect(component).toContain(
      '<SectionHeading isLoading={isLoading} isFetching={isFetching && !isLoading} />',
    )
    expect(component).toContain('{statusText}')
    expect(component).not.toContain("isFetching ? 'opacity-100' : 'opacity-0'")
  })
})
