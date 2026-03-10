import type { Metadata } from 'next'
import ClavesClientPage from './ClavesClientPage'

export const metadata: Metadata = {
    title: 'Claves de Acceso - Ajustes | Absolute Archery Academy',
}

export default function ClavesPage() {
    return <ClavesClientPage />
}
