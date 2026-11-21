'use client'

import { useCallback, useState } from 'react'
import { usePathname } from 'next/navigation'
import Image from 'next/image'
import { Bell, Menu, UserRound } from 'lucide-react'
import Link from 'next/link'
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
      <div className={`admin-workspace academy-admin-home flex min-h-screen bg-[#f3f7fc] ${pathname === '/admin' ? 'academy-admin-start' : ''}`}>
        <AdminSidebar isOpen={isSidebarOpen} onClose={closeSidebar} />

        <div className="flex min-w-0 flex-1 flex-col lg:ml-64">
          <header className="sport-dark academy-admin-masthead sticky top-0 z-30 border-b border-slate-800 bg-[#101e2a] px-4 py-3">
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
              <div className="ml-auto mr-2 flex items-center gap-3 text-white lg:mr-0">
                <Link href="/admin/notificaciones" aria-label="Notificaciones" className="grid h-11 w-11 place-items-center rounded-lg hover:bg-white/10"><Bell size={20} /></Link>
                <span className="hidden items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold sm:inline-flex"><UserRound size={16} /> Admin</span>
              </div>
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="grid h-11 w-11 place-items-center rounded-lg text-white transition hover:bg-slate-800 lg:hidden"
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
