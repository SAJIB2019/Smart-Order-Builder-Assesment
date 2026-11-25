import { AppShell } from '../components/AppShell'

export function App() {
  return (
    <AppShell>
      <section className="welcome" aria-labelledby="welcome-title">
        <p className="eyebrow">DevsStream Limited · Frontend assessment</p>
        <h2 id="welcome-title">Project foundation is ready</h2>
        <p>
          Rules, shared stock, pricing, orders, and the sales assistant will be
          implemented in the next verified phases.
        </p>
      </section>
    </AppShell>
  )
}
