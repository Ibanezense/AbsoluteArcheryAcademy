import { AdminPageHeader } from '@/components/admin/AdminVisualSystem'
import FinancesClient from './FinancesClient'

export const metadata = {
  title: 'Finanzas | Absolute Archery',
}

export default function FinancesPage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Finanzas"
        description="Ingresos, pagos y renovaciones de la academia"
      />

      <FinancesClient />
    </div>
  )
}
