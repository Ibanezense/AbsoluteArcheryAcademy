import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export type StudentClassCard = {
  student_membership_id: string
  membership_name: string
  membership_status: string
  classes_total: number
  classes_remaining: number
  card_index: number
  card_status: 'available' | 'reserved' | 'attended' | 'no_show'
  booking_id: string | null
  session_id: string | null
  start_at: string | null
  end_at: string | null
  distance_m: number | null
  bow_usage_type: 'shared_inventory' | 'assigned' | 'own' | null
}

export function useStudentClassCards(studentId?: string | null) {
  const [cards, setCards] = useState<StudentClassCard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadCards = async () => {
      if (!studentId) {
        setCards([])
        setLoading(false)
        setError(null)
        return
      }

      try {
        setLoading(true)
        setError(null)

        const { data, error: rpcError } = await supabase.rpc('get_student_class_cards', {
          p_student_id: studentId,
          p_student_membership_id: null,
        })

        if (rpcError) throw rpcError
        setCards((data || []) as StudentClassCard[])
      } catch (loadError: any) {
        setError(loadError?.message || 'No se pudieron cargar las cards de clases.')
        setCards([])
      } finally {
        setLoading(false)
      }
    }

    loadCards()
  }, [studentId])

  return {
    cards,
    loading,
    error,
  }
}
