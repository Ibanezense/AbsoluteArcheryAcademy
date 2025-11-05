'use client'

import { useEffect, useState } from 'react'
import { Menu } from 'lucide-react'
import AdminSidebar from '@/components/AdminSidebar'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
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
        <AdminSidebar 
          isOpen={isSidebarOpen} 
          onClose={() => setIsSidebarOpen(false)} 
        />

        {/* Header Móvil */}
        <div className="lg:hidden sticky top-0 z-30 flex items-center justify-between
                        bg-card border-b border-white/10 px-4 py-3">
          <div>
            <h1 className="text-lg font-bold text-textpri">Academia de Tiro</h1>
          </div>
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="text-textpri hover:text-accent transition-colors p-2"
            aria-label="Abrir menú"
          >
            <Menu size={24} />
          </button>
        </div>

        {/* Contenido principal con scroll */}
        <main className="flex-1 lg:ml-64 overflow-y-auto">
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
