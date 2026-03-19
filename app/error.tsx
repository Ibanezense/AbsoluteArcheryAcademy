'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('App route error:', error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-2xl border border-danger/30 bg-card p-6 text-center shadow-soft">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h2 className="text-xl font-semibold text-textpri">Ocurrio un error</h2>
        <p className="mt-2 text-sm text-textsec">
          Intenta recargar esta seccion. Si persiste, revisa el log del servidor.
        </p>
        <button onClick={() => reset()} className="btn mt-5">
          Reintentar
        </button>
      </div>
    </div>
  )
}
