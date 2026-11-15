import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import App from '../App.jsx'
import { setToken } from '../api.js'
import { AuthProvider } from '../auth/AuthContext.jsx'
import { jsonResponse } from '../testUtils.js'

const PAGE = '/parent/children/2/tasks'
const API = '/api/children/2/tasks'
const ZEYNEP = { id: 2, name: 'Zeynep Yılmaz' }

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

// Sahte backend. Her anahtar bir isteğe karşılık gelir; beklenmeyen bir istek 599 döner,
// böylece test sessizce geçemez. Görevler bilerek karışık sırayla verilir.
function mockApi({ role = 'parent', children = [ZEYNEP], routes = {} } = {}) {
  const all = {
    'GET /api/auth/me': () => jsonResponse({ user: { id: 1, name: 'Ayşe Yılmaz', role } }),
    'GET /api/children': () => jsonResponse({ children }),
    [`GET ${API}`]: () => jsonResponse({ tasks: [READ, DRESS, BALANCE] }),
    ...routes,
  }
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options = {}) => {
    const handler = all[`${options.method ?? 'GET'} ${url}`]
    return handler ? handler(options) : jsonResponse({ error: `Unexpected request: ${url}` }, 599)
  })
}

const requests = (fetchSpy) => fetchSpy.mock.calls.map(([url, options]) => `${options?.method ?? 'GET'} ${url}`)
const posts = (fetchSpy) => fetchSpy.mock.calls.filter(([, options]) => options?.method === 'POST')

// Testte geçerli adresi gösterir
function LocationProbe() {
  const { pathname, search } = useLocation()
  return <span data-testid="location">{pathname + search}</span>
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

async function renderPage(path = PAGE, api) {
  const rendered = renderAt(path, api)
  await screen.findByRole('heading', { name: 'Zeynep Yılmaz' })
  await screen.findByRole('list', { name: 'Tasks' })
  return rendered
}

const taskList = () => screen.getByRole('list', { name: 'Tasks' })
const titles = () =>
  within(taskList())
    .getAllByRole('listitem')
    .map((li) => li.querySelector('.task-title').textContent)

// Formu doldurur; boş bırakılan bir değer o alanı doldurmaz.
// Tarih alanı jsdom'da yazılarak doldurulamadığı için change olayıyla doldurulur.
async function fillForm(user, values = {}) {
  const { title, description, developmentArea, dueDate } = {
    title: 'Draw a house',
    description: '',
    developmentArea: 'cognitive',
    dueDate: '2026-11-15',
    ...values,
  }
  if (title) await user.type(screen.getByLabelText('Title'), title)
  if (description) await user.type(screen.getByLabelText('Description (optional)'), description)
  if (developmentArea) await user.selectOptions(screen.getByLabelText('Development area'), developmentArea)
  if (dueDate) fireEvent.change(screen.getByLabelText('Due date'), { target: { value: dueDate } })
}

const assignButton = () => screen.getByRole('button', { name: /^(Assign task|Assigning…)$/ })

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

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.clear()
})

// --- The list (FR-M4-07) ---

test('shows the child and all tasks ordered by due date and then id, with area, due date, status and assigner', async () => {
  await renderPage()

  expect(titles()).toEqual(['Balance exercise', 'Dress alone', 'Read 10 pages'])

  const [balance, , read] = within(taskList()).getAllByRole('listitem')
  expect(balance.textContent).toContain('Done')
  expect(balance.textContent).toContain('Motor · due 12 Nov 2026 · assigned by Ayşe Yılmaz')
  expect(read.textContent).toContain('To do')
  expect(read.textContent).toContain('Any book, out loud')
  expect(read.textContent).toContain('Language · due 20 Nov 2026 · assigned by Mehmet Demir')
})

test('a linked specialist sees the same tasks at the specialist address', async () => {
  await renderPage('/specialist/children/2/tasks', { role: 'specialist' })

  expect(titles()).toEqual(['Balance exercise', 'Dress alone', 'Read 10 pages'])
})

test('a child without tasks shows a message instead of an empty list', async () => {
  renderAt(PAGE, { routes: { [`GET ${API}`]: () => jsonResponse({ tasks: [] }) } })

  expect(await screen.findByText('No tasks have been assigned yet.')).toBeTruthy()
  expect(screen.queryByRole('list', { name: 'Tasks' })).toBeNull()
})

test('shows task text as plain text and never as HTML', async () => {
  const evil = task(9, '<img src=x onerror=alert(1)>', '2026-11-12', 'todo', 'motor', '<b>Mallory</b>', '<script>alert(1)</script>')
  const { view } = renderAt(PAGE, { routes: { [`GET ${API}`]: () => jsonResponse({ tasks: [evil] }) } })
  await screen.findByRole('list', { name: 'Tasks' })

  expect(view.container.querySelector('img')).toBeNull()
  expect(view.container.querySelector('script')).toBeNull()
  expect(titles()).toEqual(['<img src=x onerror=alert(1)>'])
  expect(taskList().textContent).toContain('<b>Mallory</b>')
})

test('the Back to home link goes to the home page of the role', async () => {
  const user = userEvent.setup()
  await renderPage()

  await user.click(screen.getByRole('link', { name: 'Back to home' }))

  expect(currentAddress()).toBe('/parent')
})

// --- Links from the home pages ---

test.each([
  ['parent', '/parent', PAGE],
  ['specialist', '/specialist', '/specialist/children/2/tasks'],
])('the Tasks item on the %s home page opens the tasks page of that child', async (role, home, target) => {
  const user = userEvent.setup()
  renderAt(home, { role })
  const modules = await screen.findByRole('navigation', { name: 'Zeynep Yılmaz modules' })

  await user.click(within(modules).getByRole('link', { name: 'Tasks' }))

  expect(await screen.findByRole('heading', { name: 'Tasks' })).toBeTruthy()
  expect(currentAddress()).toBe(target)
})

// --- Assigning a task (FR-M4-01, FR-M4-02) ---

test.each([
  ['no title', { title: '', developmentArea: 'motor', dueDate: '2026-11-15' }, 'Title is required'],
  ['a blank title', { title: '   ', developmentArea: 'motor', dueDate: '2026-11-15' }, 'Title is required'],
  ['no development area', { title: 'Draw', developmentArea: '', dueDate: '2026-11-15' }, 'Choose a development area'],
  ['no due date', { title: 'Draw', developmentArea: 'motor', dueDate: '' }, 'Due date is required'],
])('does not send a task with %s and says what is missing', async (_name, values, message) => {
  const user = userEvent.setup()
  const { fetchSpy } = await renderPage()

  await fillForm(user, values)
  await user.click(assignButton())

  expect((await screen.findByRole('alert')).textContent).toBe(message)
  expect(posts(fetchSpy)).toHaveLength(0)
})

test('assigns a task: sends the trimmed values, shows the new task in order and clears the form', async () => {
  const user = userEvent.setup()
  const created = task(4, 'Draw a house', '2026-11-15', 'todo', 'cognitive', 'Ayşe Yılmaz', 'Use colours')
  const { fetchSpy } = await renderPage(PAGE, { routes: { [`POST ${API}`]: () => jsonResponse({ task: created }, 201) } })

  await fillForm(user, { title: '  Draw a house ', description: '  Use colours ' })
  await user.click(assignButton())

  expect((await screen.findByRole('status')).textContent).toBe('Task assigned: Draw a house')
  expect(titles()).toEqual(['Balance exercise', 'Dress alone', 'Draw a house', 'Read 10 pages'])
  expect(screen.getByLabelText('Title').value).toBe('')
  expect(screen.getByLabelText('Description (optional)').value).toBe('')
  expect(screen.getByLabelText('Development area').value).toBe('')
  expect(screen.getByLabelText('Due date').value).toBe('')

  const [[url, options]] = posts(fetchSpy)
  expect(url).toBe(API)
  expect(JSON.parse(options.body)).toEqual({
    title: 'Draw a house',
    description: 'Use colours',
    developmentArea: 'cognitive',
    dueDate: '2026-11-15',
  })
  // Liste yeniden yüklenmez: yeni görev cevaptan eklenir
  expect(requests(fetchSpy).filter((r) => r === `GET ${API}`)).toHaveLength(1)
})

test('the description is optional and is sent as an empty string', async () => {
  const user = userEvent.setup()
  const created = task(4, 'Draw a house', '2026-11-15', 'todo', 'cognitive', 'Ayşe Yılmaz')
  const { fetchSpy } = await renderPage(PAGE, { routes: { [`POST ${API}`]: () => jsonResponse({ task: created }, 201) } })

  await fillForm(user)
  await user.click(assignButton())

  expect((await screen.findByRole('status')).textContent).toBe('Task assigned: Draw a house')
  expect(JSON.parse(posts(fetchSpy)[0][1].body).description).toBe('')
})

test('shows the message of the backend, keeps what was typed and leaves the list unchanged', async () => {
  const user = userEvent.setup()
  await renderPage(PAGE, {
    routes: {
      [`POST ${API}`]: () => jsonResponse({ error: 'Due date must be a valid date in YYYY-MM-DD format' }, 400),
    },
  })

  await fillForm(user)
  await user.click(assignButton())

  expect((await screen.findByRole('alert')).textContent).toBe('Due date must be a valid date in YYYY-MM-DD format')
  expect(screen.getByLabelText('Title').value).toBe('Draw a house')
  expect(assignButton().disabled).toBe(false)
  expect(titles()).toEqual(['Balance exercise', 'Dress alone', 'Read 10 pages'])
})

test('while the request runs the button is disabled and a second click sends nothing', async () => {
  const user = userEvent.setup()
  const created = task(4, 'Draw a house', '2026-11-15', 'todo', 'cognitive', 'Ayşe Yılmaz')
  const post = gate(() => jsonResponse({ task: created }, 201))
  const { fetchSpy } = await renderPage(PAGE, { routes: { [`POST ${API}`]: post.handler } })

  await fillForm(user)
  await user.click(assignButton())

  const button = screen.getByRole('button', { name: 'Assigning…' })
  expect(button.disabled).toBe(true)
  await user.click(button)
  expect(posts(fetchSpy)).toHaveLength(1)

  await act(async () => post.release())
  expect((await screen.findByRole('status')).textContent).toBe('Task assigned: Draw a house')
  expect(assignButton().disabled).toBe(false)
})

test('a second submit while the first request is running is ignored, even without a click on the button', async () => {
  const user = userEvent.setup()
  const created = task(4, 'Draw a house', '2026-11-15', 'todo', 'cognitive', 'Ayşe Yılmaz')
  const post = gate(() => jsonResponse({ task: created }, 201))
  const { fetchSpy } = await renderPage(PAGE, { routes: { [`POST ${API}`]: post.handler } })
  await fillForm(user)
  const form = assignButton().closest('form')

  // Enter tuşu ya da başka bir yol formu tekrar gönderebilir; düğmenin kapalı olması yetmez
  fireEvent.submit(form)
  fireEvent.submit(form)

  expect(posts(fetchSpy)).toHaveLength(1)
  await act(async () => post.release())
  expect((await screen.findByRole('status')).textContent).toBe('Task assigned: Draw a house')
})

test('a response that is not a task is shown as an error and the list stays the same', async () => {
  const user = userEvent.setup()
  await renderPage(PAGE, { routes: { [`POST ${API}`]: () => jsonResponse({ task: { id: 'x' } }, 201) } })

  await fillForm(user)
  await user.click(assignButton())

  expect((await screen.findByRole('alert')).textContent).toBe('Unexpected response from the server')
  expect(titles()).toEqual(['Balance exercise', 'Dress alone', 'Read 10 pages'])
})

// --- Errors ---

test('an invalid child id shows "Child not found" and sends no task request', async () => {
  const { fetchSpy } = renderAt('/parent/children/abc/tasks')

  expect((await screen.findByRole('alert')).textContent).toBe('Child not found')
  expect(screen.getByRole('link', { name: 'Back to home' })).toBeTruthy()
  expect(requests(fetchSpy).filter((r) => r.includes('/tasks'))).toEqual([])
})

test('a child who is not in the list of the user shows "Child not found"', async () => {
  renderAt(PAGE, { children: [] })

  expect((await screen.findByRole('alert')).textContent).toBe('Child not found')
})

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

test('a child who opens the parent tasks address is sent to their own home page and no task is requested', async () => {
  const { fetchSpy } = renderAt(PAGE, { role: 'child' })

  expect(await screen.findByRole('heading', { name: 'Child home' })).toBeTruthy()
  expect(currentAddress()).toBe('/child')
  expect(requests(fetchSpy).filter((r) => r.includes('/tasks'))).toEqual([])
})
