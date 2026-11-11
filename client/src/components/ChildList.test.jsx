import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import ChildList from './ChildList.jsx'
import { jsonResponse } from '../testUtils.js'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const renderList = (props) =>
  render(
    <MemoryRouter>
      <ChildList title="Your children" basePath="/parent" emptyMessage="None" {...props} />
    </MemoryRouter>,
  )

test('a module with a slug links to that child\'s page, a module without one is coming soon', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    jsonResponse({ children: [{ id: 7, name: 'Ali' }, { id: 9, name: 'Zeynep' }] }),
  )

  renderList({ modules: [{ label: 'Tasks', slug: 'tasks' }, { label: 'Schedule' }] })

  const ali = await screen.findByRole('navigation', { name: 'Ali modules' })
  expect(within(ali).getByRole('link', { name: 'Tasks' }).getAttribute('href')).toBe('/parent/children/7/tasks')
  expect(within(ali).queryByRole('link', { name: 'Schedule' })).toBeNull()
  expect(within(ali).getByText('(coming soon)')).toBeTruthy()

  const zeynep = screen.getByRole('navigation', { name: 'Zeynep modules' })
  expect(within(zeynep).getByRole('link', { name: 'Tasks' }).getAttribute('href')).toBe('/parent/children/9/tasks')
})

test('links start with the role\'s own base path', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    jsonResponse({ children: [{ id: 7, name: 'Ali', specialistType: 'coach' }] }),
  )

  renderList({ basePath: '/specialist', modules: [{ label: 'Tasks', slug: 'tasks' }] })

  const link = await screen.findByRole('link', { name: 'Tasks' })
  expect(link.getAttribute('href')).toBe('/specialist/children/7/tasks')
})

test('asks only GET /api/children, once', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ children: [] }))

  renderList({ modules: [] })

  await screen.findByText('None')
  expect(fetchSpy).toHaveBeenCalledTimes(1)
  expect(fetchSpy.mock.calls[0][0]).toBe('/api/children')
  expect(fetchSpy.mock.calls[0][1].method).toBe('GET')
})

test.each([
  ['an object without children', {}],
  ['children that is not a list', { children: 'Ali' }],
])('shows an error instead of crashing when the server sends %s', async (_, body) => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(body))

  renderList({ modules: [] })

  expect((await screen.findByRole('alert')).textContent).toBe('Unexpected response from the server')
})

test('shows "Cannot reach the server" when the request fails', async () => {
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))

  renderList({ modules: [] })

  expect((await screen.findByRole('alert')).textContent).toBe('Cannot reach the server')
})
