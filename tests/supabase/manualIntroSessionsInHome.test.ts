import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationsDirectory = join(process.cwd(), 'supabase', 'migrations')
const migrationName = '20260921193000_manual_intro_sessions_in_home.sql'

describe('manual intro sessions in home availability', () => {
  it('keeps manual Umacollo sessions eligible when they have no weekly template', () => {
    const sql = readFileSync(join(migrationsDirectory, migrationName), 'utf8')

    expect(sql).toContain('LEFT JOIN public.weekly_session_templates template')
    expect(sql).toContain('template.id IS NULL')
    expect(sql).toContain("location.code = 'umacollo'")
  })
})
