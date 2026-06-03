'use client'

import { usePathname } from 'next/navigation'
import { ReactNode } from 'react'
import StudentBottomNav from '@/components/StudentBottomNav'
import MembershipRenewalPrompt from '@/components/MembershipRenewalPrompt'

export default function LayoutWrapper({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const isAdminRoute = pathname.startsWith('/admin')
  const isAuthRoute = pathname.startsWith('/login')
  const isHubRoute = pathname.startsWith('/hub')

  const showStudentNav = !isAdminRoute && !isAuthRoute && !isHubRoute

  if (isAdminRoute) {
    // Vista admin: sin contenedor, el admin/layout.tsx maneja su propio layout
    return <>{children}</>
  }

  // Vista estudiante: contenedor móvil centrado
  return (
    <>
      <main className="mx-auto min-h-screen w-full max-w-[430px] overflow-x-hidden bg-bg pb-[96px] shadow-[0_0_0_1px_rgba(15,23,42,0.04)]">
        {children}
      </main>
      {showStudentNav && <MembershipRenewalPrompt />}
      {showStudentNav && <StudentBottomNav />}
    </>
  )
}
