import React, { createContext, useCallback, useContext, useState } from 'react'

type Toast = { id: string; message: string; type?: 'info'|'error'|'success' }

const ToastsContext = createContext<{
  toasts: Toast[]
  push: (t: Omit<Toast,'id'>) => void
  remove: (id: string) => void
} | null>(null)

export function ToastProvider({ children }:{ children: React.ReactNode }){
  const [toasts, setToasts] = useState<Toast[]>([])

  const push = useCallback((t: Omit<Toast,'id'>)=>{
    const id = Math.random().toString(36).slice(2,9)
    setToasts(s=>[...s,{ id, ...t }])
    // auto remove
    setTimeout(()=> setToasts(s=>s.filter(x=>x.id!==id)), 4000)
  },[])

  const remove = useCallback((id:string)=> setToasts(s=>s.filter(x=>x.id!==id)), [])

  return (
    <ToastsContext.Provider value={{ toasts, push, remove }}>
      {children}
      <div aria-live="polite" className="fixed right-4 top-4 flex flex-col gap-2 z-50">
        {toasts.map(t=> (
          <div key={t.id} className={`px-3 py-2 rounded shadow-sm text-sm text-white ${t.type==='error'? 'bg-red-600': t.type==='success'? 'bg-green-600':'bg-slate-700'}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastsContext.Provider>
  )
}

export function useToast(){
  const ctx = useContext(ToastsContext)
  if (!ctx) {
    // fallback safe no-op (useful during prerender or outside provider)
    return {
      push: (_: Omit<Toast,'id'>) => { /* no-op */ },
      remove: (_id: string) => { /* no-op */ },
    }
  }
  return { push: ctx.push, remove: ctx.remove }
}

export default ToastProvider
