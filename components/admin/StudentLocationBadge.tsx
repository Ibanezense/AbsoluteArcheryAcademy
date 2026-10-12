export default function StudentLocationBadge({ name, code }: { name?: string | null; code?: string | null }) {
  const site = `${code || ''} ${name || ''}`.toLocaleLowerCase('es')
  const color = site.includes('tiabaya') ? 'border-blue-200 bg-blue-50 text-blue-800'
    : site.includes('umacollo') ? 'border-violet-200 bg-violet-50 text-violet-800' : 'border-slate-200 bg-slate-50 text-slate-500'
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${color}`}>{name || 'Sin sede asignada'}</span>
}
