"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type Item = { href: string; label: string }

const items: Item[] = [
	{ href: '/admin/ajustes/infraestructura', label: 'Infraestructura' },
	{ href: '/admin/ajustes/claves', label: 'Claves de acceso' },
	{ href: '/admin/ajustes/personalizacion', label: 'Personalización' },
	{ href: '/admin/ajustes/reportes', label: 'Reportes' },
]

export default function SettingsNav() {
	const pathname = usePathname()
	return (
		<nav className="flex gap-1 overflow-x-auto border-b border-line pb-px">
			{items.map((it) => {
				const active = pathname?.startsWith(it.href)
				return (
					<Link
						key={it.href}
						href={it.href}
						className={`whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${active
							? 'border-accent text-accent'
							: 'border-transparent text-textsec hover:text-textpri hover:border-line'
							}`}
					>
						{it.label}
					</Link>
				)
			})}
		</nav>
	)
}
