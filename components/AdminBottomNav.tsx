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
      className={`group relative flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl py-2 text-[11px] font-semibold transition-colors ${active ? 'bg-orange-50 text-accent' : 'text-slate-500 hover:bg-orange-50 hover:text-accent'
        }`}
      aria-current={active ? 'page' : undefined}
    >
      <Icon aria-hidden="true" size={20} strokeWidth={active ? 2.3 : 1.8} />
      <span>{label}</span>
    </Link>
  )
})

const items: readonly Item[] = [
  { key: 'dashboard', href: '/admin', Icon: Home, label: 'Inicio' },
  { key: 'alumnos', href: '/admin/alumnos', Icon: Users, label: 'Alumnos' },
  { key: 'asistencia', href: '/admin/asistencia', Icon: ClipboardCheck, label: 'Asistencia' },
  { key: 'membresias', href: '/admin/membresias', Icon: BadgeCheck, label: 'Membresías' },
]

type Props = { active?: Tab; onMore?: () => void }

const AdminBottomNav = memo(function AdminBottomNav({ active, onMore }: Props) {
  return (
    <nav
      role="navigation"
      aria-label="Navegación administrativa inferior"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_24px_rgba(16,30,42,0.04)] lg:hidden"
    >
      <div className="mx-auto flex max-w-lg gap-1 bg-white px-1 py-1.5">
        {items.map(({ key, href, Icon, label }) => (
          <NavItem key={key} href={href} Icon={Icon} label={label} active={active === key} />
        ))}
        {onMore && <button type="button" onClick={onMore} className="flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-semibold text-slate-600" aria-label="Más opciones de administración"><MoreHorizontal aria-hidden="true" size={20} /><span>Más</span></button>}
      </div>
    </nav>
  )
})

export default AdminBottomNav
