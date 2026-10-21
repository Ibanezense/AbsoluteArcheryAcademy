'use client'

import { usePathname } from 'next/navigation'
import { ReactNode } from 'react'
import StudentBottomNav from '@/components/StudentBottomNav'
import StudentNotificationCenter from '@/components/student/StudentNotificationCenter'
import MembershipRenewalPromptBoundary from '@/components/MembershipRenewalPromptBoundary'

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

  // Las pantallas de alumnos aprovechan el ancho disponible en escritorio.
  return (
    <>
      <main className={`mx-auto min-h-screen w-full ${showStudentNav ? 'student-workspace max-w-[1120px]' : 'max-w-[480px] px-4'} bg-bg pb-[calc(112px+env(safe-area-inset-bottom))]`}>
        {children}
      </main>
      {showStudentNav && (
        <MembershipRenewalPromptBoundary>
          <StudentNotificationCenter />
        </MembershipRenewalPromptBoundary>
      )}
      {showStudentNav && <StudentBottomNav />}
    </>
  )
}
