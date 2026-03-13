'use client';

import { useState, useEffect } from 'react';
import { Plus, UsersRound, Clock, Phone, AlertCircle } from 'lucide-react';
import dayjs from 'dayjs';
import 'dayjs/locale/es';
import clsx from 'clsx';
import { IntroClassesService, IntroWeekendData, IntroSessionGroup } from '@/lib/services/IntroClassesService';
import RegisterIntroModal from './components/RegisterIntroModal';

dayjs.locale('es');

function SessionCard({ session }: { session: IntroSessionGroup }) {
    const available = session.capacity - session.booked_total;
    const isFull = available <= 0;
    const isAlmostFull = available > 0 && available <= 2;

    return (
        <div className={clsx(
            "rounded-xl border p-4 transition-all",
            isFull
                ? "border-red-500/30 bg-red-500/5"
                : isAlmostFull
                    ? "border-amber-500/30 bg-amber-500/5"
                    : "border-line bg-card"
        )}>
            {/* Header del turno */}
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <Clock size={16} className="text-textsec" />
                    <span className="font-semibold text-textpri">
                        {dayjs(session.start_at).format('HH:mm')} - {dayjs(session.end_at).format('HH:mm')}
                    </span>
                </div>
                <span className={clsx(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold",
                    isFull
                        ? "bg-red-500/15 text-red-400"
                        : isAlmostFull
                            ? "bg-amber-500/15 text-amber-400"
                            : "bg-emerald-500/15 text-emerald-400"
                )}>
                    {isFull && <AlertCircle size={12} />}
                    {session.booked_total}/{session.capacity}
                    {isFull ? ' LLENO' : ''}
                </span>
            </div>

            {/* Lista de clientes intro */}
            {session.clients.length > 0 ? (
                <div className="space-y-2">
                    {session.clients.map(client => (
                        <div
                            key={client.booking_id}
                            className="flex items-center gap-3 rounded-lg bg-background/60 px-3 py-2.5"
                        >
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                                <UsersRound size={12} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-textpri truncate">{client.full_name}</p>
                                <div className="flex items-center gap-3 text-xs text-textsec">
                                    <span>{client.age} años</span>
                                    {client.phone && (
                                        <span className="flex items-center gap-1">
                                            <Phone size={10} /> {client.phone}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="text-xs text-textsec italic text-center py-2">
                    Sin clases de prueba en este turno
                </p>
            )}
        </div>
    );
}

function DayColumn({ label, date, sessions }: { label: string; date: string; sessions: IntroSessionGroup[] }) {
    const introCount = sessions.reduce((sum, s) => sum + s.clients.length, 0);

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-bold text-textpri capitalize">
                        {label} {dayjs(date).format('DD MMM')}
                    </h2>
                    <p className="text-xs text-textsec mt-0.5">
                        {sessions.length} turnos · {introCount} prueba{introCount !== 1 ? 's' : ''}
                    </p>
                </div>
            </div>

            {sessions.length > 0 ? (
                <div className="space-y-3">
                    {sessions.map(session => (
                        <SessionCard key={session.session_id} session={session} />
                    ))}
                </div>
            ) : (
                <div className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-textsec">
                    No hay turnos configurados para este día.
                </div>
            )}
        </div>
    );
}

export default function IntroClient() {
    const [weekendData, setWeekendData] = useState<IntroWeekendData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const result = await IntroClassesService.getIntrosByWeekend();
            setWeekendData(result);
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
        fetchData();
    };

    const totalIntros = weekendData
        ? [...weekendData.saturday.sessions, ...weekendData.sunday.sessions].reduce(
            (sum, s) => sum + s.clients.length, 0
        )
        : 0;

    return (
        <div className="space-y-6">

            {/* Top Actions & KPIs */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="grid grid-cols-2 gap-3 sm:flex sm:gap-4 w-full sm:w-auto">
                    <div className="rounded-2xl border border-line bg-card p-4 shadow-soft">
                        <div className="flex items-center gap-2 text-textsec mb-1">
                            <UsersRound size={16} />
                            <span className="text-xs font-medium uppercase tracking-wider">Pruebas</span>
                        </div>
                        <p className="text-2xl font-bold text-textpri">{totalIntros}</p>
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

            {/* Weekend Grid */}
            {isLoading ? (
                <div className="flex items-center justify-center py-16">
                    <div className="flex items-center gap-2 text-textsec">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-r-transparent" />
                        Cargando turnos del fin de semana...
                    </div>
                </div>
            ) : weekendData ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <DayColumn
                        label="Sábado"
                        date={weekendData.saturday.date}
                        sessions={weekendData.saturday.sessions}
                    />
                    <DayColumn
                        label="Domingo"
                        date={weekendData.sunday.date}
                        sessions={weekendData.sunday.sessions}
                    />
                </div>
            ) : (
                <div className="rounded-xl border border-line p-12 text-center text-textsec">
                    No se pudo cargar la información del fin de semana.
                </div>
            )}

            <RegisterIntroModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSuccess={handleCreated}
            />
        </div>
    );
}
