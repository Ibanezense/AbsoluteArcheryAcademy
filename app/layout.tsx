import './globals.css'
import NavBar from '@/components/NavBar'
import Providers from '@/components/Providers'
import LayoutWrapper from './LayoutWrapper'

export const metadata = { title: 'Archery', description: 'Reservas' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="bg-bg text-textpri">
        <Providers>
          <LayoutWrapper>
            {children}
          </LayoutWrapper>

          {/* Barra inferior SOLO para vistas de alumno (se oculta en /admin) */}
          <div id="global-nav" className="fixed inset-x-0 bottom-0">
            <div className="mx-auto w-full max-w-[430px] px-4">
              <NavBar />
            </div>
          </div>
        </Providers>
      </body>
    </html>
  )
}
