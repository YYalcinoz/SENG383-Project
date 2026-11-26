import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import App from '../App.jsx'
import { setToken } from '../api.js'
import { AuthProvider } from '../auth/AuthContext.jsx'
import { jsonResponse } from '../testUtils.js'

const PAGE = '/parent/children/2/entries'
const SPECIALIST_PAGE = '/specialist/children/2/entries'
const API = '/api/children/2/entries'
const ZEYNEP = { id: 2, name: 'Zeynep Yılmaz' }

const entry = (id, title, entryDate, entryType, developmentArea, authorName, extra = {}) => ({
  id,
  entryDate,
  entryType,
  developmentArea,
  title,
  observationText: `${title} text.`,
  authorName,
  isEdited: false,
  isOwn: false,
  createdAt: '2026-11-20T10:00:00Z',
  updatedAt: null,
  ...extra,
})

const SORTING = entry(1, 'Sorting and matching', '2026-11-10', 'evaluation', 'cognitive', 'Burak Öztürk', {
  isEdited: true,
  updatedAt: '2026-11-21T09:00:00Z',
})
const READING = entry(2, 'Reading aloud', '2026-11-20', 'observation', 'language', 'Mehmet Demir')
const FEELINGS = entry(3, 'Naming feelings', '2026-11-20', 'session-note', 'social-emotional', 'Burak Öztürk')

// Burak olarak bakıldığında kendi girişleri isOwn: true döner
const own = (e) => ({ ...e, isOwn: true })
const BURAKS_VIEW = [own(SORTING), READING, own(FEELINGS)]

// Sahte backend. Her anahtar bir isteğe karşılık gelir; beklenmeyen bir istek 599 döner,
// böylece test sessizce geçemez. Girişler bilerek karışık sırayla verilir.
function mockApi({ role = 'parent', children = [ZEYNEP], routes = {} } = {}) {
  const all = {
    'GET /api/auth/me': () => jsonResponse({ user: { id: 1, name: 'Test User', role } }),
    'GET /api/children': () => jsonResponse({ children }),
    [`GET ${API}`]: () => jsonResponse({ entries: role === 'specialist' ? BURAKS_VIEW : [SORTING, READING, FEELINGS] }),
    ...routes,
  }
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options = {}) => {
    const handler = all[`${options.method ?? 'GET'} ${url}`]
    return handler ? handler(options) : jsonResponse({ error: `Unexpected request: ${url}` }, 599)
  })
}

const requests = (fetchSpy) => fetchSpy.mock.calls.map(([url, options]) => `${options?.method ?? 'GET'} ${url}`)
const sent = (fetchSpy, method) =>
  fetchSpy.mock.calls.filter(([, options]) => options?.method === method).map(([url, options]) => [url, JSON.parse(options.body)])

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
  await screen.findByRole('list', { name: 'Entries' })
  return rendered
}
const renderAsSpecialist = (api = {}) => renderPage(SPECIALIST_PAGE, { role: 'specialist', ...api })

const entryList = () => screen.getByRole('list', { name: 'Entries' })
const titles = () =>
  within(entryList())
    .getAllByRole('listitem')
    .map((li) => li.querySelector('.entry-title').textContent)
const entryItem = (title) => within(entryList()).getByRole('listitem', { name: title })
const editButton = (title) => screen.getByRole('button', { name: `Edit ${title}` })
const addForm = () => screen.getByRole('form', { name: 'Add an entry' })
const editForm = (title) => screen.getByRole('form', { name: `Edit ${title}` })

// Bir formu doldurur; boş bırakılan bir değer o alanı değiştirmez.
// Tarih alanı jsdom'da yazılarak doldurulamadığı için change olayıyla doldurulur.
async function fillForm(user, form, values = {}) {
  const { entryDate, entryType, developmentArea, title, observationText } = {
    entryDate: '2026-11-19',
    entryType: 'observation',
    developmentArea: 'motor',
    title: 'Ball games',
    observationText: 'Caught a large ball.',
    ...values,
  }
  const field = (name) => within(form).getByLabelText(name)
  if (entryDate) fireEvent.change(field('Date'), { target: { value: entryDate } })
  if (entryType) await user.selectOptions(field('Entry type'), entryType)
  if (developmentArea) await user.selectOptions(field('Development area'), developmentArea)
  if (title) await user.type(field('Title'), title)
  if (observationText) await user.type(field('Text'), observationText)
}

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

// --- The list (FR-M5-03, FR-M5-05) ---

test('the parent sees all entries, the newest first, with type, area, date, author and text', async () => {
  await renderPage()

  // Aynı tarihte sonra kaydedilen (id'si büyük olan) önce
  expect(titles()).toEqual(['Naming feelings', 'Reading aloud', 'Sorting and matching'])

  const feelings = entryItem('Naming feelings')
  expect(feelings.textContent).toContain('Session note · Social-emotional · 20 Nov 2026 · by Burak Öztürk')
  expect(feelings.textContent).toContain('Naming feelings text.')
  expect(entryItem('Sorting and matching').textContent).toContain(
    'Evaluation · Cognitive · 10 Nov 2026 · by Burak Öztürk',
  )
  expect(entryItem('Reading aloud').textContent).toContain('Observation · Language · 20 Nov 2026 · by Mehmet Demir')
})

test('only an edited entry shows the "Edited" label', async () => {
  await renderPage()

  expect(within(entryItem('Sorting and matching')).getByText('Edited')).toBeTruthy()
  expect(screen.getAllByText('Edited')).toHaveLength(1)
})

test('the parent sees no form and no Edit button', async () => {
  await renderPage()

  expect(screen.queryByRole('form')).toBeNull()
  expect(screen.queryByRole('heading', { name: 'Add an entry' })).toBeNull()
  expect(screen.queryByRole('button', { name: /^Edit/ })).toBeNull()
})

test('a specialist sees the same entries, with an Edit button only on their own', async () => {
  await renderAsSpecialist()

  expect(titles()).toEqual(['Naming feelings', 'Reading aloud', 'Sorting and matching'])
  expect(screen.getAllByRole('button', { name: /^Edit/ }).map((b) => b.getAttribute('aria-label'))).toEqual([
    'Edit Naming feelings',
    'Edit Sorting and matching',
  ])
  expect(within(entryItem('Reading aloud')).queryByRole('button')).toBeNull()
})

test('a child without entries shows a message instead of an empty list', async () => {
  renderAt(PAGE, { routes: { [`GET ${API}`]: () => jsonResponse({ entries: [] }) } })

  expect(await screen.findByText('No entries yet.')).toBeTruthy()
  expect(screen.queryByRole('list', { name: 'Entries' })).toBeNull()
})

test('shows entry text as plain text, never as HTML, and keeps its line breaks', async () => {
  const evil = entry(9, '<img src=x onerror=alert(1)>', '2026-11-12', 'observation', 'motor', '<b>Mallory</b>', {
    observationText: '<script>alert(1)</script>\nSecond line',
  })
  const { view } = renderAt(PAGE, { routes: { [`GET ${API}`]: () => jsonResponse({ entries: [evil] }) } })
  await screen.findByRole('list', { name: 'Entries' })

  expect(view.container.querySelector('img')).toBeNull()
  expect(view.container.querySelector('script')).toBeNull()
  expect(titles()).toEqual(['<img src=x onerror=alert(1)>'])
  expect(entryList().textContent).toContain('<b>Mallory</b>')
  expect(view.container.querySelector('.entry-text').textContent).toBe('<script>alert(1)</script>\nSecond line')
})

test.each([
  ['parent', '/parent', PAGE],
  ['specialist', '/specialist', SPECIALIST_PAGE],
])('the Entries item on the %s home page opens the entries page of that child', async (role, home, target) => {
  const user = userEvent.setup()
  renderAt(home, { role })
  const modules = await screen.findByRole('navigation', { name: 'Zeynep Yılmaz modules' })

  await user.click(within(modules).getByRole('link', { name: 'Entries' }))

  expect(await screen.findByRole('heading', { name: 'Specialist entries' })).toBeTruthy()
  expect(currentAddress()).toBe(target)
})

// --- Adding an entry (FR-M5-01, FR-M5-02) ---

test('a specialist adds an entry: it is sent trimmed, appears in its place and the form is cleared', async () => {
  const user = userEvent.setup()
  const created = own(entry(10, 'Ball games', '2026-11-19', 'observation', 'motor', 'Burak Öztürk'))
  const { fetchSpy } = await renderAsSpecialist({
    routes: { [`POST ${API}`]: async () => jsonResponse({ entry: created }, 201) },
  })

  await fillForm(user, addForm(), { title: '  Ball games  ' })
  await user.click(within(addForm()).getByRole('button', { name: 'Add entry' }))

  expect(await screen.findByText('Entry added: Ball games')).toBeTruthy()
  expect(sent(fetchSpy, 'POST')).toEqual([
    [
      API,
      {
        entryDate: '2026-11-19',
        entryType: 'observation',
        developmentArea: 'motor',
        title: 'Ball games',
        observationText: 'Caught a large ball.',
      },
    ],
  ])
  // 19 Kasım, 20 Kasım'daki girişlerle 10 Kasım'daki arasına girer
  expect(titles()).toEqual(['Naming feelings', 'Reading aloud', 'Ball games', 'Sorting and matching'])
  expect(within(addForm()).getByLabelText('Title').value).toBe('')
  expect(within(addForm()).getByLabelText('Entry type').value).toBe('')
})

test("the date field does not offer days after today", async () => {
  await renderAsSpecialist()

  const max = within(addForm()).getByLabelText('Date').getAttribute('max')
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  expect(max).toBe(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`)
})

test.each([
  ['no date', { entryDate: '' }, 'Date is required'],
  ['no entry type', { entryType: '' }, 'Choose an entry type'],
  ['no development area', { developmentArea: '' }, 'Choose a development area'],
  ['no title', { title: '' }, 'Title is required'],
  ['a blank title', { title: '   ' }, 'Title is required'],
  ['no text', { observationText: '' }, 'Text is required'],
  ['a blank text', { observationText: '   ' }, 'Text is required'],
])('with %s the form shows an error and sends nothing', async (_name, values, message) => {
  const user = userEvent.setup()
  const { fetchSpy } = await renderAsSpecialist()

  await fillForm(user, addForm(), values)
  await user.click(within(addForm()).getByRole('button', { name: 'Add entry' }))

  expect(within(addForm()).getByRole('alert').textContent).toBe(message)
  expect(sent(fetchSpy, 'POST')).toEqual([])
})

test('a backend error is shown as returned and the form keeps its values', async () => {
  const user = userEvent.setup()
  await renderAsSpecialist({
    routes: { [`POST ${API}`]: async () => jsonResponse({ error: 'Date cannot be in the future' }, 400) },
  })

  await fillForm(user, addForm())
  await user.click(within(addForm()).getByRole('button', { name: 'Add entry' }))

  expect((await within(addForm()).findByRole('alert')).textContent).toBe('Date cannot be in the future')
  expect(within(addForm()).getByLabelText('Title').value).toBe('Ball games')
  expect(titles()).toHaveLength(3)
})

test('while adding, the button is disabled and a second click sends nothing', async () => {
  const user = userEvent.setup()
  const created = own(entry(10, 'Ball games', '2026-11-19', 'observation', 'motor', 'Burak Öztürk'))
  const post = gate(() => jsonResponse({ entry: created }, 201))
  await renderAsSpecialist({ routes: { [`POST ${API}`]: post.handler } })

  await fillForm(user, addForm())
  await user.click(within(addForm()).getByRole('button', { name: 'Add entry' }))
  const busyButton = within(addForm()).getByRole('button', { name: 'Adding…' })
  expect(busyButton.disabled).toBe(true)
  await user.click(busyButton)

  await act(async () => post.release())
  expect(await screen.findByText('Entry added: Ball games')).toBeTruthy()
  expect(post.handler).toHaveBeenCalledTimes(1)
})

// --- Editing an entry (FR-M5-04, FR-M5-05) ---

test('Edit opens a form filled with the entry and moves the focus to its first field', async () => {
  const user = userEvent.setup()
  await renderAsSpecialist()

  await user.click(editButton('Naming feelings'))

  const form = editForm('Naming feelings')
  expect(within(form).getByLabelText('Date').value).toBe('2026-11-20')
  expect(within(form).getByLabelText('Entry type').value).toBe('session-note')
  expect(within(form).getByLabelText('Development area').value).toBe('social-emotional')
  expect(within(form).getByLabelText('Title').value).toBe('Naming feelings')
  expect(within(form).getByLabelText('Text').value).toBe('Naming feelings text.')
  expect(document.activeElement).toBe(within(form).getByLabelText('Date'))
})

test('Save sends the edit, shows the entry as edited and returns the focus to its Edit button', async () => {
  const user = userEvent.setup()
  const saved = own({ ...FEELINGS, title: 'Naming four feelings', isEdited: true, updatedAt: '2026-11-21T10:00:00Z' })
  const { fetchSpy } = await renderAsSpecialist({
    routes: { [`PATCH ${API}/3`]: async () => jsonResponse({ entry: saved }) },
  })

  await user.click(editButton('Naming feelings'))
  const title = within(editForm('Naming feelings')).getByLabelText('Title')
  await user.clear(title)
  await user.type(title, 'Naming four feelings')
  await user.click(within(editForm('Naming feelings')).getByRole('button', { name: 'Save' }))

  expect(await screen.findByText('Entry saved: Naming four feelings')).toBeTruthy()
  expect(sent(fetchSpy, 'PATCH')).toEqual([
    [
      `${API}/3`,
      {
        entryDate: '2026-11-20',
        entryType: 'session-note',
        developmentArea: 'social-emotional',
        title: 'Naming four feelings',
        observationText: 'Naming feelings text.',
      },
    ],
  ])
  expect(screen.queryByRole('form', { name: /^Edit/ })).toBeNull()
  expect(within(entryItem('Naming four feelings')).getByText('Edited')).toBeTruthy()
  expect(document.activeElement).toBe(editButton('Naming four feelings'))
})

test('an edit that changes the date moves the entry to its new place', async () => {
  const user = userEvent.setup()
  const saved = own({ ...FEELINGS, entryDate: '2026-11-05', isEdited: true, updatedAt: '2026-11-21T10:00:00Z' })
  await renderAsSpecialist({ routes: { [`PATCH ${API}/3`]: async () => jsonResponse({ entry: saved }) } })

  await user.click(editButton('Naming feelings'))
  fireEvent.change(within(editForm('Naming feelings')).getByLabelText('Date'), { target: { value: '2026-11-05' } })
  await user.click(within(editForm('Naming feelings')).getByRole('button', { name: 'Save' }))

  await screen.findByText('Entry saved: Naming feelings')
  expect(titles()).toEqual(['Reading aloud', 'Sorting and matching', 'Naming feelings'])
})

test('Cancel closes the form without a request, keeps the entry and returns the focus', async () => {
  const user = userEvent.setup()
  const { fetchSpy } = await renderAsSpecialist()

  await user.click(editButton('Naming feelings'))
  await user.type(within(editForm('Naming feelings')).getByLabelText('Title'), ' changed')
  await user.click(within(editForm('Naming feelings')).getByRole('button', { name: 'Cancel' }))

  expect(screen.queryByRole('form', { name: /^Edit/ })).toBeNull()
  expect(titles()).toContain('Naming feelings')
  expect(sent(fetchSpy, 'PATCH')).toEqual([])
  expect(document.activeElement).toBe(editButton('Naming feelings'))
})

test('a failed edit keeps the form open with what was typed and shows the error', async () => {
  const user = userEvent.setup()
  await renderAsSpecialist({
    routes: {
      [`PATCH ${API}/3`]: async () => jsonResponse({ error: 'You do not have permission to do this' }, 403),
    },
  })

  await user.click(editButton('Naming feelings'))
  await user.type(within(editForm('Naming feelings')).getByLabelText('Title'), ' changed')
  await user.click(within(editForm('Naming feelings')).getByRole('button', { name: 'Save' }))

  const form = editForm('Naming feelings')
  expect((await within(form).findByRole('alert')).textContent).toBe('You do not have permission to do this')
  expect(within(form).getByLabelText('Title').value).toBe('Naming feelings changed')
  expect(screen.queryByText(/Entry saved/)).toBeNull()
})

test('an edit with a missing field shows an error and sends nothing', async () => {
  const user = userEvent.setup()
  const { fetchSpy } = await renderAsSpecialist()

  await user.click(editButton('Naming feelings'))
  await user.clear(within(editForm('Naming feelings')).getByLabelText('Text'))
  await user.click(within(editForm('Naming feelings')).getByRole('button', { name: 'Save' }))

  expect(within(editForm('Naming feelings')).getByRole('alert').textContent).toBe('Text is required')
  expect(sent(fetchSpy, 'PATCH')).toEqual([])
})

test('while one entry is edited, the other Edit buttons are disabled', async () => {
  const user = userEvent.setup()
  await renderAsSpecialist()

  await user.click(editButton('Naming feelings'))

  expect(editButton('Sorting and matching').disabled).toBe(true)
})

// --- Errors and access (FR-M5-06) ---

test('an invalid child id shows "Child not found" and sends no entries request', async () => {
  const { fetchSpy } = renderAt('/parent/children/abc/entries')

  expect((await screen.findByRole('alert')).textContent).toBe('Child not found')
  expect(screen.getByRole('link', { name: 'Back to home' })).toBeTruthy()
  expect(requests(fetchSpy).filter((r) => r.includes('/entries'))).toEqual([])
})

test('shows the message of the backend when the entries cannot be loaded', async () => {
  renderAt(PAGE, {
    routes: { [`GET ${API}`]: () => jsonResponse({ error: 'You do not have permission to do this' }, 403) },
  })

  expect((await screen.findByRole('alert')).textContent).toBe('You do not have permission to do this')
  expect(screen.getByRole('link', { name: 'Back to home' })).toBeTruthy()
})

test.each([
  ['a list that is not an array', { entries: 'none' }],
  ['no list at all', {}],
  ['an entry without the edited flag', { entries: [{ ...READING, isEdited: undefined }] }],
])('shows an error for %s instead of crashing', async (_name, body) => {
  renderAt(PAGE, { routes: { [`GET ${API}`]: () => jsonResponse(body) } })

  expect((await screen.findByRole('alert')).textContent).toBe('Unexpected response from the server')
})

test('a child who opens the entries address is sent to their own home page and no entry is requested', async () => {
  const { fetchSpy } = renderAt(PAGE, { role: 'child' })

  expect(await screen.findByRole('heading', { name: 'Child home' })).toBeTruthy()
  expect(currentAddress()).toBe('/child')
  expect(requests(fetchSpy).filter((r) => r.includes('/entries'))).toEqual([])
})
