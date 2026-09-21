import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(process.cwd(), 'lib', 'infrastructureQueries.ts'), 'utf8')

describe('weekly template infrastructure mutations', () => {
  it('models location and intro availability in template writes and reads', () => {
    expect(source).toContain('allows_intro: boolean')
    expect(source).toContain('location_id: string')
    expect(source).toContain('locationId: string')
    expect(source).toContain('allowsIntro: boolean')
    expect(source).toMatch(/select\(`[^`]*allows_intro[^`]*location_id/s)
  })

  it('persists creation and editing through the atomic RPC', () => {
    expect(source).toContain("supabase.rpc('admin_upsert_weekly_template'")
    expect(source).toContain('p_template_id: payload.id || null')
    expect(source).toContain('p_location_id: payload.locationId')
    expect(source).toContain('p_allows_intro: payload.allowsIntro')
    expect(source).toContain('p_distances: payload.distances')
    expect(source).not.toContain('saveTemplateDistances')
  })

  it('invalidates templates, intro availability and generated sessions after saving', () => {
    expect(source).toContain("queryKey: ['weekly-session-templates']")
    expect(source).toContain('INTRO_AVAILABLE_SESSIONS_QUERY_KEY')
    expect(source).toContain("queryKey: ['sessions']")
  })
})
