'use client'

import { useWeeklySessions } from '@/lib/queries'
import { useAppSettings } from '@/lib/appSettingsQueries'
import { SessionDetailSheet } from './session-detail-sheet'
import { useState } from 'react'

export function WeeklySchedule() {
  const { data: sessions, isLoading, error } = useWeeklySessions()
  const { data: settings } = useAppSettings(null)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)

  // Obtener días habilitados desde la configuración
  const getEnabledDays = () => {
    if (!settings) return [true, true, true, true, true, true, true] // Default: todos habilitados
    
    return [
      settings.operating_hours_monday_enabled || false,
      settings.operating_hours_tuesday_enabled || false,
      settings.operating_hours_wednesday_enabled || false,
      settings.operating_hours_thursday_enabled || false,
      settings.operating_hours_friday_enabled || false,
      settings.operating_hours_saturday_enabled || false,
      settings.operating_hours_sunday_enabled || false
    ]
  }

  const enabledDays = getEnabledDays()
  const filteredDaysData = enabledDays.map((enabled, index) => ({
    enabled,
    dayName: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'][index],
    dayIndex: index
  })).filter(day => day.enabled)

  if (isLoading) {
    return (
  <div className="bg-[#161a23] border border-white/10 rounded-xl p-6 shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
        <div className="space-y-4">
          <div className="h-6 bg-gray-700 rounded animate-pulse w-48"></div>
          <div className="grid grid-cols-8 gap-2 mb-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-8 bg-gray-700 rounded animate-pulse"></div>
            ))}
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="grid grid-cols-8 gap-2">
              {Array.from({ length: 8 }).map((_, j) => (
                <div key={j} className="h-16 bg-gray-700 rounded animate-pulse"></div>
              ))}
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-4">
        <p className="text-red-400 text-sm">Error cargando horarios</p>
      </div>
    )
  }

  // Get current date info
  const today = new Date()
  const currentDay = today.getDay() // 0 = Sunday, 1 = Monday, etc.
  const currentDate = today.getDate()

  // Get dates for the current week (only for enabled days)
  const getWeekDates = () => {
    const startOfWeek = new Date(today)
    const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay
    startOfWeek.setDate(today.getDate() + mondayOffset)
    
    return filteredDaysData.map(day => {
      const date = new Date(startOfWeek)
      date.setDate(startOfWeek.getDate() + day.dayIndex)
      return date.getDate()
    })
  }

  const weekDates = getWeekDates()
  const todayIndex = currentDay === 0 ? 6 : currentDay - 1

  // Group sessions by day
  const sessionsByDay = sessions?.reduce((acc, session) => {
    const sessionDate = new Date(session.start_at)
    const dayIndex = sessionDate.getDay() === 0 ? 6 : sessionDate.getDay() - 1 // Convert to Monday=0 format
    if (!acc[dayIndex]) acc[dayIndex] = []
    acc[dayIndex].push(session)
    return acc
  }, {} as Record<number, typeof sessions>) || {}

  // Time slots (assuming 9 AM to 6 PM)
  const timeSlots = [
    '05:00', '06:00', '07:00', '08:00', '09:00', '10:00'
  ]

  return (
    <>
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-semibold text-white">Horario Semanal</h3>
          <div className="flex items-center gap-2">
            <button className="hover-accent p-2 rounded-lg transition-colors">
              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button className="hover-accent p-2 rounded-lg transition-colors">
              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
        
        {/* Day headers */}
        <div className={`grid gap-2 mb-4`} style={{ gridTemplateColumns: `60px repeat(${filteredDaysData.length}, 1fr)` }}>
          <div></div> {/* Empty cell for time column */}
          {filteredDaysData.map((day, index) => (
            <div
              key={day.dayIndex}
              className={`text-center py-3 px-3 rounded-lg font-medium transition-colors ${
                day.dayIndex === todayIndex
                  ? 'today-active'
                  : 'text-slate-300 hover-accent'
              }`}
            >
              <div className="text-sm">{day.dayName}</div>
              <div className="text-lg font-bold mt-1">{weekDates[index]}</div>
            </div>
          ))}
        </div>

        {/* Schedule grid */}
        <div className="space-y-2">
          {timeSlots.map((time) => (
            <div key={time} className={`grid gap-2`} style={{ gridTemplateColumns: `60px repeat(${filteredDaysData.length}, 1fr)` }}>
              {/* Time column */}
              <div className="flex items-center justify-center text-slate-400 text-sm font-medium py-4">
                {time}
              </div>
              
              {/* Day columns - only for enabled days */}
              {filteredDaysData.map((day) => {
                const dayHour = parseInt(time.split(':')[0])
                
                // Find sessions for this day and hour
                const daySessions = sessionsByDay[day.dayIndex] || []
                const hourSessions = daySessions.filter(session => {
                  const sessionHour = new Date(session.start_at).getHours()
                  return sessionHour === dayHour
                })

                if (hourSessions.length > 0) {
                  const session = hourSessions[0] // Take the first session if multiple
                  const occupancyRate = session.capacity > 0 
                    ? (session.reservation_count / session.capacity) * 100 
                    : 0
                  
                  return (
                    <button
                      key={day.dayIndex}
                      onClick={() => setSelectedSessionId(session.session_id)}
                      className="bg-white/10 border border-white/10 rounded-lg p-3 hover:border-white/20 transition-all text-left group min-h-[80px]"
                    >
                      <div className="text-xs text-slate-300 mb-1">
                        {session.start_time} - {session.end_time}
                      </div>
                      <div className="text-xs text-white font-medium mb-2">
                        🏹 Coach {session.instructor_name || 'John'}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-white/20 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full transition-all ${
                              occupancyRate >= 100 ? 'bg-red-500' :
                              occupancyRate >= 80 ? 'bg-yellow-500' :
                              'bg-green-500'
                            }`}
                            style={{ width: `${Math.min(occupancyRate, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-400">
                          {occupancyRate.toFixed(0)}% • {session.reservation_count}/{session.capacity}
                        </span>
                      </div>
                    </button>
                  )
                }

                return (
                  <div
                    key={day.dayIndex}
                    className="bg-black/20 border border-white/10 rounded-lg p-3 min-h-[80px] flex items-center justify-center"
                  >
                    <span className="text-slate-600 text-xs">No hay sesiones</span>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {selectedSessionId && (
        <SessionDetailSheet
          sessionId={selectedSessionId}
          isOpen={!!selectedSessionId}
          onClose={() => setSelectedSessionId(null)}
        />
      )}
    </>
  )
}