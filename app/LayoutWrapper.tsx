'use client'

import { usePathname } from 'next/navigation'
import { ReactNode } from 'react'
import StudentBottomNav from '@/components/StudentBottomNav'

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
      <main className="mx-auto w-full max-w-[430px] px-4 pb-[96px] pt-5">
        {children}
      </main>
      {showStudentNav && <StudentBottomNav />}
    </>
  )
}
