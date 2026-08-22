import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('ConfirmProvider accessibility', () => {
  it('gives the dialog an accessible name and description', () => {
    const source = readFileSync(
      join(process.cwd(), 'components/ui/ConfirmDialog.tsx'),
      'utf8',
    )

    expect(source).toContain('useId')
    expect(source).toContain('aria-labelledby={titleId}')
    expect(source).toContain('aria-describedby={describedBy}')
    expect(source).toContain('<h3 id={titleId}')
    expect(source).toContain('<p id={messageId}')
    expect(source).toContain('<p id={descriptionId}')
  })
})
