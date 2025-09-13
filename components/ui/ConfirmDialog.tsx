import React, { createContext, useCallback, useContext, useState } from 'react'

type ConfirmOptions = { title?: string; description?: string }

const ConfirmContext = createContext<{
  confirm: (message: string, opts?: ConfirmOptions) => Promise<boolean>
} | null>(null)

export function ConfirmProvider({ children }:{ children: React.ReactNode }){
  const [state, setState] = useState<{message:string; opts?:ConfirmOptions; resolve?: (v:boolean)=>void} | null>(null)

  const confirm = useCallback((message:string, opts?:ConfirmOptions)=>{
    return new Promise<boolean>((resolve)=>{
      setState({ message, opts, resolve })
    })
  },[])

  const handle = useCallback((v:boolean)=>{
    if (state?.resolve) state.resolve(v)
    setState(null)
  },[state])

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {state && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={()=>handle(false)} />
          <div className="bg-white rounded p-4 z-10 max-w-md w-full shadow">
            <h3 className="font-medium text-lg">{state.opts?.title ?? 'Confirmar'}</h3>
            <p className="mt-2 text-sm text-slate-600">{state.message}</p>
            <div className="mt-4 flex gap-2 justify-end">
              <button onClick={()=>handle(false)} className="px-3 py-1 rounded border">Cancelar</button>
              <button onClick={()=>handle(true)} className="px-3 py-1 rounded bg-red-600 text-white">Aceptar</button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}

export function useConfirm(){
  const ctx = useContext(ConfirmContext)
  if (!ctx) {
    // fallback: always return false or resolved false to avoid blocking prerender
    return async (_message: string) => false
  }
  return ctx.confirm
}

export default ConfirmProvider
