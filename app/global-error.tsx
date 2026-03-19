'use client'

import { useEffect } from 'react'
import { AlertOctagon } from 'lucide-react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Global app error:', error)
  }, [error])

  return (
    <html lang="es">
      <body className="min-h-screen bg-bg text-textpri">
        <div className="flex min-h-screen items-center justify-center px-4">
          <div className="w-full max-w-xl rounded-2xl border border-danger/30 bg-card p-7 text-center shadow-soft">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
              <AlertOctagon className="h-6 w-6" />
            </div>
            <h2 className="text-2xl font-semibold">Error critico de la aplicacion</h2>
            <p className="mt-2 text-sm text-textsec">
              Ocurrio un problema inesperado al renderizar la app.
            </p>
            <button onClick={() => reset()} className="btn mt-6">
              Intentar nuevamente
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
