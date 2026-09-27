import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const homeSource = readFileSync(join(process.cwd(), 'app', 'page.tsx'), 'utf8')
const studentCardSource = readFileSync(
  join(process.cwd(), 'components', 'student', 'StudentCard.tsx'),
  'utf8',
)

describe('student renewal date card', () => {
  it('derives the card from the canonical membership end date', () => {
    expect(homeSource).toContain("import { getStudentRenewalDateState } from '@/lib/utils/studentRenewalDate'")
    expect(homeSource).toContain('getStudentRenewalDateState(dashboard.membership_end)')
    expect(homeSource).toContain('label={renewalDate.label}')
    expect(homeSource).toContain('value={renewalDate.value}')
    expect(homeSource).toContain('detail={renewalDate.detail}')
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

  it('applies the renewal tone to the complete card and its label', () => {
    expect(homeSource).toContain("red: 'danger'")
    expect(homeSource).toContain("orange: 'warning'")
    expect(homeSource).toContain("neutral: 'neutral'")
    expect(homeSource).toContain("const cardVariant = emphasizeTone ? emphasisCardVariants[tone] : 'default'")
    expect(homeSource).toContain('<StudentCard variant={cardVariant} className="min-h-[132px] p-4">')
    expect(homeSource).toContain('<p className={`text-sm font-bold leading-tight ${emphasizedText}`}>{label}</p>')
  })

  it('selects one StudentCard background variant instead of combining it with the default', () => {
    expect(homeSource).not.toContain('emphasisCardClasses')
    expect(homeSource).not.toContain('className={`min-h-[132px] p-4 ${emphasizedCard}`}')
    expect(studentCardSource).toContain("neutral: 'border-slate-200 bg-slate-50 shadow-card'")
  })
})
