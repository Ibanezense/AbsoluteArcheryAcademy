'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, FileText, Users } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { Spinner } from '@/components/ui/Spinner'
import { supabase } from '@/lib/supabaseClient'
import { addFixedClubEntryAdmins, type DailyClubEntryRow } from '@/lib/reports/dailyClubEntryReport'
import { useAcademyLocations } from '@/lib/infrastructureQueries'
import { calendarDate } from '@/lib/utils/introCalendar'

export default function ReportesPage() {
  const [dateString, setDateString] = useState<string>(() => calendarDate(new Date()))
  const [locationId, setLocationId] = useState('')
  const { data: locations = [], isLoading: locationsLoading, error: locationsError, refetch: reloadLocations } = useAcademyLocations()
  const selectedLocation = locations.find((location) => location.id === locationId) || null
  const [isGenerating, setIsGenerating] = useState<boolean>(false)

  const {
    data: students = [],
    isLoading,
    isFetching,
    error,
  } = useQuery({
    queryKey: ['daily-club-entry-report', dateString, locationId],
    enabled: Boolean(dateString && selectedLocation),
    queryFn: async () => {
      const { data, error: reportError } = await supabase.rpc('get_daily_club_entry_report', {
        p_date: dateString,
        p_location_id: locationId,
      })

      if (reportError) throw reportError
      return addFixedClubEntryAdmins((data || []) as DailyClubEntryRow[])
    },
  })

  useEffect(() => {
    if (error) {
      toast.error(error instanceof Error ? error.message : 'Error al cargar alumnos del dia')
    }
  }, [error])

  const handleGenerate = async () => {
    if (!dateString || !selectedLocation || isFetching || error || locationsError || isGenerating || students.length === 0) return

    setIsGenerating(true)
    try {
      const { createDailyClubEntryPdf } = await import('@/lib/reports/dailyClubEntryPdf')
      const { doc, filename } = createDailyClubEntryPdf(students, dateString, selectedLocation)
      doc.save(filename)
      toast.success('Reporte PDF descargado con exito.')
    } catch (generateError: any) {
      toast.error(generateError?.message || 'Error al generar reporte')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="card p-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="rounded-xl bg-accent/10 p-3 text-accent">
          <FileText size={24} />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-textpri">Lista de Ingreso Diario</h2>
          <p className="mt-1 text-sm text-textsec">Selecciona una fecha y una sede. Cada PDF incluye únicamente las reservas de esa sede.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="h-fit space-y-6 rounded-xl border border-line bg-slate-50 p-5">
          <div className="space-y-3">
            <label htmlFor="report-date" className="block text-sm font-medium text-textpri">Selecciona el día</label>
            <input
              type="date"
              id="report-date"
              disabled={isGenerating}
              value={dateString}
              onChange={(event) => setDateString(event.target.value)}
              className="input"
            />
          </div>

          <div className="space-y-3">
            <label htmlFor="report-location" className="block text-sm font-medium text-textpri">Sede</label>
            <select id="report-location" className="input" value={locationId} onChange={(event) => setLocationId(event.target.value)} disabled={isGenerating || locationsLoading || Boolean(locationsError)}>
              <option value="">Selecciona una sede</option>
              {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
            </select>
            {locationsError && <p role="alert" className="text-sm text-red-700">No se pudieron cargar las sedes. <button type="button" onClick={() => reloadLocations()} className="underline">Reintentar</button></p>}
          </div>

          <button
            onClick={handleGenerate}
            disabled={isGenerating || isFetching || !dateString || !selectedLocation || Boolean(error) || Boolean(locationsError) || students.length === 0}
            className="btn w-full justify-center gap-2"
          >
            {isGenerating ? <Spinner /> : <Download size={18} />}
            <span>{isGenerating ? 'Generando PDF...' : 'Descargar PDF'}</span>
          </button>
          {selectedLocation && !isLoading && !error && students.length === 0 && (
            <p className="text-center text-sm text-textsec">No hay alumnos para la fecha y sede seleccionadas.</p>
          )}
        </div>

        <div className="rounded-xl border border-line bg-slate-50 p-5">
          <div className="mb-4 flex items-center gap-2 border-b border-line pb-2">
            <Users size={18} className="text-accent" />
            <h3 className="font-medium text-textpri">
              Lista previa
              {selectedLocation && <span> · {selectedLocation.name}</span>}
              {students.length > 0 && <span className="ml-2 font-normal text-textsec">({students.length})</span>}
            </h3>
          </div>

          {!selectedLocation || !dateString ? <p className="py-8 text-center text-sm text-textsec">Selecciona una fecha y una sede para ver la lista.</p> : error ? <p role="alert" className="py-8 text-center text-sm text-red-700">No se pudo cargar la lista. Vuelve a seleccionar la sede o la fecha.</p> : isLoading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : (
            <div className="max-h-[500px] space-y-2 overflow-y-auto pr-2">
              {students.map((student, index) => (
                <div key={`${student.name}-${student.dni}-${index}`} className="flex items-center justify-between rounded-lg bg-white p-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded bg-slate-100 text-xs font-medium text-textsec">
                      {index + 1}
                    </span>
                    <div>
                      <div className="text-sm font-medium">{student.name}</div>
                      <div className="text-xs text-textsec">{student.dni !== '-' ? `DNI: ${student.dni}` : 'Admin'}</div>
                    </div>
                  </div>
                </div>
              ))}
              {students.length === 0 && (
                <div className="py-8 text-center text-sm text-textsec">Selecciona una fecha para ver la lista.</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
