export type DashboardAgendaType = 'trial' | 'regular' | 'cct' | 'other'
export type DashboardAgendaStatus =
  | 'pending'
  | 'confirmed'
  | 'attended'
  | 'no_show'
  | 'converted'
  | 'cancelled'

export type DashboardAlertSeverity = 'normal' | 'warning' | 'critical'
export type DashboardAgendaFilter =
  | 'today'
  | 'tomorrow'
  | 'week'
  | 'pending'
  | 'confirmed'
  | 'no_show'

export type AdminDashboardAgendaItem = {
  id: string
  bookingId?: string | null
  sessionId?: string | null
  studentId?: string | null
  introClientId?: string | null
  personName: string
  phone?: string | null
  date: string
  startTime: string
  durationMinutes: number
  type: DashboardAgendaType
  status: DashboardAgendaStatus
  distanceM?: number | null
  href?: string
}

export type AdminDashboardData = {
  today: {
    reservationsToday: number
    scheduledSessionsToday: number
    availableSlotsToday: number | null
    pendingConfirmations: number
    attendancePending: number
  }
  alerts: {
    expiringMemberships: number
    studentsWithoutClasses: number
    pendingPayments: number | null
    trialClassesWithoutFollowUp: number
    recentNoShows: number
  }
  monthly: {
    activeStudents: number
    newStudentsThisMonth: number
    trialClassesThisMonth: number
    trialConversionRate: number | null
    revenueThisMonth: number
    weeklyOccupancyRate: number | null
  }
  weeklyAgenda: AdminDashboardAgendaItem[]
  weeklyOccupancy: Array<{
    day: string
    usedSlots: number
    totalSlots: number | null
    occupancyRate: number | null
  }>
  studentsByLevel: {
    beginner: number
    developing: number
    advanced: number
    competitive: number
  }
}

export type AdminStudentSearchResult = {
  id: string
  fullName: string
  dni: string | null
  phone: string | null
  email: string | null
  currentDistanceM: number | null
  membershipStatus: string
  classesRemaining: number
  href: string
}

export const emptyAdminDashboardData: AdminDashboardData = {
  today: {
    reservationsToday: 0,
    scheduledSessionsToday: 0,
    availableSlotsToday: null,
    pendingConfirmations: 0,
    attendancePending: 0,
  },
  alerts: {
    expiringMemberships: 0,
    studentsWithoutClasses: 0,
    pendingPayments: null,
    trialClassesWithoutFollowUp: 0,
    recentNoShows: 0,
  },
  monthly: {
    activeStudents: 0,
    newStudentsThisMonth: 0,
    trialClassesThisMonth: 0,
    trialConversionRate: null,
    revenueThisMonth: 0,
    weeklyOccupancyRate: null,
  },
  weeklyAgenda: [],
  weeklyOccupancy: [],
  studentsByLevel: {
    beginner: 0,
    developing: 0,
    advanced: 0,
    competitive: 0,
  },
}

function toRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {}
}

function toArray(value: unknown): any[] {
  return Array.isArray(value) ? value : []
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = toNumber(value, Number.NaN)
  return Number.isFinite(parsed) ? parsed : null
}

function toStringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function normalizeAgendaStatus(value: unknown): DashboardAgendaStatus {
  switch (value) {
    case 'reserved':
      return 'confirmed'
    case 'pending':
    case 'confirmed':
    case 'attended':
    case 'no_show':
    case 'converted':
    case 'cancelled':
      return value
    default:
      return 'pending'
  }
}

function normalizeAgendaType(value: unknown): DashboardAgendaType {
  switch (value) {
    case 'trial':
    case 'regular':
    case 'cct':
    case 'other':
      return value
    default:
      return 'other'
  }
}

export function normalizeAdminDashboardData(raw: unknown): AdminDashboardData {
  const source = toRecord(raw)
  const today = toRecord(source.today)
  const alerts = toRecord(source.alerts)
  const monthly = toRecord(source.monthly)
  const studentsByLevel = toRecord(source.studentsByLevel)

  return {
    today: {
      reservationsToday: toNumber(today.reservationsToday),
      scheduledSessionsToday: toNumber(today.scheduledSessionsToday),
      availableSlotsToday: toNullableNumber(today.availableSlotsToday),
      pendingConfirmations: toNumber(today.pendingConfirmations),
      attendancePending: toNumber(today.attendancePending),
    },
    alerts: {
      expiringMemberships: toNumber(alerts.expiringMemberships),
      studentsWithoutClasses: toNumber(alerts.studentsWithoutClasses),
      pendingPayments: toNullableNumber(alerts.pendingPayments),
      trialClassesWithoutFollowUp: toNumber(alerts.trialClassesWithoutFollowUp),
      recentNoShows: toNumber(alerts.recentNoShows),
    },
    monthly: {
      activeStudents: toNumber(monthly.activeStudents),
      newStudentsThisMonth: toNumber(monthly.newStudentsThisMonth),
      trialClassesThisMonth: toNumber(monthly.trialClassesThisMonth),
      trialConversionRate: toNullableNumber(monthly.trialConversionRate),
      revenueThisMonth: toNumber(monthly.revenueThisMonth),
      weeklyOccupancyRate: toNullableNumber(monthly.weeklyOccupancyRate),
    },
    weeklyAgenda: toArray(source.weeklyAgenda).map((item) => {
      const row = toRecord(item)
      return {
        id: toStringValue(row.id),
        bookingId: row.bookingId ?? null,
        sessionId: row.sessionId ?? null,
        studentId: row.studentId ?? null,
        introClientId: row.introClientId ?? null,
        personName: toStringValue(row.personName, 'Sin nombre'),
        phone: row.phone ?? null,
        date: toStringValue(row.date),
        startTime: toStringValue(row.startTime),
        durationMinutes: Math.max(toNumber(row.durationMinutes, 90), 0),
        type: normalizeAgendaType(row.type),
        status: normalizeAgendaStatus(row.status),
        distanceM: toNullableNumber(row.distanceM),
        href: typeof row.href === 'string' ? row.href : undefined,
      }
    }),
    weeklyOccupancy: toArray(source.weeklyOccupancy).map((item) => {
      const row = toRecord(item)
      return {
        day: toStringValue(row.day),
        usedSlots: toNumber(row.usedSlots),
        totalSlots: toNullableNumber(row.totalSlots),
        occupancyRate: toNullableNumber(row.occupancyRate),
      }
    }),
    studentsByLevel: {
      beginner: toNumber(studentsByLevel.beginner),
      developing: toNumber(studentsByLevel.developing),
      advanced: toNumber(studentsByLevel.advanced),
      competitive: toNumber(studentsByLevel.competitive),
    },
  }
}

function addDays(date: string, days: number): string {
  const current = new Date(`${date}T00:00:00`)
  current.setDate(current.getDate() + days)
  return current.toISOString().slice(0, 10)
}

export function filterAgendaItems(
  items: AdminDashboardAgendaItem[],
  filter: DashboardAgendaFilter,
  today: string
) {
  if (filter === 'today') return items.filter((item) => item.date === today)
  if (filter === 'tomorrow') return items.filter((item) => item.date === addDays(today, 1))
  if (filter === 'pending') return items.filter((item) => item.status === 'pending')
  if (filter === 'confirmed') return items.filter((item) => item.status === 'confirmed')
  if (filter === 'no_show') return items.filter((item) => item.status === 'no_show')
  return items
}

export function getAlertSeverity(count: number): DashboardAlertSeverity {
  if (count <= 0) return 'normal'
  if (count >= 5) return 'critical'
  return 'warning'
}

export function normalizeStudentSearchResults(raw: unknown): AdminStudentSearchResult[] {
  return toArray(raw).map((item) => {
    const row = toRecord(item)
    const id = toStringValue(row.id)
    return {
      id,
      fullName: toStringValue(row.full_name ?? row.fullName, 'Sin nombre'),
      dni: row.dni ?? null,
      phone: row.phone ?? null,
      email: row.email ?? null,
      currentDistanceM: toNullableNumber(row.current_distance_m ?? row.currentDistanceM),
      membershipStatus: toStringValue(row.membership_status ?? row.membershipStatus, 'unknown'),
      classesRemaining: toNumber(row.classes_remaining ?? row.classesRemaining),
      href: toStringValue(row.href, `/admin/alumnos/${id}`),
    }
  })
}
