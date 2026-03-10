import Link from 'next/link'
import { usePathname } from 'next/navigation'
import React, { memo, type ComponentType } from 'react'
import { User, CalendarPlus, Ticket, type LucideProps } from 'lucide-react'

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
    isCenter?: boolean
}

const NavItem = memo(function NavItem({ href, Icon, label, active, isCenter }: NavItemProps) {
    if (isCenter) {
        return (
            <Link
                href={href}
                className="flex flex-col items-center justify-center -mt-6 relative z-10"
                aria-current={active ? 'page' : undefined}
            >
                <div className={`flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-transform active:scale-95 ${active ? 'bg-accent text-white shadow-accent/40 ring-4 ring-bg' : 'bg-card text-textpri ring-4 ring-bg border border-line'
                    }`}>
                    <Icon size={24} />
                </div>
                <span className={`mt-1.5 text-[11px] font-medium ${active ? 'text-accent' : 'text-textsec'}`}>
                    {label}
                </span>
            </Link>
        )
    }

    return (
        <Link
            href={href}
            className={`flex flex-1 flex-col items-center justify-center gap-1 py-2 text-xs transition-colors ${active ? 'text-textpri font-medium' : 'text-textsec hover:text-textpri'
                }`}
            aria-current={active ? 'page' : undefined}
        >
            <Icon size={22} className={active ? 'opacity-100' : 'opacity-70'} />
            <span>{label}</span>
        </Link>
    )
})

const items: readonly Item[] = [
    { key: 'inicio', href: '/', Icon: User, label: 'Inicio' },
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
            className="fixed inset-x-0 bottom-0 z-40 bg-card border-t border-line/50 pb-safe sm:pb-0"
        >
            <div className="mx-auto flex h-16 max-w-[430px] items-center px-6">
                <NavItem
                    href={items[0].href}
                    Icon={items[0].Icon}
                    label={items[0].label}
                    active={active === items[0].key}
                />

                <div className="flex-1 flex justify-center">
                    <NavItem
                        href={items[1].href}
                        Icon={items[1].Icon}
                        label={items[1].label}
                        active={active === items[1].key}
                        isCenter={true}
                    />
                </div>

                <NavItem
                    href={items[2].href}
                    Icon={items[2].Icon}
                    label={items[2].label}
                    active={active === items[2].key}
                />
            </div>
        </nav>
    )
})

export default StudentBottomNav
