import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect } from 'react'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import App from '../App.jsx'
import { getToken, setToken } from '../api.js'
import { AuthProvider } from '../auth/AuthContext.jsx'
import { jsonResponse } from '../testUtils.js'

const PAGE = '/parent/children/2/specialists'
const API = '/api/children/2/specialists'

const MEHMET = { id: 5, name: 'Mehmet Demir', specialistType: 'teacher', linkedAt: '2026-11-10T09:00:00Z' }
const CAN = { id: 7, name: 'Can Kaya', specialistType: 'coach', linkedAt: '2026-11-11T09:00:00Z' }
const ELIF = { id: 6, name: 'Elif Arslan', specialistType: 'psychologist', linkedAt: '2026-11-11T10:00:00Z' }

// Sahte backend. Her anahtar bir isteğe karşılık gelir; değer bir Response döndüren fonksiyon.
// Beklenmeyen bir istek 599 döner, böylece test sessizce geçemez.
function mockApi({ role = 'parent', children, list, post, del } = {}) {
  const routes = {
    'GET /api/auth/me': () => jsonResponse({ user: { id: 1, name: 'Ayşe Yılmaz', role } }),
    'GET /api/children': children ?? (() => jsonResponse({ children: [{ id: 2, name: 'Zeynep Yılmaz' }] })),
    [`GET ${API}`]: list ?? (() => jsonResponse({ specialists: [MEHMET, CAN] })),
    [`POST ${API}`]: post,
    [`DELETE ${API}/5`]: del,
  }
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options = {}) => {
    const handler = routes[`${options.method ?? 'GET'} ${url}`]
    return handler ? handler(options) : jsonResponse({ error: `Unexpected request: ${url}` }, 599)
  })
}

const requests = (fetchSpy) => fetchSpy.mock.calls.map(([url, options]) => `${options?.method ?? 'GET'} ${url}`)

async function renderPage(path = PAGE, api) {
  setToken('good')
  const fetchSpy = mockApi(api)
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  )
  await screen.findByRole('heading', { name: 'Linked specialists' })
  return fetchSpy
}

const listItems = () =>
  within(screen.getByRole('heading', { name: 'Specialists' }).parentElement)
    .queryAllByRole('listitem')
    .map((li) => li.querySelector('strong').textContent)

async function fillAndLink(user, email, type) {
  if (email) await user.type(screen.getByLabelText('Specialist email'), email)
  if (type) await user.selectOptions(screen.getByLabelText('Specialist type'), type)
  await user.click(screen.getByRole('button', { name: 'Link specialist' }))
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.clear()
})

// --- List (FR-M2-03) ---

test('shows the child and the linked specialists by name, with type and link date', async () => {
  await renderPage()

  expect(await screen.findByRole('heading', { name: 'Zeynep Yılmaz' })).toBeTruthy()
  expect(listItems()).toEqual(['Can Kaya', 'Mehmet Demir'])
  const mehmet = screen.getByText('Mehmet Demir').closest('li')
  expect(mehmet.textContent).toContain('(teacher)')
  expect(mehmet.textContent).toContain('linked 10 Nov 2026')
})

test('says so when no specialist is linked', async () => {
  await renderPage(PAGE, { list: () => jsonResponse({ specialists: [] }) })

  expect(await screen.findByText('No specialists are linked to Zeynep Yılmaz yet.')).toBeTruthy()
})

test('the parent home links to this page for each child', async () => {
  const user = userEvent.setup()
  setToken('good')
  mockApi()
  render(
    <MemoryRouter initialEntries={['/parent']}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  )

  const link = await screen.findByRole('link', { name: 'Specialists' })
  expect(link.getAttribute('href')).toBe(PAGE)
  await user.click(link)
  expect(await screen.findByRole('heading', { name: 'Linked specialists' })).toBeTruthy()
})

// --- Access ---

test('a 403 from the backend is shown and no form is offered', async () => {
  await renderPage(PAGE, {
    list: () => jsonResponse({ error: 'You do not have access to this child' }, 403),
  })

  expect((await screen.findByRole('alert')).textContent).toBe('You do not have access to this child')
  expect(screen.queryByLabelText('Specialist email')).toBeNull()
})

test('a child missing from the parent\'s own list is treated as not found', async () => {
  await renderPage(PAGE, { children: () => jsonResponse({ children: [{ id: 3, name: 'Other' }] }) })

  expect((await screen.findByRole('alert')).textContent).toBe('Child not found')
  expect(screen.queryByLabelText('Specialist email')).toBeNull()
})

test.each(['abc', '0', '2abc', '..%2F..%2Fauth', '12345678901'])(
  'an invalid child id (%s) shows "Child not found" and sends no request about it',
  async (id) => {
    const fetchSpy = await renderPage(`/parent/children/${id}/specialists`)

    expect(screen.getByRole('alert').textContent).toBe('Child not found')
    expect(requests(fetchSpy)).toEqual(['GET /api/auth/me'])
  },
)

test('a specialist who opens the page is sent to their own home and nothing is requested', async () => {
  setToken('good')
  const fetchSpy = mockApi({ role: 'specialist', children: () => jsonResponse({ children: [] }) })
  render(
    <MemoryRouter initialEntries={[PAGE]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  )

  expect(await screen.findByRole('heading', { name: 'Specialist home' })).toBeTruthy()
  expect(requests(fetchSpy)).not.toContain(`GET ${API}`)
})

test('a 401 while loading logs the user out', async () => {
  setToken('good')
  mockApi({ list: () => jsonResponse({ error: 'Invalid or expired token' }, 401) })
  render(
    <MemoryRouter initialEntries={[PAGE]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  )

  expect(await screen.findByRole('heading', { name: 'Log in' })).toBeTruthy()
  expect(getToken()).toBeNull()
})

test('names are shown as plain text and never interpreted as HTML', async () => {
  const name = '<img src=x onerror=alert(1)>'
  await renderPage(PAGE, {
    children: () => jsonResponse({ children: [{ id: 2, name }] }),
    list: () => jsonResponse({ specialists: [{ ...MEHMET, name }] }),
  })

  expect(await screen.findByRole('heading', { name })).toBeTruthy()
  expect(document.querySelector('main img')).toBeNull()
})

// --- Link (FR-M2-01, FR-M2-02) ---

test('links a specialist: sends the trimmed email and type, adds them to the list and clears the form', async () => {
  const user = userEvent.setup()
  const post = vi.fn(() => jsonResponse({ specialist: ELIF }, 201))
  await renderPage(PAGE, { post })

  await fillAndLink(user, '  Elif@Example.com ', 'psychologist')

  expect(await screen.findByText('Elif Arslan is now linked as psychologist.')).toBeTruthy()
  expect(post).toHaveBeenCalledTimes(1)
  expect(JSON.parse(post.mock.calls[0][0].body)).toEqual({ email: 'Elif@Example.com', specialistType: 'psychologist' })
  expect(listItems()).toEqual(['Can Kaya', 'Elif Arslan', 'Mehmet Demir'])
  expect(screen.getByLabelText('Specialist email').value).toBe('')
  expect(screen.getByLabelText('Specialist type').value).toBe('')
})

test('offers exactly the five specialist types', async () => {
  await renderPage()

  const options = within(screen.getByLabelText('Specialist type'))
    .getAllByRole('option')
    .map((o) => o.value)
  expect(options).toEqual(['', 'teacher', 'psychologist', 'doctor', 'special education teacher', 'coach'])
})

test.each([
  ['an empty email', '', 'teacher', 'Email is required'],
  ['a blank email', '   ', 'teacher', 'Email is required'],
  ['no type', 'elif@example.com', null, 'Choose a specialist type'],
])('%s is rejected before anything is sent', async (_, email, type, message) => {
  const user = userEvent.setup()
  const post = vi.fn()
  await renderPage(PAGE, { post })

  await fillAndLink(user, email, type)

  expect(screen.getByRole('alert').textContent).toBe(message)
  expect(post).not.toHaveBeenCalled()
})

test.each([
  [400, 'No registered specialist with this email'],
  [409, 'This specialist is already linked to the child'],
])('a %i from the backend is shown, the email is kept and the list is unchanged', async (status, message) => {
  const user = userEvent.setup()
  await renderPage(PAGE, { post: () => jsonResponse({ error: message }, status) })

  await fillAndLink(user, 'someone@example.com', 'doctor')

  expect((await screen.findByRole('alert')).textContent).toBe(message)
  expect(screen.getByLabelText('Specialist email').value).toBe('someone@example.com')
  expect(listItems()).toEqual(['Can Kaya', 'Mehmet Demir'])
})

test('while linking the button is disabled and a second click sends nothing', async () => {
  const user = userEvent.setup()
  let respond
  const post = vi.fn(() => new Promise((resolve) => (respond = resolve)))
  await renderPage(PAGE, { post })

  await fillAndLink(user, 'elif@example.com', 'psychologist')
  const button = screen.getByRole('button', { name: 'Linking…' })
  expect(button.disabled).toBe(true)
  await user.click(button)
  expect(post).toHaveBeenCalledTimes(1)

  respond(jsonResponse({ specialist: ELIF }, 201))
  expect(await screen.findByText('Elif Arslan is now linked as psychologist.')).toBeTruthy()
})

// --- Unlink (FR-M2-04) ---

test('unlinking asks for confirmation first, and Cancel sends nothing', async () => {
  const user = userEvent.setup()
  const del = vi.fn()
  await renderPage(PAGE, { del })

  await user.click(screen.getByRole('button', { name: 'Unlink Mehmet Demir' }))
  const confirm = screen.getByRole('group', { name: 'Confirm unlinking Mehmet Demir' })
  expect(confirm.textContent).toContain('Unlink Mehmet Demir from Zeynep Yılmaz?')
  expect(del).not.toHaveBeenCalled()
  // Odak Cancel'da: Enter'a basmak bağlantıyı kaldırmamalı
  expect(document.activeElement).toBe(within(confirm).getByRole('button', { name: 'Cancel' }))

  await user.click(within(confirm).getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByRole('group')).toBeNull()
  expect(del).not.toHaveBeenCalled()
  expect(listItems()).toEqual(['Can Kaya', 'Mehmet Demir'])
})

test('confirming sends DELETE for that specialist and removes them from the list', async () => {
  const user = userEvent.setup()
  const del = vi.fn(() => new Response(null, { status: 204 }))
  const fetchSpy = await renderPage(PAGE, { del })

  await user.click(screen.getByRole('button', { name: 'Unlink Mehmet Demir' }))
  await user.click(screen.getByRole('button', { name: 'Yes, unlink' }))

  expect(await screen.findByText('Mehmet Demir is no longer linked.')).toBeTruthy()
  expect(del).toHaveBeenCalledTimes(1)
  expect(requests(fetchSpy)).toContain(`DELETE ${API}/5`)
  expect(listItems()).toEqual(['Can Kaya'])
})

test('a 404 on unlink (already removed elsewhere) removes the specialist and shows the message', async () => {
  const user = userEvent.setup()
  await renderPage(PAGE, {
    del: () => jsonResponse({ error: 'This specialist is not linked to the child' }, 404),
  })

  await user.click(screen.getByRole('button', { name: 'Unlink Mehmet Demir' }))
  await user.click(screen.getByRole('button', { name: 'Yes, unlink' }))

  expect((await screen.findByRole('alert')).textContent).toBe('This specialist is not linked to the child')
  expect(listItems()).toEqual(['Can Kaya'])
})

test('any other unlink error keeps the specialist in the list', async () => {
  const user = userEvent.setup()
  await renderPage(PAGE, { del: () => jsonResponse({ error: 'Internal server error' }, 500) })

  await user.click(screen.getByRole('button', { name: 'Unlink Mehmet Demir' }))
  await user.click(screen.getByRole('button', { name: 'Yes, unlink' }))

  expect((await screen.findByRole('alert')).textContent).toBe('Internal server error')
  expect(listItems()).toEqual(['Can Kaya', 'Mehmet Demir'])
})

test('switching to another child never shows the previous child\'s specialists', async () => {
  setToken('good')
  // Testin sayfayı başka bir çocuğa yönlendirebilmesi için router'ın navigate fonksiyonu
  const router = {}
  function NavigateProbe() {
    const navigate = useNavigate()
    useEffect(() => {
      router.navigate = navigate
    }, [navigate])
    return null
  }
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options = {}) => {
    const key = `${options.method ?? 'GET'} ${url}`
    if (key === 'GET /api/auth/me') return jsonResponse({ user: { id: 1, name: 'Ayşe Yılmaz', role: 'parent' } })
    if (key === 'GET /api/children') {
      return jsonResponse({ children: [{ id: 2, name: 'Zeynep Yılmaz' }, { id: 3, name: 'Deniz Yılmaz' }] })
    }
    if (key === `GET ${API}`) return jsonResponse({ specialists: [MEHMET] })
    if (key === 'GET /api/children/3/specialists') return new Promise(() => {}) // hiç cevap vermez
    return jsonResponse({ error: `Unexpected request: ${url}` }, 599)
  })
  render(
    <MemoryRouter initialEntries={[PAGE]}>
      <AuthProvider>
        <NavigateProbe />
        <App />
      </AuthProvider>
    </MemoryRouter>,
  )
  expect(await screen.findByText('Mehmet Demir')).toBeTruthy()

  act(() => router.navigate('/parent/children/3/specialists'))

  expect((await screen.findByRole('status')).textContent).toBe('Loading…')
  expect(screen.queryByText('Mehmet Demir')).toBeNull()
})
