'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'
import { AuthGuard } from '@/components/AuthGuard'
import { Spinner } from '@/components/ui/Spinner'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { MembershipAlert } from '@/components/ui/MembershipAlert'
import { useStudentContext } from '@/lib/hooks/useStudentContext'
import { useStudentDashboard } from '@/lib/hooks/useStudentDashboard'
import { useMembershipExpiry } from '@/lib/hooks/useMembershipExpiry'
import { useBookingHistory } from '@/lib/hooks/useBookingHistory'
import { formatDateOnly } from '@/lib/utils/dateUtils'

export default function MembresiasPage() {
    const router = useRouter()
    const { account, activeStudentId, loading: contextLoading } = useStudentContext()
    const { dashboard, loading: dashboardLoading } = useStudentDashboard(activeStudentId)
    const { daysUntilExpiry, isExpired, isExpiringSoon } = useMembershipExpiry(dashboard)

    const {
        bookings: history,
        isLoading: isHistoryLoading,
        error: historyError,
        hasMore: hasMoreHistory,
        loadMoreBookings,
    } = useBookingHistory(activeStudentId)

    useEffect(() => {
        if (contextLoading) return

        if (account?.role === 'guardian' && !activeStudentId) {
            router.replace('/hub')
            return
        }
    }, [account?.role, activeStudentId, contextLoading, router])

    useEffect(() => {
        if (dashboard && history.length === 0 && !isHistoryLoading && hasMoreHistory) {
            loadMoreBookings()
        }
    }, [dashboard, history.length, isHistoryLoading, hasMoreHistory, loadMoreBookings])

    if (contextLoading || dashboardLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center p-5">
                <Spinner />
            </div>
        )
    }

    if (!dashboard) {
        return (
            <div className="p-5 text-center text-textsec">
                Datos de membresia no disponibles.
            </div>
        )
    }

    const classes = dashboard.classes_remaining ?? 0
    const classesStatus: 'normal' | 'low' | 'empty' =
        classes === 0 ? 'empty' : classes <= 2 ? 'low' : 'normal'

    return (
        <AuthGuard>
            <div className="p-0 sm:p-4 space-y-5">
                <header>
                    <h1 className="text-xl font-bold text-textpri">Mi Membresia</h1>
                    <p className="text-sm text-textsec mt-1">Historial y estado de cuenta</p>
                </header>

                <MembershipAlert
                    isExpired={isExpired}
                    isExpiringSoon={isExpiringSoon}
                    daysUntilExpiry={daysUntilExpiry}
                />

                <div className="grid grid-cols-1 gap-3">
                    <div className={`w-full rounded-2xl border p-5 ${classesStatus === 'empty' ? 'bg-danger/10 border-danger/30' :
                        classesStatus === 'low' ? 'bg-warning/10 border-warning/30' :
                            'border-line bg-card shadow-soft'
                        }`}>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className={`text-sm mb-1 font-medium ${classesStatus === 'empty' ? 'text-danger' :
                                    classesStatus === 'low' ? 'text-warning' :
                                        'text-textpri'
                                    }`}>
                                    {classesStatus === 'empty' ? 'Clases agotadas' : 'Clases disponibles'}
                                </p>
                                <div className="flex items-baseline gap-2">
                                    <p className={`text-5xl font-bold ${classesStatus === 'empty' ? 'text-danger' :
                                        classesStatus === 'low' ? 'text-warning' :
                                            'text-accent'
                                        }`}>
                                        {classes}
                                    </p>
                                    <span className={`text-sm font-medium ${classesStatus === 'empty' ? 'text-danger/50' : 'text-textsec'}`}>
                                        / {dashboard.classes_total || 0}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {(dashboard.classes_total ?? 0) > 0 && (
                            <div className="mt-4">
                                <div className="flex items-center justify-between text-xs text-textsec mb-1.5 font-medium uppercase tracking-wider">
                                    <span>{dashboard.classes_used ?? 0} clases usadas</span>
                                </div>
                                <div className="w-full h-2.5 rounded-full bg-background overflow-hidden border border-line">
                                    <div
                                        className={`h-full rounded-full transition-all ${classesStatus === 'empty' ? 'bg-danger' :
                                            classesStatus === 'low' ? 'bg-warning' :
                                                'bg-accent'
                                            }`}
                                        style={{ width: `${Math.min(((dashboard.classes_used ?? 0) / (dashboard.classes_total ?? 1)) * 100, 100)}%` }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="w-full rounded-2xl border border-line bg-card shadow-soft p-5">
                        <h3 className="font-semibold text-textpri mb-3">Vigencia del Plan</h3>
                        <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-textsec">Inicio:</span>
                                <span className="font-medium text-textpri">{formatDateOnly(dashboard.membership_start) || '-'}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-textsec">Vencimiento:</span>
                                <span className="font-medium text-textpri">{formatDateOnly(dashboard.membership_end) || '-'}</span>
                            </div>
                            <div className="flex justify-between text-sm pt-2 border-t border-line mt-2">
                                <span className="text-textsec">Plan:</span>
                                <span className="font-medium text-textpri">{dashboard.membership_name || '-'}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="w-full pt-2">
                    <h2 className="text-lg font-semibold text-textpri mb-4">Historial de Clases</h2>
                    <div className="space-y-3">
                        {history.length === 0 && !isHistoryLoading && (
                            <div className="card p-8 text-center bg-card shadow-soft border border-line">
                                <p className="text-textsec text-sm">No hay historial de reservas registradas.</p>
                            </div>
                        )}

                        {history.map(booking => {
                            const bowLabel = booking.bow_usage_type === 'own' ? 'Arco propio' :
                                booking.bow_usage_type === 'assigned' ? 'Arco asignado' :
                                    booking.bow_usage_type === 'shared_inventory' ? 'Arco academia' : null

                            return (
                                <div key={booking.booking_id} className="flex items-center justify-between p-4 rounded-xl bg-card border border-line shadow-soft">
                                    <div className="min-w-0 flex-1 pr-4">
                                        <p className="font-medium text-textpri truncate">{dayjs(booking.start_at).format('ddd, D MMM, YYYY')}</p>
                                        <div className="flex flex-wrap flex-row items-center gap-1.5 mt-1">
                                            <span className="text-xs font-medium text-textsec">
                                                {dayjs(booking.start_at).format('HH:mm')}
                                            </span>
                                            {booking.distance_m && (
                                                <>
                                                    <span className="text-textsec/30 text-xs">•</span>
                                                    <span className="text-xs text-textsec bg-background px-1.5 py-0.5 rounded-md border border-line">{booking.distance_m}m</span>
                                                </>
                                            )}
                                            {bowLabel && (
                                                <>
                                                    <span className="text-textsec/30 text-xs">•</span>
                                                    <span className="text-xs text-textsec bg-background px-1.5 py-0.5 rounded-md border border-line">{bowLabel}</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <div className="shrink-0 flex justify-end">
                                        <StatusBadge status={booking.status} />
                                    </div>
                                </div>
                            )
                        })}

                        {isHistoryLoading && (
                            <div className="flex justify-center py-6">
                                <Spinner />
                            </div>
                        )}

                        {historyError && (
                            <p className="text-danger text-sm text-center py-4">{historyError}</p>
                        )}

                        {hasMoreHistory && !isHistoryLoading && (
                            <button onClick={loadMoreBookings} className="btn-outline w-full bg-card">
                                Cargar mas historial
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </AuthGuard>
    )
}
