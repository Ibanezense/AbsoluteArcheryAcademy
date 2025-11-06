import './globals.css'
import NavBar from '@/components/NavBar'
import Providers from '@/components/Providers'
import LayoutWrapper from './LayoutWrapper'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Academia de Tiro',
  description: 'Panel de control de la academia',
  icons: {
    // Ícono principal para la pestaña del navegador
    icon: [
      { url: '/favicon.ico', type: 'image/x-icon' },
      { url: '/favicon-32x32.png', type: 'image/png', sizes: '32x32' },
      { url: '/favicon-16x16.png', type: 'image/png', sizes: '16x16' },
    ],
    // Ícono para "Añadir a pantalla de inicio" en Apple
    apple: '/apple-touch-icon.png',
    // Ícono SVG (moderno)
    other: [
      {
        rel: 'icon',
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
  },
}

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
