import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const pagePath = join(process.cwd(), 'app', 'page.tsx')

describe('home page unauthenticated access', () => {
  const source = readFileSync(pagePath, 'utf8')

  it('mounts the student dashboard only inside AuthGuard', () => {
    expect(source).toContain('function StudentHomeContent()')
    expect(source).toMatch(/export default function HomePage\(\)[\s\S]*<AuthGuard>[\s\S]*<StudentHomeContent \/>[\s\S]*<\/AuthGuard>/)
  })
})
