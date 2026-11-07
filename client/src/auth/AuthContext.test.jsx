import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { getToken, setToken } from '../api.js'
import { AuthProvider } from './AuthContext.jsx'
import { useAuth } from './useAuth.js'

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const parent = { id: 1, name: 'Ayşe Yılmaz', role: 'parent' }
const renderAuth = () => renderHook(() => useAuth(), { wrapper: AuthProvider })

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.clear()
})

test('without a token it does not call /me and is anonymous', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch')

  const { result } = renderAuth()

  expect(result.current.status).toBe('anonymous')
  expect(result.current.user).toBeNull()
  expect(fetchSpy).not.toHaveBeenCalled()
})

test('with a valid token it loads the user from /me', async () => {
  setToken('good')
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ user: parent }))

  const { result } = renderAuth()
  expect(result.current.status).toBe('loading')

  await waitFor(() => expect(result.current.status).toBe('authenticated'))
  expect(result.current.user).toEqual(parent)
  expect(fetchSpy.mock.calls[0][0]).toBe('/api/auth/me')
  expect(fetchSpy.mock.calls[0][1].headers.Authorization).toBe('Bearer good')
})

test('with an invalid token it removes the token and becomes anonymous', async () => {
  setToken('bad')
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ error: 'Invalid or expired token' }, 401))

  const { result } = renderAuth()

  await waitFor(() => expect(result.current.status).toBe('anonymous'))
  expect(getToken()).toBeNull()
  expect(result.current.user).toBeNull()
})

test('when the server is unreachable at startup it becomes anonymous and keeps the token', async () => {
  setToken('maybe-good')
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))

  const { result } = renderAuth()

  await waitFor(() => expect(result.current.status).toBe('anonymous'))
  expect(getToken()).toBe('maybe-good')
})

test('a successful login stores the token and sets the user', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ token: 'new-token', user: parent }))
  const { result } = renderAuth()

  await act(async () => {
    await result.current.login('ayse@example.com', 'password123')
  })

  expect(getToken()).toBe('new-token')
  expect(result.current.user).toEqual(parent)
  expect(result.current.status).toBe('authenticated')
  const [path, options] = fetchSpy.mock.calls[0]
  expect(path).toBe('/api/auth/login')
  expect(options.method).toBe('POST')
  expect(JSON.parse(options.body)).toEqual({ email: 'ayse@example.com', password: 'password123' })
})

test('a failed login throws the backend message and stores nothing', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ error: 'Invalid email or password' }, 401))
  const { result } = renderAuth()

  await act(async () => {
    await expect(result.current.login('ayse@example.com', 'wrong')).rejects.toThrow('Invalid email or password')
  })

  expect(getToken()).toBeNull()
  expect(result.current.user).toBeNull()
  expect(result.current.status).toBe('anonymous')
})

test('logout removes the token and the user', async () => {
  setToken('good')
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ user: parent }))
  const { result } = renderAuth()
  await waitFor(() => expect(result.current.status).toBe('authenticated'))

  act(() => result.current.logout())

  expect(getToken()).toBeNull()
  expect(result.current.user).toBeNull()
  expect(result.current.status).toBe('anonymous')
})

test('useAuth throws when used outside AuthProvider', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})

  expect(() => renderHook(() => useAuth())).toThrow('useAuth must be used inside AuthProvider')
})
