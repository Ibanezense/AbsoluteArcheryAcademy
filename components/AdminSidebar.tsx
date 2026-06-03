'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { memo } from 'react'
import { BadgeCheck, Banknote, CalendarDays, ClipboardCheck, Home, LogOut, Settings, Target, Users } from 'lucide-react'
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
      className={`group flex items-center gap-3 rounded-2xl px-4 py-3 transition-all duration-200 ${active
        ? 'bg-accent/20 text-white shadow-[inset_0_0_0_1px_rgba(249,115,22,0.45),0_16px_40px_rgba(249,115,22,0.16)]'
        : 'text-slate-300 hover:bg-white/10 hover:text-white'
        }`}
      suppressHydrationWarning
      aria-current={active ? 'page' : undefined}
    >
      <span className={active ? 'text-accent' : 'text-slate-400 group-hover:text-accent'}>{icon}</span>
      <span className="text-sm font-medium">{label}</span>
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
      {isOpen && <div className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm lg:hidden" onClick={onClose} />}

      <aside
        className={`fixed left-0 top-0 z-50 flex h-screen w-72 flex-col overflow-hidden border-r border-white/10 bg-[#04101a] text-white shadow-[18px_0_60px_rgba(2,6,23,0.28)] transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full'
          } lg:translate-x-0`}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(249,115,22,0.18),transparent_28rem),linear-gradient(160deg,rgba(15,23,42,0.15),transparent_45%)]" />
        <div className="pointer-events-none absolute -bottom-24 left-7 h-72 w-72 rounded-full border border-orange-500/20 bg-[repeating-radial-gradient(circle,rgba(249,115,22,0.34)_0_10px,rgba(15,23,42,0.92)_10px_24px,rgba(255,255,255,0.12)_24px_28px,transparent_28px_44px)] opacity-80 blur-[0.2px]" />
        <div className="pointer-events-none absolute -bottom-8 left-0 h-40 w-full bg-gradient-to-t from-orange-500/20 to-transparent" />

        <div className="relative border-b border-white/10 px-6 py-6">
          <Image
            src="/AA ACADEMY logo blanco.png"
            alt="Absolute Archery Academy"
            width={190}
            height={48}
            className="h-12 w-auto brightness-110"
            style={{ width: 'auto', height: 'auto' }}
            priority
          />
          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.28em] text-orange-300/80">Academy ops</p>
        </div>

        <nav className="relative flex-1 space-y-2 p-4">
          <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Navegacion</p>
          <NavItem href="/admin" icon={<Home size={20} />} label="Inicio" active={active === 'dashboard'} onClick={onClose} />
          <NavItem href="/admin/sesiones" icon={<CalendarDays size={20} />} label="Turnos" active={active === 'turnos'} onClick={onClose} />
          <NavItem href="/admin/alumnos" icon={<Users size={20} />} label="Alumnos" active={active === 'alumnos'} onClick={onClose} />
          <NavItem href="/admin/intro" icon={<Target size={20} />} label="Pruebas" active={active === 'intro'} onClick={onClose} />
          <NavItem href="/admin/asistencia" icon={<ClipboardCheck size={20} />} label="Asistencia" active={active === 'asistencia'} onClick={onClose} />
          <NavItem href="/admin/membresias" icon={<BadgeCheck size={20} />} label="Membresias" active={active === 'membresias'} onClick={onClose} />
          <NavItem href="/admin/finanzas" icon={<Banknote size={20} />} label="Finanzas" active={active === 'finanzas'} onClick={onClose} />
        </nav>

        <div className="relative space-y-2 border-t border-white/10 p-4">
          <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Administracion</p>
          <NavItem href="/admin/ajustes" icon={<Settings size={20} />} label="Configuracion" active={active === 'ajustes'} onClick={onClose} />
          <button
            onClick={signOut}
            className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
          >
            <LogOut size={20} className="text-slate-400" />
            <span>Cerrar sesion</span>
          </button>
        </div>
      </aside>
    </>
  )
}
