import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import App from '../App.jsx'
import { getToken, setToken } from '../api.js'
import { AuthProvider } from '../auth/AuthContext.jsx'
import { jsonResponse } from '../testUtils.js'

const PARENT_MODULES = ['Specialists', 'Tasks', 'Schedule', 'Entries', 'Documents', 'Statistics', 'AI summary']
const SPECIALIST_MODULES = ['Tasks', 'Schedule', 'Entries', 'Documents', 'Statistics', 'AI summary']

// /me kullanıcıyı, /api/children verilen cevabı döner. Beklenmeyen bir istek testi bozar.
// children: dizi (200 cevabı) veya () => Response / Promise (hata ve bekleme durumları için)
function mockApi(role, { name = 'Test User', children = [] } = {}) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    if (url === '/api/auth/me') return jsonResponse({ user: { id: 1, name, role } })
    if (url === '/api/children') {
      return typeof children === 'function' ? children() : jsonResponse({ children })
    }
    throw new Error(`Unexpected request: ${url}`)
  })
}

async function renderAs(role, path, options) {
  setToken('good')
  const fetchSpy = mockApi(role, options)
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  )
  await screen.findByRole('heading', { name: /^Welcome, / })
  return { ...view, fetchSpy }
}

// Bir çocuğun kartındaki modül adları (link olsun olmasın, "(coming soon)" olmadan)
function modulesOf(childName) {
  const nav = screen.getByRole('navigation', { name: `${childName} modules` })
  return within(nav)
    .getAllByRole('listitem')
    .map((item) => item.firstChild.textContent.trim())
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.clear()
})

test('the parent home lists each of the parent\'s children with all parent modules', async () => {
  await renderAs('parent', '/parent', {
    children: [
      { id: 3, name: 'Ali' },
      { id: 2, name: 'Zeynep' },
    ],
  })

  const headings = await screen.findAllByRole('heading', { level: 3 })
  expect(headings.map((h) => h.textContent)).toEqual(['Ali', 'Zeynep'])
  expect(modulesOf('Ali')).toEqual(PARENT_MODULES)
  expect(modulesOf('Zeynep')).toEqual(PARENT_MODULES)
})

test('the specialist home shows each linked child with the specialist type and no "My children" module', async () => {
  await renderAs('specialist', '/specialist', {
    children: [{ id: 2, name: 'Zeynep', specialistType: 'teacher' }],
  })

  expect(await screen.findByRole('heading', { level: 3, name: 'Zeynep (teacher)' })).toBeTruthy()
  expect(modulesOf('Zeynep')).toEqual(SPECIALIST_MODULES)
})

test('the child home keeps its own modules and never asks for a list of children', async () => {
  const { fetchSpy } = await renderAs('child', '/child')

  const items = screen.getAllByRole('listitem').map((item) => item.firstChild.textContent.trim())
  expect(items).toEqual(['My tasks', 'My schedule'])
  expect(fetchSpy.mock.calls.map(([url]) => url)).toEqual(['/api/auth/me'])
})

test('the child home does not show entries, documents, statistics or the AI summary', async () => {
  await renderAs('child', '/child')

  for (const hidden of [/entries/i, /documents/i, /statistics/i, /ai summary/i]) {
    expect(screen.queryByText(hidden)).toBeNull()
  }
})

test.each([
  ['parent', '/parent', 'No children are registered to your account yet.'],
  ['specialist', '/specialist', /No children are linked to you yet/],
])('the %s home says so when there are no children', async (role, path, message) => {
  await renderAs(role, path, { children: [] })

  expect(await screen.findByText(message)).toBeTruthy()
  expect(screen.queryByRole('heading', { level: 3 })).toBeNull()
})

test('shows Loading while the children are being loaded', async () => {
  await renderAs('parent', '/parent', { children: () => new Promise(() => {}) })

  expect(screen.getByRole('status').textContent).toBe('Loading…')
})

test('shows the server error when the children cannot be loaded', async () => {
  await renderAs('specialist', '/specialist', {
    children: () => jsonResponse({ error: 'Internal server error' }, 500),
  })

  expect((await screen.findByRole('alert')).textContent).toBe('Internal server error')
  expect(screen.queryByRole('status')).toBeNull()
})

test('a 401 while loading the children logs the user out', async () => {
  await renderAs('parent', '/parent', {
    children: () => jsonResponse({ error: 'Invalid or expired token' }, 401),
  })

  expect(await screen.findByRole('heading', { name: 'Log in' })).toBeTruthy()
  expect(getToken()).toBeNull()
})

test('child names and specialist types are shown as plain text and never interpreted as HTML', async () => {
  const name = '<img src=x onerror=alert(1)>'
  const type = '<script>alert(2)</script>'
  const { container } = await renderAs('specialist', '/specialist', {
    children: [{ id: 2, name, specialistType: type }],
  })

  expect(await screen.findByRole('heading', { level: 3, name: `${name} (${type})` })).toBeTruthy()
  expect(container.querySelector('img')).toBeNull()
  expect(container.querySelector('script')).toBeNull()
})

test('the header shows the user name and a Log out button', async () => {
  await renderAs('specialist', '/specialist', { name: 'Mehmet Demir' })

  expect(screen.getByText('Mehmet Demir')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Log out' })).toBeTruthy()
})

test('a user name is shown as plain text and never interpreted as HTML', async () => {
  const name = '<img src=x onerror=alert(1)>'
  const { container } = await renderAs('parent', '/parent', { name })

  expect(container.querySelector('img')).toBeNull()
  expect(screen.getByRole('heading', { name: `Welcome, ${name}` })).toBeTruthy()
})
