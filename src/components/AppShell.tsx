import type { ReactNode } from 'react'

interface AppShellProps {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <header className="site-header">
        <div className="header-inner">
          <h1 className="sr-only">Smart Order Builder</h1>
          <a
            className="brand"
            href="#builder"
            aria-label="Smart Order Builder home"
          >
            <span className="brand-mark" aria-hidden="true">
              S
            </span>
            <span>
              <strong>Smart Order</strong>
              <small>Staff workspace</small>
            </span>
          </a>
          <nav aria-label="Primary navigation">
            <a href="#builder">Builder</a>
            <a href="#cart">Cart</a>
            <a href="#orders">Orders</a>
            <a href="#assistant">Assistant</a>
          </nav>
          <span className="status-badge">
            <span aria-hidden="true" /> Mock API online
          </span>
        </div>
      </header>
      <main className="app-shell" id="main-content">
        {children}
      </main>
      <footer>
        <p>Smart Order Builder · Staff assessment workspace</p>
      </footer>
    </>
  )
}
