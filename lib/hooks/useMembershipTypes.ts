import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'

export type MembershipType = {
  id: string
  name: string
  default_classes: number
  is_active: boolean
  created_at: string
}

export function useMembershipTypes() {
  const [data, setData] = useState<MembershipType[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchMemberships = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      
      const { data: memberships, error: err } = await supabase
        .from('memberships')
        .select('*')
        .order('created_at', { ascending: false })

      if (err) throw err
      
      setData((memberships || []) as MembershipType[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar membresías')
      setData([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  const refetch = useCallback(() => {
    fetchMemberships()
  }, [fetchMemberships])

  useEffect(() => {
    fetchMemberships()
  }, [fetchMemberships])

  return {
    data,
    isLoading,
    error,
    refetch,
  }
}
