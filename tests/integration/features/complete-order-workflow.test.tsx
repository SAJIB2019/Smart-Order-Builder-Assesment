import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { OrderBuilderPreview } from '../../../src/features/order-builder/OrderBuilderPreview'
import { buildYourBreakfastFixture } from '../../../src/mocks/fixtures/build-your-breakfast'
import { createApiHandlers } from '../../../src/mocks/handlers/create-api-handlers'
import { CartService } from '../../../src/mocks/services/cart-service'
import { OrderService } from '../../../src/mocks/services/order-service'
import { ServerClock } from '../../../src/mocks/services/server-clock'
import { createInMemoryMockStore } from '../../../src/mocks/store/in-memory-mock-store'
import { server } from '../../../src/mocks/server'

describe('complete staff order workflow', () => {
  it('reflects authoritative state through build, reserve, edit, checkout, and history', async () => {
    const store = createInMemoryMockStore(buildYourBreakfastFixture)
    const clock = new ServerClock(
      { now: () => Date.parse('2026-11-25T10:30:00+06:00') },
      0,
    )
    const orders = new OrderService({
      store,
      clock,
      seedOrders: buildYourBreakfastFixture.seedOrders,
      ids: { orderId: () => 'ORD-UI-WORKFLOW' },
    })
    server.use(
      ...createApiHandlers({
        store,
        clock,
        orderService: orders,
        seedOrders: buildYourBreakfastFixture.seedOrders,
        priceSimulation: { latencyMs: () => 0, shouldFail: () => false },
      }),
    )

    render(<OrderBuilderPreview createIdempotencyKey={() => 'ui-add-key'} />)

    await configureValidBreakfast()
    expect(screen.getAllByText(/more available/).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Add to cart' }))

    expect(await screen.findByText('Toast ×1')).toBeInTheDocument()
    expect(screen.getByText('Scrambled ×2')).toBeInTheDocument()
    expect(screen.getByText(/4:59|5:00/)).toBeInTheDocument()
    let state = await store.getSnapshot()
    expect(state.cartItems).toHaveLength(1)
    expect(
      state.reservations.filter(({ status }) => status === 'active'),
    ).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.change(
      screen.getByRole('spinbutton', { name: 'Item quantity' }),
      {
        target: { value: '2' },
      },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Quantity 2')).toBeInTheDocument()
    state = await store.getSnapshot()
    expect(state.cartItems[0]?.quantity).toBe(2)

    fireEvent.change(screen.getByLabelText('Coupon code'), {
      target: { value: 'MORNING15' },
    })
    fireEvent.click(screen.getByRole('radio', { name: 'Cash' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pay' }))

    expect(
      await screen.findByText(/Order created successfully: ORD-UI-WORKFLOW/),
    ).toBeInTheDocument()
    expect(await screen.findByText('Your cart is empty')).toBeInTheDocument()
    expect(await screen.findByText('ORD-UI-WORKFLOW')).toBeInTheDocument()

    state = await store.getSnapshot()
    expect(state.cartItems).toEqual([])
    expect(state.orders).toHaveLength(7)
    expect(state.orders.at(-1)).toEqual(
      expect.objectContaining({
        id: 'ORD-UI-WORKFLOW',
        paymentMethod: 'cash',
      }),
    )
  })

  it('renders every group and option from a modified API menu', async () => {
    const menu = {
      ...buildYourBreakfastFixture.menu,
      product: {
        ...buildYourBreakfastFixture.menu.product,
        name: 'Configurable Staff Meal',
      },
      groups: buildYourBreakfastFixture.menu.groups.map((group, index) =>
        index === 0
          ? {
              ...group,
              name: 'Dynamic Foundation',
              options: group.options.map((option, optionIndex) =>
                optionIndex === 0
                  ? { ...option, name: 'API-provided choice' }
                  : option,
              ),
            }
          : group,
      ),
    }
    render(
      <OrderBuilderPreview
        menuClient={{
          getMenu: async () => ({
            ok: true,
            data: menu,
            meta: { serverTime: new Date().toISOString(), stateVersion: 0 },
          }),
        }}
      />,
    )

    expect(
      await screen.findByRole('heading', { name: 'Configurable Staff Meal' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('group', { name: /Dynamic Foundation/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('spinbutton', { name: 'API-provided choice quantity' }),
    ).toBeInTheDocument()
  })

  it('TC-14 preserves the configuration and leaves no phantom stock before Retry succeeds', async () => {
    const store = createInMemoryMockStore(buildYourBreakfastFixture)
    const clock = new ServerClock(
      { now: () => Date.parse('2026-11-25T10:30:00+06:00') },
      0,
    )
    let failNextAdd = true
    const cart = new CartService({
      store,
      clock,
      ids: {
        cartItemId: () => 'cart-tc-14',
        reservationId: () => 'reservation-tc-14',
      },
      failures: {
        shouldFail(operation) {
          if (operation !== 'add' || !failNextAdd) return false
          failNextAdd = false
          return true
        },
      },
    })
    const createIdempotencyKey = vi.fn(() => 'tc-14-logical-add')
    server.use(
      ...createApiHandlers({
        store,
        clock,
        cartService: cart,
        seedOrders: buildYourBreakfastFixture.seedOrders,
        priceSimulation: { latencyMs: () => 0, shouldFail: () => false },
      }),
    )

    render(<OrderBuilderPreview createIdempotencyKey={createIdempotencyKey} />)
    await configureValidBreakfast()
    fireEvent.click(screen.getByRole('button', { name: 'Add to cart' }))

    expect(
      await screen.findByText('Reservation failed before commit'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('spinbutton', { name: 'Toast quantity' }),
    ).toHaveValue(1)
    expect(
      screen.getByRole('spinbutton', { name: 'Scrambled quantity' }),
    ).toHaveValue(2)

    let state = await store.getSnapshot()
    expect(state.cartItems).toEqual([])
    expect(state.reservations).toEqual([])
    expect(
      state.stock.levels.find(({ ingredientId }) => ingredientId === 'egg')
        ?.availability,
    ).toEqual({ type: 'finite', quantity: 10 })

    fireEvent.click(screen.getByRole('button', { name: 'Retry add' }))
    expect(await screen.findByText('Toast ×1')).toBeInTheDocument()

    state = await store.getSnapshot()
    expect(state.cartItems).toHaveLength(1)
    expect(state.reservations).toEqual([
      expect.objectContaining({
        id: 'reservation-tc-14',
        status: 'active',
      }),
    ])
    expect(createIdempotencyKey).toHaveBeenCalledTimes(1)
    expect(state.idempotencyRecords).toEqual([
      expect.objectContaining({ key: 'tc-14-logical-add' }),
    ])
  })
})

async function configureValidBreakfast(): Promise<void> {
  await screen.findByRole('spinbutton', { name: 'Toast quantity' })
  for (const [name, value] of [
    ['Toast quantity', '1'],
    ['Scrambled quantity', '2'],
    ['Chicken Sausage quantity', '1'],
    ['Ketchup quantity', '1'],
  ] as const) {
    fireEvent.change(screen.getByRole('spinbutton', { name }), {
      target: { value },
    })
  }
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Add to cart' })).toBeEnabled(),
  )
}
