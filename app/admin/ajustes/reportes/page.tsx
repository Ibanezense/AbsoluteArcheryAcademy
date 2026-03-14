'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import dayjs from 'dayjs'
import { FileText, Download, Users } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { toast } from 'react-hot-toast'

interface StudentEntry {
    name: string
    dni: string
}

export default function ReportesPage() {
    const [dateString, setDateString] = useState<string>(dayjs().format('YYYY-MM-DD'))
    const [isGenerating, setIsGenerating] = useState<boolean>(false)
    const [isLoading, setIsLoading] = useState<boolean>(false)
    const [students, setStudents] = useState<StudentEntry[]>([])

    useEffect(() => {
        const loadStudents = async () => {
            if (!dateString) {
                setStudents([])
                return
            }

            setIsLoading(true)
            try {
                const startOfDay = dayjs(dateString).startOf('day').toISOString()
                const endOfDay = dayjs(dateString).endOf('day').toISOString()

                // 1. OBTENER SESIONES DEL DIA COMO FILTRO PREVIO
                const { data: sessionsData, error: sessionErr } = await supabase
                    .from('sessions')
                    .select('id')
                    .gte('start_at', startOfDay)
                    .lte('start_at', endOfDay)

                if (sessionErr) throw sessionErr
                const sessionIds = sessionsData.map(s => s.id)

                let studentsList: StudentEntry[] = []

                if (sessionIds.length > 0) {
                    // Bookings Regulares
                    const { data: regularBookings, error: regErr } = await supabase
                        .from('bookings')
                        .select(`
                            status,
                            students!inner ( full_name, dni )
                        `)
                        .in('session_id', sessionIds)
                        .in('status', ['reserved', 'attended']) // Excluir canceladas
                        .is('intro_client_id', null)

                    if (regErr) throw regErr

                    // Bookings Intro
                    const { data: introBookings, error: introErr } = await supabase
                        .from('bookings')
                        .select(`
                            status,
                            intro_clients!inner ( full_name )
                        `)
                        .in('session_id', sessionIds)
                        .in('status', ['reserved', 'attended'])
                        .not('intro_client_id', 'is', 'null')

                    if (introErr) throw introErr

                    const parsedRegular = (regularBookings || []).map(b => {
                        const student = Array.isArray(b.students) ? b.students[0] : b.students
                        return {
                            name: student?.full_name || 'Desconocido',
                            dni: student?.dni || 'N/A'
                        }
                    })

                    const parsedIntro = (introBookings || []).map(b => {
                        const intro = Array.isArray(b.intro_clients) ? b.intro_clients[0] : b.intro_clients
                        return {
                            name: intro?.full_name + ' (Clase de Prueba)' || 'Prueba',
                            dni: 'N/A' // No se solicita DNI en pruebas
                        }
                    })

                    studentsList = [...parsedRegular, ...parsedIntro]
                }

                // Filtrar duplicados
                const uniqueStudentsMap = new Map<string, StudentEntry>()
                studentsList.forEach(s => {
                    uniqueStudentsMap.set(s.name, s)
                })
                const uniqueStudentsList = Array.from(uniqueStudentsMap.values())

                // 3. AGREGAR A LOS ADMINISTRADORES FIJOS
                const adminsFixedList = [
                    { name: 'Jose Carlos Ibañez', dni: '-' },
                    { name: 'Kevin Ibañez', dni: '-' },
                    { name: 'Fabian Ibañez Tijero', dni: '-' },
                ]

                setStudents([...adminsFixedList, ...uniqueStudentsList])
            } catch (error: any) {
                console.error(error)
                toast.error(error?.message || 'Error al cargar alumnos del dia')
            } finally {
                setIsLoading(false)
            }
        }

        loadStudents()
    }, [dateString])

    const handleGenerate = async () => {
        if (!dateString || students.length === 0) return

        setIsGenerating(true)
        try {
            const localFormatDate = dayjs(dateString).format('DD/MM/YYYY')

            const doc = new jsPDF()

            const tableRows = students.map((st, index) => [
                (index + 1).toString(),
                st.name,
                st.dni || '-'
            ])

            const ROWS_PER_PAGE = 32;
            const totalChunks = Math.ceil(tableRows.length / ROWS_PER_PAGE);

            for (let i = 0; i < totalChunks; i++) {
                if (i > 0) doc.addPage();

                const chunk = tableRows.slice(i * ROWS_PER_PAGE, (i + 1) * ROWS_PER_PAGE);
                const isFirstPage = i === 0;

                if (isFirstPage) {
                    // Header solo en la primera página
                    doc.setFontSize(20)
                    doc.setTextColor(0)
                    doc.text('Lista de Ingreso al Club', 14, 22)
                    doc.setFontSize(11)
                    doc.setTextColor(100)
                    doc.text(`Fecha: ${localFormatDate}`, 14, 30)
                }

                autoTable(doc, {
                    startY: isFirstPage ? 40 : 15,
                    head: [['N°', 'Nombres Completos', 'DNI']],
                    body: chunk,
                    theme: 'striped',
                    headStyles: { fillColor: [41, 128, 185], textColor: 255, fontSize: 8 },
                    styles: { fontSize: 8, cellPadding: 2 }
                })
            }

            // Download file
            const fileName = `ingreso-archery-${dayjs(dateString).format('DD-MM-YYYY')}.pdf`
            doc.save(fileName)

            toast.success('Reporte PDF descargado con éxito.')

        } catch (error: any) {
            console.error(error)
            toast.error(error?.message || 'Error al generar reporte')
        } finally {
            setIsGenerating(false)
        }
    }

    return (
        <div className="card p-6">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-accent/10 text-accent rounded-xl">
                    <FileText size={24} />
                </div>
                <div>
                    <h2 className="text-xl font-semibold text-textpri">Lista de Ingreso Diario</h2>
                    <p className="text-sm text-textsec mt-1">Generado en PDF para la sede del club.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-6 bg-background rounded-xl p-5 border border-line h-fit">
                    <div className="space-y-3">
                        <label className="block text-sm font-medium text-textpri">Selecciona el día</label>
                        <input
                            type="date"
                            value={dateString}
                            onChange={(e) => setDateString(e.target.value)}
                            className="input"
                        />
                    </div>

                    <button
                        onClick={handleGenerate}
                        disabled={isGenerating || isLoading || !dateString || students.length === 0}
                        className="btn w-full gap-2 justify-center"
                    >
                        {isGenerating ? (
                            <Spinner />
                        ) : (
                            <Download size={18} />
                        )}
                        <span>{isGenerating ? 'Generando PDF...' : 'Descargar PDF'}</span>
                    </button>
                    {!isLoading && students.length === 0 && (
                        <p className="text-sm text-textsec text-center">No hay alumnos para la fecha seleccionada.</p>
                    )}
                </div>

                <div className="bg-background rounded-xl p-5 border border-line">
                    <div className="flex items-center gap-2 mb-4 pb-2 border-b border-white/5">
                        <Users size={18} className="text-accent" />
                        <h3 className="font-medium text-textpri">Lista previa
                            {students.length > 0 && <span className="text-textsec font-normal ml-2">({students.length})</span>}
                        </h3>
                    </div>

                    {isLoading ? (
                        <div className="py-12 flex justify-center"><Spinner /></div>
                    ) : (
                        <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                            {students.map((st, i) => (
                                <div key={i} className="flex justify-between items-center p-3 rounded-lg bg-surface">
                                    <div className="flex gap-3 items-center">
                                        <span className="w-6 h-6 rounded bg-black/20 flex items-center justify-center text-xs text-textsec font-medium">
                                            {i + 1}
                                        </span>
                                        <div>
                                            <div className="text-sm font-medium">{st.name}</div>
                                            <div className="text-xs text-textsec">{st.dni !== '-' ? `DNI: ${st.dni}` : 'Admin'}</div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {students.length === 0 && (
                                <div className="text-center py-8 text-sm text-textsec">Selecciona una fecha para ver la lista.</div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
