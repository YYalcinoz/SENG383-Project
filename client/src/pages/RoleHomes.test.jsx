import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import App from '../App.jsx'
import { setToken } from '../api.js'
import { AuthProvider } from '../auth/AuthContext.jsx'

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

async function renderAs(role, path, name = 'Test User') {
  setToken('good')
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ user: { id: 1, name, role } }))
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  )
  await screen.findByRole('heading', { level: 2 })
  return view
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.clear()
})

test.each([
  ['parent', '/parent', ['Specialists', 'Tasks', 'Schedule', 'Entries', 'Documents', 'Statistics', 'AI summary']],
  ['specialist', '/specialist', ['My children', 'Tasks', 'Schedule', 'Entries', 'Documents', 'Statistics', 'AI summary']],
  ['child', '/child', ['My tasks', 'My schedule']],
])('the %s home page greets the user and lists exactly their modules', async (role, path, modules) => {
  await renderAs(role, path)

  expect(screen.getByRole('heading', { name: 'Welcome, Test User' })).toBeTruthy()
  const items = screen.getAllByRole('listitem').map((item) => item.firstChild.textContent.trim())
  expect(items).toEqual(modules)
})

test('the child home page does not show entries, documents, statistics or the AI summary', async () => {
  await renderAs('child', '/child')

  for (const hidden of [/entries/i, /documents/i, /statistics/i, /ai summary/i]) {
    expect(screen.queryByText(hidden)).toBeNull()
  }
})

test('the header shows the user name and a Log out button', async () => {
  await renderAs('specialist', '/specialist', 'Mehmet Demir')

  expect(screen.getByText('Mehmet Demir')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Log out' })).toBeTruthy()
})

test('a user name is shown as plain text and never interpreted as HTML', async () => {
  const name = '<img src=x onerror=alert(1)>'
  const { container } = await renderAs('parent', '/parent', name)

  expect(container.querySelector('img')).toBeNull()
  expect(screen.getByRole('heading', { name: `Welcome, ${name}` })).toBeTruthy()
})
