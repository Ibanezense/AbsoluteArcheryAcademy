import './globals.css'
import NavBar from '@/components/NavBar'
import SignOutButton from '@/components/SignOutButton'

export const metadata = { title: 'Archery', description: 'Reservas' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="bg-bg text-textpri">
        <SignOutButton />
        {/* Contenido centrado tipo móvil para la app del alumno */}
        <main className="mx-auto w-full max-w-[430px] px-4 pb-[88px]">
          {children}
        </main>

        {/* Barra inferior SOLO para vistas de alumno (se podrá ocultar en /admin) */}
        <div id="global-nav" className="fixed inset-x-0 bottom-0">
          <div className="mx-auto w-full max-w-[430px] px-4">
            <NavBar />
          </div>
        </div>
      </body>
    </html>
  )
}
