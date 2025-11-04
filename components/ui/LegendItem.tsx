// components/ui/LegendItem.tsx
interface LegendItemProps {
  colorClass: string
  label: string
}

export function LegendItem({ colorClass, label }: LegendItemProps) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-4 h-4 rounded ${colorClass}`}></div>
      <span className="text-textsec">{label}</span>
    </div>
  )
}
