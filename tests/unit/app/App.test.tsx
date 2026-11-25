import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { App } from '../../../src/app/App'

describe('App', () => {
  it('renders the project shell', () => {
    render(<App />)

    expect(
      screen.getByRole('heading', { level: 1, name: 'Smart Order Builder' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Project foundation is ready',
      }),
    ).toBeInTheDocument()
  })
})
