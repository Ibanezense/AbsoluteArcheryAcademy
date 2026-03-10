'use client'

import { useMemo, useState } from 'react'
import { AlertCircle, Edit2, Plus, Trash2 } from 'lucide-react'
import { useToast } from '@/components/ui/ToastProvider'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import {
  type BowInventoryItem,
  type WeeklySessionTemplate,
  useBowInventory,
  useCreateBowInventory,
  useCreateWeeklySessionTemplate,
  useDeleteBowInventory,
  useDeleteWeeklySessionTemplate,
  useGenerateWeeklySessions,
  useUpdateBowInventory,
  useUpdateWeeklySessionTemplate,
  useWeeklySessionTemplates,
} from '@/lib/infrastructureQueries'

const DISTANCES = [10, 15, 20, 30, 40, 50, 60, 70]
const WEEKDAYS = [
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miercoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sabado' },
  { value: 7, label: 'Domingo' },
]

type ModalType = 'bow-create' | 'bow-edit' | 'template-create' | 'template-edit' | null

function getMondayISO(date = new Date()) {
  const base = new Date(date)
  const day = base.getDay()
  const diff = day === 0 ? -6 : 1 - day
  base.setDate(base.getDate() + diff)
  return base.toISOString().slice(0, 10)
}

function weekdayLabel(weekday: number) {
  return WEEKDAYS.find((item) => item.value === weekday)?.label || `Dia ${weekday}`
}

function renderDistanceSummary(template: WeeklySessionTemplate) {
  if (!template.distances.length) {
    return 'Sin cupos configurados'
  }

  const totalTargets = template.distances.reduce((sum, d) => sum + (d.targets || 0), 0)
  const totalSlots = template.distances.reduce((sum, d) => sum + (d.slot_capacity || 0), 0)

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {template.distances.map((distance) => (
          <span key={distance.distance_m} className="text-xs text-textsec bg-white/5 px-2 py-0.5 rounded-full border border-white/5">
            {distance.distance_m}m: {distance.targets} p ({distance.slot_capacity} c)
          </span>
        ))}
      </div>
      <p className="mt-2 text-xs font-semibold text-accent uppercase tracking-wider">
        Total: {totalTargets} pacas · {totalSlots} cupos
      </p>
    </>
  )
}

export default function InfraestructuraClientPage() {
  const toast = useToast()
  const confirm = useConfirm()
  const [modalType, setModalType] = useState<ModalType>(null)
  const [selectedBow, setSelectedBow] = useState<BowInventoryItem | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<WeeklySessionTemplate | null>(null)
  const [weekStart, setWeekStart] = useState(getMondayISO())
  const [weeksToGenerate, setWeeksToGenerate] = useState(4)

  const {
    data: bowInventory = [],
    isLoading: inventoryLoading,
    error: inventoryError,
  } = useBowInventory()
  const {
    data: templates = [],
    isLoading: templatesLoading,
    error: templatesError,
  } = useWeeklySessionTemplates()

  const createBowMutation = useCreateBowInventory()
  const updateBowMutation = useUpdateBowInventory()
  const deleteBowMutation = useDeleteBowInventory()

  const createTemplateMutation = useCreateWeeklySessionTemplate()
  const updateTemplateMutation = useUpdateWeeklySessionTemplate()
  const deleteTemplateMutation = useDeleteWeeklySessionTemplate()
  const generateSessionsMutation = useGenerateWeeklySessions()

  const loading = inventoryLoading || templatesLoading
  const error = inventoryError || templatesError

  const totalActiveBows = useMemo(
    () => bowInventory.reduce((sum, item) => sum + item.quantity_active, 0),
    [bowInventory]
  )

  const totalConfiguredSlots = useMemo(
    () =>
      templates.reduce(
        (sum, template) =>
          sum + template.distances.reduce((distanceSum, distance) => distanceSum + (distance.slot_capacity || 0), 0),
        0
      ),
    [templates]
  )

  const closeModal = () => {
    setModalType(null)
    setSelectedBow(null)
    setSelectedTemplate(null)
  }

  const handleBowSubmit = async (formData: FormData) => {
    const drawWeight = Number(formData.get('draw_weight_lbs') || 0)
    const total = Number(formData.get('quantity_total') || 0)
    const active = Number(formData.get('quantity_active') || 0)
    const notes = String(formData.get('notes') || '').trim()

    if (drawWeight <= 0 || total < 0 || active < 0 || active > total) {
      toast.push({ message: 'Revisa el libraje y las cantidades del inventario.', type: 'error' })
      return
    }

    try {
      if (modalType === 'bow-create') {
        await createBowMutation.mutateAsync({
          draw_weight_lbs: drawWeight,
          quantity_total: total,
          quantity_active: active,
          notes,
        })
        toast.push({ message: 'Inventario guardado.', type: 'success' })
      } else if (modalType === 'bow-edit' && selectedBow) {
        await updateBowMutation.mutateAsync({
          id: selectedBow.id,
          draw_weight_lbs: drawWeight,
          quantity_total: total,
          quantity_active: active,
          notes,
        })
        toast.push({ message: 'Inventario actualizado.', type: 'success' })
      }

      closeModal()
    } catch (mutationError: any) {
      toast.push({ message: mutationError?.message || 'No se pudo guardar el inventario.', type: 'error' })
    }
  }

  const handleTemplateSubmit = async (formData: FormData) => {
    const label = String(formData.get('label') || '').trim()
    const weekday = Number(formData.get('weekday') || 0)
    const startTime = String(formData.get('start_time') || '')
    const endTime = String(formData.get('end_time') || '')
    const isActive = formData.get('is_active') === 'on'
    const distances = DISTANCES.map((distance) => {
      const pacas = Number(formData.get(`distance_${distance}`) || 0)
      return {
        distance_m: distance,
        slot_capacity: pacas * 4, // 4 cupos por paca
        targets: pacas,
      }
    })

    if (!label || !weekday || !startTime || !endTime || endTime <= startTime) {
      toast.push({ message: 'Revisa el nombre, dia y horario de la plantilla.', type: 'error' })
      return
    }

    if (!distances.some((distance) => distance.slot_capacity > 0)) {
      toast.push({ message: 'Configura al menos un cupo por distancia.', type: 'error' })
      return
    }

    try {
      if (modalType === 'template-create') {
        await createTemplateMutation.mutateAsync({
          label,
          weekday,
          start_time: startTime,
          end_time: endTime,
          is_active: isActive,
          distances,
        })
        toast.push({ message: 'Plantilla semanal creada.', type: 'success' })
      } else if (modalType === 'template-edit' && selectedTemplate) {
        await updateTemplateMutation.mutateAsync({
          id: selectedTemplate.id,
          label,
          weekday,
          start_time: startTime,
          end_time: endTime,
          is_active: isActive,
          distances,
        })
        toast.push({ message: 'Plantilla semanal actualizada.', type: 'success' })
      }

      closeModal()
    } catch (mutationError: any) {
      toast.push({ message: mutationError?.message || 'No se pudo guardar la plantilla.', type: 'error' })
    }
  }

  const handleDeleteBow = async (id: string) => {
    const confirmed = await confirm('¿Eliminar este libraje del inventario?', { title: 'Eliminar libraje' })
    if (!confirmed) {
      return
    }

    try {
      await deleteBowMutation.mutateAsync(id)
      toast.push({ message: 'Inventario eliminado.', type: 'success' })
    } catch (mutationError: any) {
      toast.push({ message: mutationError?.message || 'No se pudo eliminar el inventario.', type: 'error' })
    }
  }

  const handleDeleteTemplate = async (id: string) => {
    const confirmed = await confirm('¿Eliminar esta plantilla semanal?', { title: 'Eliminar plantilla' })
    if (!confirmed) {
      return
    }

    try {
      await deleteTemplateMutation.mutateAsync(id)
      toast.push({ message: 'Plantilla eliminada.', type: 'success' })
    } catch (mutationError: any) {
      toast.push({ message: mutationError?.message || 'No se pudo eliminar la plantilla.', type: 'error' })
    }
  }

  const handleGenerateSessions = async () => {
    try {
      const created = await generateSessionsMutation.mutateAsync({
        weekStart,
        weeks: weeksToGenerate,
      })
      toast.push({
        message: created === 0 ? 'No se crearon turnos nuevos.' : `Turnos generados: ${created}.`,
        type: 'success',
      })
    } catch (mutationError: any) {
      toast.push({ message: mutationError?.message || 'No se pudieron generar los turnos.', type: 'error' })
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-textsec">Cargando infraestructura...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-[400px] items-center justify-center text-danger">
        <AlertCircle className="mr-2 h-5 w-5" />
        Error al cargar la infraestructura
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="card p-5">
          <p className="text-sm text-textsec">Inventario activo</p>
          <p className="mt-2 text-3xl font-semibold text-textpri">{totalActiveBows}</p>
          <p className="mt-1 text-xs text-textsec">Arcos compartidos configurados por libraje</p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-textsec">Plantillas activas</p>
          <p className="mt-2 text-3xl font-semibold text-textpri">
            {templates.filter((template) => template.is_active).length}
          </p>
          <p className="mt-1 text-xs text-textsec">Turnos semanales listos para generar</p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-textsec">Cupos semanales</p>
          <p className="mt-2 text-3xl font-semibold text-textpri">{totalConfiguredSlots}</p>
          <p className="mt-1 text-xs text-textsec">Suma de cupos por distancia en plantillas</p>
        </div>
      </div>

      <div className="card p-6">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-textpri">Inventario de arcos</h2>
            <p className="mt-1 text-sm text-textsec">
              Define cuantos arcos compartidos hay disponibles por libraje.
            </p>
          </div>
          <button
            onClick={() => setModalType('bow-create')}
            className="btn flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Agregar libraje
          </button>
        </div>

        <div className="space-y-3">
          {bowInventory.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-textsec">
              No hay inventario configurado. Usa el botón de arriba para agregar arcos.
            </div>
          ) : (
            bowInventory.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-bg/40 p-4">
                <div>
                  <h3 className="font-medium text-textpri">{item.draw_weight_lbs} lb</h3>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-textsec">
                    <span>{item.quantity_active}/{item.quantity_total} activos</span>
                    {item.notes && <span>{item.notes}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setSelectedBow(item)
                      setModalType('bow-edit')
                    }}
                    className="rounded-lg p-2 text-textsec transition-colors hover:bg-white/10 hover:text-textpri"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteBow(item.id)}
                    className="rounded-lg p-2 text-textsec transition-colors hover:bg-red-500/20 hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="card p-6">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-textpri">Plantillas semanales</h2>
            <p className="mt-1 text-sm text-textsec">
              Configura los turnos recurrentes y sus cupos por distancia.
            </p>
          </div>
          <button
            onClick={() => setModalType('template-create')}
            className="btn flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Agregar plantilla
          </button>
        </div>

        <div className="space-y-3">
          {templates.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-textsec">
              No hay plantillas semanales configuradas.
            </div>
          ) : (
            templates.map((template) => (
              <div key={template.id} className="rounded-2xl border border-white/10 bg-bg/40 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="font-medium text-textpri">{template.label}</h3>
                      <span
                        className={`rounded-full border px-2 py-1 text-xs ${template.is_active
                          ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
                          : 'border-red-500/30 bg-red-500/15 text-red-300'
                          }`}
                      >
                        {template.is_active ? 'Activa' : 'Inactiva'}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-textsec">
                      {weekdayLabel(template.weekday)} · {template.start_time.slice(0, 5)} - {template.end_time.slice(0, 5)}
                    </p>
                    <p className="mt-2 text-sm text-textsec">{renderDistanceSummary(template)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setSelectedTemplate(template)
                        setModalType('template-edit')
                      }}
                      className="rounded-lg p-2 text-textsec transition-colors hover:bg-white/10 hover:text-textpri"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteTemplate(template.id)}
                      className="rounded-lg p-2 text-textsec transition-colors hover:bg-red-500/20 hover:text-danger"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="card p-6">
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-textpri">Generar turnos</h2>
          <p className="mt-1 text-sm text-textsec">
            Crea sesiones reales desde las plantillas activas. Si un turno ya existe, no se duplica.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="mb-2 block text-sm font-medium text-textsec">Semana base</label>
            <input
              type="date"
              value={weekStart}
              onChange={(event) => setWeekStart(event.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-textsec">Semanas a generar</label>
            <input
              type="number"
              min="1"
              max="24"
              value={weeksToGenerate}
              onChange={(event) => setWeeksToGenerate(Number(event.target.value || 1))}
              className="input"
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={handleGenerateSessions}
              disabled={generateSessionsMutation.isPending}
              className="btn w-full"
            >
              {generateSessionsMutation.isPending ? 'Generando...' : 'Generar turnos'}
            </button>
          </div>
        </div>

        <p className="mt-4 text-xs text-textsec">
          Para cambiar un turno puntual despues de generarlo, editalo desde la pantalla de turnos.
        </p>
      </div>

      {(modalType === 'bow-create' || modalType === 'bow-edit') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-card p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold text-textpri">
              {modalType === 'bow-create' ? 'Agregar libraje' : 'Editar libraje'}
            </h3>
            <form action={handleBowSubmit} className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-textsec">Libraje (lb)</label>
                <input
                  name="draw_weight_lbs"
                  type="number"
                  min="1"
                  defaultValue={selectedBow?.draw_weight_lbs || ''}
                  className="input"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-2 block text-sm font-medium text-textsec">Cantidad total</label>
                  <input
                    name="quantity_total"
                    type="number"
                    min="0"
                    defaultValue={selectedBow?.quantity_total ?? 0}
                    className="input"
                    required
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-textsec">Cantidad activa</label>
                  <input
                    name="quantity_active"
                    type="number"
                    min="0"
                    defaultValue={selectedBow?.quantity_active ?? 0}
                    className="input"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-textsec">Notas</label>
                <textarea
                  name="notes"
                  defaultValue={selectedBow?.notes || ''}
                  className="input min-h-24"
                  placeholder="Observaciones opcionales"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeModal} className="btn-outline flex-1">
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn flex-1"
                  disabled={createBowMutation.isPending || updateBowMutation.isPending}
                >
                  {createBowMutation.isPending || updateBowMutation.isPending ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {(modalType === 'template-create' || modalType === 'template-edit') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-3xl rounded-2xl border border-white/10 bg-card p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold text-textpri">
              {modalType === 'template-create' ? 'Agregar plantilla semanal' : 'Editar plantilla semanal'}
            </h3>
            <form action={handleTemplateSubmit} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-textsec">Nombre</label>
                  <input
                    name="label"
                    type="text"
                    defaultValue={selectedTemplate?.label || ''}
                    className="input"
                    placeholder="Ej: Grupo intermedio tarde"
                    required
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-textsec">Dia</label>
                  <select
                    name="weekday"
                    defaultValue={selectedTemplate?.weekday || 1}
                    className="input"
                    required
                  >
                    {WEEKDAYS.map((weekday) => (
                      <option key={weekday.value} value={weekday.value}>
                        {weekday.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-textsec">Hora inicio</label>
                  <input
                    name="start_time"
                    type="time"
                    defaultValue={selectedTemplate?.start_time?.slice(0, 5) || ''}
                    className="input"
                    required
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-textsec">Hora fin</label>
                  <input
                    name="end_time"
                    type="time"
                    defaultValue={selectedTemplate?.end_time?.slice(0, 5) || ''}
                    className="input"
                    required
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-textpri">Pacas por distancia</p>
                    <p className="text-[10px] text-textsec uppercase tracking-widest mt-1">Cada paca = 4 cupos para alumnos</p>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-textsec">
                    <input
                      name="is_active"
                      type="checkbox"
                      defaultChecked={selectedTemplate ? selectedTemplate.is_active : true}
                    />
                    Plantilla activa
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  {DISTANCES.map((distance) => {
                    const defaultDistance = selectedTemplate?.distances.find(
                      (item) => item.distance_m === distance
                    )

                    return (
                      <div key={distance}>
                        <label className="mb-2 block text-sm font-medium text-textsec">{distance} m</label>
                        <input
                          name={`distance_${distance}`}
                          type="number"
                          min="0"
                          defaultValue={defaultDistance?.targets ?? 0}
                          className="input"
                        />
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeModal} className="btn-outline flex-1">
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn flex-1"
                  disabled={createTemplateMutation.isPending || updateTemplateMutation.isPending}
                >
                  {createTemplateMutation.isPending || updateTemplateMutation.isPending ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
