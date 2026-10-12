import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

function extractBlock(contents: string, marker: string) {
  const markerIndex = contents.indexOf(marker)
  expect(markerIndex, `Missing marker: ${marker}`).toBeGreaterThanOrEqual(0)

  const openingBrace = contents.indexOf('{', markerIndex + marker.length)
  expect(openingBrace, `Missing opening brace after: ${marker}`).toBeGreaterThanOrEqual(0)

  let depth = 0
  for (let index = openingBrace; index < contents.length; index += 1) {
    if (contents[index] === '{') depth += 1
    if (contents[index] === '}') depth -= 1
    if (depth === 0) return contents.slice(openingBrace + 1, index)
  }

  throw new Error(`Unclosed block after: ${marker}`)
}

const capacityInvalidation =
  'queryClient.invalidateQueries({ queryKey: WEEKEND_INTRO_CAPACITY_QUERY_KEY })'

describe('admin weekend intro capacity invalidation', () => {
  it('invalidates the shared capacity query after a regular booking succeeds', () => {
    const queries = source('lib/adminBookingQueries.ts')
    const hook = extractBlock(queries, 'export function useAdminBookSession()')
    const onSuccess = extractBlock(hook, 'onSuccess: () =>')

    expect(queries).toContain(
      "import { WEEKEND_INTRO_CAPACITY_QUERY_KEY } from '@/lib/utils/weekendIntroCapacity'",
    )
    expect(onSuccess).toContain(capacityInvalidation)
    expect(hook.slice(0, hook.indexOf('onSuccess: () =>'))).not.toContain(capacityInvalidation)
  })

  it('invalidates the shared capacity query after a regular cancellation succeeds', () => {
    const queries = source('lib/adminBookingQueries.ts')
    const hook = extractBlock(queries, 'export function useAdminCancelBooking()')
    const onSuccess = extractBlock(hook, 'onSuccess: () =>')

    expect(onSuccess).toContain(capacityInvalidation)
    expect(hook.slice(0, hook.indexOf('onSuccess: () =>'))).not.toContain(capacityInvalidation)
    expect(queries).not.toContain("['admin-weekend-intro-capacity']")
  })

  it('invalidates the shared capacity query after intro creation and preserves local refresh', () => {
    const intro = source('app/admin/intro/components/IntroCalendarClient.tsx')
    const actions = source('lib/hooks/useIntroAppointmentActions.ts')
    expect(intro).toContain('await IntroClassesService.registerAppointment')
    expect(intro).toContain('await actions.refresh()')
    expect(actions).toContain('WEEKEND_INTRO_CAPACITY_QUERY_KEY')
    expect(actions).toContain('queryClient.invalidateQueries({ queryKey })')
    expect(intro).toContain('setForm(null); setSelected(null)')
  })

  it('invalidates the shared capacity query after intro update and preserves cleanup and local refresh', () => {
    const actions = source('lib/hooks/useIntroAppointmentActions.ts')
    expect(actions).toContain('onSuccess: refresh')
    expect(actions).toContain('onError: refresh')
    expect(actions).toContain('INTRO_CALENDAR_KEY')
    expect(actions).toContain('INTRO_AVAILABLE_SESSIONS_QUERY_KEY')
    expect(actions).toContain('WEEKEND_INTRO_CAPACITY_QUERY_KEY')
    expect(actions).not.toContain("['admin-weekend-intro-capacity']")
  })
})
