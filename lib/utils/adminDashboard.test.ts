import { describe, expect, it } from 'vitest'
import {
  filterAgendaItems,
  getAlertSeverity,
  normalizeAdminDashboardData,
} from '@/lib/utils/adminDashboard'

describe('normalizeAdminDashboardData', () => {
  it('returns a stable empty dashboard model for missing rpc data', () => {
    const dashboard = normalizeAdminDashboardData(null)

    expect(dashboard.today).toEqual({
      reservationsToday: 0,
      scheduledSessionsToday: 0,
      availableSlotsToday: null,
      pendingConfirmations: 0,
      attendancePending: 0,
    })
    expect(dashboard.alerts.pendingPayments).toBeNull()
    expect(dashboard.monthly.trialConversionRate).toBeNull()
    expect(dashboard.weeklyAgenda).toEqual([])
    expect(dashboard.weeklyOccupancy).toEqual([])
    expect(dashboard.studentsByLevel.competitive).toBe(0)
  })

  it('normalizes arrays, invalid status values, and null numeric fields safely', () => {
    const dashboard = normalizeAdminDashboardData({
      today: {
        reservationsToday: '4',
        scheduledSessionsToday: 2,
        availableSlotsToday: null,
        pendingConfirmations: 1,
        attendancePending: 3,
      },
      alerts: {
        expiringMemberships: 2,
        studentsWithoutClasses: 5,
        pendingPayments: 7,
        trialClassesWithoutFollowUp: 0,
        recentNoShows: 1,
      },
      monthly: {
        activeStudents: 40,
        newStudentsThisMonth: 3,
        trialClassesThisMonth: 6,
        trialConversionRate: null,
        revenueThisMonth: 2400,
        weeklyOccupancyRate: 62,
      },
      weeklyAgenda: [
        {
          id: 'booking-1',
          personName: 'Fabian Ibanez',
          phone: '999111222',
          date: '2026-04-30',
          startTime: '16:00',
          durationMinutes: 90,
          type: 'regular',
          status: 'reserved',
          href: '/admin/alumnos/student-1',
        },
        {
          id: 'booking-2',
          personName: 'Prospecto',
          date: '2026-05-01',
          startTime: '10:00',
          durationMinutes: 60,
          type: 'trial',
          status: 'unexpected',
        },
      ],
      weeklyOccupancy: [
        { day: 'Lun', usedSlots: 3, totalSlots: 10, occupancyRate: 30 },
        { day: 'Mar', usedSlots: 0, totalSlots: null, occupancyRate: null },
      ],
      studentsByLevel: {
        beginner: 8,
        developing: 14,
        advanced: 10,
        competitive: 8,
      },
    })

    expect(dashboard.today.reservationsToday).toBe(4)
    expect(dashboard.weeklyAgenda[0].status).toBe('confirmed')
    expect(dashboard.weeklyAgenda[1].status).toBe('pending')
    expect(dashboard.weeklyOccupancy[1].occupancyRate).toBeNull()
  })
})

describe('filterAgendaItems', () => {
  const agenda = normalizeAdminDashboardData({
    weeklyAgenda: [
      {
        id: 'today-confirmed',
        personName: 'Hoy',
        date: '2026-04-30',
        startTime: '16:00',
        durationMinutes: 90,
        type: 'regular',
        status: 'confirmed',
      },
      {
        id: 'tomorrow-no-show',
        personName: 'Manana',
        date: '2026-05-01',
        startTime: '17:30',
        durationMinutes: 90,
        type: 'trial',
        status: 'no_show',
      },
    ],
  }).weeklyAgenda

  it('filters by date and operational status', () => {
    expect(filterAgendaItems(agenda, 'today', '2026-04-30').map((item) => item.id)).toEqual([
      'today-confirmed',
    ])
    expect(filterAgendaItems(agenda, 'tomorrow', '2026-04-30').map((item) => item.id)).toEqual([
      'tomorrow-no-show',
    ])
    expect(filterAgendaItems(agenda, 'no_show', '2026-04-30').map((item) => item.id)).toEqual([
      'tomorrow-no-show',
    ])
  })
})

describe('getAlertSeverity', () => {
  it('marks pending work as normal, warning, or critical by count', () => {
    expect(getAlertSeverity(0)).toBe('normal')
    expect(getAlertSeverity(2)).toBe('warning')
    expect(getAlertSeverity(8)).toBe('critical')
  })
})
