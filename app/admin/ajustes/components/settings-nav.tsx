"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type Item = { href: string; label: string; icon: React.ReactNode }

const items: Item[] = [
	{ href: '/admin/ajustes/academia', label: 'Academia', icon: (
		<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3l9 4.5-9 4.5L3 7.5 12 3z"/><path strokeLinecap="round" strokeLinejoin="round" d="M12 12v9"/></svg>
	) },
	{ href: '/admin/ajustes/personal', label: 'Personal', icon: (
		<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
	) },
	{ href: '/admin/ajustes/servicios', label: 'Servicios', icon: (
		<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01"/><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
	) },
	{ href: '/admin/ajustes/infraestructura', label: 'Infraestructura', icon: (
		<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M5 6h14M7 14h10m-8 4h6"/></svg>
	) },
	{ href: '/admin/ajustes/personalizacion', label: 'Personalización', icon: (
		<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
			<circle cx="12" cy="12" r="3"/>
			<path d="M12 1v6m0 6v6m11-7h-6m-6 0H1m11-7a4 4 0 0 1 0 8 4 4 0 0 1 0-8z"/>
		</svg>
	) },
	{ href: '/admin/ajustes/sistema', label: 'Sistema', icon: (
		<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3h4.5l.75 2.25h3l1.5 3-1.5 3h-3L14.25 18h-4.5L9 14.25H6l-1.5-3L6 8.25h3L9.75 3z"/></svg>
	) },
]

export default function SettingsNav(){
	const pathname = usePathname()
	return (
		<nav className="space-y-1">
			{items.map((it)=>{
				const active = pathname?.startsWith(it.href)
				return (
					<Link
						key={it.href}
						href={it.href}
						className={`settings-nav-item menu-item hover-accent flex items-center gap-3 px-3 py-2 rounded-lg border transition-all ${active? 'settings-nav-active border-white/20 text-white':'border-transparent text-slate-300'}`}
					>
						<span className={`shrink-0 ${active? 'text-white':'text-slate-400'}`}>{it.icon}</span>
						<span className="text-sm font-medium">{it.label}</span>
					</Link>
				)
			})}
		</nav>
	)
}
