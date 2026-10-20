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
      className={`relative flex min-h-[68px] min-w-0 flex-1 flex-col items-center justify-center gap-1.5 rounded-2xl px-0.5 text-[0.6875rem] max-[359px]:text-[0.625rem] sm:text-[0.8rem] transition-colors ${
        active
          ? 'font-semibold text-accent'
          : 'font-medium text-white hover:text-white'
      }`}
      aria-current={active ? 'page' : undefined}
    >
      <Icon
        size={26}
        strokeWidth={active ? 2.35 : 2.15}
        className={
          active ? 'text-accent opacity-100' : 'text-white opacity-100'
        }
      />
      <span className="whitespace-nowrap">{label}</span>
      {active && (
        <span className="absolute bottom-0 h-1 w-12 rounded-full bg-accent shadow-[0_0_14px_rgba(249,115,22,0.7)]" />
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
      className="fixed inset-x-0 bottom-0 z-40 bg-[#020B14] pb-[calc(env(safe-area-inset-bottom)+8px)] pt-2 shadow-[0_-14px_30px_rgba(2,11,20,0.24)]"
    >
      <div className="mx-auto flex max-w-[1120px] items-center px-2 md:px-8">
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
