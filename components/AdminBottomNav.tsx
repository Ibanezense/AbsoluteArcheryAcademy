import Link from 'next/link'
import React, { memo, type ComponentType } from 'react'
import { LayoutDashboard, CalendarDays, Users, BadgeCheck, type LucideProps } from 'lucide-react'

export type Tab = 'turnos' | 'alumnos' | 'membresias' | 'ajustes' | 'dashboard'

const BASE = 'flex flex-col items-center gap-1 text-xs flex-1 py-2'
const OFF = 'text-textsec'
const ON = 'text-accent'

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
    <Link href={href} className={`${BASE} ${active ? ON : OFF}`} aria-current={active ? 'page' : undefined}>
      <Icon size={20} />
      <span>{label}</span>
    </Link>
  )
})

const items: readonly Item[] = [
  { key: 'dashboard', href: '/admin', Icon: LayoutDashboard, label: 'Dashboard' },
  { key: 'turnos', href: '/admin/sesiones', Icon: CalendarDays, label: 'Turnos' },
  { key: 'alumnos', href: '/admin/alumnos', Icon: Users, label: 'Alumnos' },
  { key: 'membresias', href: '/admin/membresias', Icon: BadgeCheck, label: 'Membresías' },
]

type Props = { active: Tab }

const AdminBottomNav = memo(function AdminBottomNav({ active }: Props) {
  return (
    <nav
      role="navigation"
      aria-label="Admin bottom navigation"
      className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[430px] border-t border-white/10 bg-card/95 backdrop-blur"
    >
      <div className="flex px-4 py-2">
        {items.map(({ key, href, Icon, label }) => (
          <NavItem key={key} href={href} Icon={Icon} label={label} active={active === key} />
        ))}
      </div>
    </nav>
  )
})

export default AdminBottomNav
