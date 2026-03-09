'use client';

import { useState, useEffect } from 'react';
import { Plus, UsersRound, Calendar, Phone, Activity } from 'lucide-react';
import dayjs from 'dayjs';
import clsx from 'clsx';
import { IntroClassesService, IntroClientRecord } from '@/lib/services/IntroClassesService';
import RegisterIntroModal from './components/RegisterIntroModal';

export default function IntroClient() {
    const [data, setData] = useState<IntroClientRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const result = await IntroClassesService.getUpcomingIntros();
            setData(result);
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleCreated = () => {
        setIsModalOpen(false);
        fetchData(); // Refrescar lista
    };

    return (
        <div className="space-y-6">

            {/* Top Actions & KPIs */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="grid grid-cols-2 gap-3 sm:flex sm:gap-4 w-full sm:w-auto">
                    <div className="rounded-2xl border border-line bg-card p-4 shadow-soft">
                        <div className="flex items-center gap-2 text-textsec mb-1">
                            <UsersRound size={16} />
                            <span className="text-xs font-medium uppercase tracking-wider">Próximas</span>
                        </div>
                        <p className="text-2xl font-bold text-textpri">{data.length}</p>
                    </div>
                </div>

                <button
                    onClick={() => setIsModalOpen(true)}
                    className="flex flex-1 sm:flex-none items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white shadow-soft transition-transform active:scale-95"
                >
                    <Plus size={18} />
                    Nueva Clase
                </button>
            </div>

            {/* Table Section */}
            <div className="overflow-hidden rounded-2xl border border-line bg-card shadow-soft">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="border-b border-line bg-background/50 text-xs uppercase text-textsec">
                            <tr>
                                <th className="px-6 py-4 font-medium">Cliente</th>
                                <th className="px-6 py-4 font-medium">Edad</th>
                                <th className="px-6 py-4 font-medium">Turno Reservado</th>
                                <th className="px-6 py-4 font-medium">Estado</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-8 text-center text-textsec">
                                        <div className="flex items-center justify-center gap-2">
                                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-r-transparent" />
                                            Cargando clases...
                                        </div>
                                    </td>
                                </tr>
                            ) : data.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-12 text-center text-textsec">
                                        No hay clases de prueba agendadas próximamente.
                                    </td>
                                </tr>
                            ) : (
                                data.map((row) => {
                                    const isPast = dayjs(row.session_end).isBefore(dayjs());

                                    return (
                                        <tr key={row.booking_id} className="transition-colors hover:bg-white/5">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10 text-accent">
                                                        <UsersRound size={14} />
                                                    </div>
                                                    <div>
                                                        <p className="font-medium text-textpri">{row.full_name}</p>
                                                        {row.phone && (
                                                            <p className="flex items-center gap-1 text-xs text-textsec mt-0.5">
                                                                <Phone size={10} /> {row.phone}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-textsec">{row.age} años</td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col">
                                                    <span className="font-medium text-textpri">
                                                        {dayjs(row.session_start).format('DD MMM, YYYY')}
                                                    </span>
                                                    <span className="flex items-center gap-1 text-xs text-textsec mt-0.5">
                                                        <Calendar size={12} />
                                                        {dayjs(row.session_start).format('HH:mm')} - {dayjs(row.session_end).format('HH:mm')}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={clsx(
                                                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                                                    isPast ? "bg-gray-500/10 text-gray-400" : "bg-emerald-500/10 text-emerald-500"
                                                )}>
                                                    <Activity size={12} />
                                                    {isPast ? 'Finalizada' : 'Pendiente'}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <RegisterIntroModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSuccess={handleCreated}
            />
        </div>
    );
}
