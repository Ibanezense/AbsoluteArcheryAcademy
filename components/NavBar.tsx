"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import clsx from 'clsx'
import type { ComponentType } from 'react'
import { CalendarDays, Home, List, LogOut, Users, type LucideProps } from 'lucide-react'
import { useAuth } from '@/lib/hooks/useAuth'
import { useStudentContext } from '@/lib/hooks/useStudentContext'

const defaultItems: { href: string; label: string; Icon: ComponentType<LucideProps> }[] = [
  { href: '/', label: 'Inicio', Icon: Home },
  { href: '/reservar', label: 'Reservar', Icon: CalendarDays },
  { href: '/mis-reservas', label: 'Mis reservas', Icon: List },
]

export default function NavBar() {
  const pathname = usePathname()
  const { signOut } = useAuth()
  const { account } = useStudentContext()

  if (pathname === '/login' || pathname.startsWith('/hub') || pathname.startsWith('/admin')) {
    return null
  }

  const items =
    account?.role === 'guardian'
      ? [
          { href: '/', label: 'Inicio', Icon: Home },
          { href: '/reservar', label: 'Reservar', Icon: CalendarDays },
          { href: '/mis-reservas', label: 'Reservas', Icon: List },
          { href: '/hub', label: 'Alumnos', Icon: Users },
        ]
      : defaultItems

  return (
    <nav
      role="navigation"
      aria-label="Navegacion principal"
      className="fixed bottom-3 left-1/2 z-[40] w-[calc(100%-2rem)] max-w-[430px] -translate-x-1/2 rounded-2xl border border-line bg-card/95 shadow-soft backdrop-blur"
    >
      <ul className="grid grid-cols-4 text-center">
        {items.map(({ href, label, Icon }) => {
          const active = pathname === href

          return (
            <li key={href}>
              <Link
                href={href}
                className={clsx(
                  'flex flex-col items-center justify-center gap-1 py-3 text-sm transition',
                  active ? 'text-accent font-medium' : 'text-textsec hover:text-textpri'
                )}
              >
                <Icon size={20} />
                <span className="text-xs">{label}</span>
              </Link>
            </li>
          )
        })}

        <li>
          <button
            onClick={signOut}
            className="flex w-full flex-col items-center justify-center gap-1 py-3 text-sm text-textsec transition hover:text-textpri"
            aria-label="Cerrar sesion"
          >
            <LogOut size={20} />
            <span className="text-xs">Salir</span>
          </button>
        </li>
      </ul>
    </nav>
  )
}
