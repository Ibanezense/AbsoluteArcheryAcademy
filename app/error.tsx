'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, WifiOff } from 'lucide-react'
import { isLikelyNetworkError } from '@/lib/utils/networkError'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const [isOffline, setIsOffline] = useState(
    () => typeof navigator !== 'undefined' && !navigator.onLine,
  )
  const isConnectivityError = isOffline || isLikelyNetworkError(error)

  useEffect(() => {
    console.error('App route error:', error)
  }, [error])

  useEffect(() => {
    const updateConnection = () => setIsOffline(!navigator.onLine)

    window.addEventListener('online', updateConnection)
    window.addEventListener('offline', updateConnection)

    return () => {
      window.removeEventListener('online', updateConnection)
      window.removeEventListener('offline', updateConnection)
    }
  }, [])

  const Icon = isConnectivityError ? WifiOff : AlertTriangle

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-2xl border border-danger/30 bg-card p-6 text-center shadow-soft">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
          <Icon className="h-6 w-6" aria-hidden="true" />
        </div>
        <h2 className="text-xl font-semibold text-textpri">
          {isConnectivityError ? 'Sin conexión a Internet' : 'No pudimos cargar esta sección'}
        </h2>
        <p className="mt-2 text-sm text-textsec">
          {isConnectivityError
            ? 'Revisa tu conexión y vuelve a intentarlo. Tus datos no se han perdido.'
            : 'Vuelve a intentarlo. Si el problema continúa, comunícate con la academia.'}
        </p>
        <button onClick={() => reset()} className="btn mt-5">
          Reintentar
        </button>
      </div>
    </div>
  )
}
