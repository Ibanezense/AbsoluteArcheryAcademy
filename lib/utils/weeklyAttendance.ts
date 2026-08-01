import dayjs from 'dayjs'

export type WeeklyAttendanceWindow = {
  isSunday: boolean
  weekStart: string
  weekEnd: string
}

export function getWeeklyAttendanceWindow(date: string): WeeklyAttendanceWindow {
  const selectedDate = dayjs(date)

  if (!selectedDate.isValid()) {
    throw new Error('Fecha de revisión semanal inválida')
  }

  return {
    isSunday: selectedDate.day() === 0,
    weekStart: selectedDate.subtract(3, 'day').format('YYYY-MM-DD'),
    weekEnd: selectedDate.format('YYYY-MM-DD'),
  }
}
