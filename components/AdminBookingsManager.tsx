"use client"

import { useState } from 'react'
import Card from '@/components/ui/card'
import Button from '@/components/ui/button'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { 
  useAdminBookings, 
  useAdminCancelBooking,
  type AdminBooking 
} from '@/lib/adminBookingQueries'

const ITEMS_PER_PAGE = 10

export default function AdminBookingsManager() {
  const confirm = useConfirm()
  const [currentPage, setCurrentPage] = useState(1)

  const { data: bookings = [], isLoading } = useAdminBookings()
  const cancelBookingMutation = useAdminCancelBooking()

  // Filtrar solo reservas activas (no canceladas ni pasadas)
  const allActiveBookings = bookings.filter(b => 
    b.status === 'reserved' && new Date(b.start_at) > new Date()
  )
  
  // Paginación
  const totalPages = Math.ceil(allActiveBookings.length / ITEMS_PER_PAGE)
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const endIndex = startIndex + ITEMS_PER_PAGE
  const activeBookings = allActiveBookings.slice(startIndex, endIndex)

  const handleCancelBooking = async (bookingId: string) => {
    const confirmed = await confirm(
      '¿Estás seguro de que quieres cancelar esta reserva? Se devolverá el crédito al estudiante automáticamente.',
      { title: 'Cancelar Reserva' }
    )
    
    if (!confirmed) return

    try {
      await cancelBookingMutation.mutateAsync(bookingId)
      alert('Reserva cancelada exitosamente. Se devolvió el crédito al estudiante.')
      
      // Recargar la página para actualizar todas las vistas
      window.location.reload()
    } catch (error: any) {
      alert(`Error: ${error.message}`)
    }
  }

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('es-ES', {
      weekday: 'short',
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'reserved': return 'text-green-400'
      case 'cancelled': return 'text-red-400'
      case 'attended': return 'text-blue-400'
      case 'no_show': return 'text-yellow-400'
      default: return 'text-slate-400'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'reserved': return 'Reservada'
      case 'cancelled': return 'Cancelada'
      case 'attended': return 'Asistió'
      case 'no_show': return 'No asistió'
      default: return status
    }
  }

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="text-center py-8 text-slate-400">
          Cargando reservas...
        </div>
      </Card>
    )
  }

  return (
    <>
      <Card className="p-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white">Reservas Activas</h3>
              <p className="text-slate-400 text-sm">Próximas reservas de estudiantes</p>
            </div>
            <div className="text-sm text-slate-400">
              {activeBookings.length} reservas activas
            </div>
          </div>

          {activeBookings.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              No hay reservas activas próximas.
            </div>
          ) : (
            <div className="space-y-3">
              {activeBookings.map((booking) => (
                <div 
                  key={booking.booking_id}
                  className="bg-slate-800 rounded-lg p-4 border border-slate-700"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <div className="font-medium text-white">
                            {booking.student_name}
                          </div>
                          <div className="text-sm text-slate-300">
                            {formatDateTime(booking.start_at)} • {booking.distance}m
                          </div>
                          {/* Mostrar categoría/grupo si está disponible */}
                          {booking.group_type && (
                            <div className="text-xs text-purple-400 mt-1">
                              {booking.group_type === 'children' ? '👶 Niños' :
                               booking.group_type === 'youth' ? '🧒 Jóvenes' :
                               booking.group_type === 'adult' ? '🧑 Adultos' :
                               booking.group_type === 'assigned' ? '🎯 Asignados' :
                               booking.group_type === 'ownbow' ? '🏹 Arco propio' : booking.group_type}
                            </div>
                          )}
                          {/* Mostrar notas del admin si existen */}
                          {booking.admin_notes && (
                            <div className="text-xs text-amber-400 mt-1 italic">
                              📝 {booking.admin_notes}
                            </div>
                          )}
                          <div className="text-xs text-slate-400 mt-1">
                            Instructor: {booking.coach_name || 'Sin asignar'}
                            <span className="ml-3">
                              Clases restantes: 
                              <span className={`ml-1 ${booking.classes_remaining > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {booking.classes_remaining}
                              </span>
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-1 rounded ${getStatusColor(booking.status)}`}>
                        {getStatusText(booking.status)}
                      </span>
                      {booking.status === 'reserved' && (
                        <Button
                          variant="ghost"
                          onClick={() => handleCancelBooking(booking.booking_id)}
                          className="text-red-400 hover:text-red-300 hover:bg-red-400/10 !px-3 !py-1"
                        >
                          Cancelar
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Información adicional de la clase */}
                  <div className="mt-3 pt-3 border-t border-slate-700">
                    <div className="flex items-center text-xs text-slate-400 gap-4">
                      <span>
                        Ocupación: {booking.current_reservations}/{booking.capacity}
                      </span>
                      <span>
                        Reservado: {formatDateTime(booking.booking_created)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Paginación */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t border-slate-700">
              <div className="text-xs text-slate-400">
                Mostrando {startIndex + 1}-{Math.min(endIndex, allActiveBookings.length)} de {allActiveBookings.length} reservas
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="!px-3 !py-1 text-xs"
                >
                  ← Anterior
                </Button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`px-3 py-1 text-xs rounded ${
                        page === currentPage 
                          ? 'bg-accent text-white font-medium' 
                          : 'text-slate-400 hover:text-white hover:bg-slate-700'
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                </div>
                <Button
                  variant="outline"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="!px-3 !py-1 text-xs"
                >
                  Siguiente →
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </>
  )
}