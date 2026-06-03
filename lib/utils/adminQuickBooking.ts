export type QuickBookingStudent = {
  id: string
  full_name: string
  status: string
  classes_remaining: number
}

function toLocalDateInputValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getAdminQuickBookingDateRange(selectedDateOrMonth: string, now = new Date()) {
  const monthKey = selectedDateOrMonth.slice(0, 7)
  const [year, month] = monthKey.split('-').map(Number)
  const monthStart = new Date(year, month - 1, 1)
  const monthEnd = new Date(year, month, 0)
  const minDateValue = new Date(now)
  minDateValue.setHours(0, 0, 0, 0)
  minDateValue.setDate(minDateValue.getDate() - 7)

  const from = monthStart < minDateValue ? minDateValue : monthStart

  return {
    fromDate: toLocalDateInputValue(from),
    toDate: toLocalDateInputValue(monthEnd),
    minDate: toLocalDateInputValue(minDateValue),
  }
}

export function getQuickBookingStudentOptions<T extends QuickBookingStudent>(
  students: T[],
  search = '',
  limit = 60
) {
  const normalizedSearch = search.trim().toLowerCase()

  return students
    .filter((student) => student.status !== 'inactive')
    .filter((student) => (
      normalizedSearch.length === 0
        || student.full_name.toLowerCase().includes(normalizedSearch)
    ))
    .slice(0, limit)
}
