'use client'

import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ToastProvider from './ui/ToastProvider'
import ConfirmProvider from './ui/ConfirmDialog'
import dayjs from 'dayjs'
import 'dayjs/locale/es'
import { supabase } from '@/lib/supabaseClient'
import { ProgressAvailabilityContext } from '@/components/student/progress/ProgressAvailability'

dayjs.locale('es')

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
})

export default function Providers({ children, studentProgressEnabled = false }: { children: React.ReactNode; studentProgressEnabled?: boolean }) {
  React.useEffect(() => {
    let previousAccount: string | null | undefined
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const nextAccount = session?.user.id || null
      if (previousAccount !== nextAccount || event === 'SIGNED_OUT') {
        for (const key of ['student-progress', 'admin-student-progress']) {
          void queryClient.cancelQueries({ queryKey: [key] })
          queryClient.removeQueries({ queryKey: [key] })
        }
      }
      previousAccount = nextAccount
    })
    return () => subscription.unsubscribe()
  }, [])
  return (
    <QueryClientProvider client={queryClient}>
      <ProgressAvailabilityContext.Provider value={studentProgressEnabled}>
      <ToastProvider>
        <ConfirmProvider>
          {children}
        </ConfirmProvider>
      </ToastProvider>
      </ProgressAvailabilityContext.Provider>
    </QueryClientProvider>
  )
}
