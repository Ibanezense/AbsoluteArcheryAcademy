'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { Download, FileText, Users } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { Spinner } from '@/components/ui/Spinner'
import { supabase } from '@/lib/supabaseClient'
import { addFixedClubEntryAdmins, type DailyClubEntryRow } from '@/lib/reports/dailyClubEntryReport'

export default function ReportesPage() {
  const [dateString, setDateString] = useState<string>(dayjs().format('YYYY-MM-DD'))
  const [isGenerating, setIsGenerating] = useState<boolean>(false)

  const {
    data: students = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['daily-club-entry-report', dateString],
    enabled: !!dateString,
    queryFn: async () => {
      const { data, error: reportError } = await supabase.rpc('get_daily_club_entry_report', {
        p_date: dateString,
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
    if (!dateString || students.length === 0) return

    setIsGenerating(true)
    try {
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ])
      const localFormatDate = dayjs(dateString).format('DD/MM/YYYY')
      const doc = new jsPDF()

      const tableRows = students.map((student, index) => [
        (index + 1).toString(),
        student.name,
        student.dni || '-',
      ])

      const rowsPerPage = 32
      const totalChunks = Math.ceil(tableRows.length / rowsPerPage)

      for (let index = 0; index < totalChunks; index += 1) {
        if (index > 0) doc.addPage()

        const chunk = tableRows.slice(index * rowsPerPage, (index + 1) * rowsPerPage)
        const isFirstPage = index === 0

        if (isFirstPage) {
          doc.setFontSize(20)
          doc.setTextColor(0)
          doc.text('Lista de Ingreso al Club', 14, 22)
          doc.setFontSize(11)
          doc.setTextColor(100)
          doc.text(`Fecha: ${localFormatDate}`, 14, 30)
        }

        autoTable(doc, {
          startY: isFirstPage ? 40 : 15,
          head: [['N', 'Nombres Completos', 'DNI']],
          body: chunk,
          theme: 'striped',
          headStyles: { fillColor: [41, 128, 185], textColor: 255, fontSize: 8 },
          styles: { fontSize: 8, cellPadding: 2 },
        })
      }

      doc.save(`ingreso-archery-${dayjs(dateString).format('DD-MM-YYYY')}.pdf`)
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
          <p className="mt-1 text-sm text-textsec">Generado en PDF para la sede del club.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="h-fit space-y-6 rounded-xl border border-line bg-slate-50 p-5">
          <div className="space-y-3">
            <label className="block text-sm font-medium text-textpri">Selecciona el dia</label>
            <input
              type="date"
              value={dateString}
              onChange={(event) => setDateString(event.target.value)}
              className="input"
            />
          </div>

          <button
            onClick={handleGenerate}
            disabled={isGenerating || isLoading || !dateString || students.length === 0}
            className="btn w-full justify-center gap-2"
          >
            {isGenerating ? <Spinner /> : <Download size={18} />}
            <span>{isGenerating ? 'Generando PDF...' : 'Descargar PDF'}</span>
          </button>
          {!isLoading && students.length === 0 && (
            <p className="text-center text-sm text-textsec">No hay alumnos para la fecha seleccionada.</p>
          )}
        </div>

        <div className="rounded-xl border border-line bg-slate-50 p-5">
          <div className="mb-4 flex items-center gap-2 border-b border-line pb-2">
            <Users size={18} className="text-accent" />
            <h3 className="font-medium text-textpri">
              Lista previa
              {students.length > 0 && <span className="ml-2 font-normal text-textsec">({students.length})</span>}
            </h3>
          </div>

          {isLoading ? (
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
