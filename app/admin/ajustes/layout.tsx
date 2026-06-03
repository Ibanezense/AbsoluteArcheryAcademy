'use client'

import SettingsNav from './components/settings-nav'

export default function AjustesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-textpri">Ajustes</h1>
        <p className="mt-1 text-sm text-textsec">Configuracion general de la academia.</p>
      </div>
      <SettingsNav />
      <div>{children}</div>
    </div>
  )
}
