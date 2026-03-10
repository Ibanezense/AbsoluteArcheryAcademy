'use client'

import AdminGuard from '@/components/AdminGuard'
import SettingsNav from './components/settings-nav'

export default function AjustesLayout({ children }: { children: React.ReactNode }) {
    return (
        <AdminGuard>
            <div className="space-y-6">
                <div>
                    <h1 className="text-2xl font-bold text-textpri">Ajustes</h1>
                    <p className="mt-1 text-sm text-textsec">Configuración general de la academia.</p>
                </div>
                <SettingsNav />
                <div>{children}</div>
            </div>
        </AdminGuard>
    )
}
