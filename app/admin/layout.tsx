'use client'

import { usePathname } from 'next/navigation'
import AdminBottomNav, { type Tab } from '@/components/AdminBottomNav'
import { useEffect, useMemo } from 'react'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  const active: Tab = useMemo(() => {
    if (pathname.startsWith('/admin/sesiones'))    return 'turnos'
    if (pathname.startsWith('/admin/alumnos'))     return 'alumnos'
    if (pathname.startsWith('/admin/membresias'))  return 'membresias'
    if (pathname.startsWith('/admin/ajustes'))     return 'ajustes'
    return 'dashboard'
  }, [pathname])

  return (
    <>
      {/* Ocultar SIEMPRE la barra pública dentro de /admin (CSS + refuerzo JS) */}
      <style jsx global>{`
        #global-nav { display: none !important; }
      `}</style>

      {/* Refuerzo en cliente: ocultar nav público si existiera */}
      {/** Evita inline <script> por CSP y posibles errores de parseo */}
      {(() => {
        // Hook dentro del árbol para que se ejecute en cliente
        // eslint-disable-next-line react-hooks/rules-of-hooks
        useEffect(() => {
          try {
            const el = document.getElementById('global-nav')
            if (el) {
              el.style.display = 'none'
              el.setAttribute('aria-hidden', 'true')
            }
          } catch {}
        }, [])
        return null
      })()}

      {/* Contenido del admin con ancho completo */}
      <main className="w-full px-4 pb-24 lg:px-8 lg:pb-28">
        <div className="mx-auto max-w-7xl">
          {children}
        </div>
      </main>

      <AdminBottomNav active={active} />
    </>
  )
}
