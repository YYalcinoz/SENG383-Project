import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { jsonResponse } from '../testUtils.js'
import { useChild } from './useChild.js'

const CHILDREN = [
  { id: 2, name: 'Zeynep Yılmaz' },
  { id: 4, name: 'Ali Kaya' },
]

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

test('finds the child in the user\'s own list', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ children: CHILDREN }))

  const { result } = renderHook(() => useChild('4'))

  expect(result.current).toEqual({ status: 'loading', child: null, error: null })
  await waitFor(() => expect(result.current.status).toBe('ready'))
  expect(result.current.child).toEqual({ id: 4, name: 'Ali Kaya' })
  expect(fetchSpy).toHaveBeenCalledTimes(1)
  expect(fetchSpy.mock.calls[0][0]).toBe('/api/children')
})

test.each([undefined, '', 'abc', '0', '02', '-1', '2abc', '1.5', '..%2F..', '12345678901'])(
  'an invalid id (%s) is "Child not found" and nothing is requested',
  (id) => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const { result } = renderHook(() => useChild(id))

    expect(result.current).toEqual({ status: 'error', child: null, error: 'Child not found' })
    expect(fetchSpy).not.toHaveBeenCalled()
  },
)

test('a child that is not in the user\'s list is "Child not found"', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ children: CHILDREN }))

  const { result } = renderHook(() => useChild('7'))

  await waitFor(() => expect(result.current.status).toBe('error'))
  expect(result.current.error).toBe('Child not found')
  expect(result.current.child).toBeNull()
})

test.each([
  ['a server error', jsonResponse({ error: 'Internal server error' }, 500), 'Internal server error'],
  ['an unexpected response', jsonResponse({}), 'Unexpected response from the server'],
])('%s is returned as the error', async (_, response, message) => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(response)

  const { result } = renderHook(() => useChild('2'))

  await waitFor(() => expect(result.current.status).toBe('error'))
  expect(result.current.error).toBe(message)
})

test('when the id changes, the old child is never shown and a late old answer is ignored', async () => {
  const pending = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    () => new Promise((resolve) => pending.push(() => resolve(jsonResponse({ children: CHILDREN })))),
  )

  const { result, rerender } = renderHook(({ id }) => useChild(id), { initialProps: { id: '2' } })
  rerender({ id: '4' })
  expect(result.current.status).toBe('loading')

  pending[1]() // yeni istek önce cevap verir
  await waitFor(() => expect(result.current.child?.name).toBe('Ali Kaya'))

  pending[0]() // eski istek sonra gelir, sonucu değiştirmemeli
  await new Promise((r) => setTimeout(r, 0))
  expect(result.current.child?.name).toBe('Ali Kaya')
})

test('after switching to another id, the previous child is not returned while loading', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({ children: CHILDREN }))

  const { result, rerender } = renderHook(({ id }) => useChild(id), { initialProps: { id: '2' } })
  await waitFor(() => expect(result.current.child?.name).toBe('Zeynep Yılmaz'))

  fetchSpy.mockImplementation(() => new Promise(() => {})) // ikinci istek hiç cevap vermez
  rerender({ id: '4' })

  expect(result.current).toEqual({ status: 'loading', child: null, error: null })
})
