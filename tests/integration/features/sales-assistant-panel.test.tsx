import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SalesAssistantPanel } from '../../../src/features/sales-assistant/SalesAssistantPanel'
import { SalesAssistantError } from '../../../src/services/gemini/assistant-error'
import type { SalesAssistant } from '../../../src/services/gemini/sales-assistant'

describe('SalesAssistantPanel', () => {
  it('submits a suggestion and displays loading and success', async () => {
    let resolveAnswer: ((value: unknown) => void) | undefined
    const ask = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveAnswer = resolve
      }),
    )
    render(
      <SalesAssistantPanel assistant={{ ask } as unknown as SalesAssistant} />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'How many orders do we have?' }),
    )
    expect(screen.getByText('Checking the latest orders…')).toBeInTheDocument()
    resolveAnswer?.({
      answer: 'There are 6 orders.',
      toolName: 'getOrderCount',
      toolResult: { orderCount: 6 },
    })
    expect(await screen.findByText(/There are 6 orders/)).toBeInTheDocument()
  })

  it('shows distinct errors and retries the same question', async () => {
    const ask = vi
      .fn()
      .mockRejectedValueOnce(new SalesAssistantError('quotaExceeded'))
      .mockResolvedValueOnce({
        answer: 'Recovered.',
        toolName: 'getOrderCount',
        toolResult: { orderCount: 6 },
      })
    render(
      <SalesAssistantPanel assistant={{ ask } as unknown as SalesAssistant} />,
    )

    const input = screen.getByLabelText('Sales question')
    fireEvent.change(input, { target: { value: 'How many orders?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }))
    expect(
      await screen.findByText(/quota is currently exhausted/i),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(ask).toHaveBeenCalledTimes(2))
    expect(await screen.findByText(/Recovered/)).toBeInTheDocument()
    expect(ask).toHaveBeenLastCalledWith('How many orders?')
  })
})
