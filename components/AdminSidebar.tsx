'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { memo } from 'react'
import { LayoutDashboard, CalendarDays, Users, BadgeCheck, Settings, LogOut } from 'lucide-react'
import { useAuth } from '@/lib/hooks/useAuth'

export type Tab = 'turnos' | 'alumnos' | 'membresias' | 'ajustes' | 'dashboard'

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

export default function AdminSidebar({ isOpen, onClose }: AdminSidebarProps) {
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
    <>
      {/* Backdrop para móvil */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}
      
      {/* Sidebar */}
      <aside className={`fixed left-0 top-0 h-screen w-64 bg-card border-r border-white/10 flex flex-col z-50
                         transition-transform duration-300 ease-in-out
                         ${isOpen ? 'translate-x-0' : '-translate-x-full'}
                         lg:translate-x-0`}>
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
          onClick={onClose}
        />
        <NavItem 
          href="/admin/sesiones" 
          icon={<CalendarDays size={20} />} 
          label="Turnos" 
          active={active === 'turnos'}
          onClick={onClose}
        />
        <NavItem 
          href="/admin/alumnos" 
          icon={<Users size={20} />} 
          label="Alumnos" 
          active={active === 'alumnos'}
          onClick={onClose}
        />
        <NavItem 
          href="/admin/membresias" 
          icon={<BadgeCheck size={20} />} 
          label="Membresías" 
          active={active === 'membresias'}
          onClick={onClose}
        />
      </nav>

      {/* Bottom Actions */}
      <div className="p-4 border-t border-white/10 space-y-1">
        <NavItem 
          href="/admin/ajustes" 
          icon={<Settings size={20} />} 
          label="Configuración" 
          active={active === 'ajustes'}
          onClick={onClose}
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
    </>
  )
}
