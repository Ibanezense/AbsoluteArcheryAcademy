import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20260921160000_manual_sessions_location.sql'),
  'utf8',
)

describe('manual session location migration', () => {
  it('requires an active academy location in the atomic RPC', () => {
    expect(migration).toContain('p_location_id uuid')
    expect(migration).toContain('p_location_id IS NULL')
    expect(migration).toContain('academy_locations WHERE id = p_location_id AND is_active')
    expect(migration).toContain('location_id = p_location_id')
  })
})
