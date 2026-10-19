'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { memo, useEffect, useRef } from 'react'
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
      className={`group flex items-center gap-3 rounded-lg px-3 py-3 transition-all duration-200 ${active
        ? 'bg-orange-500/15 text-white'
        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
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
  const panel = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!isOpen) return
    const opener = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.current?.querySelector<HTMLElement>('a, button')?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose() }
      if (event.key !== 'Tab') return
      const controls = panel.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')
      if (!controls?.length) return
      const first = controls[0], last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', keydown)
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', keydown); opener?.focus() }
  }, [isOpen, onClose])

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
        ref={panel}
        role={isOpen ? "dialog" : undefined}
        aria-modal={isOpen ? true : undefined}
        aria-label="Navegación administrativa"
        className={`fixed left-0 top-0 z-50 flex h-dvh w-64 flex-col overflow-y-auto border-r border-slate-800 bg-[#101b28] text-white transition-transform duration-300 ease-in-out ${isOpen ? 'visible translate-x-0' : 'invisible -translate-x-full'
          } lg:visible lg:translate-x-0`}
      >

        <div className="relative border-b border-slate-800 px-5 py-5">
          <Image
            src="/AA ACADEMY logo blanco.png"
            alt="Absolute Archery Academy"
            width={190}
            height={48}
            className="h-12 w-auto brightness-110"
            style={{ width: 'auto', height: '38px', maxWidth: '200px' }}
            priority
          />
          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.28em] text-orange-300/80">Administración</p>
        </div>

        <nav className="relative flex-1 space-y-1 p-3">
          <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Navegacion</p>
          <NavItem href="/admin" icon={<Home size={20} />} label="Inicio" active={active === 'dashboard'} onClick={onClose} />
          <NavItem href="/admin/sesiones" icon={<CalendarDays size={20} />} label="Turnos" active={active === 'turnos'} onClick={onClose} />
          <NavItem href="/admin/alumnos" icon={<Users size={20} />} label="Alumnos" active={active === 'alumnos'} onClick={onClose} />
          <NavItem href="/admin/intro" icon={<Target size={20} />} label="Pruebas" active={active === 'intro'} onClick={onClose} />
          <NavItem href="/admin/asistencia" icon={<ClipboardCheck size={20} />} label="Asistencia" active={active === 'asistencia'} onClick={onClose} />
          <NavItem href="/admin/membresias" icon={<BadgeCheck size={20} />} label="Membresias" active={active === 'membresias'} onClick={onClose} />
          <NavItem href="/admin/finanzas" icon={<Banknote size={20} />} label="Finanzas" active={active === 'finanzas'} onClick={onClose} />
        </nav>

        <div className="relative space-y-1 border-t border-slate-800 p-3">
          <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Administracion</p>
          <NavItem href="/admin/ajustes" icon={<Settings size={20} />} label="Configuracion" active={active === 'ajustes'} onClick={onClose} />
          <button
            onClick={signOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-medium text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
          >
            <LogOut size={20} className="text-slate-400" />
            <span>Cerrar sesion</span>
          </button>
        </div>
      </aside>
    </>
  )
}
