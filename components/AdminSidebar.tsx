'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { memo } from 'react'
import { LayoutDashboard, CalendarDays, Users, BadgeCheck, Settings, LogOut } from 'lucide-react'
import { useAuth } from '@/lib/hooks/useAuth'

export type Tab = 'turnos' | 'alumnos' | 'membresias' | 'ajustes' | 'dashboard'

type NavItemProps = {
  href: string
  icon: React.ReactNode
  label: string
  active?: boolean
}

const NavItem = memo(function NavItem({ href, icon, label, active }: NavItemProps) {
  return (
    <Link 
      href={href}
      className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
        active 
          ? 'bg-accent/10 text-accent font-medium' 
          : 'text-textsec hover:bg-white/5 hover:text-textpri'
      }`}
      aria-current={active ? 'page' : undefined}
    >
      {icon}
      <span>{label}</span>
    </Link>
  )
})

export default function AdminSidebar() {
  const pathname = usePathname()
  const { signOut } = useAuth()

  const active: Tab = (() => {
    if (pathname.startsWith('/admin/sesiones'))    return 'turnos'
    if (pathname.startsWith('/admin/alumnos'))     return 'alumnos'
    if (pathname.startsWith('/admin/membresias'))  return 'membresias'
    if (pathname.startsWith('/admin/ajustes'))     return 'ajustes'
    return 'dashboard'
  })()

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-card border-r border-white/10 flex flex-col">
      {/* Logo/Header */}
      <div className="p-6 border-b border-white/10">
        <h1 className="text-xl font-bold text-textpri">Academia de Tiro</h1>
        <p className="text-xs text-textsec mt-1">Panel de Control</p>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 p-4 space-y-1">
        <NavItem 
          href="/admin" 
          icon={<LayoutDashboard size={20} />} 
          label="Inicio" 
          active={active === 'dashboard'}
        />
        <NavItem 
          href="/admin/sesiones" 
          icon={<CalendarDays size={20} />} 
          label="Turnos" 
          active={active === 'turnos'}
        />
        <NavItem 
          href="/admin/alumnos" 
          icon={<Users size={20} />} 
          label="Alumnos" 
          active={active === 'alumnos'}
        />
        <NavItem 
          href="/admin/membresias" 
          icon={<BadgeCheck size={20} />} 
          label="Membresías" 
          active={active === 'membresias'}
        />
      </nav>

      {/* Bottom Actions */}
      <div className="p-4 border-t border-white/10 space-y-1">
        <NavItem 
          href="/admin/ajustes" 
          icon={<Settings size={20} />} 
          label="Configuración" 
          active={active === 'ajustes'}
        />
        <button
          onClick={signOut}
          className="flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-textsec hover:bg-white/5 hover:text-textpri w-full text-left"
        >
          <LogOut size={20} />
          <span>Cerrar Sesión</span>
        </button>
      </div>
    </aside>
  )
}
