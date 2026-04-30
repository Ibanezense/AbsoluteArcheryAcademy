import './globals.css'
import Providers from '@/components/Providers'
import ServiceWorkerRegistrar from '@/components/ServiceWorkerRegistrar'
import LayoutWrapper from './LayoutWrapper'
import type { Metadata, Viewport } from 'next'
import { Inter, Poppins } from 'next/font/google'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
})

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-heading',
  display: 'swap',
})

export const metadata: Metadata = {
  applicationName: 'Absolute Archery Academy',
  title: 'Absolute Archery Academy',
  description: 'Panel de control de la academia',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Absolute Archery',
    statusBarStyle: 'default',
  },
  icons: {
    icon: [
      { url: '/favicon.ico', type: 'image/x-icon' },
      { url: '/favicon-32x32.png', type: 'image/png', sizes: '32x32' },
      { url: '/favicon-16x16.png', type: 'image/png', sizes: '16x16' },
      { url: '/favicon-96x96.png', type: 'image/png', sizes: '96x96' },
    ],
  },
}

export const viewport: Viewport = {
  themeColor: '#F97316',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={`${inter.variable} ${poppins.variable} bg-bg text-textpri`}>
        <Providers>
          <ServiceWorkerRegistrar />
          <LayoutWrapper>
            {children}
          </LayoutWrapper>
        </Providers>
      </body>
    </html>
  )
}
