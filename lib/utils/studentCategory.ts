export const STUDENT_DIVISIONS = ['Recurvo', 'Compuesto', 'Raso'] as const
export const STUDENT_GENDERS = ['varones', 'damas'] as const

export type StudentDivision = (typeof STUDENT_DIVISIONS)[number]
export type StudentGender = (typeof STUDENT_GENDERS)[number]

function isValidDate(dateString: string | null | undefined) {
  if (!dateString) return false
  const date = new Date(dateString)
  return !Number.isNaN(date.getTime())
}

export function getStudentAgeCategory(
  dateOfBirth: string | null | undefined,
  referenceDate: Date = new Date()
): string | null {
  if (!isValidDate(dateOfBirth)) return null

  const birthDate = new Date(dateOfBirth as string)
  const turningAge = referenceDate.getFullYear() - birthDate.getFullYear()

  if (turningAge <= 9) return 'U10'
  if (turningAge <= 12) return 'U13'
  if (turningAge <= 14) return 'U15'
  if (turningAge <= 17) return 'U18'
  if (turningAge <= 20) return 'U21'
  if (turningAge <= 49) return 'Mayores'
  return 'Senior'
}

export function buildStudentCategory(input: {
  dateOfBirth?: string | null
  division?: string | null
  gender?: string | null
  fallbackCategory?: string | null
  referenceDate?: Date
}) {
  const division = input.division?.trim() || null
  const gender = input.gender?.trim() || null
  const ageCategory = getStudentAgeCategory(input.dateOfBirth, input.referenceDate)

  const parts = [division, ageCategory, gender].filter(Boolean)
  if (parts.length > 0) {
    return parts.join(' ')
  }

  return input.fallbackCategory?.trim() || null
}
