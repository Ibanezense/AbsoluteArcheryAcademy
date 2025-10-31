'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'

export function Sidebar() {
  const pathname = usePathname()

  return (
  <aside className="bg-[#0e1116] border-r border-white/20 flex flex-col">
      {/* Logo y Título */}
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center">
            {/* Logo placeholder - se puede conectar a settings más adelante */}
          </div>
          <h1 className="text-xl font-semibold text-white">
            Archery Academy
          </h1>
        </div>
      </div>

      {/* Navegación */}
  <nav className="flex-1 p-4">
        <div className="space-y-1">
          <NavItem
            href="/admin/dashboard"
            icon={
              <svg className="w-5 h-5 shrink-0 overflow-visible" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            }
            label="Inicio"
            active={pathname === '/admin/dashboard'}
          />
          
          <NavItem
            href="/admin/alumnos"
            icon={
              <svg className="w-5 h-5 shrink-0 overflow-visible" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                {/* Cabeza */}
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0z" />
                {/* Hombros/Busto */}
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            }
            label="Alumnos"
            active={pathname.startsWith('/admin/alumnos')}
          />
          
          <NavItem
            href="/admin/sesiones"
            icon={
              <svg className="w-5 h-5 shrink-0 overflow-visible" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            }
            label="Clases"
            active={pathname.startsWith('/admin/sesiones')}
          />
          
          <NavItem
            href="/admin/ajustes"
            icon={
              <svg className="w-5 h-5 shrink-0 overflow-visible" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            }
            label="Ajustes"
            active={pathname.startsWith('/admin/ajustes')}
          />
        </div>
      </nav>
    </aside>
  )
}

interface NavItemProps {
  href: string
  icon: React.ReactNode
  label: string
  active?: boolean
}

function NavItem({ href, icon, label, active }: NavItemProps) {
  return (
    <Link
      href={href}
      className={`sidebar-item menu-item hover-accent flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
        active
          ? 'sidebar-active text-white'
          : 'text-slate-300'
      }`}
    >
      <span className="inline-flex h-6 w-6 items-center justify-center text-current">{icon}</span>
      <span className="font-medium">{label}</span>
    </Link>
  )
}