import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-2xl border border-line bg-card p-7 text-center shadow-soft">
        <p className="text-sm uppercase tracking-[0.16em] text-textsec">404</p>
        <h1 className="mt-2 text-2xl font-semibold text-textpri">Pagina no encontrada</h1>
        <p className="mt-2 text-sm text-textsec">
          El recurso que buscas no existe o fue movido.
        </p>
        <Link href="/" className="btn mt-6 inline-flex">
          Volver al inicio
        </Link>
      </div>
    </div>
  )
}
