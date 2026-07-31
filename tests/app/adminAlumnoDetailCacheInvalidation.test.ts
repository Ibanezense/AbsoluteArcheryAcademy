import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const detailPagePath = join(
  process.cwd(),
  'app',
  'admin',
  'alumnos',
  '[id]',
  'page.tsx',
)

describe('admin alumno detail cache invalidation', () => {
  it('refreshes every student query after profile and membership mutations', () => {
    const source = readFileSync(detailPagePath, 'utf8')

    expect(source).toContain("import { useQueryClient } from '@tanstack/react-query'")
    expect(source).toContain("import { studentKeys } from '@/lib/queries/studentQueries'")
    expect(source).toContain(
      'await queryClient.invalidateQueries({ queryKey: studentKeys.all })',
    )
    expect(source).not.toContain('await detailQuery.refetch()')
  })
})
