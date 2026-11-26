import { AppShell } from '../components/AppShell'
import { OrderBuilderPreview } from '../features/order-builder/OrderBuilderPreview'
import { SalesAssistantPanel } from '../features/sales-assistant/SalesAssistantPanel'

export function App() {
  return (
    <AppShell>
      <OrderBuilderPreview />
      <SalesAssistantPanel />
    </AppShell>
  )
}
