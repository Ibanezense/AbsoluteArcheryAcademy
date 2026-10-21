'use client'

import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  EngineCandidate,
  EngineIdentityPreview,
  EngineLinkOperation,
  EngineLinksContext,
} from '@/lib/contracts/studentCompetitions'
import type { ProgressLink } from '@/lib/contracts/studentProgress'
import { useProgressAccountId } from '@/lib/hooks/useStudentProgress'
import { progressRequest, ProgressRequestError } from '@/lib/services/studentProgressService'
import { useConfirm } from '@/components/ui/ConfirmDialog'

const endpoint = '/api/admin/student-progress-competitions'
const button =
  'min-h-11 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50'
type Work = {
  scope: string
  query: string
  candidates: EngineCandidate[]
  hasMore: boolean
  searched: boolean
  preview: EngineIdentityPreview | null
  verified: boolean
  busy: boolean
  message: string
  error: string
}
const initial = (scope: string): Work => ({
  scope,
  query: '',
  candidates: [],
  hasMore: false,
  searched: false,
  preview: null,
  verified: false,
  busy: false,
  message: '',
  error: '',
})
const operationErrors = {
  remote_unavailable:
    'No pudimos verificar el registro de origen. Puedes reintentar esta misma operación.',
  identity_conflict:
    'Ese registro está vinculado a otro alumno y necesita revisión administrativa.',
  invalid_source: 'No pudimos verificar la respuesta del origen. La operación sigue pendiente.',
}

export default function EngineProgressLinks({ studentId }: { studentId: string }) {
  const accountId = useProgressAccountId()
  const scope = `${accountId || 'signed-out'}:${studentId}`
  const latest = useRef({ scope, sequence: 0 })
  const controller = useRef<AbortController | null>(null)
  if (latest.current.scope !== scope)
    latest.current = { scope, sequence: latest.current.sequence + 1 }
  const [workspace, setWorkspace] = useState(() => initial(scope))
  const work = workspace.scope === scope ? workspace : initial(scope)
  const confirm = useConfirm()
  const cache = useQueryClient()
  const formId = useId()
  const query = useQuery({
    queryKey: ['admin-student-progress', accountId, studentId, 'competitions'],
    enabled: !!accountId && !!studentId,
    staleTime: 0,
    retry: false,
    queryFn: async ({ signal }) => {
      const result = await progressRequest<EngineLinksContext>(
        `${endpoint}?studentId=${encodeURIComponent(studentId)}`,
        { accountId: accountId!, signal }
      )
      if (
        result.student_id !== studentId ||
        !Array.isArray(result.links) ||
        !Array.isArray(result.operations) ||
        result.links.some(
          (link) => link.student_id !== studentId || link.source !== 'tournament_engine'
        ) ||
        result.operations.some((operation) => operation.student_id !== studentId)
      )
        throw Error('No pudimos verificar las identidades de este alumno.')
      return result
    },
  })
  const data = !query.isError && query.data?.student_id === studentId ? query.data : null
  const canAct = !!accountId && !!data && !query.isFetching && !work.busy
  useEffect(() => {
    setWorkspace(initial(scope))
    return () => {
      latest.current.sequence++
      controller.current?.abort()
    }
  }, [scope])
  function update(patch: Partial<Work>) {
    setWorkspace((value) => ({ ...(value.scope === scope ? value : initial(scope)), ...patch }))
  }
  function begin() {
    controller.current?.abort()
    controller.current = new AbortController()
    const operation = { scope, sequence: ++latest.current.sequence }
    update({ busy: true, error: '', message: '' })
    return { operation, signal: controller.current.signal }
  }
  const current = (operation: { scope: string; sequence: number }) =>
    operation.scope === latest.current.scope && operation.sequence === latest.current.sequence
  const refresh = () =>
    Promise.all([
      cache.invalidateQueries({ queryKey: ['admin-student-progress'] }),
      cache.invalidateQueries({ queryKey: ['student-progress'] }),
    ])
  function errorMessage(error: unknown) {
    return error instanceof ProgressRequestError
      ? error.message
      : 'No pudimos completar la consulta. Vuelve a intentarlo.'
  }

  async function search(event: FormEvent) {
    event.preventDefault()
    if (!canAct || work.query.trim().length < 2) return
    const { operation, signal } = begin()
    update({ preview: null, searched: false, candidates: [], verified: false })
    try {
      const result = await progressRequest<{ candidates: EngineCandidate[]; has_more: boolean }>(
        endpoint,
        {
          accountId: accountId!,
          signal,
          body: { action: 'search', studentId, query: work.query.trim() },
        }
      )
      if (current(operation))
        update({
          candidates: result.candidates,
          hasMore: result.has_more,
          searched: true,
          busy: false,
        })
    } catch (error) {
      if (current(operation)) update({ busy: false, error: errorMessage(error) })
    }
  }
  async function preview(candidate: Pick<EngineCandidate, 'competitor_id'>) {
    if (!canAct) return
    const { operation, signal } = begin()
    update({ preview: null, verified: false })
    try {
      const result = await progressRequest<EngineIdentityPreview>(endpoint, {
        accountId: accountId!,
        signal,
        body: { action: 'preview', studentId, externalId: candidate.competitor_id },
      })
      if (result.candidate.competitor_id !== candidate.competitor_id)
        throw Error('Identity mismatch')
      if (current(operation)) update({ preview: result, busy: false })
    } catch (error) {
      if (current(operation)) update({ busy: false, error: errorMessage(error) })
    }
  }
  async function mutate(
    action: 'beginConfirm' | 'retry' | 'revoke',
    selected?: ProgressLink | EngineLinkOperation
  ) {
    if (!canAct) return
    const candidate = work.preview?.candidate
    if (
      action === 'beginConfirm' &&
      (!candidate || !work.verified)
    )
      return
    const { operation, signal } = begin()
    try {
      if (action !== 'retry') {
        const accepted = await confirm(
          action === 'beginConfirm'
            ? `Vincular a ${candidate!.display_name}\nID de competencias: ${candidate!.competitor_id}`
            : 'Se retirará el acceso local de inmediato. Si la limpieza del origen no termina, podrás reintentarla desde esta ficha.',
          {
            title:
              action === 'beginConfirm'
                ? 'Confirmar identidad de competencias'
                : 'Retirar identidad de competencias',
            description:
              action === 'beginConfirm'
                ? 'El alumno y sus tutores podrán consultar todos los torneos de este arquero. Los nuevos registros con el mismo nombre completo se incorporarán automáticamente; los datos contradictorios requerirán revisión.'
                : undefined,
            confirmLabel: action === 'beginConfirm' ? 'Confirmar identidad' : 'Retirar acceso',
            tone: action === 'beginConfirm' ? 'warning' : 'danger',
          }
        )
        if (!current(operation)) return
        if (!accepted) {
          update({ busy: false })
          return
        }
      }
      const existing = candidate
        ? data?.links.find((link) => link.external_id === candidate.competitor_id)
        : null
      const body =
        action === 'beginConfirm'
          ? {
              action,
              studentId,
              externalId: candidate!.competitor_id,
              identityVerified: true,
              requestId: crypto.randomUUID(),
              expectedLinkId: existing?.id ?? null,
              expectedRevision: existing?.revision ?? null,
            }
          : action === 'retry'
            ? { action, studentId, operationId: selected!.id }
            : {
                action,
                studentId,
                linkId: selected!.id,
                expectedRevision: (selected as ProgressLink).revision,
                requestId: crypto.randomUUID(),
              }
      const result = await progressRequest<{ link: ProgressLink; operation: EngineLinkOperation }>(
        endpoint,
        { accountId: accountId!, signal, body }
      )
      if (result.link.student_id !== studentId || result.operation.student_id !== studentId)
        throw Error('Identity mismatch')
      await refresh()
      if (current(operation))
        setWorkspace({
          ...initial(scope),
          message:
            result.operation.state === 'pending'
              ? 'La operación quedó pendiente. Puedes reintentar desde el registro sin volver a confirmar la identidad.'
              : result.link.status === 'confirmed'
                ? 'Identidad de competencias vinculada y verificada.'
                : 'Acceso de competencias retirado.',
        })
    } catch (error) {
      if (!current(operation)) return
      // The server may have accepted the decision before a response was lost. Read its persisted operation instead of creating a new decision.
      await refresh()
      if (current(operation))
        update({
          preview: null,
          verified: false,
                  busy: false,
          error: errorMessage(error),
        })
    }
  }
  const visible =
    data?.links.filter(
      (link) =>
        link.status !== 'revoked' ||
        data.operations.some(
          (operation) => operation.link_id === link.id && operation.state === 'pending'
        )
    ) || []
  const selectedLink = work.preview
    ? data?.links.find((link) => link.external_id === work.preview!.candidate.competitor_id)
    : null
  return (
    <section
      aria-labelledby={`${formId}-heading`}
      className="mt-6 space-y-4 border-t border-slate-200 pt-5"
    >
      <div>
        <h3 id={`${formId}-heading`} className="font-semibold text-slate-900">
          Competencias
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          Confirma al arquero una sola vez. Sus torneos con el mismo nombre completo se reunirán automáticamente, aunque tengan códigos diferentes.
        </p>
      </div>
      {!accountId || query.isLoading ? (
        <p role="status" className="text-sm text-slate-600">
          Comprobando identidades de competencias…
        </p>
      ) : null}
      {query.isError && (
        <div className="rounded-xl bg-amber-50 p-3">
          <p role="alert" className="text-sm text-amber-900">
            No pudimos consultar las identidades de competencias.
          </p>
          <button type="button" className={`${button} mt-2`} onClick={() => void query.refetch()}>
            Volver a consultar identidades
          </button>
        </div>
      )}
      {data && (
        <>
          {visible.length === 0 && (
            <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
              Sin identidades de competencias vinculadas.
            </p>
          )}
          <ul className="space-y-3">
            {visible.map((link) => {
              const pending = data.operations.find(
                (operation) => operation.link_id === link.id && operation.state === 'pending'
              )
              return (
                <li key={link.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">
                        {link.status === 'confirmed'
                          ? 'Identidad verificada'
                          : link.status === 'pending'
                            ? 'Pendiente de confirmar'
                            : 'Acceso retirado'}
                      </p>
                      <p className="mt-1 break-all font-mono text-xs text-slate-600">
                        {link.external_id}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">Revisión {link.revision}</p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        className={button}
                        disabled={!canAct}
                        onClick={() => void preview({ competitor_id: link.external_id })}
                      >
                        Revisar registro<span className="sr-only"> {link.external_id}</span>
                      </button>
                      {link.status !== 'revoked' && (
                        <button
                          type="button"
                          className="min-h-11 text-sm font-semibold text-rose-700 underline disabled:opacity-50"
                          disabled={!canAct}
                          onClick={() => void mutate('revoke', link)}
                        >
                          Retirar acceso<span className="sr-only"> de {link.external_id}</span>
                        </button>
                      )}
                    </div>
                  </div>
                  {pending && (
                    <div className="mt-3 rounded-lg bg-amber-50 p-3">
                      <p className="text-xs font-semibold text-amber-900">
                        {pending.action === 'revoke'
                          ? 'Acceso local retirado · limpieza pendiente en el origen'
                          : 'La confirmación todavía no está completa'}
                      </p>
                      {pending.last_error_code && (
                        <p className="mt-1 text-xs text-amber-800">
                          {operationErrors[pending.last_error_code]}
                        </p>
                      )}
                      <button
                        type="button"
                        className={`${button} mt-2`}
                        disabled={!canAct}
                        onClick={() => void mutate('retry', pending)}
                      >
                        Reintentar operación<span className="sr-only"> de {link.external_id}</span>
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          <form onSubmit={(event) => void search(event)}>
            <label htmlFor={`${formId}-search`} className="text-sm font-semibold text-slate-800">
              Buscar identidad de competencias
            </label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                id={`${formId}-search`}
                value={work.query}
                minLength={2}
                maxLength={100}
                required
                autoComplete="off"
                disabled={work.busy}
                onChange={(event) =>
                  update({
                    query: event.target.value,
                    candidates: [],
                    searched: false,
                    preview: null,
                                      verified: false,
                  })
                }
                className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-300 px-3 text-sm"
              />
              <button
                type="submit"
                className={button}
                disabled={!canAct || work.query.trim().length < 2}
              >
                Buscar en competencias
              </button>
            </div>
          </form>
          {work.searched && (
            <div>
              <p className="text-sm text-slate-600" role="status">
                {work.candidates.length
                  ? 'Revisa el registro y sus eventos antes de confirmar.'
                  : 'No encontramos coincidencias con ese nombre.'}
              </p>
              <ul className="mt-2 space-y-2">
                {work.candidates.map((candidate) => (
                  <li
                    key={candidate.competitor_id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{candidate.display_name}</p>
                      <p className="mt-1 break-all font-mono text-xs text-slate-500">
                        {candidate.competitor_id}
                      </p>
                    </div>
                    <button
                      type="button"
                      className={button}
                      disabled={!canAct}
                      onClick={() => void preview(candidate)}
                    >
                      Revisar identidad<span className="sr-only"> {candidate.competitor_id}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {work.hasMore && (
                <p className="mt-2 text-sm text-amber-800">
                  Hay más coincidencias. Escribe un nombre más preciso.
                </p>
              )}
            </div>
          )}
          {work.preview && (
            <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4">
              <h4 className="font-semibold text-slate-900">
                Registro seleccionado: {work.preview.candidate.display_name}
              </h4>
              <p className="mt-1 break-all font-mono text-xs text-slate-600">
                {work.preview.candidate.competitor_id}
              </p>
              <p className="mt-2 text-sm text-slate-700">
                Presente en {work.preview.published_individual_datasets} eventos individuales
                publicados.
              </p>
              <ul className="mt-2 space-y-2 text-xs text-slate-600">
                {work.preview.recent_events.map((event, index) => (
                  <li key={index}>
                    <p className="font-semibold">
                      {event.name}
                      {event.start_date ? ` · ${event.start_date}` : ''}
                    </p>
                    <p>{event.category_labels.join(' · ')}</p>
                  </li>
                ))}
              </ul>
              {selectedLink && selectedLink.status !== 'revoked' ? (
                <p className="mt-4 text-sm font-semibold text-slate-700">
                  {selectedLink.status === 'confirmed'
                    ? 'Este registro ya está vinculado al alumno.'
                    : 'Este registro ya tiene una operación pendiente. Usa Reintentar operación.'}
                </p>
              ) : (
                <>
                  <p className="mt-4 text-xs text-slate-600">Se guardarán automáticamente el administrador, la fecha y el registro vinculado.</p>
                  <label className="mt-3 flex items-start gap-2 text-sm text-slate-800">
                    <input
                      type="checkbox"
                      checked={work.verified}
                      disabled={work.busy}
                      onChange={(event) => update({ verified: event.target.checked })}
                      className="mt-1 h-4 w-4"
                    />
                    He verificado que esta identidad de competencias corresponde al alumno.
                  </label>
                  <button
                    type="button"
                    className="mt-4 min-h-11 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    disabled={!canAct || !work.verified}
                    onClick={() => void mutate('beginConfirm')}
                  >
                    Confirmar identidad de competencias
                  </button>
                </>
              )}
            </div>
          )}
        </>
      )}
      {work.busy && (
        <p role="status" className="text-sm text-slate-600">
          Procesando operación de competencias…
        </p>
      )}
      {work.error && (
        <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">
          {work.error}
        </p>
      )}
      {work.message && (
        <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
          {work.message}
        </p>
      )}
    </section>
  )
}
