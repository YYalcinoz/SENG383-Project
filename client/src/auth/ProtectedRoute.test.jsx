import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import App from '../App.jsx'
import { getToken, setToken } from '../api.js'
import { AuthProvider } from './AuthContext.jsx'

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  )

const HOME = { parent: 'Parent home', specialist: 'Specialist home', child: 'Child home' }
const PATH = { parent: '/parent', specialist: '/specialist', child: '/child' }

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.clear()
})

test.each(['/parent', '/specialist', '/child'])(
  'a visitor who is not logged in is sent from %s to the login page',
  async (path) => {
    renderAt(path)

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeTruthy()
  },
)

test('while the user is being loaded a protected page shows Loading and does not redirect', () => {
  setToken('good')
  vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}))

  renderAt('/parent')

  expect(screen.getByRole('status').textContent).toBe('Loading…')
  expect(screen.queryByRole('heading', { name: 'Log in' })).toBeNull()
})

const crossRole = [
  ['parent', 'specialist'],
  ['parent', 'child'],
  ['specialist', 'parent'],
  ['specialist', 'child'],
  ['child', 'parent'],
  ['child', 'specialist'],
]

test.each(crossRole)('a %s who opens the %s page is sent to their own home page', async (role, other) => {
  setToken('good')
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ user: { id: 1, name: 'Test', role } }))

  renderAt(PATH[other])

  expect(await screen.findByRole('heading', { name: HOME[role] })).toBeTruthy()
  expect(screen.queryByRole('heading', { name: HOME[other] })).toBeNull()
})

test('someone sent to the login page from another role page ends up on their own home page after logging in', async () => {
  const fetchSpy = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(jsonResponse({ token: 't', user: { id: 1, name: 'Ayşe', role: 'parent' } }))
  const user = userEvent.setup()
  renderAt('/child')

  await user.type(await screen.findByLabelText('Email'), 'ayse@example.com')
  await user.type(screen.getByLabelText('Password'), 'password123')
  await user.click(screen.getByRole('button', { name: 'Log in' }))

  expect(await screen.findByRole('heading', { name: 'Parent home' })).toBeTruthy()
  expect(screen.queryByRole('heading', { name: 'Child home' })).toBeNull()
  expect(fetchSpy).toHaveBeenCalledTimes(1)
})

test('Log out removes the token and shows the login page', async () => {
  setToken('good')
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ user: { id: 1, name: 'Test', role: 'parent' } }))
  const user = userEvent.setup()
  renderAt('/parent')
  await screen.findByRole('heading', { name: 'Parent home' })

  await user.click(screen.getByRole('button', { name: 'Log out' }))

  expect(await screen.findByRole('heading', { name: 'Log in' })).toBeTruthy()
  expect(getToken()).toBeNull()
  expect(screen.queryByRole('heading', { name: 'Parent home' })).toBeNull()
})
