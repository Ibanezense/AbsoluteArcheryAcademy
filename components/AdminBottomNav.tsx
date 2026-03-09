import Link from 'next/link'
import React, { memo, type ComponentType } from 'react'
import { CalendarDays, ClipboardCheck, LayoutDashboard, MoreHorizontal, Users, type LucideProps } from 'lucide-react'

export type Tab = 'dashboard' | 'turnos' | 'alumnos' | 'asistencia' | 'finanzas' | 'intro' | 'more'

type Item = {
  key: Tab
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

const NavItem = memo(function NavItem({ href, Icon, label, active }: NavItemProps) {
  return (
    <Link
      href={href}
      className={`flex flex-1 flex-col items-center gap-1 py-2 text-xs transition ${active ? 'text-accent font-medium' : 'text-textsec'
        }`}
      aria-current={active ? 'page' : undefined}
    >
      <Icon size={20} />
      <span>{label}</span>
    </Link>
  )
})

import { Banknote, UsersRound } from 'lucide-react'

const items: readonly Item[] = [
  { key: 'dashboard', href: '/admin', Icon: LayoutDashboard, label: 'Inicio' },
  { key: 'turnos', href: '/admin/sesiones', Icon: CalendarDays, label: 'Turnos' },
  { key: 'alumnos', href: '/admin/alumnos', Icon: Users, label: 'Alumnos' },
  { key: 'intro', href: '/admin/intro', Icon: UsersRound, label: 'Pruebas' },
  { key: 'finanzas', href: '/admin/finanzas', Icon: Banknote, label: 'Finanzas' },
  { key: 'more', href: '/admin/ajustes', Icon: MoreHorizontal, label: 'Mas' },
]

type Props = { active: Tab }

const AdminBottomNav = memo(function AdminBottomNav({ active }: Props) {
  return (
    <nav
      role="navigation"
      aria-label="Admin bottom navigation"
      className="fixed inset-x-0 bottom-3 z-40 px-4 lg:hidden"
    >
      <div className="mx-auto flex max-w-[430px] rounded-2xl border border-line bg-card/95 px-3 py-2 shadow-soft backdrop-blur">
        {items.map(({ key, href, Icon, label }) => (
          <NavItem key={key} href={href} Icon={Icon} label={label} active={active === key} />
        ))}
      </div>
    </nav>
  )
})

export default AdminBottomNav
