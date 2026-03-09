'use client'

import { useEffect, useMemo, useState } from 'react'
import Card from '@/components/ui/card'
import Button from '@/components/ui/button'
import Label from '@/components/ui/label'
import Avatar from '@/components/ui/Avatar'
import { useAdminBookSession, useAdminStudents, type AdminStudent } from '@/lib/adminBookingQueries'
import { useToast } from '@/components/ui/ToastProvider'
import { supabase } from '@/lib/supabaseClient'

type AvailableSession = {
  session_id: string
  start_at: string
  end_at: string
  status: 'scheduled' | 'cancelled'
  already_reserved: boolean
  distance_m: number
  bow_usage_type: 'shared_inventory' | 'assigned' | 'own'
  slot_capacity: number
  distance_reserved: number
  bow_capacity: number | null
  bow_reserved: number | null
  spots_for_student: number
}

function equipmentLabel(student: AdminStudent) {
  if (student.has_own_bow) return 'Arco propio'
  if (student.assigned_bow) return 'Arco asignado'
  if (student.bow_poundage) return `Arco academia ${student.bow_poundage} lb`
  return 'Sin equipo definido'
}

export default function AdminQuickBooking() {
  const [selectedStudent, setSelectedStudent] = useState('')
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [selectedSession, setSelectedSession] = useState('')
  const [adminNotes, setAdminNotes] = useState('')
  const [forceBooking, setForceBooking] = useState(false)
  const [sessions, setSessions] = useState<AvailableSession[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(false)

  const { data: students = [], isLoading: studentsLoading } = useAdminStudents()
  const bookSessionMutation = useAdminBookSession()
  const toast = useToast()

  const availableStudents = useMemo(
    () => students.filter((student) => student.status === 'active' && student.classes_remaining > 0),
    [students]
  )

  const selectedStudentData = availableStudents.find((student) => student.id === selectedStudent) || null

  useEffect(() => {
    const loadSessions = async () => {
      if (!selectedStudent) {
        setSessions([])
        return
      }

      try {
        setSessionsLoading(true)
        const [year, month] = selectedMonth.split('-').map(Number)
        const fromDate = new Date(year, month - 1, 1).toISOString().slice(0, 10)
        const toDate = new Date(year, month, 0).toISOString().slice(0, 10)

        const { data, error } = await supabase.rpc('get_available_sessions_for_student', {
          p_student_id: selectedStudent,
          p_date_from: fromDate,
          p_date_to: toDate,
        })

        if (error) {
          throw error
        }

        setSessions((data || []) as AvailableSession[])
      } catch (loadError) {
        console.error('Error loading available sessions for admin booking:', loadError)
        setSessions([])
      } finally {
        setSessionsLoading(false)
      }
    }

    loadSessions()
  }, [selectedMonth, selectedStudent])

  const groupedByDay = useMemo(() => {
    const grouped: Record<string, AvailableSession[]> = {}

    sessions.forEach((session) => {
      const dateKey = session.start_at.slice(0, 10)
      if (!grouped[dateKey]) grouped[dateKey] = []
      grouped[dateKey].push(session)
    })

    return Object.entries(grouped).sort(([left], [right]) => left.localeCompare(right))
  }, [sessions])

  const selectedSessionData = sessions.find((session) => session.session_id === selectedSession) || null

  const handleBooking = async () => {
    if (!selectedStudent || !selectedSession) return

    try {
      await bookSessionMutation.mutateAsync({
        sessionId: selectedSession,
        studentId: selectedStudent,
        adminNotes: adminNotes.trim() || undefined,
        forceBooking,
      })

      setSelectedStudent('')
      setSelectedSession('')
      setAdminNotes('')
      setForceBooking(false)
      setSessions([])
      toast.push({ message: 'Reserva creada correctamente.', type: 'success' })
    } catch (error: any) {
      toast.push({ message: error?.message || 'No se pudo crear la reserva.', type: 'error' })
    }
  }

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div>
          <h3 className="mb-2 text-lg font-semibold text-textpri">Reserva rapida</h3>
          <p className="text-sm text-textsec">Reserva un turno para cualquier alumno activo.</p>
        </div>

        <div>
          <Label htmlFor="student-select">1. Alumno</Label>
          <select
            id="student-select"
            value={selectedStudent}
            onChange={(event) => {
              setSelectedStudent(event.target.value)
              setSelectedSession('')
              setForceBooking(false)
            }}
            className="input mt-1"
            disabled={studentsLoading}
          >
            <option value="">{studentsLoading ? 'Cargando alumnos...' : 'Seleccionar alumno'}</option>
            {availableStudents.map((student) => (
              <option key={student.id} value={student.id}>
                {student.full_name} ({student.classes_remaining} clases)
              </option>
            ))}
          </select>
        </div>

        {selectedStudentData && (
          <div className="rounded-xl bg-bg/40 border border-white/10 p-4">
            <div className="flex items-start gap-3">
              <Avatar
                name={selectedStudentData.full_name}
                url={selectedStudentData.avatar_url || null}
                size="md"
              />
              <div className="text-sm text-textsec">
                <div className="font-medium text-textpri">{selectedStudentData.full_name}</div>
                <div className="mt-1">Membresia: {selectedStudentData.membership_type || 'Sin membresia'}</div>
                <div className="text-success">{selectedStudentData.classes_remaining} clases disponibles</div>
                <div className="mt-1 flex flex-wrap gap-3">
                  <span>{selectedStudentData.distance_m ? `${selectedStudentData.distance_m}m` : 'Sin distancia'}</span>
                  <span>{equipmentLabel(selectedStudentData)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div>
          <Label htmlFor="month-select">2. Mes</Label>
          <input
            id="month-select"
            type="month"
            className="input mt-1"
            value={selectedMonth}
            onChange={(event) => {
              setSelectedMonth(event.target.value)
              setSelectedSession('')
            }}
            disabled={!selectedStudent}
          />
        </div>

        <div>
          <Label htmlFor="session-select">3. Turno</Label>
          <select
            id="session-select"
            value={selectedSession}
            onChange={(event) => setSelectedSession(event.target.value)}
            className="input mt-1"
            disabled={!selectedStudent || sessionsLoading}
          >
            <option value="">
              {sessionsLoading
                ? 'Cargando turnos...'
                : !selectedStudent
                  ? 'Primero selecciona un alumno'
                  : 'Seleccionar turno'}
            </option>
            {groupedByDay.map(([date, daySessions]) => (
              <optgroup key={date} label={new Date(`${date}T00:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}>
                {daySessions.map((session) => (
                  <option key={session.session_id} value={session.session_id}>
                    {new Date(session.start_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} · {session.distance_m}m · {session.spots_for_student} cupos
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {selectedSessionData && (
          <div className="rounded-xl bg-bg/40 border border-white/10 p-4 text-sm text-textsec">
            <div className="font-medium text-textpri">
              {new Date(selectedSessionData.start_at).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
            </div>
            <div className="mt-1">
              {new Date(selectedSessionData.start_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} - {new Date(selectedSessionData.end_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
            </div>
            <div className="mt-1">
              Distancia: {selectedSessionData.distance_m}m
            </div>
            <div className="mt-1">
              Capacidad: {selectedSessionData.distance_reserved}/{selectedSessionData.slot_capacity}
            </div>
            {selectedSessionData.bow_usage_type === 'shared_inventory' && selectedSessionData.bow_capacity !== null && (
              <div className="mt-1">
                Inventario {selectedStudentData?.bow_poundage || '-'} lb: {(selectedSessionData.bow_reserved || 0)}/{selectedSessionData.bow_capacity}
              </div>
            )}
          </div>
        )}

        <div>
          <Label htmlFor="admin-notes">4. Notas</Label>
          <textarea
            id="admin-notes"
            rows={2}
            value={adminNotes}
            onChange={(event) => setAdminNotes(event.target.value)}
            className="input mt-1 resize-none"
            placeholder="Observaciones internas de la reserva"
            disabled={!selectedStudent || !selectedSession}
          />
        </div>

        <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-bg/40 p-3 text-sm text-textsec">
          <input
            type="checkbox"
            checked={forceBooking}
            onChange={(event) => setForceBooking(event.target.checked)}
            disabled={!selectedStudent || !selectedSession}
          />
          Forzar reserva aunque el turno este sin cupo
        </label>

        <Button
          onClick={handleBooking}
          disabled={!selectedStudent || !selectedSession || bookSessionMutation.isPending}
          className="w-full"
        >
          {bookSessionMutation.isPending ? 'Reservando...' : forceBooking ? 'Forzar reserva' : 'Reservar clase'}
        </Button>
      </div>
    </Card>
  )
}
