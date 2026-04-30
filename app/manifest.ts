import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Absolute Archery Academy',
    short_name: 'Archery',
    description: 'Reservas, membresias y operaciones de Absolute Archery Academy.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#F8F9FA',
    theme_color: '#F97316',
    icons: [
      {
        src: '/favicon-96x96.png',
        sizes: '96x96',
        type: 'image/png',
      },
      {
        src: '/android-icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/android-icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
