import Link from 'next/link'
import { usePathname } from 'next/navigation'
import React, { memo, type ComponentType } from 'react'
import {
  CalendarDays,
  CalendarPlus,
  Home,
  Ticket,
  UserRound,
  type LucideProps,
} from 'lucide-react'

import { getStudentTab, type StudentTab } from '@/lib/utils/studentNavigation'
export type { StudentTab } from '@/lib/utils/studentNavigation'

type Item = {
  key: StudentTab
  href: string
  Icon: ComponentType<LucideProps>
  label: string
}

type NavItemProps = {
  href: string
  Icon: ComponentType<LucideProps>
  label: string
  active?: boolean
}

const NavItem = memo(function NavItem({
  href,
  Icon,
  label,
  active,
}: NavItemProps) {
  return (
    <Link
      href={href}
      className={`relative flex min-h-[64px] min-w-0 flex-1 flex-col items-center justify-center gap-1.5 rounded-xl px-0.5 text-[0.6875rem] max-[359px]:text-[0.625rem] sm:text-[0.8rem] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-orange-300 ${
        active
          ? 'bg-white/10 font-bold text-orange-300'
          : 'font-medium text-slate-300 hover:bg-white/10 hover:text-white'
      }`}
      aria-current={active ? 'page' : undefined}
    >
      <Icon
        aria-hidden="true"
        size={23}
        strokeWidth={active ? 2.35 : 2.15}
        className={
          active ? 'text-orange-300' : 'text-slate-300'
        }
      />
      <span className="whitespace-nowrap">{label}</span>
      {active && (
        <span className="absolute top-0 h-0.5 w-7 rounded-full bg-orange-300" />
      )}
    </Link>
  )
})

const items: readonly Item[] = [
  { key: 'inicio', href: '/', Icon: Home, label: 'Inicio' },
  { key: 'reservar', href: '/reservar', Icon: CalendarPlus, label: 'Reservar' },
  {
    key: 'reservas',
    href: '/mis-reservas',
    Icon: CalendarDays,
    label: 'Mis reservas',
  },
  { key: 'membresias', href: '/membresias', Icon: Ticket, label: 'Membresías' },
  { key: 'perfil', href: '/perfil', Icon: UserRound, label: 'Mi perfil' },
]

const StudentBottomNav = memo(function StudentBottomNav() {
  const pathname = usePathname()

  const active = getStudentTab(pathname)

  return (
    <nav
      role="navigation"
      aria-label="Navegación del alumno"
      className="sport-dark fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-navy pb-[calc(env(safe-area-inset-bottom)+8px)] pt-2 shadow-[0_-8px_28px_rgba(16,30,42,0.12)]"
    >
      <div className="mx-auto flex max-w-[1120px] items-center gap-1 px-2 md:gap-2 md:px-8">
        {items.map((item) => (
          <NavItem
            key={item.key}
            href={item.href}
            Icon={item.Icon}
            label={item.label}
            active={active === item.key}
          />
        ))}
      </div>
    </nav>
  )
})

export default StudentBottomNav
