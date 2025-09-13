import React from 'react'
import ToastProvider from './ui/ToastProvider'
import ConfirmProvider from './ui/ConfirmDialog'

export default function Providers({ children }:{ children: React.ReactNode }){
  return (
    <ToastProvider>
      <ConfirmProvider>
        {children}
      </ConfirmProvider>
    </ToastProvider>
  )
}
