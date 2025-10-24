'use client'

import { usePathname } from 'next/navigation'
import { ReactNode } from 'react'

export default function LayoutWrapper({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const isAdminRoute = pathname.startsWith('/admin')

  if (isAdminRoute) {
    // Vista admin: sin contenedor, el admin/layout.tsx maneja su propio layout
    return <>{children}</>
  }

  // Vista estudiante: contenedor móvil centrado
  return (
    <main className="mx-auto w-full max-w-[430px] px-4 pb-[88px]">
      {children}
    </main>
  )
}
