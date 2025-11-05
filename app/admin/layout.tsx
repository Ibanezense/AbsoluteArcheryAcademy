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
        
        {/* Sidebar (fijo, se superpone en móvil y se controla con 'isOpen') */}
        <AdminSidebar 
          isOpen={isSidebarOpen} 
          onClose={() => setIsSidebarOpen(false)} 
        />

        {/* Área de Contenido Principal (El wrapper que se desplaza) */}
        <div className="flex-1 flex flex-col overflow-y-auto lg:ml-64">
          
          {/* Header Móvil (solo visible en móvil) */}
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
          
          {/* El contenido de la página con scroll */}
          <main className="flex-1">
            <div className="w-full px-4 py-6 lg:px-8">
              <div className="mx-auto max-w-7xl">
                {children}
              </div>
            </div>
          </main>
        </div>
      </div>
    </>
  )
}
