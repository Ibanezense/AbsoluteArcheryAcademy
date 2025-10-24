"use client"

import { useState } from 'react'
import { Plus, Edit2, Trash2, AlertCircle } from 'lucide-react'
import { 
  useEquipment, 
  useCreateEquipment, 
  useUpdateEquipment, 
  useDeleteEquipment,
  useShootingLanes,
  useCreateShootingLane,
  useUpdateShootingLane,
  useDeleteShootingLane,
  type Equipment,
  type ShootingLane,
  type CreateEquipmentData,
  type UpdateEquipmentData,
  type CreateShootingLaneData,
  type UpdateShootingLaneData
} from '@/lib/infrastructureQueries'

type ModalType = 'equipment-create' | 'equipment-edit' | 'lane-create' | 'lane-edit' | null

export default function InfraestructuraClientPage() {
  const [modalType, setModalType] = useState<ModalType>(null)
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null)
  const [selectedLane, setSelectedLane] = useState<ShootingLane | null>(null)

  // Equipment queries
  const { data: equipment = [], isLoading: equipmentLoading, error: equipmentError } = useEquipment()
  const createEquipmentMutation = useCreateEquipment()
  const updateEquipmentMutation = useUpdateEquipment()
  const deleteEquipmentMutation = useDeleteEquipment()

  // Shooting lanes queries
  const { data: lanes = [], isLoading: lanesLoading, error: lanesError } = useShootingLanes()
  const createLaneMutation = useCreateShootingLane()
  const updateLaneMutation = useUpdateShootingLane()
  const deleteLaneMutation = useDeleteShootingLane()

  const handleEquipmentSubmit = async (formData: FormData) => {
    const name = formData.get('name') as string
    const category = formData.get('category') as 'niños' | 'jovenes' | 'adultos' | 'asignados'
    const total_quantity = parseInt(formData.get('total_quantity') as string)

    try {
      if (modalType === 'equipment-create') {
        await createEquipmentMutation.mutateAsync({ name, category, total_quantity })
      } else if (modalType === 'equipment-edit' && selectedEquipment) {
        await updateEquipmentMutation.mutateAsync({ 
          id: selectedEquipment.id, 
          name, 
          category, 
          total_quantity 
        })
      }
      setModalType(null)
      setSelectedEquipment(null)
    } catch (error) {
      console.error('Error saving equipment:', error)
    }
  }

  const handleLaneSubmit = async (formData: FormData) => {
    const name = formData.get('name') as string
    const distance_meters = parseInt(formData.get('distance_meters') as string)
    const capacity = parseInt(formData.get('capacity') as string)

    try {
      if (modalType === 'lane-create') {
        await createLaneMutation.mutateAsync({ name, distance_meters, capacity })
      } else if (modalType === 'lane-edit' && selectedLane) {
        await updateLaneMutation.mutateAsync({ 
          id: selectedLane.id, 
          name, 
          distance_meters, 
          capacity 
        })
      }
      setModalType(null)
      setSelectedLane(null)
    } catch (error) {
      console.error('Error saving lane:', error)
    }
  }

  const handleDeleteEquipment = async (id: string) => {
    if (confirm('¿Estás seguro de que deseas eliminar este equipamiento?')) {
      try {
        await deleteEquipmentMutation.mutateAsync(id)
      } catch (error) {
        console.error('Error deleting equipment:', error)
      }
    }
  }

  const handleDeleteLane = async (id: string) => {
    if (confirm('¿Estás seguro de que deseas eliminar esta pista?')) {
      try {
        await deleteLaneMutation.mutateAsync(id)
      } catch (error) {
        console.error('Error deleting lane:', error)
      }
    }
  }

  const getCategoryLabel = (category: string) => {
    const labels = {
      'niños': 'Niños',
      'jovenes': 'Jóvenes',
      'adultos': 'Adultos',
      'asignados': 'Asignados'
    }
    return labels[category as keyof typeof labels] || category
  }

  const getCategoryColor = (category: string) => {
    const colors = {
      'niños': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      'jovenes': 'bg-green-500/20 text-green-400 border-green-500/30',
      'adultos': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      'asignados': 'bg-orange-500/20 text-orange-400 border-orange-500/30'
    }
    return colors[category as keyof typeof colors] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'
  }

  if (equipmentLoading || lanesLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-slate-300">Cargando infraestructura...</div>
      </div>
    )
  }

  if (equipmentError || lanesError) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-red-400">
        <AlertCircle className="w-5 h-5 mr-2" />
        Error al cargar la infraestructura
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Equipment Card */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-white">Equipamiento</h2>
            <p className="text-slate-400 text-sm mt-1">Gestiona tu inventario de arcos y otros equipos.</p>
          </div>
          <button
            onClick={() => setModalType('equipment-create')}
            className="hover-accent btn flex items-center gap-2"
            style={{ backgroundColor: 'var(--accent-color)', color: 'white' }}
          >
            <Plus className="w-4 h-4" />
            Agregar Equipamiento
          </button>
        </div>

        <div className="space-y-3">
          {equipment.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              No hay equipamiento registrado
            </div>
          ) : (
            equipment.map((item) => (
              <div key={item.id} className="flex items-center justify-between p-4 bg-gray-800 rounded-lg border border-gray-700">
                <div className="flex items-center gap-4">
                  <div>
                    <h3 className="font-medium text-white">{item.name}</h3>
                    <div className="flex items-center gap-3 mt-1">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full border ${getCategoryColor(item.category)}`}>
                        {getCategoryLabel(item.category)}
                      </span>
                      <span className="text-slate-400 text-sm">
                        {item.available_quantity}/{item.total_quantity} disponibles
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setSelectedEquipment(item)
                      setModalType('equipment-edit')
                    }}
                    className="hover-accent p-2 rounded-lg transition-colors"
                  >
                    <Edit2 className="w-4 h-4 text-slate-400" />
                  </button>
                  <button
                    onClick={() => handleDeleteEquipment(item.id)}
                    className="p-2 rounded-lg transition-colors hover:bg-red-500/20 hover:text-red-400"
                  >
                    <Trash2 className="w-4 h-4 text-slate-400" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Shooting Lanes Card */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-white">Pistas de Tiro</h2>
            <p className="text-slate-400 text-sm mt-1">Configura las distancias y capacidades de las pistas.</p>
          </div>
          <button
            onClick={() => setModalType('lane-create')}
            className="hover-accent btn flex items-center gap-2"
            style={{ backgroundColor: 'var(--accent-color)', color: 'white' }}
          >
            <Plus className="w-4 h-4" />
            Agregar Pista
          </button>
        </div>

        <div className="space-y-3">
          {lanes.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              No hay pistas registradas
            </div>
          ) : (
            lanes.map((lane) => (
              <div key={lane.id} className="flex items-center justify-between p-4 bg-gray-800 rounded-lg border border-gray-700">
                <div className="flex items-center gap-4">
                  <div>
                    <h3 className="font-medium text-white">{lane.name}</h3>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-slate-400 text-sm">
                        {lane.distance_meters}m
                      </span>
                      <span className="text-slate-400 text-sm">
                        {lane.capacity} arqueros
                      </span>
                      {!lane.is_active && (
                        <span className="px-2 py-1 text-xs font-medium rounded-full border bg-red-500/20 text-red-400 border-red-500/30">
                          Inactiva
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setSelectedLane(lane)
                      setModalType('lane-edit')
                    }}
                    className="hover-accent p-2 rounded-lg transition-colors"
                  >
                    <Edit2 className="w-4 h-4 text-slate-400" />
                  </button>
                  <button
                    onClick={() => handleDeleteLane(lane.id)}
                    className="p-2 rounded-lg transition-colors hover:bg-red-500/20 hover:text-red-400"
                  >
                    <Trash2 className="w-4 h-4 text-slate-400" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Equipment Modal */}
      {(modalType === 'equipment-create' || modalType === 'equipment-edit') && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-white mb-4">
              {modalType === 'equipment-create' ? 'Agregar Equipamiento' : 'Editar Equipamiento'}
            </h3>
            <form action={handleEquipmentSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Nombre</label>
                <input
                  name="name"
                  type="text"
                  defaultValue={selectedEquipment?.name || ''}
                  className="input"
                  placeholder="Ej: Arco Recurvo Infantil"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Categoría</label>
                <select
                  name="category"
                  defaultValue={selectedEquipment?.category || 'niños'}
                  className="input"
                  required
                >
                  <option value="niños">Niños</option>
                  <option value="jovenes">Jóvenes</option>
                  <option value="adultos">Adultos</option>
                  <option value="asignados">Asignados</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Cantidad Total</label>
                <input
                  name="total_quantity"
                  type="number"
                  min="1"
                  defaultValue={selectedEquipment?.total_quantity || 1}
                  className="input"
                  required
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setModalType(null)
                    setSelectedEquipment(null)
                  }}
                  className="btn-ghost flex-1"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn flex-1"
                  style={{ backgroundColor: 'var(--accent-color)', color: 'white' }}
                  disabled={createEquipmentMutation.isPending || updateEquipmentMutation.isPending}
                >
                  {createEquipmentMutation.isPending || updateEquipmentMutation.isPending 
                    ? 'Guardando...' 
                    : modalType === 'equipment-create' ? 'Crear' : 'Guardar'
                  }
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Shooting Lane Modal */}
      {(modalType === 'lane-create' || modalType === 'lane-edit') && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-white mb-4">
              {modalType === 'lane-create' ? 'Agregar Pista' : 'Editar Pista'}
            </h3>
            <form action={handleLaneSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Nombre</label>
                <input
                  name="name"
                  type="text"
                  defaultValue={selectedLane?.name || ''}
                  className="input"
                  placeholder="Ej: Pista Corta"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Distancia (metros)</label>
                <input
                  name="distance_meters"
                  type="number"
                  min="1"
                  defaultValue={selectedLane?.distance_meters || 10}
                  className="input"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Capacidad (arqueros)</label>
                <input
                  name="capacity"
                  type="number"
                  min="1"
                  defaultValue={selectedLane?.capacity || 4}
                  className="input"
                  required
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setModalType(null)
                    setSelectedLane(null)
                  }}
                  className="btn-ghost flex-1"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn flex-1"
                  style={{ backgroundColor: 'var(--accent-color)', color: 'white' }}
                  disabled={createLaneMutation.isPending || updateLaneMutation.isPending}
                >
                  {createLaneMutation.isPending || updateLaneMutation.isPending 
                    ? 'Guardando...' 
                    : modalType === 'lane-create' ? 'Crear' : 'Guardar'
                  }
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}