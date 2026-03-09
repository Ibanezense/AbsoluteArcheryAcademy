import FinancesClient from './FinancesClient';

export const metadata = {
    title: 'Finanzas | Absolute Archery',
};

export default function FinancesPage() {
    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600">
                    Control Financiero
                </h1>
                <p className="text-gray-500">
                    Supervisa los ingresos por membresías, descuentos otorgados y el estado de los pagos.
                </p>
            </div>

            <FinancesClient />
        </div>
    );
}
