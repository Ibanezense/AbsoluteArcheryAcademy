'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import Image from 'next/image'
import { Menu } from 'lucide-react'
import AdminBottomNav, { type Tab } from '@/components/AdminBottomNav'
import AdminGuard from '@/components/AdminGuard'
import AdminSidebar from '@/components/AdminSidebar'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const pathname = usePathname()

  const activeTab: Tab | undefined = (() => {
    if (pathname.startsWith('/admin/alumnos')) return 'alumnos'
    if (pathname.startsWith('/admin/asistencia')) return 'asistencia'
    if (pathname.startsWith('/admin/membresias')) return 'membresias'
    if (
      pathname.startsWith('/admin/sesiones') ||
      pathname.startsWith('/admin/intro') ||
      pathname.startsWith('/admin/finanzas') ||
      pathname.startsWith('/admin/ajustes')
    ) return undefined
    return 'dashboard'
  })()

  return (
    <AdminGuard>
      <div className="flex min-h-screen overflow-hidden bg-[#f7f4ef]">
        <AdminSidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

        <div className="flex flex-1 flex-col overflow-y-auto lg:ml-72">
          <header className="sticky top-0 z-30 border-b border-white/10 bg-[#06101a]/95 px-4 py-4 shadow-[0_14px_35px_rgba(2,6,23,0.25)] backdrop-blur lg:hidden">
            <div className="flex items-center justify-between">
              <div>
                <Image
                  src="/AA ACADEMY logo blanco.png"
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
                className="rounded-xl border border-white/10 bg-white/10 p-2 text-white shadow-card transition hover:bg-white/20"
                aria-label="Abrir menu"
              >
                <Menu size={22} />
              </button>
            </div>
          </header>

          <main className="flex-1">
            <div className="w-full px-4 py-5 pb-28 lg:px-8 lg:py-8 lg:pb-10">
              <div className="mx-auto max-w-[1680px]">{children}</div>
            </div>
          </main>
        </div>

        <AdminBottomNav active={activeTab} />
      </div>
    </AdminGuard>
  )
}
