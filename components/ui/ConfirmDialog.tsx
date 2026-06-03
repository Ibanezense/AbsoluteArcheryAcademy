import React, { createContext, useCallback, useContext, useState } from 'react'

type ConfirmTone = 'default' | 'warning' | 'danger'
type ConfirmOptions = {
  title?: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: ConfirmTone
}

const ConfirmContext = createContext<{
  confirm: (message: string, opts?: ConfirmOptions) => Promise<boolean>
} | null>(null)

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ message: string; opts?: ConfirmOptions; resolve?: (v: boolean) => void } | null>(null)

  const confirm = useCallback((message: string, opts?: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({ message, opts, resolve })
    })
  }, [])

  const handle = useCallback((v: boolean) => {
    if (state?.resolve) state.resolve(v)
    setState(null)
  }, [state])

  const confirmButtonClass =
    state?.opts?.tone === 'warning'
      ? 'bg-warning text-black hover:brightness-110'
      : state?.opts?.tone === 'danger'
        ? 'bg-danger text-white hover:brightness-110'
        : 'bg-accent text-black hover:brightness-110'

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {state && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => handle(false)} />
          <div className="z-10 mx-4 w-full max-w-lg rounded-2xl border border-line bg-card p-5 shadow-card">
            <h3 className="text-lg font-semibold text-textpri">{state.opts?.title ?? 'Confirmar'}</h3>
            <p className="mt-3 whitespace-pre-line rounded-xl border border-line bg-bg/70 p-4 text-sm leading-6 text-textpri">
              {state.message}
            </p>
            {state.opts?.description && (
              <p className="mt-3 whitespace-pre-line text-sm leading-6 text-textsec">
                {state.opts.description}
              </p>
            )}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => handle(false)}
                className="rounded-xl border border-line px-4 py-2 text-sm font-medium text-textsec transition hover:text-textpri"
              >
                {state.opts?.cancelLabel ?? 'Cancelar'}
              </button>
              <button
                type="button"
                onClick={() => handle(true)}
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${confirmButtonClass}`}
              >
                {state.opts?.confirmLabel ?? 'Aceptar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) {
    // fallback: always return false or resolved false to avoid blocking prerender
    return async (_message: string) => false
  }
  return ctx.confirm
}

export default ConfirmProvider
