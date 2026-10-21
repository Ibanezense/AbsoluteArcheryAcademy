import './globals.css'
import Providers from '@/components/Providers'
import ServiceWorkerRegistrar from '@/components/ServiceWorkerRegistrar'
import LayoutWrapper from './LayoutWrapper'
import type { Metadata, Viewport } from 'next'
import { Manrope, Barlow_Condensed } from 'next/font/google'

const bodyFont = Manrope({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
})

const headingFont = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
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
      <body className={`${bodyFont.variable} ${headingFont.variable} bg-bg text-textpri`}>
        <Providers studentProgressEnabled={process.env.STUDENT_PROGRESS_ENABLED === 'true'} studentCompetitionsEnabled={process.env.STUDENT_PROGRESS_COMPETITIONS_ENABLED === 'true'}>
          <ServiceWorkerRegistrar />
          <LayoutWrapper>
            {children}
          </LayoutWrapper>
        </Providers>
      </body>
    </html>
  )
}
