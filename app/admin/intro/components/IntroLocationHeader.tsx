import { MapPin } from 'lucide-react'

export default function IntroLocationHeader({ name, code, className = '' }: { name: string; code: string; className?: string }) {
  const site = `${code} ${name}`.toLocaleLowerCase('es')
  const color = site.includes('umacollo') ? 'bg-orange-100 text-orange-900' : 'bg-[#edf5ff] text-[#084681]'
  return <div className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold ${color} ${className}`}><MapPin size={12} aria-hidden="true" /><span>{name}</span></div>
}
