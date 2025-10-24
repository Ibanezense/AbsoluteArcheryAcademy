import { Metadata } from 'next'
import InfraestructuraClientPage from './InfraestructuraClientPage'

export const metadata: Metadata = {
  title: 'Infraestructura - Ajustes | Academia de Tiro con Arco',
  description: 'Gestiona el equipamiento y las pistas de tiro de la academia',
}

export default function InfraestructuraPage() {
  return <InfraestructuraClientPage />
}