import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import dayjs from 'dayjs'
import type { DailyClubEntryRow } from './dailyClubEntryReport'

export function createDailyClubEntryPdf(rows: DailyClubEntryRow[], date: string, location: { id: string; name: string; code: string } | null) {
  if (!location?.id || !location.name) throw new Error('Selecciona una sede antes de generar el PDF.')
  if (!date || !dayjs(date).isValid()) throw new Error('Selecciona una fecha válida.')
  const doc = new jsPDF()
  autoTable(doc, {
    margin: { top: 45, bottom: 18, left: 14, right: 14 },
    head: [['N', 'Nombres Completos', 'DNI']],
    body: rows.map((row, index) => [String(index + 1), row.name, row.dni || '-']),
    theme: 'striped',
    headStyles: { fillColor: [41, 128, 185], textColor: 255, fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 2 },
    didDrawPage: () => {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(20)
      doc.setTextColor(0)
      doc.text('Lista de Ingreso al Club', 14, 22)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(11)
      doc.setTextColor(70)
      doc.text(`Sede: ${location.name}`, 14, 30)
      doc.text(`Fecha: ${dayjs(date).format('DD/MM/YYYY')}`, 14, 37)
    },
  })
  const siteSlug = (location.code || location.name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return { doc, filename: `ingreso-archery-${siteSlug}-${dayjs(date).format('DD-MM-YYYY')}.pdf` }
}
