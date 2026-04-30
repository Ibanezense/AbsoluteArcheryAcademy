import Link from 'next/link'
import { WifiOff } from 'lucide-react'

export default function OfflinePage() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-white text-textsec shadow-card">
        <WifiOff className="h-7 w-7" />
      </div>
      <h1 className="text-2xl font-semibold text-textpri">Sin conexion</h1>
      <p className="mt-2 max-w-sm text-sm text-textsec">
        Puedes volver a intentar cuando recuperes internet. Las reservas, pagos y datos administrativos no se guardan sin conexion.
      </p>
      <Link href="/" className="btn mt-5">
        Reintentar
      </Link>
    </div>
  )
}
