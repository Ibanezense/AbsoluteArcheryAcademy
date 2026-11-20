'use client'

import { useMemo, useState } from 'react'
import { AlertCircle, CalendarDays, Edit2, MapPin, Package, Plus, Trash2 } from 'lucide-react'
import { useToast } from '@/components/ui/ToastProvider'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import {
  type BowInventoryItem,
  type AcademyLocation,
  type WeeklySessionTemplate,
  useBowInventory,
  useAcademyLocations,
  useCreateBowInventory,
  useCreateWeeklySessionTemplate,
  useDeleteBowInventory,
  useDeleteWeeklySessionTemplate,
  useUpdateBowInventory,
  useUpdateWeeklySessionTemplate,
  useUpdateAcademyLocation,
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
          <span key={distance.distance_m} className="rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-xs text-blue-900">
            {distance.distance_m}m: {distance.targets} p ({distance.slot_capacity} posiciones)
          </span>
        ))}
      </div>
      <p className="mt-2 text-xs font-semibold text-accent uppercase tracking-wider">
        Distribución: {totalTargets} pacas · {totalSlots} posiciones por distancia
      </p>
    </>
  )
}

function LocationEditor({ location, saving, onSave }: { location: AcademyLocation; saving: boolean; onSave: (location: AcademyLocation) => void }) {
  const [draft, setDraft] = useState(location)
  const invalidUrl = Boolean(draft.maps_url?.trim()) && (() => { try { return !['http:', 'https:'].includes(new URL(draft.maps_url!.trim()).protocol) } catch { return true } })()
  return (
    <article className="rounded-2xl border border-blue-100 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div><p className="font-semibold text-textpri">{location.name}</p><p className="text-xs uppercase tracking-wider text-textsec">{location.code}</p></div>
        <label className="flex items-center gap-2 text-sm font-bold text-textsec"><input type="checkbox" checked={draft.is_active} onChange={(event) => setDraft({ ...draft, is_active: event.target.checked })} /> Activa</label>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-sm font-bold text-textsec">Nombre<input className="input" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
        <label className="grid gap-1 text-sm font-bold text-textsec">Dirección<input className="input" value={draft.address || ''} onChange={(event) => setDraft({ ...draft, address: event.target.value })} /></label>
        <label className="grid gap-1 text-sm font-bold text-textsec md:col-span-2">Enlace de ubicación<input className="input" value={draft.maps_url || ''} onChange={(event) => setDraft({ ...draft, maps_url: event.target.value })} /></label>
      </div>
      {invalidUrl && <p role="alert" className="mt-2 text-sm text-red-700">Introduce un enlace válido que empiece por http:// o https://.</p>}
      {!draft.address?.trim() && <p className="mt-2 text-sm text-orange-700">Dirección pendiente</p>}
      <button type="button" className="btn mt-4" disabled={saving || !draft.name.trim() || invalidUrl} onClick={() => onSave(draft)}>{saving ? 'Guardando…' : 'Guardar sede'}</button>
    </article>
  )
}

export default function InfraestructuraClientPage() {
  const toast = useToast()
  const confirm = useConfirm()
  const [modalType, setModalType] = useState<ModalType>(null)
  const [selectedBow, setSelectedBow] = useState<BowInventoryItem | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<WeeklySessionTemplate | null>(null)
  const [templateLocationId, setTemplateLocationId] = useState('')

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
  const { data: locations = [], isLoading: locationsLoading, error: locationsError } = useAcademyLocations()

  const createBowMutation = useCreateBowInventory()
  const updateBowMutation = useUpdateBowInventory()
  const deleteBowMutation = useDeleteBowInventory()

  const createTemplateMutation = useCreateWeeklySessionTemplate()
  const updateTemplateMutation = useUpdateWeeklySessionTemplate()
  const deleteTemplateMutation = useDeleteWeeklySessionTemplate()
  const updateLocationMutation = useUpdateAcademyLocation()

  const loading = inventoryLoading || templatesLoading || locationsLoading
  const error = inventoryError || templatesError || locationsError

  const totalActiveBows = useMemo(
    () => bowInventory.reduce((sum, item) => sum + item.quantity_active, 0),
    [bowInventory]
  )

  const templatesByLocation = useMemo(
    () => new Map(
      locations.map((location) => [
        location.id,
        templates.filter((template) => template.location_id === location.id).sort((a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time)),
      ]),
    ),
    [locations, templates],
  )

  const selectedLocationCode = locations.find((location) => location.id === templateLocationId)?.code
  const slotsPerTarget = selectedLocationCode === 'umacollo' ? 2 : 4

  const closeModal = () => {
    setModalType(null)
    setSelectedBow(null)
    setSelectedTemplate(null)
    setTemplateLocationId('')
  }

  const openTemplateCreate = () => {
    setSelectedTemplate(null)
    setTemplateLocationId(locations.find((location) => location.code === 'tiabaya')?.id || locations[0]?.id || '')
    setModalType('template-create')
  }

  const openTemplateEdit = (template: WeeklySessionTemplate) => {
    setSelectedTemplate(template)
    setTemplateLocationId(template.location_id)
    setModalType('template-edit')
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
    const locationId = String(formData.get('location_id') || '')
    const allowsIntro = formData.get('allows_intro') === 'on'
    const distances = DISTANCES.map((distance) => {
      const pacas = Number(formData.get(`distance_${distance}`) || 0)
      return {
        distance_m: distance,
        slot_capacity: pacas * slotsPerTarget,
        targets: pacas,
      }
    })

    if (!locationId || !label || !weekday || !startTime || !endTime || endTime <= startTime) {
      toast.push({ message: 'Revisa la sede, el nombre, el día y el horario de la plantilla.', type: 'error' })
      return
    }

    if (!distances.some((distance) => distance.slot_capacity > 0)) {
      toast.push({ message: 'Configura al menos un cupo por distancia.', type: 'error' })
      return
    }

    try {
      if (modalType === 'template-create') {
        await createTemplateMutation.mutateAsync({
          locationId,
          label,
          weekday,
          start_time: startTime,
          end_time: endTime,
          is_active: isActive,
          allowsIntro,
          distances,
        })
        toast.push({ message: 'Horario guardado. Genera los turnos desde la página Turnos.', type: 'success' })
      } else if (modalType === 'template-edit' && selectedTemplate) {
        await updateTemplateMutation.mutateAsync({
          id: selectedTemplate.id,
          locationId,
          label,
          weekday,
          start_time: startTime,
          end_time: endTime,
          is_active: isActive,
          allowsIntro,
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
    <div className="space-y-5">
      <nav aria-label="Secciones de configuración" className="grid gap-3 sm:grid-cols-3">
        <a href="#sedes" className="flex items-center gap-3 rounded-2xl border border-blue-100 bg-white p-4 text-left shadow-sm hover:border-blue-300 hover:bg-blue-50"><MapPin className="h-5 w-5 text-[#0758aa]" aria-hidden="true" /><span className="font-bold text-[#102448]">Sedes</span></a>
        <a href="#inventario" className="flex items-center gap-3 rounded-2xl border border-orange-200 bg-orange-50 p-4 text-left shadow-sm hover:border-orange-400"><Package className="h-5 w-5 text-orange-600" aria-hidden="true" /><span className="font-bold text-[#102448]">Inventario de arcos</span></a>
        <a href="#horarios" className="flex items-center gap-3 rounded-2xl border border-blue-100 bg-white p-4 text-left shadow-sm hover:border-blue-300 hover:bg-blue-50"><CalendarDays className="h-5 w-5 text-[#0758aa]" aria-hidden="true" /><span className="font-bold text-[#102448]">Días y horarios</span></a>
      </nav>
      <section id="sedes" className="scroll-mt-6 rounded-2xl border border-blue-100 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5"><h2 className="text-xl font-bold text-[#102448]">Sedes</h2><p className="mt-1 text-sm text-textsec">Edita la dirección, el enlace y la disponibilidad operativa de Tiabaya y Umacollo.</p></div>
        <div className="grid gap-4 lg:grid-cols-2">
          {locations.map((location) => <LocationEditor key={location.id} location={location} saving={updateLocationMutation.isPending} onSave={async (next) => {
            try {
              await updateLocationMutation.mutateAsync(next)
              toast.push({ message: 'Sede actualizada.', type: 'success' })
            } catch (locationError: any) {
              toast.push({ message: locationError.message || 'No se pudo actualizar la sede.', type: 'error' })
            }
          }} />)}
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-[#0758aa]">Inventario registrado activo</p>
          <p className="mt-2 text-3xl font-semibold text-textpri">{totalActiveBows}</p>
          <p className="mt-1 text-xs text-textsec">Arcos compartidos configurados por libraje</p>
        </div>
        <div className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-orange-700">Horarios activos</p>
          <p className="mt-2 text-3xl font-semibold text-textpri">
            {templates.filter((template) => template.is_active).length}
          </p>
          <p className="mt-1 text-xs text-textsec">Turnos semanales listos para generar</p>
        </div>

      </div>

      <section id="inventario" className="scroll-mt-6 rounded-2xl border border-blue-100 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-[#102448]">Inventario de arcos</h2>
            <p className="mt-1 text-sm text-textsec">
              Define cuántos arcos compartidos hay disponibles por libraje. Umacollo tiene 4 plazas compartidas; Tiabaya, 6 arcos de academia compartidos. Los arqueros con arco propio son adicionales en Tiabaya.
            </p>
          </div>
          <button
            onClick={() => setModalType('bow-create')}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#0758aa] px-4 py-2 text-sm font-bold text-white hover:bg-[#064786]"
          >
            <Plus className="h-4 w-4" />
            Agregar libraje
          </button>
        </div>

        <p className="mb-4 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">El inventario registrado es general y todavía no distingue sedes. La distribución informada es de 8 arcos: 2 de 18 lb permanecen en Umacollo y 6 pertenecen a Tiabaya; 2 de 20 lb se trasladan a Umacollo durante la semana y regresan a Tiabaya el fin de semana. Las cantidades y notas guardadas requieren revisión. La disponibilidad de reservas aún no descuenta este traslado.</p>
        <div className="space-y-3">
          {bowInventory.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-blue-200 p-8 text-center text-textsec">
              No hay inventario configurado. Usa el botón de arriba para agregar arcos.
            </div>
          ) : (
            bowInventory.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-2xl border border-blue-100 bg-slate-50 p-4">
                <div>
                  <h3 className="inline-flex rounded-lg bg-orange-100 px-2.5 py-1 font-bold text-orange-800">{item.draw_weight_lbs} lb</h3>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-textsec">
                    <span>{item.quantity_active}/{item.quantity_total} activos</span>
                    {item.notes && <span>{item.notes}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button" aria-label={`Editar ${item.draw_weight_lbs} libras`}
                    onClick={() => {
                      setSelectedBow(item)
                      setModalType('bow-edit')
                    }}
                    className="rounded-lg p-2 text-textsec transition-colors hover:bg-blue-50 hover:text-[#0758aa]"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button
                    type="button" aria-label={`Eliminar ${item.draw_weight_lbs} libras`}
                    onClick={() => handleDeleteBow(item.id)}
                    className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section id="horarios" className="scroll-mt-6 rounded-2xl border border-blue-100 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-[#102448]">Días y horarios de trabajo</h2>
            <p className="mt-1 text-sm text-textsec">
              Define los días y horarios recurrentes de cada sede. Genera los turnos desde la página Turnos.
            </p>
          </div>
          <button
            onClick={openTemplateCreate}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#0758aa] px-4 py-2 text-sm font-bold text-white hover:bg-[#064786]"
          >
            <Plus className="h-4 w-4" />
            Agregar horario
          </button>
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          {locations.map((location) => {
            const locationTemplates = templatesByLocation.get(location.id) || []
            return (
              <section key={location.id} className="rounded-2xl border border-blue-100 bg-slate-50 p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-textpri">{location.name}</h3>
                    <p className="text-xs text-textsec">{location.address || 'Dirección pendiente'}</p>
                  </div>
                  <span className="rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-accent">
                    {locationTemplates.length} horarios
                  </span>
                </div>
                <div className="space-y-3">
                  {locationTemplates.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-blue-200 p-6 text-center text-sm text-textsec">
                      No hay horarios recurrentes configurados en esta sede.
                    </div>
                  ) : WEEKDAYS.map(day => {
                    const dayTemplates = locationTemplates.filter(template => template.weekday === day.value)
                    if (!dayTemplates.length) return null
                    return <details key={day.value} className="rounded-xl border border-blue-100 bg-white p-3">
                      <summary className="cursor-pointer font-semibold text-blue-950">{day.label} · {dayTemplates.length} {dayTemplates.length === 1 ? 'horario' : 'horarios'}</summary>
                      <div className="mt-3 space-y-2">{dayTemplates.map((template) => (
                    <div key={template.id} className="rounded-xl border border-slate-200 bg-white p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="font-medium text-textpri">{template.label}</h4>
                            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-bold text-textsec">
                              {template.location?.name || location.name}
                            </span>
                            <span className={`rounded-full border px-2 py-1 text-[11px] font-bold ${template.allows_intro
                              ? 'border-orange-200 bg-orange-50 text-orange-800'
                              : 'border-blue-100 bg-blue-50 text-blue-800'}`}>
                              {template.allows_intro ? 'Clases de prueba' : 'Solo alumnos'}
                            </span>
                            <span className={`rounded-full border px-2 py-1 text-[11px] ${template.is_active
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                              : 'border-red-200 bg-red-50 text-red-800'}`}>
                              {template.is_active ? 'Activa' : 'Inactiva'}
                            </span>
                          </div>
                          <p className="mt-2 text-sm text-textsec">
                            {weekdayLabel(template.weekday)} · {template.start_time.slice(0, 5)} - {template.end_time.slice(0, 5)}
                          </p>
                          <div className="mt-3">{renderDistanceSummary(template)}</div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button type="button" aria-label={`Editar ${template.label}`} onClick={() => openTemplateEdit(template)} className="rounded-lg p-2 text-textsec transition-colors hover:bg-blue-50 hover:text-[#0758aa]">
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button type="button" aria-label={`Eliminar ${template.label}`} onClick={() => handleDeleteTemplate(template.id)} className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-700">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}</div></details>
                  })}
                </div>
              </section>
            )
          })}
        </div>
      </section>

      {(modalType === 'bow-create' || modalType === 'bow-edit') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-blue-100 bg-white p-6 shadow-xl">
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
          <div className="w-full max-w-3xl rounded-2xl border border-white/10 bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold text-textpri">
              {modalType === 'template-create' ? 'Agregar plantilla semanal' : 'Editar plantilla semanal'}
            </h3>
            <form action={handleTemplateSubmit} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-textsec">Sede</label>
                  <select
                    name="location_id"
                    value={templateLocationId}
                    onChange={(event) => setTemplateLocationId(event.target.value)}
                    className="input"
                    required
                  >
                    <option value="" disabled>Selecciona una sede</option>
                    {locations.map((location) => (
                      <option key={location.id} value={location.id}>{location.name}</option>
                    ))}
                  </select>
                </div>
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

              <div key={templateLocationId} className="rounded-2xl border border-white/10 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-textpri">Pacas por distancia</p>
                    <p className="text-[10px] text-textsec uppercase tracking-widest mt-1">
                      Cada paca = {slotsPerTarget} cupos en {selectedLocationCode === 'umacollo' ? 'Umacollo' : 'Tiabaya'}
                    </p>
                  </div>
                  <div className="grid gap-2 text-sm text-textsec">
                    <label className="flex items-center gap-2">
                      <input name="is_active" type="checkbox" defaultChecked={selectedTemplate ? selectedTemplate.is_active : true} />
                      Plantilla activa
                    </label>
                    <label className="flex items-center gap-2 font-semibold text-sky-200">
                      <input name="allows_intro" type="checkbox" defaultChecked={selectedTemplate?.allows_intro || false} />
                      Acepta clases de prueba
                    </label>
                  </div>
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
