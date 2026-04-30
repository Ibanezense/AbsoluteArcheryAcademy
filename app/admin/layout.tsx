'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import Image from 'next/image'
import { Menu } from 'lucide-react'
import AdminBottomNav, { type Tab } from '@/components/AdminBottomNav'
import AdminSidebar from '@/components/AdminSidebar'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const pathname = usePathname()

  const activeTab: Tab = (() => {
    if (pathname.startsWith('/admin/sesiones')) return 'turnos'
    if (pathname.startsWith('/admin/alumnos')) return 'alumnos'
    if (pathname.startsWith('/admin/asistencia')) return 'asistencia'
    if (pathname.startsWith('/admin/membresias') || pathname.startsWith('/admin/ajustes')) return 'more'
    return 'dashboard'
  })()

  return (
    <div className="flex min-h-screen overflow-hidden bg-bg">
      <AdminSidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <div className="flex flex-1 flex-col overflow-y-auto lg:ml-72">
        <header className="sticky top-0 z-30 border-b border-line bg-card/95 px-4 py-4 shadow-sm backdrop-blur lg:hidden">
          <div className="flex items-center justify-between">
            <div>
              <Image
                src="/aa-academy-logo-720.png"
                alt="Absolute Archery Academy"
                width={140}
                height={36}
                className="h-9 w-auto"
                style={{ width: 'auto', height: 'auto' }}
                priority
              />
            </div>
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="rounded-xl border border-line bg-card p-2 text-textpri shadow-card transition hover:bg-white/5"
              aria-label="Abrir menu"
            >
              <Menu size={22} />
            </button>
          </div>
        </header>

        <main className="flex-1">
          <div className="w-full px-4 py-6 pb-28 lg:px-8 lg:pb-8">
            <div className="mx-auto max-w-7xl">{children}</div>
          </div>
        </main>
      </div>

      <AdminBottomNav active={activeTab} />
    </div>
  )
}
