'use client';

import { useState, useEffect, useMemo } from 'react';
import { FinancesService, FinanceRecord, FinanceActionableDashboard } from '@/lib/services/FinancesService';
import dayjs from 'dayjs';
import 'dayjs/locale/es';
import { Download, TrendingUp, TrendingDown, Clock, Search, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';

dayjs.locale('es');

const YEARS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);
const MONTHS = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export default function FinancesClient() {
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth()); // 0-11
    const [records, setRecords] = useState<FinanceRecord[]>([]);
    const [actionable, setActionable] = useState<FinanceActionableDashboard | null>(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    useEffect(() => {
        async function fetchReport() {
            setLoading(true);
            try {
                // Construct start and end dates strictly based on the selected month/year
                const startDateString = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`;
                const nextMonth = selectedMonth === 11 ? 0 : selectedMonth + 1;
                const nextYear = selectedMonth === 11 ? selectedYear + 1 : selectedYear;
                const endDateString = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-01`;

                const [data, dashboard] = await Promise.all([
                    FinancesService.getMonthlyReport(startDateString, endDateString),
                    FinancesService.getActionableDashboard(startDateString, endDateString),
                ]);

                setRecords(data);
                setActionable(dashboard);
            } catch (error) {
                console.error('Error loading finances:', error);
            } finally {
                setLoading(false);
            }
        }

        fetchReport();
    }, [selectedYear, selectedMonth]);

    // Derived stats
    const stats = useMemo(() => {
        let totalIncome = 0;
        let totalDiscounts = 0;
        let pendingCount = 0;

        records.forEach(r => {
            // Only sum paid records for total income and discounts
            if (r.payment_status === 'paid') {
                totalIncome += Number(r.amount_paid);
                totalDiscounts += Number(r.discount_calculated);
            } else if (r.payment_status === 'pending' || r.payment_status === 'late') {
                pendingCount += 1;
            }
        });

        return { totalIncome, totalDiscounts, pendingCount };
    }, [records]);

    // Filtered records for table
    const filteredRecords = useMemo(() => {
        if (!search) return records;
        const lower = search.toLowerCase();
        return records.filter(
            r => r.student_name?.toLowerCase().includes(lower) || r.plan_name?.toLowerCase().includes(lower)
        );
    }, [records, search]);

    const exportToCsv = () => {
        if (records.length === 0) return;

        const headers = ['Fecha de Pago', 'Alumno', 'Plan', 'Precio Base', 'Descuento', 'Total Pagado', 'Estado', 'Metodo'];
        const rows = filteredRecords.map(r => [
            dayjs(r.paid_at).format('DD/MM/YYYY HH:mm'),
            `"${r.student_name}"`,
            `"${r.plan_name}"`,
            r.base_price,
            r.discount_calculated,
            r.amount_paid,
            r.payment_status,
            r.payment_method || 'NA'
        ]);

        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `Finanzas_${MONTHS[selectedMonth]}_${selectedYear}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'paid': return <span className="px-2 py-1 bg-green-100 text-green-700 rounded-lg text-xs font-semibold uppercase tracking-wide">Pagado</span>;
            case 'pending': return <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-lg text-xs font-semibold uppercase tracking-wide">Pendiente</span>;
            case 'late': return <span className="px-2 py-1 bg-red-100 text-red-700 rounded-lg text-xs font-semibold uppercase tracking-wide">Atrasado</span>;
            case 'waived': return <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded-lg text-xs font-semibold uppercase tracking-wide">Exonerado</span>;
            default: return <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded-lg text-xs font-semibold uppercase tracking-wide">{status}</span>;
        }
    };

    return (
        <div className="space-y-6">
            {/* Controls */}
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                <div className="flex items-center gap-3">
                    <select
                        value={selectedMonth}
                        onChange={e => setSelectedMonth(Number(e.target.value))}
                        className="bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-xl focus:ring-blue-500 focus:border-blue-500 block p-2.5 outline-none hover:bg-gray-100 transition-colors cursor-pointer font-medium"
                    >
                        {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
                    </select>
                    <select
                        value={selectedYear}
                        onChange={e => setSelectedYear(Number(e.target.value))}
                        className="bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-xl focus:ring-blue-500 focus:border-blue-500 block p-2.5 outline-none hover:bg-gray-100 transition-colors cursor-pointer font-medium"
                    >
                        {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                </div>

                <button
                    onClick={exportToCsv}
                    disabled={records.length === 0}
                    className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm active:scale-95"
                >
                    <Download className="w-4 h-4" />
                    Exportar CSV
                </button>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex items-center gap-4 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-green-50 to-green-100 rounded-bl-full -z-10 opacity-50 group-hover:scale-110 transition-transform duration-500" />
                    <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center shrink-0">
                        <TrendingUp className="w-6 h-6 text-green-600" />
                    </div>
                    <div>
                        <p className="text-sm text-gray-500 font-medium mb-1">Ingresos Totales</p>
                        <h3 className="text-3xl font-bold text-gray-900">S/ {stats.totalIncome.toFixed(2)}</h3>
                    </div>
                </div>

                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex items-center gap-4 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-orange-50 to-orange-100 rounded-bl-full -z-10 opacity-50 group-hover:scale-110 transition-transform duration-500" />
                    <div className="w-12 h-12 rounded-full bg-orange-50 flex items-center justify-center shrink-0">
                        <TrendingDown className="w-6 h-6 text-orange-600" />
                    </div>
                    <div>
                        <p className="text-sm text-gray-500 font-medium mb-1">Descuentos Otorgados</p>
                        <h3 className="text-3xl font-bold text-gray-900">S/ {stats.totalDiscounts.toFixed(2)}</h3>
                    </div>
                </div>

                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex items-center gap-4 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-bl-full -z-10 opacity-50 group-hover:scale-110 transition-transform duration-500" />
                    <div className="w-12 h-12 rounded-full bg-yellow-50 flex items-center justify-center shrink-0">
                        <Clock className="w-6 h-6 text-yellow-600" />
                    </div>
                    <div>
                        <p className="text-sm text-gray-500 font-medium mb-1">Pagos Pendientes</p>
                        <h3 className="text-3xl font-bold text-gray-900">{stats.pendingCount} <span className="text-lg font-normal text-gray-500">recibos</span></h3>
                    </div>
                </div>
            </div>

            {actionable && (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                            <p className="text-sm text-gray-500 font-medium">Proyeccion mensual</p>
                            <h3 className="mt-2 text-3xl font-bold text-gray-900">S/ {Number(actionable.projection_month || 0).toFixed(2)}</h3>
                            <p className="mt-2 text-xs text-gray-500">
                                Cobrado: S/ {Number(actionable.paid_month || 0).toFixed(2)} · Pendiente del mes: S/ {Number(actionable.pending_month || 0).toFixed(2)}
                            </p>
                        </div>
                        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                            <p className="text-sm text-gray-500 font-medium">Morosidad acumulada</p>
                            <h3 className="mt-2 text-3xl font-bold text-red-600">S/ {Number(actionable.overdue_amount || 0).toFixed(2)}</h3>
                            <p className="mt-2 text-xs text-gray-500">{actionable.overdue_count || 0} pagos atrasados</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                            <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                                <h3 className="text-base font-semibold text-gray-800">Top morosos</h3>
                            </div>
                            <div className="p-4 space-y-3">
                                {actionable.top_debtors?.length ? actionable.top_debtors.map((debtor) => (
                                    <div key={debtor.student_id} className="rounded-xl border border-gray-100 p-3 flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="font-medium text-gray-900 truncate">{debtor.student_name}</p>
                                            <p className="text-xs text-gray-500">
                                                {debtor.overdue_count} pagos · desde {debtor.oldest_due_date ? dayjs(debtor.oldest_due_date).format('DD/MM/YYYY') : 'sin fecha'}
                                            </p>
                                        </div>
                                        <span className="text-sm font-semibold text-red-600">S/ {Number(debtor.overdue_amount || 0).toFixed(2)}</span>
                                    </div>
                                )) : (
                                    <p className="text-sm text-gray-500">No hay alumnos con pagos vencidos.</p>
                                )}
                            </div>
                        </div>

                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                            <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                                <h3 className="text-base font-semibold text-gray-800">Alertas de atraso</h3>
                            </div>
                            <div className="p-4 space-y-3 max-h-[360px] overflow-y-auto">
                                {actionable.overdue_rows?.length ? actionable.overdue_rows.map((row) => (
                                    <div key={row.payment_id} className="rounded-xl border border-gray-100 p-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <p className="font-medium text-gray-900 truncate">{row.student_name}</p>
                                            <span className="text-sm font-semibold text-red-600">S/ {Number(row.amount || 0).toFixed(2)}</span>
                                        </div>
                                        <p className="mt-1 text-xs text-gray-500">
                                            {row.membership_name} · vence {row.due_date ? dayjs(row.due_date).format('DD/MM/YYYY') : 'sin fecha'} · {row.days_late} dias de atraso
                                        </p>
                                    </div>
                                )) : (
                                    <p className="text-sm text-gray-500">No hay pagos atrasados para mostrar.</p>
                                )}
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Main Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                    <h2 className="text-lg font-bold text-gray-800">Detalle de {MONTHS[selectedMonth]} {selectedYear}</h2>

                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                            <Search className="w-4 h-4 text-gray-400" />
                        </div>
                        <input
                            type="text"
                            placeholder="Buscar alumno o plan..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="bg-white border border-gray-200 text-gray-900 text-sm rounded-xl focus:ring-blue-500 focus:border-blue-500 block w-64 pl-10 p-2 outline-none transition-all placeholder-gray-400"
                        />
                    </div>
                </div>

                <div className="overflow-x-auto min-h-[300px]">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-400">
                            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                            <p>Cargando registros contables...</p>
                        </div>
                    ) : filteredRecords.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 gap-2 text-gray-400">
                            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-2">
                                <Search className="w-6 h-6 text-gray-300" />
                            </div>
                            <p className="font-medium text-gray-600">No hay movimientos registrados</p>
                            <p className="text-sm">Intenta buscar otro mes o limpia los filtros</p>
                        </div>
                    ) : (
                        <table className="w-full text-sm text-left text-gray-500 whitespace-nowrap">
                            <thead className="text-xs text-gray-500 bg-gray-50 uppercase font-semibold">
                                <tr>
                                    <th scope="col" className="px-6 py-4 rounded-tl-lg">Fecha</th>
                                    <th scope="col" className="px-6 py-4">Alumno</th>
                                    <th scope="col" className="px-6 py-4">Concepto</th>
                                    <th scope="col" className="px-6 py-4 text-right">Precio Base</th>
                                    <th scope="col" className="px-6 py-4 text-right">Descuento</th>
                                    <th scope="col" className="px-6 py-4 text-right">Total Pagado</th>
                                    <th scope="col" className="px-6 py-4">Método</th>
                                    <th scope="col" className="px-6 py-4 rounded-tr-lg">Estado</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredRecords.map((r) => (
                                    <tr key={r.payment_id} className="bg-white border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <span className="font-medium text-gray-900">{dayjs(r.paid_at).format('DD MMM, YYYY')}</span>
                                            <span className="text-gray-400 ml-2 text-xs">{dayjs(r.paid_at).format('HH:mm')}</span>
                                        </td>
                                        <td className="px-6 py-4 font-medium text-gray-900 max-w-[200px] truncate" title={r.student_name}>
                                            {r.student_name}
                                        </td>
                                        <td className="px-6 py-4 max-w-[200px] truncate" title={r.plan_name}>
                                            {r.plan_name}
                                        </td>
                                        <td className="px-6 py-4 text-right text-gray-400">
                                            S/ {Number(r.base_price).toFixed(2)}
                                        </td>
                                        <td className={clsx("px-6 py-4 text-right", Number(r.discount_calculated) > 0 ? "text-orange-500 font-medium" : "text-gray-400")}>
                                            S/ {Number(r.discount_calculated).toFixed(2)}
                                        </td>
                                        <td className="px-6 py-4 text-right font-bold text-gray-900">
                                            S/ {Number(r.amount_paid).toFixed(2)}
                                        </td>
                                        <td className="px-6 py-4">
                                            {r.payment_method === 'admin_manual' ? 'Caja / Manual' : (r.payment_method || 'N/A')}
                                        </td>
                                        <td className="px-6 py-4">
                                            {getStatusBadge(r.payment_status)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}
