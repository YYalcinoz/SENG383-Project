import { render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import App from './App'

afterEach(() => {
  vi.restoreAllMocks()
})

test('shows the backend status from /api/health', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    json: () => Promise.resolve({ status: 'ok' }),
  })

  render(<App />)

  expect(await screen.findByText('Backend status: ok')).toBeTruthy()
})