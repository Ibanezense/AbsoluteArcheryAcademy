export default function GuardianDniInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <label className="grid gap-2 text-sm font-bold text-slate-700">DNI del tutor
    <input className="min-h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-950 outline-none focus:border-accent/50 focus:ring-4 focus:ring-orange-100" value={value} onChange={(event) => onChange(event.target.value)} inputMode="numeric" maxLength={8} pattern="[0-9]{8}" placeholder="8 dígitos" />
  </label>
}
