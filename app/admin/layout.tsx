'use client'

import { useCallback, useState } from 'react'
import { usePathname } from 'next/navigation'
import Image from 'next/image'
import { Menu } from 'lucide-react'
import AdminBottomNav, { type Tab } from '@/components/AdminBottomNav'
import AdminGuard from '@/components/AdminGuard'
import AdminSidebar from '@/components/AdminSidebar'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const pathname = usePathname()
  const closeSidebar = useCallback(() => setIsSidebarOpen(false), [])

  const activeTab: Tab | undefined = (() => {
    if (pathname.startsWith('/admin/alumnos')) return 'alumnos'
    if (pathname.startsWith('/admin/asistencia')) return 'asistencia'
    if (pathname.startsWith('/admin/membresias')) return 'membresias'
    if (
      pathname.startsWith('/admin/sesiones') ||
      pathname.startsWith('/admin/intro') ||
      pathname.startsWith('/admin/finanzas') ||
      pathname.startsWith('/admin/ajustes') ||
      pathname.startsWith('/admin/notificaciones')
    ) return undefined
    return 'dashboard'
  })()

  return (
    <AdminGuard>
      <div className="admin-workspace flex min-h-screen bg-[#f2f5f7]">
        <AdminSidebar isOpen={isSidebarOpen} onClose={closeSidebar} />

        <div className="flex min-w-0 flex-1 flex-col lg:ml-64">
          <header className="sport-dark sticky top-0 z-30 border-b border-slate-800 bg-[#101e2a] px-4 py-3 lg:hidden">
            <div className="flex items-center justify-between">
              <div>
                <Image
                  src="/AA ACADEMY logo blanco.png"
                  alt="Absolute Archery Academy"
                  width={140}
                  height={36}
                  className="h-9 w-auto"
                  style={{ width: 'auto', height: '32px', maxWidth: '165px' }}
                  priority
                />
              </div>
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="grid h-11 w-11 place-items-center rounded-lg text-white transition hover:bg-slate-800"
                aria-label="Abrir menú" aria-expanded={isSidebarOpen}
              >
                <Menu size={22} />
              </button>
            </div>
          </header>

          <main className="flex-1">
            <div className="w-full px-4 py-6 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-8 lg:py-8 lg:pb-12 xl:px-10">
              <div className="mx-auto max-w-[1680px]">{children}</div>
            </div>
          </main>
        </div>

        <AdminBottomNav active={activeTab} onMore={() => setIsSidebarOpen(true)} />
      </div>
    </AdminGuard>
  )
}
