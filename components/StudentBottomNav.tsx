import Link from 'next/link'
import { usePathname } from 'next/navigation'
import React, { memo, type ComponentType } from 'react'
import { CalendarPlus, Home, Ticket, type LucideProps } from 'lucide-react'

export type StudentTab = 'inicio' | 'reservar' | 'membresias'

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

const NavItem = memo(function NavItem({ href, Icon, label, active }: NavItemProps) {
  return (
    <Link
      href={href}
      className={`relative flex min-h-[68px] flex-1 flex-col items-center justify-center gap-1.5 rounded-2xl px-2 text-[0.8rem] transition-colors ${
        active ? 'font-semibold text-accent' : 'font-medium text-white hover:text-white'
      }`}
      aria-current={active ? 'page' : undefined}
    >
      <Icon size={26} strokeWidth={active ? 2.35 : 2.15} className={active ? 'text-accent opacity-100' : 'text-white opacity-100'} />
      <span>{label}</span>
      {active && <span className="absolute bottom-0 h-1 w-12 rounded-full bg-accent shadow-[0_0_14px_rgba(249,115,22,0.7)]" />}
    </Link>
  )
})

const items: readonly Item[] = [
  { key: 'inicio', href: '/', Icon: Home, label: 'Inicio' },
  { key: 'reservar', href: '/reservar', Icon: CalendarPlus, label: 'Reservar' },
  { key: 'membresias', href: '/membresias', Icon: Ticket, label: 'Membresías' },
]

const StudentBottomNav = memo(function StudentBottomNav() {
  const pathname = usePathname()

  const active: StudentTab = (() => {
    if (pathname.startsWith('/reservar')) return 'reservar'
    if (pathname.startsWith('/membresias')) return 'membresias'
    return 'inicio'
  })()

  return (
    <nav
      role="navigation"
      aria-label="Student bottom navigation"
      className="fixed inset-x-0 bottom-0 z-40 bg-[#020B14] pb-[calc(env(safe-area-inset-bottom)+8px)] pt-2 shadow-[0_-14px_30px_rgba(2,11,20,0.24)]"
    >
      <div className="mx-auto flex max-w-[430px] items-center px-6">
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
