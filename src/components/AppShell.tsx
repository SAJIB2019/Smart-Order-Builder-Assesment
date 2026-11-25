import type { ReactNode } from 'react'

interface AppShellProps {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="app-shell">
      <header className="site-header">
        <div>
          <p className="brand-kicker">Smart ordering</p>
          <h1>Smart Order Builder</h1>
        </div>
        <span className="status-badge">Foundation</span>
      </header>
      <main>{children}</main>
    </div>
  )
}
