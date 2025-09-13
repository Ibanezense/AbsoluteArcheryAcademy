import PageShell from './PageShell'

export default function AppContainer({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <PageShell title={title}>
      {children}
    </PageShell>
  )
}
