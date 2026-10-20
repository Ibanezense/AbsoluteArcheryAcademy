'use client'

import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  AcademyIdentity,
  ProgressLink,
  TrainingSummary,
} from '@/lib/contracts/studentProgress'
import { useProgressAccountId } from '@/lib/hooks/useStudentProgress'
import { progressRequest, ProgressRequestError } from '@/lib/services/studentProgressService'
import { useConfirm } from '@/components/ui/ConfirmDialog'

type LinkContext = {
  student_id: string
  assigned_distance_m: number | null
  link: ProgressLink | null
}
type Preview = { student: AcademyIdentity; summary: TrainingSummary; control_count: number }
type Operation = { scope: string; sequence: number }
type Workspace = {
  scope: string
  query: string
  candidates: AcademyIdentity[]
  hasMore: boolean
  searched: boolean
  preview: Preview | null
  evidence: string
  verified: boolean
  busy: boolean
  message: string
  error: string
}
const endpoint = '/api/admin/student-progress-links'
const button =
  'min-h-11 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50'
const primary =
  'min-h-11 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50'
function initial(scope: string): Workspace {
  return {
    scope,
    query: '',
    candidates: [],
    hasMore: false,
    searched: false,
    preview: null,
    evidence: '',
    verified: false,
    busy: false,
    message: '',
    error: '',
  }
}
export function isCurrentProgressOperation(operation: Operation, current: Operation) {
  return operation.scope === current.scope && operation.sequence === current.sequence
}
export function canConfirmProgressIdentity(
  identity: AcademyIdentity | null,
  evidence: string,
  verified: boolean
) {
  return !!identity && verified && evidence.trim().length >= 3 && evidence.length <= 1000
}

export default function StudentProgressLinks({
  studentId,
  onReviewDistance,
}: {
  studentId: string
  onReviewDistance: () => void
}) {
  const accountId = useProgressAccountId()
  const scope = `${accountId || 'signed-out'}:${studentId}`
  const current = useRef<Operation>({ scope, sequence: 0 })
  const controller = useRef<AbortController | null>(null)
  if (current.current.scope !== scope)
    current.current = { scope, sequence: current.current.sequence + 1 }
  const [workspace, setWorkspace] = useState(() => initial(scope))
  const work = workspace.scope === scope ? workspace : initial(scope)
  const confirm = useConfirm()
  const cache = useQueryClient()
  const headingId = useId()
  const searchId = useId()
  const evidenceId = useId()
  const dataQuery = useQuery({
    queryKey: ['admin-student-progress', accountId, studentId],
    enabled: !!accountId && !!studentId,
    staleTime: 0,
    retry: false,
    queryFn: async ({ signal }) => {
      const result = await progressRequest<LinkContext>(
        `${endpoint}?studentId=${encodeURIComponent(studentId)}`,
        { accountId: accountId!, signal }
      )
      if (
        result.student_id !== studentId ||
        (result.link &&
          (result.link.student_id !== studentId || result.link.source !== 'academy_controls'))
      ) {
        throw new Error('No pudimos verificar la vinculación de este alumno.')
      }
      return result
    },
  })
  const data =
    !dataQuery.isError && accountId && dataQuery.data?.student_id === studentId
      ? dataQuery.data
      : null
  const link = data?.link || null
  const canAct = !!accountId && !!data && !dataQuery.isError && !dataQuery.isFetching && !work.busy

  useEffect(() => {
    setWorkspace(initial(scope))
    return () => {
      current.current.sequence++
      controller.current?.abort()
    }
  }, [scope])
  const update = (patch: Partial<Workspace>) =>
    setWorkspace((value) => ({ ...(value.scope === scope ? value : initial(scope)), ...patch }))
  const begin = () => {
    controller.current?.abort()
    controller.current = new AbortController()
    const operation = { scope, sequence: ++current.current.sequence }
    update({ busy: true, message: '', error: '' })
    return { operation, signal: controller.current.signal }
  }
  const isCurrent = (operation: Operation) => isCurrentProgressOperation(operation, current.current)
  const refresh = () =>
    Promise.all([
      cache.invalidateQueries({ queryKey: ['student-progress'] }),
      cache.invalidateQueries({ queryKey: ['admin-student-progress'] }),
    ])
  const showError = (error: unknown, operation: Operation) => {
    if (!isCurrent(operation)) return
    if (error instanceof Error && error.name === 'AbortError') return
    update({
      error: error instanceof Error ? error.message : 'No pudimos completar la operación.',
      busy: false,
    })
    if (error instanceof ProgressRequestError && error.status === 409) void refresh()
  }

  async function search(event: FormEvent) {
    event.preventDefault()
    if (!canAct || work.query.trim().length < 2 || work.query.length > 100) return
    const { operation, signal } = begin()
    update({ candidates: [], preview: null, evidence: '', verified: false, searched: false })
    try {
      const result = await progressRequest<{ candidates: AcademyIdentity[]; has_more: boolean }>(
        endpoint,
        {
          accountId: accountId!,
          signal,
          body: { action: 'search', studentId, query: work.query.trim() },
        }
      )
      if (isCurrent(operation))
        update({
          candidates: result.candidates,
          hasMore: result.has_more,
          searched: true,
          busy: false,
        })
    } catch (error) {
      showError(error, operation)
    }
  }
  async function preview(candidate: AcademyIdentity) {
    if (!canAct) return
    const { operation, signal } = begin()
    update({ preview: null, evidence: '', verified: false })
    try {
      const result = await progressRequest<Preview>(endpoint, {
        accountId: accountId!,
        signal,
        body: { action: 'preview', studentId, externalId: candidate.id },
      })
      if (result.student.id !== candidate.id)
        throw new Error('El registro recibido no coincide con la selección. Vuelve a buscar.')
      if (isCurrent(operation)) update({ preview: result, busy: false })
    } catch (error) {
      showError(error, operation)
    }
  }
  async function save() {
    if (
      !canAct ||
      !work.preview ||
      !canConfirmProgressIdentity(work.preview.student, work.evidence, work.verified)
    )
      return
    const selected = work.preview.student
    const { operation, signal } = begin()
    try {
      const accepted = await confirm(
        `Vincular este alumno con ${selected.name}\nID de Controles: ${selected.id}`,
        {
          title: link ? 'Reemplazar vinculación de Controles' : 'Confirmar identidad de Controles',
          description: link
            ? 'La vinculación actual se retirará y ambos cambios quedarán registrados. Verifica que el registro seleccionado corresponda a la misma persona.'
            : 'Esta confirmación permite que el alumno y sus tutores consulten los controles de esa identidad.',
          confirmLabel: 'Confirmar vinculación',
          tone: 'warning',
        }
      )
      if (!isCurrent(operation)) return
      if (!accepted) {
        update({ busy: false })
        return
      }
      await progressRequest<{ link: ProgressLink }>(endpoint, {
        accountId: accountId!,
        signal,
        body: {
          action: 'confirm',
          studentId,
          externalId: selected.id,
          evidence: work.evidence.trim(),
          expectedLinkId: link?.id ?? null,
          expectedRevision: link?.revision ?? null,
        },
      })
      await refresh()
      if (isCurrent(operation))
        setWorkspace({
          ...initial(scope),
          message:
            'Vinculación confirmada. El historial de Controles ya corresponde a esta identidad.',
        })
    } catch (error) {
      showError(error, operation)
    }
  }
  async function revoke() {
    if (!canAct || !link) return
    const { operation, signal } = begin()
    try {
      const accepted = await confirm(
        'El alumno dejará de ver los controles de esta identidad. El historial de la vinculación se conservará.',
        {
          title: 'Retirar vinculación de Controles',
          confirmLabel: 'Retirar vinculación',
          tone: 'danger',
        }
      )
      if (!isCurrent(operation)) return
      if (!accepted) {
        update({ busy: false })
        return
      }
      await progressRequest<{ link: ProgressLink }>(endpoint, {
        accountId: accountId!,
        signal,
        body: { action: 'revoke', studentId, linkId: link.id, expectedRevision: link.revision },
      })
      await refresh()
      if (isCurrent(operation))
        setWorkspace({
          ...initial(scope),
          message: 'Vinculación retirada. No se modificaron los controles del origen.',
        })
    } catch (error) {
      showError(error, operation)
    }
  }

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id={headingId} className="text-lg font-semibold text-slate-900">
            Mi progreso · Vinculación
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Confirma la identidad de Controles antes de mostrar su historial al alumno. Coincidir en
            el nombre no confirma que sea la misma persona.
          </p>
        </div>
        <button type="button" className={button} onClick={onReviewDistance}>
          Revisar distancia asignada
        </button>
      </div>
      {!accountId || dataQuery.isLoading ? (
        <p className="mt-4 text-sm text-slate-600" role="status">
          Comprobando vinculación…
        </p>
      ) : null}
      {dataQuery.isError ? (
        <div className="mt-4 rounded-xl bg-amber-50 p-3">
          <p role="alert" className="text-sm text-amber-900">
            {dataQuery.error instanceof Error
              ? dataQuery.error.message
              : 'No pudimos consultar la vinculación.'}
          </p>
          <button
            type="button"
            className={`${button} mt-2`}
            onClick={() => void dataQuery.refetch()}
          >
            Volver a consultar
          </button>
        </div>
      ) : null}
      {data ? (
        <>
          <div className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium text-slate-500">
                Distancia asignada en la academia
              </p>
              <p className="mt-1 font-semibold text-slate-900">
                {data.assigned_distance_m === null
                  ? 'Pendiente de asignación'
                  : `${data.assigned_distance_m} m`}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Controles</p>
              <p className="mt-1 text-sm font-medium text-slate-900">
                {link ? 'Vinculación confirmada' : 'Pendiente de vinculación'}
              </p>
              {link ? (
                <>
                  <p className="mt-1 break-all font-mono text-xs text-slate-600">
                    ID: {link.external_id}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Revisión {link.revision}</p>
                  <button
                    type="button"
                    disabled={!canAct}
                    className="mt-2 min-h-11 text-sm font-medium text-rose-700 underline disabled:opacity-50"
                    onClick={() => void revoke()}
                  >
                    Retirar vinculación
                  </button>
                </>
              ) : null}
            </div>
          </div>
          <form onSubmit={(event) => void search(event)} className="mt-5">
            <label htmlFor={searchId} className="block text-sm font-medium text-slate-800">
              Buscar identidad en Controles
            </label>
            <p className="mt-1 text-xs text-slate-500">
              Escribe el nombre o apellido. Revisa el ID y el historial aunque los nombres
              coincidan.
            </p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                id={searchId}
                value={work.query}
                minLength={2}
                maxLength={100}
                required
                disabled={work.busy}
                onChange={(event) =>
                  update({
                    query: event.target.value,
                    preview: null,
                    verified: false,
                    evidence: '',
                    message: '',
                    searched: false,
                    candidates: [],
                    hasMore: false,
                  })
                }
                className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-300 px-3 text-sm"
                autoComplete="off"
              />
              <button
                type="submit"
                className={button}
                disabled={!canAct || work.query.trim().length < 2}
              >
                Buscar en Controles
              </button>
            </div>
          </form>
          {work.searched ? (
            <div className="mt-3">
              <p className="text-sm text-slate-600" role="status">
                {work.candidates.length
                  ? `${work.candidates.length} registros encontrados`
                  : 'No se encontraron registros. Prueba con otro nombre o apellido.'}
              </p>
              <ul className="mt-2 max-h-72 space-y-2 overflow-y-auto">
                {work.candidates.map((candidate) => (
                  <li
                    key={candidate.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">
                        {candidate.name}
                        {candidate.active === 0 ? ' · Inactivo en origen' : ''}
                      </p>
                      <p className="mt-1 break-all font-mono text-xs text-slate-500">
                        {candidate.id}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={!canAct}
                      className={button}
                      onClick={() => void preview(candidate)}
                    >
                      Revisar controles
                      <span className="sr-only">
                        {' '}
                        de {candidate.name}, ID {candidate.id}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {work.hasMore ? (
                <p className="mt-2 text-sm text-amber-800">
                  Hay más coincidencias. Escribe un nombre o apellido más preciso para encontrar el
                  registro correcto.
                </p>
              ) : null}
            </div>
          ) : null}
          {work.preview ? (
            <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
              <h3 className="font-semibold text-slate-900">
                Registro seleccionado: {work.preview.student.name}
              </h3>
              <p className="mt-1 break-all font-mono text-xs text-slate-600">
                ID de Controles: {work.preview.student.id}
              </p>
              <p className="mt-2 text-sm text-slate-700">
                {work.preview.control_count} controles registrados
                {work.preview.student.active === 0 ? ' · Identidad inactiva en el origen' : ''}.
              </p>
              <p className="mt-1 text-sm text-slate-700">
                {work.preview.summary.last_control
                  ? `Último control${data.assigned_distance_m === null ? ' histórico' : ' en la distancia asignada'}: ${work.preview.summary.last_control.performed_date} · ${work.preview.summary.last_control.score}/${work.preview.summary.last_control.arrows * 10} puntos`
                  : data.assigned_distance_m === null
                    ? 'Sin controles válidos registrados.'
                    : 'Sin controles en la distancia asignada.'}
              </p>
              {['discrepant', 'uncertain'].includes(work.preview.summary.reference.kind) ? (
                <p
                  role="status"
                  className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
                >
                  Distancia pendiente de revisión. El último día con controles válidos (
                  {work.preview.summary.reference.latest_date}) registra{' '}
                  {work.preview.summary.reference.latest_distances_m
                    .map((distance) => `${distance} m`)
                    .join(', ')}
                  .
                  {work.preview.summary.reference.kind === 'uncertain'
                    ? ' Hay varias distancias sin un orden deportivo concluyente.'
                    : ' La distancia del último control no coincide con la asignada.'}{' '}
                  Usa «Revisar distancia asignada» para comprobarla.
                </p>
              ) : null}
              <label htmlFor={evidenceId} className="mt-4 block text-sm font-medium text-slate-800">
                Evidencia de identidad
              </label>
              <p className="mt-1 text-xs text-slate-600">
                Describe qué comprobaste para confirmar a esta persona. Evita copiar documentos
                completos o datos sensibles.
              </p>
              <textarea
                id={evidenceId}
                value={work.evidence}
                minLength={3}
                maxLength={1000}
                required
                disabled={work.busy}
                onChange={(event) => update({ evidence: event.target.value })}
                rows={3}
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm"
              />
              <label className="mt-3 flex items-start gap-2 text-sm text-slate-800">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  disabled={work.busy}
                  checked={work.verified}
                  onChange={(event) => update({ verified: event.target.checked })}
                />
                He verificado que este registro corresponde al alumno de esta ficha.
              </label>
              <button
                type="button"
                className={`${primary} mt-4`}
                disabled={
                  !canAct ||
                  !canConfirmProgressIdentity(work.preview.student, work.evidence, work.verified)
                }
                onClick={() => void save()}
              >
                {link ? 'Reemplazar vinculación' : 'Confirmar vinculación'}
              </button>
            </div>
          ) : null}
        </>
      ) : null}
      {work.busy ? (
        <p role="status" className="mt-3 text-sm text-slate-600">
          Procesando solicitud…
        </p>
      ) : null}
      {work.error ? (
        <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">
          {work.error}
        </p>
      ) : null}
      {work.message ? (
        <p role="status" className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
          {work.message}
        </p>
      ) : null}
    </section>
  )
}
