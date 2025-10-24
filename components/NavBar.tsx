"use client"
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import clsx from 'clsx'
import { useAuth } from '@/lib/hooks/useAuth'
import { Home, CalendarDays, List, LogOut, type LucideProps } from 'lucide-react'
import type { ComponentType } from 'react'

const items: { href: string; label: string; Icon: ComponentType<LucideProps> }[] = [
  { href: '/', label: 'Inicio', Icon: Home },
  { href: '/reservar', label: 'Reservar', Icon: CalendarDays },
  { href: '/mis-reservas', label: 'Mis reservas', Icon: List },
]

export default function NavBar() {
  const pathname = usePathname()
  const { signOut } = useAuth()

  return (
    <nav
      id="global-nav"
      className="
        fixed bottom-0 left-1/2 -translate-x-1/2
        w-full max-w-[480px]
        bg-card border-t border-white/10
        z-[40]
      "
    >
      <ul className="grid grid-cols-4 text-center">
        {items.map((it) => {
          const active = pathname === it.href
          const Icon = it.Icon
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                className={clsx(
                  'flex flex-col items-center justify-center py-3 text-sm transition gap-1',
                  active ? 'text-accent font-medium' : 'text-textsec hover:text-textpri'
                )}
              >
                <Icon size={20} />
                <span className="text-xs">{it.label}</span>
              </Link>
            </li>
          )
        })}

        {/* Logout button */}
        <li>
          <button
            onClick={signOut}
            className={clsx('flex flex-col items-center justify-center py-3 text-sm transition text-textsec hover:text-textpri gap-1')}
            aria-label="Cerrar sesión"
          >
            <LogOut size={20} />
            <span className="text-xs">Salir</span>
          </button>
        </li>
      </ul>
    </nav>
  )
}
