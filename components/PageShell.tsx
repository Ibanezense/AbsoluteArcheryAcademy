export default function PageShell({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <div className="min-h-screen pb-24 bg-bg text-textpri">
      <div className="mx-auto w-full max-w-[430px] px-4">
        {title && (
          <div className="pt-4 pb-2">
            <h1 className="text-lg font-semibold text-center">{title}</h1>
          </div>
        )}
        <div className="space-y-4">{children}</div>
      </div>
    </div>
  )
}
