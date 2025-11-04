'use client'

import { useEffect } from 'react'
import AdminSidebar from '@/components/AdminSidebar'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Ocultar nav público si existiera
    try {
      const el = document.getElementById('global-nav')
      if (el) {
        el.style.display = 'none'
        el.setAttribute('aria-hidden', 'true')
      }
    } catch {}
  }, [])

  return (
    <>
      {/* Ocultar SIEMPRE la barra pública dentro de /admin */}
      <style jsx global>{`
        #global-nav { display: none !important; }
      `}</style>

      {/* Layout con Sidebar + Contenido */}
      <div className="flex h-screen overflow-hidden">
        {/* Sidebar fijo a la izquierda */}
        <AdminSidebar />

        {/* Contenido principal con scroll */}
        <main className="flex-1 ml-64 overflow-y-auto">
          <div className="w-full px-4 py-6 lg:px-8">
            <div className="mx-auto max-w-7xl">
              {children}
            </div>
          </div>
        </main>
      </div>
    </>
  )
}
