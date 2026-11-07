import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import App from '../App.jsx'
import { getToken } from '../api.js'
import { AuthProvider } from '../auth/AuthContext.jsx'

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const renderLogin = () =>
  render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  )

async function fillAndSubmit(user, email, password) {
  if (email) await user.type(screen.getByLabelText('Email'), email)
  if (password) await user.type(screen.getByLabelText('Password'), password)
  await user.click(screen.getByRole('button', { name: 'Log in' }))
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.clear()
})

test('shows an email field, a password field and a Log in button, and no role field', () => {
  renderLogin()

  expect(screen.getByLabelText('Email').type).toBe('email')
  expect(screen.getByLabelText('Password').type).toBe('password')
  expect(screen.getByRole('button', { name: 'Log in' })).toBeTruthy()
  expect(screen.queryByLabelText(/role/i)).toBeNull()
})

test.each([
  ['parent', 'ayse@example.com', 'Parent home'],
  ['specialist', 'mehmet@example.com', 'Specialist home'],
  ['child', 'zeynep@example.com', 'Child home'],
])('a %s who logs in correctly is sent to their own home page', async (role, email, heading) => {
  const fetchSpy = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(jsonResponse({ token: 'new-token', user: { id: 1, name: 'Test', role } }))
  const user = userEvent.setup()
  renderLogin()

  await fillAndSubmit(user, email, 'password123')

  expect(await screen.findByRole('heading', { name: heading })).toBeTruthy()
  expect(getToken()).toBe('new-token')
  const [path, options] = fetchSpy.mock.calls[0]
  expect(path).toBe('/api/auth/login')
  expect(options.method).toBe('POST')
  expect(JSON.parse(options.body)).toEqual({ email, password: 'password123' })
})

test('can be submitted with the Enter key', async () => {
  const fetchSpy = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(jsonResponse({ token: 't', user: { id: 1, name: 'Test', role: 'parent' } }))
  const user = userEvent.setup()
  renderLogin()

  await user.type(screen.getByLabelText('Email'), 'ayse@example.com')
  await user.type(screen.getByLabelText('Password'), 'password123{Enter}')

  expect(await screen.findByRole('heading', { name: 'Parent home' })).toBeTruthy()
  expect(fetchSpy).toHaveBeenCalledTimes(1)
})

test('a wrong password shows the backend message, stores no token and clears the password', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ error: 'Invalid email or password' }, 401))
  const user = userEvent.setup()
  renderLogin()

  await fillAndSubmit(user, 'ayse@example.com', 'wrong-password')

  expect((await screen.findByRole('alert')).textContent).toBe('Invalid email or password')
  expect(getToken()).toBeNull()
  expect(screen.getByLabelText('Password').value).toBe('')
  expect(screen.getByLabelText('Email').value).toBe('ayse@example.com')
  expect(screen.getByRole('heading', { name: 'Log in' })).toBeTruthy()
})

test.each([
  ['both fields empty', '', ''],
  ['only the email filled in', 'ayse@example.com', ''],
  ['only the password filled in', '', 'password123'],
])('does not send a request when %s', async (_name, email, password) => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch')
  const user = userEvent.setup()
  renderLogin()

  await fillAndSubmit(user, email, password)

  expect((await screen.findByRole('alert')).textContent).toBe('Email and password are required')
  expect(fetchSpy).not.toHaveBeenCalled()
})

test('while the request is running the button is disabled and a second click sends nothing', async () => {
  let respond
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise((resolve) => (respond = resolve)))
  const user = userEvent.setup()
  renderLogin()

  await fillAndSubmit(user, 'ayse@example.com', 'password123')

  const button = screen.getByRole('button', { name: 'Logging in…' })
  expect(button.disabled).toBe(true)
  await user.click(button)
  expect(fetchSpy).toHaveBeenCalledTimes(1)

  respond(jsonResponse({ token: 't', user: { id: 1, name: 'Test', role: 'parent' } }))
  expect(await screen.findByRole('heading', { name: 'Parent home' })).toBeTruthy()
})

test('shows a clear message when the backend cannot be reached and lets the user try again', async () => {
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
  const user = userEvent.setup()
  renderLogin()

  await fillAndSubmit(user, 'ayse@example.com', 'password123')

  expect((await screen.findByRole('alert')).textContent).toBe('Cannot reach the server')
  expect(getToken()).toBeNull()
  expect(screen.getByRole('button', { name: 'Log in' }).disabled).toBe(false)
})
