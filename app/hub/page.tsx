'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Avatar from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/Spinner'
import { supabase } from '@/lib/supabaseClient'
import { useStudentContext } from '@/lib/hooks/useStudentContext'

export default function HubPage() {
  const router = useRouter()
  const {
    account,
    students,
    activeStudentId,
    setActiveStudentId,
    loading,
    error,
  } = useStudentContext()

  const signOut = async () => {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  useEffect(() => {
    if (account?.role === 'admin') {
      router.replace('/admin')
    }

    if (account?.role === 'student' || (account?.role === 'guardian' && students.length === 1)) {
      router.replace('/')
    }
  }, [account?.role, students.length, router])

  const selectStudent = (studentId: string) => {
    setActiveStudentId(studentId)
    router.replace('/')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <Spinner />
      </div>
    )
  }

  // Prevenir parpadeo de UI mientras el useEffect ejecuta la redireccion
  if (account?.role === 'student' || (account?.role === 'guardian' && students.length === 1) || account?.role === 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <Spinner />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="card p-6 text-center max-w-md">
          <p className="text-danger mb-4">{error}</p>
          <button className="btn w-full" onClick={() => window.location.reload()}>
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg text-textpri py-6">
      <div className="space-y-5">
        <header className="card p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm text-textsec">Hub de acceso</p>
              <h1 className="text-2xl font-semibold mt-1">
                {account?.full_name || 'Tutor'}
              </h1>
              <p className="text-sm text-textsec mt-2">
                Elige el alumno que quieres revisar en la app.
              </p>
            </div>
            <button className="btn-outline shrink-0" onClick={signOut}>
              Salir
            </button>
          </div>
        </header>

        {students.length === 0 ? (
          <div className="card p-5">
            <p className="text-textsec">
              Esta cuenta no tiene alumnos vinculados todavia.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {students.map((student) => {
              const isSelected = student.student_id === activeStudentId
              const stData = student as any
              const classesRem = stData.classes_remaining ?? null
              const nextBooking = stData.next_booking_at ?? null
              const memStatus = stData.membership_status ?? null

              return (
                <button
                  key={student.student_id}
                  type="button"
                  onClick={() => selectStudent(student.student_id)}
                  className={`card p-4 w-full text-left transition border ${isSelected ? 'border-accent/40 bg-accent/5' : 'border-white/10'
                    }`}
                >
                  <div className="flex items-center gap-4">
                    <Avatar
                      url={student.avatar_url}
                      name={student.full_name}
                      size="md"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-3">
                        <h2 className="font-medium truncate">{student.full_name}</h2>
                        {isSelected && (
                          <span className="text-xs px-2 py-1 rounded-full bg-accent/20 text-accent">
                            Activo
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-textsec mt-1">
                        {student.current_distance_m ? `${student.current_distance_m} m` : 'Sin distancia'}
                        {' · '}
                        {student.level || 'Sin nivel'}
                      </p>
                      {/* Resumen de membresía y próxima clase */}
                      <div className="flex items-center gap-3 mt-2 text-xs">
                        {classesRem !== null && memStatus === 'active' ? (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium ${classesRem === 0 ? 'bg-danger/10 text-danger' :
                            classesRem <= 2 ? 'bg-warning/10 text-warning' :
                              'bg-success/10 text-success'
                            }`}>
                            {classesRem} {classesRem === 1 ? 'clase' : 'clases'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-line/40 text-textsec font-medium">
                            Sin membresía
                          </span>
                        )}
                        {nextBooking && (
                          <span className="text-textsec">
                            Próx: {new Date(nextBooking).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
