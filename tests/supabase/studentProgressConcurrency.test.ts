import { describe, it, expect } from 'vitest'
// @ts-expect-error Standalone Node runner has no application type declarations.
import { assertDisposableDatabase } from './runStudentProgressConcurrency.mjs'
const local =
  'postgres://codex_progress_test:codex-local-test-only@127.0.0.1:55439/codex_student_progress_test'
describe('concurrency runner database safety', () => {
  it('accepts only the marked disposable loopback target', () => {
    expect(assertDisposableDatabase(local)).toBe(local)
    expect(() => assertDisposableDatabase(local.replace('127.0.0.1', 'localhost'))).not.toThrow()
  })
  it.each([
    local.replace('127.0.0.1', 'database.example.com'),
    local.replace('55439', '5432'),
    local.replace('codex_student_progress_test', 'postgres'),
    local.replace('codex_progress_test:', 'real_user:'),
    local.replace('codex-local-test-only', 'actual-secret'),
    `${local}?host=remote.example`,
    `${local}#fragment`,
    'not-a-url',
  ])('rejects unmarked, remote or ambiguous database: %s', (input) => {
    expect(() => assertDisposableDatabase(input)).toThrow()
  })
})
