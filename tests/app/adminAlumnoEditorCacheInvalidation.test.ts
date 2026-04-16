import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const editorPath = join(
  process.cwd(),
  'app',
  'admin',
  'alumnos',
  'editar',
  '[id]',
  'page.tsx'
)

describe('admin alumno editor cache invalidation', () => {
  it('invalidates student list and detail caches after save', () => {
    const source = readFileSync(editorPath, 'utf8')

    expect(source).toContain("import { useQueryClient } from '@tanstack/react-query'")
    expect(source).toContain("import { studentKeys } from '@/lib/queries/studentQueries'")
    expect(source).toContain("queryClient.invalidateQueries({ queryKey: studentKeys.all })")
    expect(source).toContain("queryClient.invalidateQueries({ queryKey: studentKeys.detail(id) })")
  })
})
