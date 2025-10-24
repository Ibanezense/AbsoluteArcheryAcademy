"use client"

import { useState, useMemo } from 'react'
import Card from '@/components/ui/card'
import Button from '@/components/ui/button'
import Label from '@/components/ui/label'
import { 
  useAdminStudents, 
  useAvailableSessions, 
  useAdminBookSession,
  type AdminStudent 
} from '@/lib/adminBookingQueries'

interface Session {
  id: string
  start_at: string
  end_at: string
  distance: number
  capacity: number
  spots_left: number
  instructor_name: string
}

export default function AdminQuickBooking() {
  const [selectedStudent, setSelectedStudent] = useState<string>('')
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [selectedSession, setSelectedSession] = useState<string>('')

  // Queries
  const { data: students = [], isLoading: studentsLoading } = useAdminStudents()
  const { data: sessions = [], isLoading: sessionsLoading } = useAvailableSessions()
  const bookSessionMutation = useAdminBookSession()

  // Filtrar solo estudiantes activos con clases disponibles
  const availableStudents = students.filter(s => 
    s.status === 'active' && s.classes_remaining > 0
  )

  // Obtener fechas únicas disponibles
  const availableDates = useMemo(() => {
    const dates = new Set<string>()
    sessions.forEach(session => {
      const date = new Date(session.start_at)
      const dateStr = date.toISOString().split('T')[0]
      dates.add(dateStr)
    })
    return Array.from(dates).sort()
  }, [sessions])

  // Filtrar sesiones por fecha seleccionada, distancia Y grupo del estudiante
  const sessionsForSelectedDate = useMemo(() => {
    if (!selectedDate) return []
    
    // Obtener la distancia y grupo del estudiante seleccionado
    const student = availableStudents.find(s => s.id === selectedStudent)
    const studentDistance = student?.distance_m
    const studentGroup = student?.group_type
    
    // Diagnóstico desactivado
    
    // Filtrar por fecha, distancia y disponibilidad de grupo
    const filtered = sessions.filter(session => {
      const date = new Date(session.start_at)
      const dateStr = date.toISOString().split('T')[0]
      
      // Debe coincidir la fecha
      if (dateStr !== selectedDate) return false
      
      // Si el estudiante tiene distancia configurada, solo mostrar esa distancia
      if (studentDistance !== null && studentDistance !== undefined) {
        if (session.distance !== studentDistance) return false
      }
      
      // Validar disponibilidad por grupo (excepto para ownbow)
      if (studentGroup && studentGroup !== 'ownbow') {
        const capacityKey = `capacity_${studentGroup}` as keyof typeof session
        const reservedKey = `reserved_${studentGroup}` as keyof typeof session
        
        const capacity = (session[capacityKey] as number) || 0
        const reserved = (session[reservedKey] as number) || 0
        const availableGroup = capacity - reserved
        
        // Si no hay cupos disponibles para este grupo, no mostrar esta sesión
        if (availableGroup <= 0) return false
      }
      
      return true
    })
    
    return filtered
  }, [sessions, selectedDate, selectedStudent, availableStudents])

  // Agrupar sesiones por horario (misma sesión puede aparecer con diferentes distancias)
  // Ahora que filtramos por distancia del estudiante, cada grupo tendrá solo una entrada
  const groupedSessions = useMemo(() => {
    const groups: Record<string, {
      sessionId: string
      start_at: string
      end_at: string
      instructor_name: string
      distance: number
      capacity: number
      spots_left: number
    }> = {}

    sessionsForSelectedDate.forEach(session => {
      // Usar solo session.id como key porque ya filtramos por distancia
      const key = session.id
      
      // Si ya existe, es la misma sesión (no debería pasar con el filtro por distancia)
      if (!groups[key]) {
        groups[key] = {
          sessionId: session.id,
          start_at: session.start_at,
          end_at: session.end_at,
          instructor_name: session.instructor_name,
          distance: session.distance,
          capacity: session.capacity,
          spots_left: session.spots_left
        }
      }
    })

    return Object.values(groups).sort((a, b) => a.start_at.localeCompare(b.start_at))
  }, [sessionsForSelectedDate])

  const handleBooking = async () => {
    if (!selectedStudent || !selectedSession) return

    try {
      await bookSessionMutation.mutateAsync({
        sessionId: selectedSession,
        studentId: selectedStudent,
      })
      
      // Limpiar selecciones después del éxito
      setSelectedStudent('')
      setSelectedDate('')
      setSelectedSession('')
      
      // Mostrar mensaje de éxito
      alert('Reserva creada exitosamente!')
      
      // Recargar la página para actualizar el panel de control
      window.location.reload()
    } catch (error: any) {
      alert(`Error: ${error.message}`)
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString + 'T00:00:00')
    return date.toLocaleDateString('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    })
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const selectedStudentData = availableStudents.find(s => s.id === selectedStudent)
  const selectedSessionGroup = groupedSessions.find(g => g.sessionId === selectedSession)

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-white mb-2">Reserva Rápida</h3>
          <p className="text-slate-400 text-sm">Reserva una clase para cualquier estudiante</p>
        </div>

        {/* Selector de Estudiante */}
        <div>
          <Label htmlFor="student-select" className="text-slate-300">1. Estudiante</Label>
          <select
            id="student-select"
            value={selectedStudent}
            onChange={(e) => {
              setSelectedStudent(e.target.value)
              setSelectedDate('')
              setSelectedSession('')
            }}
            className="input mt-1"
            disabled={studentsLoading}
          >
            <option value="">
              {studentsLoading ? 'Cargando estudiantes...' : 'Seleccionar estudiante'}
            </option>
            {availableStudents.map((student) => (
              <option key={student.id} value={student.id}>
                {student.full_name} ({student.classes_remaining} clases restantes)
              </option>
            ))}
          </select>
        </div>

        {/* Información del estudiante seleccionado */}
        {selectedStudentData && (
          <div className="bg-slate-800 rounded-lg p-3">
            <div className="text-sm text-slate-300">
              <span className="font-medium text-white">{selectedStudentData.full_name}</span>
              <div className="mt-1">
                <span>Membresía: {selectedStudentData.membership_type || 'No definida'}</span>
              </div>
              <div>
                <span className="text-green-400">{selectedStudentData.classes_remaining} clases disponibles</span>
              </div>
              <div className="flex gap-3 mt-1">
                {selectedStudentData.distance_m && (
                  <span className="text-blue-400">📏 {selectedStudentData.distance_m}m</span>
                )}
                {selectedStudentData.group_type && (
                  <span className="text-purple-400">
                    🎯 {selectedStudentData.group_type === 'children' ? 'Niños' :
                       selectedStudentData.group_type === 'youth' ? 'Jóvenes' :
                       selectedStudentData.group_type === 'adult' ? 'Adultos' :
                       selectedStudentData.group_type === 'assigned' ? 'Asignados' :
                       selectedStudentData.group_type === 'ownbow' ? 'Arco propio' : selectedStudentData.group_type}
                  </span>
                )}
              </div>
              {(!selectedStudentData.distance_m || !selectedStudentData.group_type) && (
                <div className="text-orange-400 text-xs mt-2 p-2 bg-orange-500/10 rounded">
                  ⚠️ Configura distancia y grupo en el perfil del estudiante
                </div>
              )}
            </div>
          </div>
        )}

        {/* Selector de Fecha */}
        <div>
          <Label htmlFor="date-select" className="text-slate-300">2. Fecha</Label>
          <select
            id="date-select"
            value={selectedDate}
            onChange={(e) => {
              setSelectedDate(e.target.value)
              setSelectedSession('')
            }}
            className="input mt-1"
            disabled={sessionsLoading || !selectedStudent}
          >
            <option value="">
              {sessionsLoading 
                ? 'Cargando fechas...' 
                : !selectedStudent 
                ? 'Primero selecciona un estudiante'
                : 'Seleccionar fecha'
              }
            </option>
            {availableDates.map((date) => (
              <option key={date} value={date}>
                {formatDate(date)}
              </option>
            ))}
          </select>
        </div>

        {/* Selector de Turno */}
        <div>
          <Label htmlFor="session-select" className="text-slate-300">3. Turno Disponible</Label>
          <select
            id="session-select"
            value={selectedSession}
            onChange={(e) => setSelectedSession(e.target.value)}
            className="input mt-1"
            disabled={sessionsLoading || !selectedDate}
          >
            <option value="">
              {sessionsLoading 
                ? 'Cargando turnos...' 
                : !selectedDate 
                ? 'Primero selecciona una fecha'
                : groupedSessions.length === 0
                ? 'No hay turnos disponibles'
                : 'Seleccionar turno'
              }
            </option>
            {groupedSessions.map((group) => (
              <option key={group.sessionId} value={group.sessionId}>
                {formatTime(group.start_at)} - {formatTime(group.end_at)} • {group.distance}m ({group.spots_left} cupos)
              </option>
            ))}
          </select>
        </div>

        {/* Información de la sesión seleccionada */}
        {selectedSessionGroup && (
          <div className="bg-slate-800 rounded-lg p-3">
            <div className="text-sm text-slate-300">
              <div className="font-medium text-white">
                {formatTime(selectedSessionGroup.start_at)} - {formatTime(selectedSessionGroup.end_at)}
              </div>
              <div className="mt-1">
                <span>Distancia: {selectedSessionGroup.distance}m</span>
                <span className="mx-2">•</span>
                <span>Instructor: {selectedSessionGroup.instructor_name || 'Sin asignar'}</span>
              </div>
              <div>
                <span className="text-blue-400">
                  {selectedSessionGroup.spots_left} de {selectedSessionGroup.capacity} cupos disponibles
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Botón de reserva */}
        <Button
          onClick={handleBooking}
          disabled={!selectedStudent || !selectedSession || bookSessionMutation.isPending}
          className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-gray-600"
        >
          {bookSessionMutation.isPending ? 'Reservando...' : 'Reservar Clase'}
        </Button>

        {/* Resumen de estudiantes sin clases */}
        {students.length > 0 && (
          <div className="pt-2 border-t border-slate-700">
            <div className="text-xs text-slate-400">
              {availableStudents.length} estudiantes con clases disponibles
              {students.filter(s => s.classes_remaining === 0).length > 0 && (
                <span className="ml-2 text-red-400">
                  • {students.filter(s => s.classes_remaining === 0).length} sin clases
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}