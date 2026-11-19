import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const homeSource = readFileSync(join(process.cwd(), 'app', 'page.tsx'), 'utf8')
const studentCardSource = readFileSync(
  join(process.cwd(), 'components', 'student', 'StudentCard.tsx'),
  'utf8',
)

describe('student renewal date card', () => {
  it('uses the overall coverage end for the dashboard date', () => {
    expect(homeSource).toContain("import { getStudentRenewalDateState } from '@/lib/utils/studentRenewalDate'")
    expect(homeSource).toContain('useStudentMembershipCoverageEnd(activeStudentId)')
    expect(homeSource).toContain('getStudentRenewalDateState(coverage.data)')
    expect(homeSource).toContain('label="Vencimiento"')
    expect(homeSource).toContain('tone={renewalDate.tone}')
    expect(homeSource).not.toContain('detail="Vencimiento"')
    expect(homeSource).not.toContain('label="Vence"')
  })

  it('supports expired and missing-date tones while limiting emphasis to this card', () => {
    expect(homeSource).toContain("tone: 'orange' | 'green' | 'blue' | 'red' | 'neutral'")
    expect(homeSource).toContain("red: 'bg-red-50 text-red-600'")
    expect(homeSource).toContain("neutral: 'bg-slate-100 text-slate-500'")
    expect(homeSource).toContain('emphasizeTone')
    expect(homeSource).toContain('emphasizeTone={true}')
  })

  it('keeps the card neutral and uses text and icon tones for renewal status', () => {
    expect(homeSource).toContain('<StudentCard className="min-h-[120px] p-4">')
    expect(homeSource).toContain('<p className={`text-sm font-bold leading-tight ${emphasizedText}`}>{label}</p>')
    expect(homeSource).toContain('{detail}</p>')
  })

  it('selects one StudentCard background variant instead of combining it with the default', () => {
    expect(homeSource).not.toContain('emphasisCardClasses')
    expect(homeSource).not.toContain('className={`min-h-[120px] p-4 ${emphasizedCard}`}')
    expect(studentCardSource).toContain("neutral: 'border-slate-200 bg-slate-50 shadow-card'")
  })
})
