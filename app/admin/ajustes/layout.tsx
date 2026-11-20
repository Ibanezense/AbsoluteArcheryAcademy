'use client'


export default function AjustesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-black tracking-tight text-[#102448]">Ajustes</h1>
        <p className="mt-1 text-sm text-textsec">Gestiona las sedes, el inventario de arcos y los horarios de la academia.</p>
      </div>
      <div>{children}</div>
    </div>
  )
}
