import { MapPin } from 'lucide-react'

export default function IntroLocationHeader({ name, code, className = '' }: { name: string; code: string; className?: string }) {
  const site = `${code} ${name}`.toLocaleLowerCase('es')
  const color = site.includes('tiabaya') ? 'bg-blue-100 text-blue-900'
    : site.includes('umacollo') ? 'bg-violet-100 text-violet-900' : 'bg-slate-100 text-slate-700'
  return <div className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold ${color} ${className}`}><MapPin size={12} aria-hidden="true" /><span>{name}</span></div>
}
