'use client';

import { useState, useEffect } from 'react';
import { X, Calendar, DollarSign, User, Phone, Loader2 } from 'lucide-react';
import dayjs from 'dayjs';
import clsx from 'clsx';
import { IntroClassesService, AvailableIntroSession } from '@/lib/services/IntroClassesService';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export default function RegisterIntroModal({ isOpen, onClose, onSuccess }: Props) {
    const [sessions, setSessions] = useState<AvailableIntroSession[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [formData, setFormData] = useState({
        fullName: '',
        age: '',
        phone: '',
        sessionId: '',
        amountPaid: '45.00', // Precio sugerido por defecto? ajustaremos según la regla de negocio
        paymentMethod: 'transferencia'
    });

    useEffect(() => {
        if (isOpen) {
            loadSessions();
            setFormData(prev => ({ ...prev, fullName: '', age: '', phone: '', sessionId: '' }));
            setError(null);
        }
    }, [isOpen]);

    const loadSessions = async () => {
        setIsLoading(true);
        try {
            // Cargar sesiones de la próxima semana
            const available = await IntroClassesService.getAvailableSessions(7);
            setSessions(available);
            if (available.length > 0) {
                setFormData(prev => ({ ...prev, sessionId: available[0].session_id }));
            }
        } catch (err) {
            setError('Error al cargar turnos disponibles.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.fullName || !formData.age || !formData.sessionId || !formData.amountPaid) {
            setError('Por favor completa todos los campos requeridos.');
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            await IntroClassesService.registerIntroClass({
                fullName: formData.fullName,
                age: parseInt(formData.age, 10),
                phone: formData.phone,
                sessionId: formData.sessionId,
                amountPaid: parseFloat(formData.amountPaid),
                paymentMethod: formData.paymentMethod
            });

            onSuccess();
        } catch (err: any) {
            setError(err.message || 'Error al procesar el registro.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <>
            <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm transition-opacity" onClick={onClose} />

            <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 p-4">
                <div className="flex max-h-[90vh] flex-col overflow-hidden rounded-2xl bg-card shadow-xl ring-1 ring-black/5">
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-line px-6 py-4">
                        <h2 className="text-lg font-semibold text-textpri">Nueva Clase de Prueba</h2>
                        <button
                            onClick={onClose}
                            className="rounded-full p-2 text-textsec transition-colors hover:bg-black/5 hover:text-textpri"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {/* Body */}
                    <div className="overflow-y-auto px-6 py-4">
                        {error && (
                            <div className="mb-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-500">
                                {error}
                            </div>
                        )}

                        <form id="intro-form" onSubmit={handleSubmit} className="space-y-5">

                            {/* Sección Datos Personales */}
                            <div className="space-y-4">
                                <h3 className="text-sm font-medium text-textsec uppercase tracking-wider">1. Datos del Cliente</h3>

                                <div>
                                    <label className="mb-1.5 block text-sm font-medium text-textpri">Nombre Completo *</label>
                                    <div className="relative">
                                        <User className="absolute left-3 top-1/2 -translate-y-1/2 text-textsec" size={18} />
                                        <input
                                            type="text"
                                            className="w-full rounded-xl border border-line bg-background py-2.5 pl-10 pr-4 text-sm text-textpri outline-none transition-colors focus:border-accent"
                                            placeholder="Ej: Laura Torres"
                                            value={formData.fullName}
                                            onChange={(e) => setFormData(prev => ({ ...prev, fullName: e.target.value }))}
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="mb-1.5 block text-sm font-medium text-textpri">Edad *</label>
                                        <input
                                            type="number"
                                            className="w-full rounded-xl border border-line bg-background px-4 py-2.5 text-sm text-textpri outline-none transition-colors focus:border-accent"
                                            placeholder="Ej: 25"
                                            min="5"
                                            value={formData.age}
                                            onChange={(e) => setFormData(prev => ({ ...prev, age: e.target.value }))}
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-1.5 block text-sm font-medium text-textpri">Teléfono (Opcional)</label>
                                        <div className="relative">
                                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-textsec" size={16} />
                                            <input
                                                type="tel"
                                                className="w-full rounded-xl border border-line bg-background py-2.5 pl-9 pr-4 text-sm text-textpri outline-none transition-colors focus:border-accent"
                                                placeholder="Ej: 999 888 777"
                                                value={formData.phone}
                                                onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="h-px w-full bg-line" />

                            {/* Sección Reserva */}
                            <div className="space-y-4">
                                <h3 className="text-sm font-medium text-textsec uppercase tracking-wider">2. Asignar Turno</h3>

                                <div>
                                    <label className="mb-1.5 block text-sm font-medium text-textpri">
                                        Próximas Sesiones con Cupo
                                    </label>
                                    <div className="relative">
                                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-textsec" size={18} />
                                        <select
                                            className="w-full cursor-pointer appearance-none rounded-xl border border-line bg-background py-2.5 pl-10 pr-10 text-sm text-textpri outline-none transition-colors focus:border-accent disabled:opacity-50"
                                            value={formData.sessionId}
                                            onChange={(e) => setFormData(prev => ({ ...prev, sessionId: e.target.value }))}
                                            disabled={isLoading || sessions.length === 0}
                                            required
                                        >
                                            {isLoading ? (
                                                <option value="">Cargando turnos...</option>
                                            ) : sessions.length === 0 ? (
                                                <option value="">No hay turnos con cupo los próximos 7 días</option>
                                            ) : (
                                                sessions.map(s => (
                                                    <option key={s.session_id} value={s.session_id}>
                                                        {dayjs(s.start_at).format('ddd DD MMM - HH:mm')}
                                                        {' '}({s.available} cupos libres)
                                                    </option>
                                                ))
                                            )}
                                        </select>
                                    </div>
                                    <p className="mt-1.5 text-xs text-textsec">
                                        Las clases de prueba gastan el mismo cupo de arcos que los alumnos regulares.
                                    </p>
                                </div>
                            </div>

                            <div className="h-px w-full bg-line" />

                            {/* Sección Financiera */}
                            <div className="space-y-4">
                                <h3 className="text-sm font-medium text-textsec uppercase tracking-wider">3. Registro de Cobro</h3>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="mb-1.5 block text-sm font-medium text-textpri">Monto Cobrado *</label>
                                        <div className="relative">
                                            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-textsec" size={16} />
                                            <input
                                                type="number"
                                                step="0.01"
                                                className="w-full rounded-xl border border-line bg-background py-2.5 pl-9 pr-4 text-sm text-textpri outline-none transition-colors focus:border-accent"
                                                value={formData.amountPaid}
                                                onChange={(e) => setFormData(prev => ({ ...prev, amountPaid: e.target.value }))}
                                                required
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="mb-1.5 block text-sm font-medium text-textpri">Método</label>
                                        <select
                                            className="w-full cursor-pointer appearance-none rounded-xl border border-line bg-background py-2.5 px-4 text-sm text-textpri outline-none transition-colors focus:border-accent"
                                            value={formData.paymentMethod}
                                            onChange={(e) => setFormData(prev => ({ ...prev, paymentMethod: e.target.value }))}
                                        >
                                            <option value="transferencia">Transferencia</option>
                                            <option value="yape">Yape</option>
                                            <option value="plin">Plin</option>
                                            <option value="efectivo">Efectivo</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                        </form>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-end gap-3 border-t border-line bg-background/50 px-6 py-4">
                        <button
                            onClick={onClose}
                            disabled={isSubmitting}
                            className="rounded-xl px-4 py-2.5 text-sm font-medium text-textpri transition-colors hover:bg-black/5 disabled:opacity-50"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            form="intro-form"
                            disabled={isSubmitting || sessions.length === 0}
                            className="flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-white shadow-soft transition-transform hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:ring-offset-2 active:scale-95 disabled:opacity-50"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="animate-spin" size={16} />
                                    Registrando...
                                </>
                            ) : (
                                'Confirmar y Agendar'
                            )}
                        </button>
                    </div>

                </div>
            </div>
        </>
    );
}
