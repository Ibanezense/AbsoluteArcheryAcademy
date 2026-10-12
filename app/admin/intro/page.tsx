import IntroClient from './IntroClient'

export const metadata = {
  title: 'Clases de Prueba | Absolute Archery',
  description: 'Gestion de clases de introduccion y prospectos',
}

export default function IntroClassesPage() {
  return (
    <div className="space-y-6">
      <IntroClient />
    </div>
  )
}
