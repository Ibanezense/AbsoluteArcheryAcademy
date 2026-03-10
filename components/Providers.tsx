'use client'

import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ToastProvider from './ui/ToastProvider'
import ConfirmProvider from './ui/ConfirmDialog'
import dayjs from 'dayjs'
import 'dayjs/locale/es'

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

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ConfirmProvider>
          {children}
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>
  )
}
