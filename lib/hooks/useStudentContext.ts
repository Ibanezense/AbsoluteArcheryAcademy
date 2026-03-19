'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

const ACTIVE_STUDENT_STORAGE_KEY = 'activeStudentId'

export type AccountRole = 'admin' | 'guardian' | 'student'

export type AccountProfile = {
  id: string
  full_name: string | null
  role: AccountRole
}

export type AccessibleStudent = {
  student_id: string
  full_name: string
  avatar_url: string | null
  current_distance_m: number | null
  level: string | null
  is_active: boolean
  relationship: string | null
  self_profile_id: string | null
  classes_remaining: number | null
  membership_status: string | null
  next_booking_at: string | null
}

export function useStudentContext() {
  const [account, setAccount] = useState<AccountProfile | null>(null)
  const [students, setStudents] = useState<AccessibleStudent[]>([])
  const [activeStudentId, setActiveStudentIdState] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadContext = async () => {
      try {
        setLoading(true)
        setError(null)

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          setAccount(null)
          setStudents([])
          setActiveStudentIdState(null)
          return
        }

        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('id, full_name, role')
          .eq('id', user.id)
          .single()

        if (profileError || !profileData) {
          throw new Error(profileError?.message || 'No se pudo cargar la cuenta.')
        }

        const currentAccount = profileData as AccountProfile
        setAccount(currentAccount)

        const { data: studentsData, error: studentsError } = await supabase.rpc('get_my_children')
        if (studentsError) {
          throw new Error(studentsError.message)
        }

        const availableStudents = ((studentsData || []) as any[]).map((student) => ({
          ...student,
          classes_remaining: student?.classes_remaining ?? null,
          membership_status: student?.membership_status ?? null,
          next_booking_at: student?.next_booking_at ?? null,
        })) as AccessibleStudent[]
        setStudents(availableStudents)

        const storedStudentId = typeof window === 'undefined'
          ? null
          : window.localStorage.getItem(ACTIVE_STUDENT_STORAGE_KEY)

        let nextStudentId: string | null = null

        if (currentAccount.role === 'student') {
          nextStudentId = availableStudents[0]?.student_id || null
        } else if (currentAccount.role === 'guardian') {
          const storedStudentExists = availableStudents.some(student => student.student_id === storedStudentId)
          if (storedStudentId && storedStudentExists) {
            nextStudentId = storedStudentId
          } else if (availableStudents.length === 1) {
            nextStudentId = availableStudents[0].student_id
          }
        }

        setActiveStudentIdState(nextStudentId)

        if (typeof window !== 'undefined') {
          if (nextStudentId) {
            window.localStorage.setItem(ACTIVE_STUDENT_STORAGE_KEY, nextStudentId)
          } else {
            window.localStorage.removeItem(ACTIVE_STUDENT_STORAGE_KEY)
          }
        }
      } catch (loadError: any) {
        setError(loadError?.message || 'No se pudo cargar el contexto del alumno.')
      } finally {
        setLoading(false)
      }
    }

    loadContext()
  }, [])

  const setActiveStudentId = (studentId: string | null) => {
    setActiveStudentIdState(studentId)
    if (typeof window === 'undefined') return

    if (studentId) {
      window.localStorage.setItem(ACTIVE_STUDENT_STORAGE_KEY, studentId)
    } else {
      window.localStorage.removeItem(ACTIVE_STUDENT_STORAGE_KEY)
    }
  }

  const activeStudent = students.find(student => student.student_id === activeStudentId) || null

  return {
    account,
    students,
    activeStudent,
    activeStudentId,
    setActiveStudentId,
    loading,
    error,
  }
}
