'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { memo } from 'react'
import { BadgeCheck, CalendarDays, ClipboardCheck, LayoutDashboard, LogOut, Settings, Users, Banknote, UsersRound } from 'lucide-react'
import { useAuth } from '@/lib/hooks/useAuth'

export type Tab = 'turnos' | 'alumnos' | 'membresias' | 'ajustes' | 'dashboard' | 'asistencia' | 'finanzas' | 'intro'

interface AdminSidebarProps {
  isOpen: boolean
  onClose: () => void
}

type NavItemProps = {
  href: string
  icon: React.ReactNode
  label: string
  active?: boolean
  onClick?: () => void
}

const NavItem = memo(function NavItem({ href, icon, label, active, onClick }: NavItemProps) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center gap-3 rounded-2xl px-4 py-3 transition-colors ${active
        ? 'bg-accent/10 text-accent font-medium shadow-card'
        : 'text-textsec hover:bg-white/5 hover:text-textpri'
        }`}
      suppressHydrationWarning
      aria-current={active ? 'page' : undefined}
    >
      {icon}
      <span>{label}</span>
    </Link>
  )
})

export default function AdminSidebar({ isOpen, onClose }: AdminSidebarProps) {
  const pathname = usePathname()
  const { signOut } = useAuth()

  const active: Tab = (() => {
    if (pathname.startsWith('/admin/sesiones')) return 'turnos'
    if (pathname.startsWith('/admin/alumnos')) return 'alumnos'
    if (pathname.startsWith('/admin/asistencia')) return 'asistencia'
    if (pathname.startsWith('/admin/membresias')) return 'membresias'
    if (pathname.startsWith('/admin/finanzas')) return 'finanzas'
    if (pathname.startsWith('/admin/intro')) return 'intro'
    if (pathname.startsWith('/admin/ajustes')) return 'ajustes'
    return 'dashboard'
  })()

  return (
    <>
      {isOpen && <div className="fixed inset-0 z-40 bg-slate-900/20 backdrop-blur-sm lg:hidden" onClick={onClose} />}

      <aside
        className={`fixed left-0 top-0 z-50 flex h-screen w-72 flex-col border-r border-line bg-card shadow-soft transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full'
          } lg:translate-x-0`}
      >
        <div className="border-b border-line px-6 py-5">
          <Image
            src="/aa-academy-logo-720.png"
            alt="Absolute Archery Academy"
            width={180}
            height={48}
            className="h-12 w-auto"
            style={{ width: 'auto', height: 'auto' }}
            priority
          />
          <p className="mt-2 text-sm text-textsec">Panel de control</p>
        </div>

        <nav className="flex-1 space-y-2 p-4">
          <NavItem href="/admin" icon={<LayoutDashboard size={20} />} label="Inicio" active={active === 'dashboard'} onClick={onClose} />
          <NavItem href="/admin/sesiones" icon={<CalendarDays size={20} />} label="Turnos" active={active === 'turnos'} onClick={onClose} />
          <NavItem href="/admin/alumnos" icon={<Users size={20} />} label="Alumnos" active={active === 'alumnos'} onClick={onClose} />
          <NavItem href="/admin/intro" icon={<UsersRound size={20} />} label="Pruebas" active={active === 'intro'} onClick={onClose} />
          <NavItem href="/admin/asistencia" icon={<ClipboardCheck size={20} />} label="Asistencia" active={active === 'asistencia'} onClick={onClose} />
          <NavItem href="/admin/membresias" icon={<BadgeCheck size={20} />} label="Membresias" active={active === 'membresias'} onClick={onClose} />
          <NavItem href="/admin/finanzas" icon={<Banknote size={20} />} label="Finanzas" active={active === 'finanzas'} onClick={onClose} />
        </nav>

        <div className="space-y-2 border-t border-line p-4">
          <NavItem href="/admin/ajustes" icon={<Settings size={20} />} label="Configuracion" active={active === 'ajustes'} onClick={onClose} />
          <button
            onClick={signOut}
            className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-textsec transition-colors hover:bg-white/5 hover:text-textpri"
          >
            <LogOut size={20} />
            <span>Cerrar sesion</span>
          </button>
        </div>
      </aside>
    </>
  )
}
