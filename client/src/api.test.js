import { afterEach, expect, test, vi } from 'vitest'
import { ApiError, apiFetch, getToken, setToken, setUnauthorizedHandler } from './api.js'

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
  setUnauthorizedHandler(null)
})

test('adds the Authorization header when a token is stored', async () => {
  setToken('abc')
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ ok: true }))

  await apiFetch('/api/auth/me')

  const [path, options] = fetchSpy.mock.calls[0]
  expect(path).toBe('/api/auth/me')
  expect(options.headers.Authorization).toBe('Bearer abc')
})

test('does not add the Authorization header when there is no token', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ ok: true }))

  await apiFetch('/api/health')

  expect(fetchSpy.mock.calls[0][1].headers.Authorization).toBeUndefined()
})

test('sends a JSON body with the Content-Type header and returns the parsed response', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ id: 7 }))

  const result = await apiFetch('/api/things', { method: 'POST', body: { name: 'x' } })

  const options = fetchSpy.mock.calls[0][1]
  expect(options.method).toBe('POST')
  expect(options.headers['Content-Type']).toBe('application/json')
  expect(options.body).toBe('{"name":"x"}')
  expect(result).toEqual({ id: 7 })
})

test('throws an ApiError with the backend message and status', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ error: 'You do not have permission to do this' }, 403))

  const error = await apiFetch('/api/things').catch((e) => e)

  expect(error).toBeInstanceOf(ApiError)
  expect(error.message).toBe('You do not have permission to do this')
  expect(error.status).toBe(403)
})

test('on 401 it removes the token and tells the auth handler the session ended', async () => {
  setToken('expired')
  const handler = vi.fn()
  setUnauthorizedHandler(handler)
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ error: 'Invalid or expired token' }, 401))

  await expect(apiFetch('/api/auth/me')).rejects.toMatchObject({ status: 401 })

  expect(getToken()).toBeNull()
  expect(handler).toHaveBeenCalledTimes(1)
})

test('a 401 on a request that expects it keeps the token and does not end the session', async () => {
  setToken('still-good')
  const handler = vi.fn()
  setUnauthorizedHandler(handler)
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ error: 'Invalid email or password' }, 401))

  const error = await apiFetch('/api/auth/login', { method: 'POST', body: {}, expectUnauthorized: true }).catch((e) => e)

  expect(error.message).toBe('Invalid email or password')
  expect(getToken()).toBe('still-good')
  expect(handler).not.toHaveBeenCalled()
})

test('gives a clear message when the server cannot be reached', async () => {
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))

  await expect(apiFetch('/api/health')).rejects.toMatchObject({ message: 'Cannot reach the server', status: 0 })
})

test('treats a non-JSON server error as an unreachable backend', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('proxy error', { status: 500 }))

  await expect(apiFetch('/api/health')).rejects.toMatchObject({ message: 'Cannot reach the server', status: 500 })
})
