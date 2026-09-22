export const WEEKEND_INTRO_CAPACITY_QUERY_KEY = ['admin-weekend-intro-capacity'] as const

export type WeekendIntroCapacityStatus =
  | 'available'
  | 'last_spot'
  | 'full'
  | 'finished'
  | 'not_scheduled'

export type WeekendIntroCapacitySession = {
  sessionId: string
  startAt: string
  endAt: string
  equipmentCapacity: number
  equipmentReserved: number
  spotsRemaining: number
  academyCapacity: number
  academyBowsUsed: number
  introBowsCapacity: number
  introBowsUsed: number
  locationId: string
  locationCode: string
  locationName: string
}

export type WeekendIntroCapacityDay =
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday'

export type WeekendIntroCapacitySlot = {
  day: WeekendIntroCapacityDay
  position: number
  session: WeekendIntroCapacitySession | null
  status: WeekendIntroCapacityStatus
}

const LIMA_TIME_ZONE = 'America/Lima'
const DAY_MILLISECONDS = 24 * 60 * 60 * 1000

const limaDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: LIMA_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function formatDateParts(formatter: Intl.DateTimeFormat, date: Date): string {
  const parts = formatter.formatToParts(date)
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value

  return `${year}-${month}-${day}`
}

export function getLimaReferenceDate(now: Date): string {
  return formatDateParts(limaDateFormatter, now)
}

function addCalendarDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number)
  const result = new Date(Date.UTC(year, month - 1, day) + days * DAY_MILLISECONDS)

  return result.toISOString().slice(0, 10)
}

export function getCurrentIntroWeekDates(now: Date): Record<WeekendIntroCapacityDay, string> {
  const referenceDate = getLimaReferenceDate(now)
  const referenceUtc = new Date(`${referenceDate}T00:00:00Z`)
  const daysSinceMonday = (referenceUtc.getUTCDay() + 6) % 7
  const monday = addCalendarDays(referenceDate, -daysSinceMonday)

  return {
    wednesday: addCalendarDays(monday, 2),
    thursday: addCalendarDays(monday, 3),
    friday: addCalendarDays(monday, 4),
    saturday: addCalendarDays(monday, 5),
    sunday: addCalendarDays(monday, 6),
  }
}

function getSessionStatus(
  session: WeekendIntroCapacitySession,
  startTime: number,
  nowTime: number,
): WeekendIntroCapacityStatus {
  if (startTime <= nowTime) return 'finished'
  if (session.spotsRemaining <= 0) return 'full'
  if (session.spotsRemaining === 1) return 'last_spot'

  return 'available'
}

function buildDaySlots(
  day: WeekendIntroCapacityDay,
  sessions: WeekendIntroCapacitySession[],
  nowTime: number,
): WeekendIntroCapacitySlot[] {
  return sessions.map((session, position) => ({
    day,
    position,
    session,
    status: getSessionStatus(session, new Date(session.startAt).getTime(), nowTime),
  }))
}

export function buildWeekendIntroSlots(
  sessions: WeekendIntroCapacitySession[],
  now: Date,
): WeekendIntroCapacitySlot[] {
  const weekDates = getCurrentIntroWeekDates(now)
  const nowTime = now.getTime()
  const validSessions = sessions
    .map((session) => ({
      session,
      startTime: new Date(session.startAt).getTime(),
      endTime: new Date(session.endAt).getTime(),
    }))
    .filter(({ startTime, endTime }) => Number.isFinite(startTime) && Number.isFinite(endTime))
    .sort((left, right) => {
      if (left.startTime !== right.startTime) return left.startTime - right.startTime
      return left.session.sessionId.localeCompare(right.session.sessionId)
    })

  const sessionsByDay: Record<WeekendIntroCapacityDay, WeekendIntroCapacitySession[]> = {
    wednesday: [],
    thursday: [],
    friday: [],
    saturday: [],
    sunday: [],
  }
  const expectedLocationByDay: Record<WeekendIntroCapacityDay, string> = {
    wednesday: 'umacollo',
    thursday: 'umacollo',
    friday: 'umacollo',
    saturday: 'tiabaya',
    sunday: 'tiabaya',
  }

  for (const { session, startTime } of validSessions) {
    const limaDate = getLimaReferenceDate(new Date(startTime))
    const day = (Object.keys(weekDates) as WeekendIntroCapacityDay[]).find(
      (candidate) => weekDates[candidate] === limaDate,
    )

    if (day && session.locationCode.toLowerCase() === expectedLocationByDay[day]) {
      sessionsByDay[day].push(session)
    }
  }

  return (Object.keys(sessionsByDay) as WeekendIntroCapacityDay[]).flatMap((day) =>
    buildDaySlots(day, sessionsByDay[day], nowTime),
  )
}
