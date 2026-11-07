import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import App from './App.jsx'
import { getToken, setToken } from './api.js'
import { AuthProvider } from './auth/AuthContext.jsx'

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const renderApp = (path = '/') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  )

afterEach(() => {
  cleanup() // Vitest'te otomatik temizlik yok: her testten sonra ekranı biz temizleriz
  vi.restoreAllMocks()
  localStorage.clear()
})

test('a visitor without a token is sent from / to the login page', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch')

  renderApp('/')

  expect(await screen.findByRole('heading', { name: 'Log in' })).toBeTruthy()
  expect(fetchSpy).not.toHaveBeenCalled()
})

test('an unknown path ends up on the login page for a visitor', async () => {
  renderApp('/no-such-page')

  expect(await screen.findByRole('heading', { name: 'Log in' })).toBeTruthy()
})

test.each([
  ['parent', 'Parent home'],
  ['specialist', 'Specialist home'],
  ['child', 'Child home'],
])('a logged-in %s is sent from / to their own home page', async (role, heading) => {
  setToken('good')
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ user: { id: 1, name: 'Test', role } }))

  renderApp('/')

  expect(await screen.findByRole('heading', { name: heading })).toBeTruthy()
})

test('a logged-in user who opens /login is sent to their home page', async () => {
  setToken('good')
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ user: { id: 1, name: 'Test', role: 'parent' } }))

  renderApp('/login')

  expect(await screen.findByRole('heading', { name: 'Parent home' })).toBeTruthy()
})

test('while the user is being loaded it shows Loading and does not show the login page', () => {
  setToken('good')
  vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}))

  renderApp('/login')

  expect(screen.getByRole('status').textContent).toBe('Loading…')
  expect(screen.queryByRole('heading', { name: 'Log in' })).toBeNull()
})

test('an invalid token is removed and the visitor lands on the login page', async () => {
  setToken('abc')
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ error: 'Invalid or expired token' }, 401))

  renderApp('/')

  expect(await screen.findByRole('heading', { name: 'Log in' })).toBeTruthy()
  expect(getToken()).toBeNull()
})
