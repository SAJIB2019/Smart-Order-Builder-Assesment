import { lazy, Suspense } from 'react'

import { AppShell } from '../components/AppShell'
import { OrderBuilderPreview } from '../features/order-builder/OrderBuilderPreview'

const SalesAssistantPanel = lazy(async () => {
  const module = await import('../features/sales-assistant/SalesAssistantPanel')
  return { default: module.SalesAssistantPanel }
})

export function App() {
  return (
    <AppShell>
      <OrderBuilderPreview />
      <Suspense
        fallback={
          <section
            className="panel assistant-skeleton"
            aria-label="Loading sales assistant"
          />
        }
      >
        <SalesAssistantPanel />
      </Suspense>
    </AppShell>
  )
}
