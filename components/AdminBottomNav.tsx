import Link from 'next/link'
import React, { memo, type ComponentType } from 'react'
import { BadgeCheck, ClipboardCheck, Home, Users, type LucideProps } from 'lucide-react'

export type Tab = 'dashboard' | 'alumnos' | 'asistencia' | 'membresias'

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
      className={`group flex flex-1 flex-col items-center gap-1 rounded-2xl py-2 text-[11px] font-semibold transition ${active ? 'bg-accent text-white shadow-[0_10px_25px_rgba(249,115,22,0.28)]' : 'text-slate-500 hover:bg-orange-50 hover:text-accent'
        }`}
      aria-current={active ? 'page' : undefined}
    >
      <Icon size={20} />
      <span>{label}</span>
    </Link>
  )
})

const items: readonly Item[] = [
  { key: 'dashboard', href: '/admin', Icon: Home, label: 'Inicio' },
  { key: 'alumnos', href: '/admin/alumnos', Icon: Users, label: 'Alumnos' },
  { key: 'asistencia', href: '/admin/asistencia', Icon: ClipboardCheck, label: 'Asistencia' },
  { key: 'membresias', href: '/admin/membresias', Icon: BadgeCheck, label: 'Membresias' },
]

type Props = { active?: Tab }

const AdminBottomNav = memo(function AdminBottomNav({ active }: Props) {
  return (
    <nav
      role="navigation"
      aria-label="Admin bottom navigation"
      className="fixed inset-x-0 bottom-3 z-40 px-4 lg:hidden"
    >
      <div className="mx-auto flex max-w-[430px] rounded-[1.35rem] border border-white/80 bg-white/95 px-2 py-2 shadow-[0_18px_45px_rgba(15,23,42,0.14)] backdrop-blur">
        {items.map(({ key, href, Icon, label }) => (
          <NavItem key={key} href={href} Icon={Icon} label={label} active={active === key} />
        ))}
      </div>
    </nav>
  )
})

export default AdminBottomNav
