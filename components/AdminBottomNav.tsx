import Link from 'next/link'
import React, { memo, type ComponentType } from 'react'
import { BadgeCheck, ClipboardCheck, Home, MoreHorizontal, Users, type LucideProps } from 'lucide-react'

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
      className={`group flex flex-1 flex-col items-center gap-1 rounded-lg py-2 text-[11px] font-semibold transition ${active ? 'bg-orange-50 text-orange-800' : 'text-slate-500 hover:bg-orange-50 hover:text-accent'
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

type Props = { active?: Tab; onMore?: () => void }

const AdminBottomNav = memo(function AdminBottomNav({ active, onMore }: Props) {
  return (
    <nav
      role="navigation"
      aria-label="Admin bottom navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white px-2 pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <div className="mx-auto flex max-w-lg bg-white px-1 py-1">
        {items.map(({ key, href, Icon, label }) => (
          <NavItem key={key} href={href} Icon={Icon} label={label} active={active === key} />
        ))}
        {onMore && <button type="button" onClick={onMore} className="flex min-h-12 flex-1 flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-semibold text-slate-600" aria-label="Más opciones de administración"><MoreHorizontal size={20} /><span>Más</span></button>}
      </div>
    </nav>
  )
})

export default AdminBottomNav
