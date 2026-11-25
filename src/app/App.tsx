import { AppShell } from '../components/AppShell'
import { OrderBuilderPreview } from '../features/order-builder/OrderBuilderPreview'

export function App() {
  return (
    <AppShell>
      <OrderBuilderPreview />
    </AppShell>
  )
}
