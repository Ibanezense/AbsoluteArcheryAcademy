'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { confirmTrialConversion, fetchTrialConversionData, unlinkTrialConversion } from '@/lib/services/adminTrialConversionService'
import { buildTrialConversionReport, matchesPersonSearch, trialCivilDate, type TrialConversionRow, type TrialStudent } from '@/lib/utils/adminTrialConversion'
import { getLimaDateKey } from '@/lib/utils/membershipCycles'
import { studentKeys } from '@/lib/queries/studentQueries'

const dateLabel = (day: string) => new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`))

export default function TrialConversionPanel() {
  const today = getLimaDateKey()
  const client = useQueryClient()
  const [month, setMonth] = useState('')
  const [search, setSearch] = useState('')
  const [limit, setLimit] = useState(10)
  const [editing, setEditing] = useState<string | null>(null)
  const [candidateSearch, setCandidateSearch] = useState('')
  const [selected, setSelected] = useState<TrialStudent | null>(null)
  const [revoke, setRevoke] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const query = useQuery({ queryKey: [...studentKeys.all, 'admin-trial-conversions', today], queryFn: fetchTrialConversionData, staleTime: 60_000 })
  const toDate = month ? new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).toISOString().slice(0, 10) : today
  const report = query.data ? buildTrialConversionReport(query.data, { fromDate: month ? `${month}-01` : '1900-01-01', toDate, asOf: today, search }) : null
  async function save(row: TrialConversionRow, remove = false) {
    if (saving || (!remove && !selected) || (remove && !row.link)) return
    setSaving(true)
    setError('')
    try {
      if (remove && row.link) await unlinkTrialConversion(row.link.id, row.link.version)
      else if (selected) await confirmTrialConversion(row.introClientId, selected.id)
      await client.invalidateQueries({ queryKey: studentKeys.all })
      setEditing(null); setSelected(null); setRevoke(null)
    } catch (cause) {
      setError(cause && typeof cause === 'object' && 'message' in cause ? String(cause.message) : 'No se pudo guardar la confirmación. Intenta nuevamente.')
    } finally { setSaving(false) }
  }
  return <section id="trial-conversion" aria-labelledby="trial-conversion-title" className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="trial-conversion-title" className="text-lg font-semibold text-slate-950">De la prueba a la inscripción</h2><p className="mt-1 text-sm text-slate-500">Conversión confirmada de quienes asistieron a una clase de prueba</p></div><div className="text-xs text-slate-600"><label htmlFor="trial-conversion-month">Mes de primera asistencia</label><input id="trial-conversion-month" type="month" max={today.slice(0, 7)} value={month} onChange={event => { setMonth(event.target.value); setLimit(10) }} className="mt-1 block min-h-11 rounded-lg border border-slate-200 px-3" />{month && <button type="button" className="min-h-11 underline" onClick={() => setMonth('')}>Ver todo el historial</button>}</div></div>
    {query.isPending ? <p role="status" className="py-8 text-sm text-slate-500">Cargando asistencias de prueba…</p> : query.isError ? <div role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">No pudimos cargar la conversión de pruebas.<button type="button" className="ml-2 min-h-11 underline" onClick={() => void query.refetch()}>Reintentar</button></div> : report && query.data && <>
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">{[{ label: 'Asistieron a prueba', value: report.attended }, { label: 'Inscripciones confirmadas', value: report.converted ?? '—' }, { label: 'Conversión confirmada', value: report.conversionRate === null ? '—' : `${report.conversionRate.toFixed(1)}%` }].map(item => <div key={item.label} className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-600">{item.label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{item.value}</p></div>)}</div>
      <p className="mt-3 text-xs leading-5 text-slate-500">Cada persona se cuenta por su primera prueba asistida. La inscripción requiere una primera membresía posterior o del mismo día, sin obsequios. El porcentaje acumula las inscripciones confirmadas hasta {dateLabel(today)}. La búsqueda no cambia estos totales. Sin vínculo confirmado no significa que la persona no se inscribió; la revisión puede estar incompleta.</p>
      {!report.linksAvailable && <p role="status" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">El registro de conversiones aún no está habilitado. Puedes consultar las asistencias; la tasa estará disponible al habilitar las confirmaciones.</p>}
      <details className="mt-4 rounded-lg border border-slate-200 p-3"><summary className="cursor-pointer py-1 text-sm font-medium text-slate-700">Buscar y verificar inscripciones</summary>
        <label className="mt-4 block text-sm text-slate-600">Nombre o apellido<input type="search" value={search} onChange={event => { setSearch(event.target.value); setLimit(10) }} placeholder="Buscar en las clases de prueba" className="mt-1 min-h-11 w-full rounded-lg border border-slate-200 px-3" /></label>
        <p className="mt-2 text-xs text-slate-500">{report.rows.length} {report.rows.length === 1 ? 'resultado' : 'resultados'} · {month || 'Todo el historial'}</p>
        {error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
        <ul className="mt-3 divide-y divide-slate-100">{report.rows.slice(0, limit).map(row => {
          const trialDay = trialCivilDate(row.firstAttendedAt)
          const candidates = editing === row.introClientId ? query.data.students.filter(student => student.firstMembershipDate >= trialDay && student.firstMembershipDate <= today && matchesPersonSearch(student.fullName, candidateSearch) && !query.data.links.some(link => link.studentId === student.id && link.introClientId !== row.introClientId)) : []
          return <li key={row.introClientId} className="py-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-medium text-slate-900">{row.fullName}</p><p className="mt-1 text-xs text-slate-500">Primera prueba: {dateLabel(trialDay)}</p>{row.student ? <p className="mt-1 text-sm text-emerald-700">Inscripción confirmada: <Link className="underline" href={`/admin/alumnos/${row.student.id}`}>{row.student.fullName}</Link> · {dateLabel(row.student.firstMembershipDate)}</p> : <p className="mt-1 text-xs text-slate-500">{report.linksAvailable ? 'Sin vínculo confirmado' : 'Confirmación no disponible'}</p>}</div>{report.linksAvailable && (row.link ? <button type="button" disabled={saving} className="min-h-11 text-sm text-slate-600 underline" onClick={() => { setRevoke(row.introClientId); setError('') }}>Desvincular</button> : <button type="button" disabled={saving} className="min-h-11 text-sm font-medium text-blue-700 underline" onClick={() => { setEditing(row.introClientId); setCandidateSearch(row.fullName); setSelected(null); setError('') }}>Buscar alumno</button>)}</div>
            {editing === row.introClientId && <div className="mt-3 rounded-lg bg-slate-50 p-3"><label className="block text-sm">Buscar alumno inscrito<input value={candidateSearch} onChange={event => { setCandidateSearch(event.target.value); setSelected(null) }} className="mt-1 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3" /></label><p className="mt-2 text-xs text-slate-500">Verifica que sea la misma persona. Solo se muestran primeras membresías desde la fecha de prueba.</p><div className="mt-2 max-h-60 overflow-y-auto">{candidates.slice(0, 20).map(student => <button key={student.id} type="button" disabled={saving} onClick={() => setSelected(student)} className={`mt-1 block min-h-11 w-full rounded-lg border p-3 text-left text-sm ${selected?.id === student.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white'}`}><span className="block font-medium">{student.fullName}</span><span className="text-xs text-slate-500">Inicio: {dateLabel(student.firstMembershipDate)}{student.dni ? ` · Documento terminado en ${student.dni.slice(-4)}` : ''}</span></button>)}</div>{!candidates.length && <p className="py-3 text-sm text-slate-500">No se encontraron alumnos. Puedes probar con un apellido.</p>}{selected && <div className="mt-3"><p className="text-sm">Confirmo que {row.fullName} y {selected.fullName} son la misma persona.</p><Link className="inline-flex min-h-11 items-center text-sm text-blue-700 underline" target="_blank" rel="noreferrer" href={`/admin/alumnos/${selected.id}`}>Revisar ficha antes de confirmar</Link><button type="button" disabled={saving} onClick={() => void save(row)} className="ml-2 min-h-11 rounded-lg bg-blue-700 px-3 text-sm font-medium text-white disabled:opacity-50">{saving ? 'Guardando…' : 'Confirmar inscripción'}</button></div>}<button type="button" disabled={saving} className="mt-2 min-h-11 text-sm text-slate-600 underline" onClick={() => { setEditing(null); setSelected(null) }}>Cancelar</button></div>}
            {revoke === row.introClientId && <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm"><p>¿Retirar esta confirmación? Se conservará el historial del cambio.</p><button type="button" disabled={saving} onClick={() => void save(row, true)} className="mr-4 min-h-11 font-medium text-rose-700 underline">{saving ? 'Guardando…' : 'Retirar confirmación'}</button><button type="button" disabled={saving} className="min-h-11 underline" onClick={() => setRevoke(null)}>Cancelar</button></div>}
          </li>
        })}</ul>
        {!report.rows.length && <p className="py-6 text-sm text-slate-500">No hay asistencias que coincidan con la búsqueda y el periodo.</p>}
        {limit < report.rows.length && <button type="button" className="min-h-11 text-sm font-medium text-blue-700 underline" onClick={() => setLimit(value => value + 10)}>Mostrar más resultados</button>}
      </details>
    </>}
  </section>
}
