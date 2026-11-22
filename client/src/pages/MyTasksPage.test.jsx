import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import App from '../App.jsx'
import { setToken } from '../api.js'
import { AuthProvider } from '../auth/AuthContext.jsx'
import { jsonResponse } from '../testUtils.js'

const PAGE = '/child/tasks'
// Çocuğun kendi id'si 3; sayfa başka bir id'yle hiç istek atmamalı
const API = '/api/children/3/tasks'

const task = (id, title, dueDate, status, developmentArea, assignerName, description = '') => ({
  id,
  title,
  description,
  developmentArea,
  dueDate,
  status,
  assignerName,
  createdAt: '2026-11-13T10:00:00Z',
  doneAt: status === 'done' ? '2026-11-14T08:00:00Z' : null,
})

const READ = task(1, 'Read 10 pages', '2026-11-20', 'todo', 'language', 'Mehmet Demir', 'Any book, out loud')
const BALANCE = task(2, 'Balance exercise', '2026-11-12', 'done', 'motor', 'Ayşe Yılmaz')
const DRESS = task(3, 'Dress alone', '2026-11-12', 'todo', 'self-care', 'Mehmet Demir')

// Sahte backend; beklenmeyen bir istek 599 döner, böylece test sessizce geçemez.
// Görevler bilerek karışık sırayla verilir.
function mockApi({ role = 'child', routes = {} } = {}) {
  const all = {
    'GET /api/auth/me': () => jsonResponse({ user: { id: 3, name: 'Zeynep Yılmaz', role } }),
    [`GET ${API}`]: () => jsonResponse({ tasks: [READ, DRESS, BALANCE] }),
    ...routes,
  }
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options = {}) => {
    const handler = all[`${options.method ?? 'GET'} ${url}`]
    return handler ? handler(options) : jsonResponse({ error: `Unexpected request: ${url}` }, 599)
  })
}

const requests = (fetchSpy) => fetchSpy.mock.calls.map(([url, options]) => `${options?.method ?? 'GET'} ${url}`)

function LocationProbe() {
  const { pathname } = useLocation()
  return <span data-testid="location">{pathname}</span>
}
const currentAddress = () => screen.getByTestId('location').textContent

function renderAt(path, api) {
  setToken('good')
  const fetchSpy = mockApi(api)
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
        <LocationProbe />
      </AuthProvider>
    </MemoryRouter>,
  )
  return { fetchSpy, view }
}

async function renderPage(api) {
  const rendered = renderAt(PAGE, api)
  await screen.findByRole('list', { name: 'Tasks' })
  return rendered
}

const items = () => within(screen.getByRole('list', { name: 'Tasks' })).getAllByRole('listitem')
const titles = () => items().map((li) => li.querySelector('.task-title').textContent)
const itemOf = (title) => items().find((li) => li.querySelector('.task-title').textContent === title)
const doneButton = (title) => within(itemOf(title)).queryByRole('button', { name: /^(Mark as done|Saving…)$/ })

// Cevabı biz istediğimiz anda bırakmak için: release() çağrılana kadar istek bekler
function gate(response) {
  let release
  const promise = new Promise((resolve) => {
    release = resolve
  })
  const handler = vi.fn(async () => {
    await promise
    return response()
  })
  return { handler, release }
}

const donePatch = (id, changes = {}) => () =>
  jsonResponse({ task: { ...READ, id, status: 'done', doneAt: '2026-11-15T09:30:00Z', ...changes } })

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.clear()
})

// --- The list (FR-M4-04) ---

test("shows the child's tasks ordered by due date and then id, with description, area, due date, assigner and status", async () => {
  await renderPage()

  expect(titles()).toEqual(['Balance exercise', 'Dress alone', 'Read 10 pages'])
  expect(itemOf('Balance exercise').textContent).toContain('Done')
  expect(itemOf('Balance exercise').textContent).toContain('Motor · due 12 Nov 2026 · assigned by Ayşe Yılmaz')
  expect(itemOf('Read 10 pages').textContent).toContain('To do')
  expect(itemOf('Read 10 pages').textContent).toContain('Any book, out loud')
  expect(itemOf('Read 10 pages').textContent).toContain('Language · due 20 Nov 2026 · assigned by Mehmet Demir')
})

test('only the tasks that are not done have a Mark as done button', async () => {
  await renderPage()

  expect(doneButton('Dress alone')).toBeTruthy()
  expect(doneButton('Read 10 pages')).toBeTruthy()
  expect(doneButton('Balance exercise')).toBeNull()
})

test("uses the child's own id from the login, never the list of children or another id", async () => {
  const { fetchSpy } = await renderPage()

  expect(requests(fetchSpy)).toEqual(['GET /api/auth/me', `GET ${API}`])
})

test('a child without tasks shows a message instead of an empty list', async () => {
  renderAt(PAGE, { routes: { [`GET ${API}`]: () => jsonResponse({ tasks: [] }) } })

  expect(await screen.findByText('You have no tasks right now.')).toBeTruthy()
  expect(screen.queryByRole('list', { name: 'Tasks' })).toBeNull()
})

test('shows task text as plain text and never as HTML', async () => {
  const evil = task(9, '<img src=x onerror=alert(1)>', '2026-11-12', 'todo', 'motor', '<b>Mallory</b>', '<script>alert(1)</script>')
  const { view } = renderAt(PAGE, { routes: { [`GET ${API}`]: () => jsonResponse({ tasks: [evil] }) } })
  await screen.findByRole('list', { name: 'Tasks' })

  expect(view.container.querySelector('img')).toBeNull()
  expect(view.container.querySelector('script')).toBeNull()
  expect(titles()).toEqual(['<img src=x onerror=alert(1)>'])
})

test('shows Loading while the tasks are being loaded', async () => {
  renderAt(PAGE, { routes: { [`GET ${API}`]: () => new Promise(() => {}) } })

  expect(await screen.findByRole('heading', { name: 'My tasks' })).toBeTruthy()
  expect(screen.getByText('Loading…')).toBeTruthy()
  expect(screen.queryByRole('list', { name: 'Tasks' })).toBeNull()
})

test('the Back to home link goes to the child home page', async () => {
  const user = userEvent.setup()
  await renderPage()

  await user.click(screen.getByRole('link', { name: 'Back to home' }))

  expect(currentAddress()).toBe('/child')
})

test('the My tasks item on the child home page opens this page', async () => {
  const user = userEvent.setup()
  renderAt('/child')

  await user.click(await screen.findByRole('link', { name: 'My tasks' }))

  expect(await screen.findByRole('heading', { name: 'My tasks' })).toBeTruthy()
  expect(currentAddress()).toBe('/child/tasks')
})

test('the Back to home link points to the child home page', async () => {
  await renderPage()

  // Adrese bakmak yetmez: yanlış bir bağlantıya tıklayan kullanıcıyı ProtectedRoute zaten kendi
  // ana sayfasına yönlendirir. Bu yüzden bağlantının kendisi de kontrol edilir.
  expect(screen.getByRole('link', { name: 'Back to home' }).getAttribute('href')).toBe('/child')
})

test('the Back to home link on the error page points to the child home page', async () => {
  renderAt(PAGE, { routes: { [`GET ${API}`]: () => jsonResponse({ error: 'You do not have permission to do this' }, 403) } })
  await screen.findByRole('alert')

  expect(screen.getByRole('link', { name: 'Back to home' }).getAttribute('href')).toBe('/child')
})

test('each button is described by the title of its own task', async () => {
  await renderPage()

  for (const title of ['Dress alone', 'Read 10 pages']) {
    const describedBy = doneButton(title).getAttribute('aria-describedby')
    expect(document.getElementById(describedBy).textContent).toBe(title)
  }
})

// --- Marking a task as done (FR-M4-05) ---

test('marks a task as done: sends PATCH without a body, shows it as done and keeps the other tasks', async () => {
  const user = userEvent.setup()
  const { fetchSpy } = await renderPage({ routes: { [`PATCH ${API}/1/done`]: donePatch(1) } })

  await user.click(doneButton('Read 10 pages'))

  expect((await screen.findByRole('status')).textContent).toBe('Marked as done: Read 10 pages')
  expect(itemOf('Read 10 pages').textContent).toContain('Done')
  expect(doneButton('Read 10 pages')).toBeNull()
  // Diğer görevler değişmez
  expect(doneButton('Dress alone')).toBeTruthy()
  expect(titles()).toEqual(['Balance exercise', 'Dress alone', 'Read 10 pages'])

  const patch = fetchSpy.mock.calls.find(([, options]) => options?.method === 'PATCH')
  expect(patch[0]).toBe(`${API}/1/done`)
  expect(patch[1].body).toBeUndefined()
  // Liste yeniden yüklenmez
  expect(requests(fetchSpy).filter((r) => r === `GET ${API}`)).toHaveLength(1)
})

test('each task is saved on its own: while one is saving, the others can still be marked', async () => {
  const user = userEvent.setup()
  const slow = gate(donePatch(1))
  await renderPage({
    routes: { [`PATCH ${API}/1/done`]: slow.handler, [`PATCH ${API}/3/done`]: donePatch(3, { title: 'Dress alone' }) },
  })

  await user.click(doneButton('Read 10 pages'))
  expect(doneButton('Read 10 pages').disabled).toBe(true)
  expect(doneButton('Dress alone').disabled).toBe(false)

  await user.click(doneButton('Dress alone'))
  expect(doneButton('Dress alone')).toBeNull()

  await act(async () => slow.release())
  expect(doneButton('Read 10 pages')).toBeNull()
})

test('while the request runs the button is disabled and a second click sends nothing', async () => {
  const user = userEvent.setup()
  const slow = gate(donePatch(1))
  const { fetchSpy } = await renderPage({ routes: { [`PATCH ${API}/1/done`]: slow.handler } })

  await user.click(doneButton('Read 10 pages'))

  const button = within(itemOf('Read 10 pages')).getByRole('button', { name: 'Saving…' })
  expect(button.disabled).toBe(true)
  await user.click(button)
  expect(fetchSpy.mock.calls.filter(([, options]) => options?.method === 'PATCH')).toHaveLength(1)

  await act(async () => slow.release())
  expect((await screen.findByRole('status')).textContent).toBe('Marked as done: Read 10 pages')
})

test('shows the message of the backend when saving fails, and the task can be tried again', async () => {
  const user = userEvent.setup()
  await renderPage({
    routes: { [`PATCH ${API}/1/done`]: () => jsonResponse({ error: 'Task not found' }, 404) },
  })

  await user.click(doneButton('Read 10 pages'))

  expect((await screen.findByRole('alert')).textContent).toBe('Task not found')
  expect(itemOf('Read 10 pages').textContent).toContain('To do')
  expect(doneButton('Read 10 pages').disabled).toBe(false)
})

test('shows a clear message when the server cannot be reached while saving', async () => {
  const user = userEvent.setup()
  await renderPage({
    routes: {
      [`PATCH ${API}/1/done`]: () => {
        throw new TypeError('Failed to fetch')
      },
    },
  })

  await user.click(doneButton('Read 10 pages'))

  expect((await screen.findByRole('alert')).textContent).toBe('Cannot reach the server')
  expect(doneButton('Read 10 pages').disabled).toBe(false)
})

test('a response that is not a task is shown as an error and the task stays as it was', async () => {
  const user = userEvent.setup()
  await renderPage({ routes: { [`PATCH ${API}/1/done`]: () => jsonResponse({ task: { id: 'x' } }) } })

  await user.click(doneButton('Read 10 pages'))

  expect((await screen.findByRole('alert')).textContent).toBe('Unexpected response from the server')
  expect(itemOf('Read 10 pages').textContent).toContain('To do')
})

test('an old error disappears when the next attempt starts', async () => {
  const user = userEvent.setup()
  let attempt = 0
  await renderPage({
    routes: {
      [`PATCH ${API}/1/done`]: () =>
        ++attempt === 1 ? jsonResponse({ error: 'Task not found' }, 404) : jsonResponse({ task: { ...READ, status: 'done' } }),
    },
  })

  await user.click(doneButton('Read 10 pages'))
  expect((await screen.findByRole('alert')).textContent).toBe('Task not found')

  await user.click(doneButton('Read 10 pages'))

  expect((await screen.findByRole('status')).textContent).toBe('Marked as done: Read 10 pages')
  expect(screen.queryByRole('alert')).toBeNull()
})

test('several tasks can be saving at the same time and each one is released when its own request ends', async () => {
  const user = userEvent.setup()
  const read = gate(donePatch(1))
  const dress = gate(donePatch(3, { title: 'Dress alone' }))
  await renderPage({ routes: { [`PATCH ${API}/1/done`]: read.handler, [`PATCH ${API}/3/done`]: dress.handler } })

  await user.click(doneButton('Read 10 pages'))
  await user.click(doneButton('Dress alone'))
  expect(doneButton('Read 10 pages').disabled).toBe(true)
  expect(doneButton('Dress alone').disabled).toBe(true)

  await act(async () => dress.release())
  expect(doneButton('Dress alone')).toBeNull()
  // Okuma görevinin isteği hâlâ sürüyor, düğmesi kapalı kalmalı
  expect(doneButton('Read 10 pages').disabled).toBe(true)

  await act(async () => read.release())
  expect(doneButton('Read 10 pages')).toBeNull()
})

test('two clicks in the same instant send only one request', async () => {
  const slow = gate(donePatch(1))
  const { fetchSpy } = await renderPage({ routes: { [`PATCH ${API}/1/done`]: slow.handler } })
  const button = doneButton('Read 10 pages')

  // İki tıklama da React düğmeyi "kapalı" olarak yeniden çizmeden önce gelir
  act(() => {
    button.click()
    button.click()
  })

  expect(fetchSpy.mock.calls.filter(([, options]) => options?.method === 'PATCH')).toHaveLength(1)
  await act(async () => slow.release())
  expect((await screen.findByRole('status')).textContent).toBe('Marked as done: Read 10 pages')
})

test('the notice of a successful save disappears when the next attempt starts', async () => {
  const user = userEvent.setup()
  await renderPage({
    routes: {
      [`PATCH ${API}/1/done`]: donePatch(1),
      [`PATCH ${API}/3/done`]: () => jsonResponse({ error: 'Task not found' }, 404),
    },
  })

  await user.click(doneButton('Read 10 pages'))
  expect((await screen.findByRole('status')).textContent).toBe('Marked as done: Read 10 pages')

  await user.click(doneButton('Dress alone'))

  expect((await screen.findByRole('alert')).textContent).toBe('Task not found')
  expect(screen.getByRole('status').textContent).toBe('')
})

// --- Errors and access ---

test('shows the message of the backend when the tasks cannot be loaded', async () => {
  renderAt(PAGE, { routes: { [`GET ${API}`]: () => jsonResponse({ error: 'You do not have permission to do this' }, 403) } })

  expect((await screen.findByRole('alert')).textContent).toBe('You do not have permission to do this')
  expect(screen.getByRole('link', { name: 'Back to home' })).toBeTruthy()
})

test.each([
  ['a list that is not an array', { tasks: 'none' }],
  ['no list at all', {}],
  ['a task with an unknown status', { tasks: [{ ...READ, status: 'paused' }] }],
])('shows an error for %s instead of crashing', async (_name, body) => {
  renderAt(PAGE, { routes: { [`GET ${API}`]: () => jsonResponse(body) } })

  expect((await screen.findByRole('alert')).textContent).toBe('Unexpected response from the server')
})

test.each([
  ['parent', '/parent'],
  ['specialist', '/specialist'],
])('a %s who opens the child tasks address is sent to their own home page and no task is requested', async (role, home) => {
  const { fetchSpy } = renderAt(PAGE, { role })

  expect(await screen.findByRole('heading', { name: new RegExp(`^${role} home$`, 'i') })).toBeTruthy()
  expect(currentAddress()).toBe(home)
  expect(requests(fetchSpy).filter((r) => r.includes('/tasks'))).toEqual([])
})
