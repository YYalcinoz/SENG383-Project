import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import App from '../App.jsx'
import { getToken, setToken } from '../api.js'
import { AuthProvider } from '../auth/AuthContext.jsx'
import { jsonResponse } from '../testUtils.js'
import { addDays } from '../utils/week.js'

const PAGE = '/parent/children/2/schedule'
const API = '/api/children/2/schedule'
const ZEYNEP = { id: 2, name: 'Zeynep Yılmaz' }

const event = (id, title, eventDate, startTime, endTime, eventType) => ({
  id,
  title,
  eventDate,
  startTime,
  endTime,
  eventType,
  creatorName: 'Ayşe Yılmaz',
  createdAt: '2026-11-13T10:00:00Z',
})

const SPEECH = event(1, 'Speech therapy', '2026-11-16', '10:00', null, 'support')
const SWIM = event(2, 'Swimming class', '2026-11-18', '16:00', '17:00', 'sports')
const TRIP = event(3, 'School trip', '2026-11-18', '09:00', '15:00', 'school')
const DENTIST = event(4, 'Dentist', '2026-11-27', '11:00', null, 'health')

// Bir haftanın cevabı; etkinlikler bilerek karışık sırayla verilir
const week = (weekStart, events = []) => () =>
  jsonResponse({ weekStart, weekEnd: addDays(weekStart, 6), events })

// Sahte backend. Her anahtar bir isteğe karşılık gelir; beklenmeyen bir istek 599 döner,
// böylece test sessizce geçemez.
function mockApi({ role = 'parent', children = [ZEYNEP], routes = {} } = {}) {
  const all = {
    'GET /api/auth/me': () => jsonResponse({ user: { id: 1, name: 'Ayşe Yılmaz', role } }),
    'GET /api/children': () => jsonResponse({ children }),
    [`GET ${API}`]: week('2026-11-16', [SWIM, SPEECH, TRIP]),
    [`GET ${API}?weekStart=2026-11-16`]: week('2026-11-16', [SWIM, SPEECH, TRIP]),
    ...routes,
  }
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options = {}) => {
    const handler = all[`${options.method ?? 'GET'} ${url}`]
    return handler ? handler(options) : jsonResponse({ error: `Unexpected request: ${url}` }, 599)
  })
}

const requests = (fetchSpy) => fetchSpy.mock.calls.map(([url, options]) => `${options?.method ?? 'GET'} ${url}`)

// Testte geçerli adresi (yol + ?week=) gösterir
function LocationProbe() {
  const { pathname, search } = useLocation()
  return <span data-testid="location">{pathname + search}</span>
}
const currentAddress = () => screen.getByTestId('location').textContent

function renderAt(path, api) {
  setToken('good')
  const fetchSpy = mockApi(api)
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
        <LocationProbe />
      </AuthProvider>
    </MemoryRouter>,
  )
  return fetchSpy
}

const findWeek = (range) => screen.findByRole('heading', { name: range })

async function renderPage(path = PAGE, api) {
  const fetchSpy = renderAt(path, api)
  await screen.findByRole('heading', { name: 'Weekly schedule' })
  return fetchSpy
}

const dayItem = (label) => screen.getByRole('listitem', { name: label })
const eventsOf = (label) =>
  within(dayItem(label))
    .queryAllByRole('listitem')
    .map((li) => li.querySelector('.event-title').textContent)

// Formu doldurur; boş bırakılan bir değer o alanı doldurmaz.
// Tarih ve saat alanları jsdom'da yazılarak doldurulamadığı için change olayıyla doldurulur.
async function fillForm(user, values = {}) {
  const { title, eventDate, startTime, endTime, eventType } = {
    title: 'Swim',
    eventDate: '2026-11-18',
    startTime: '16:00',
    endTime: '',
    eventType: 'sports',
    ...values,
  }
  if (title) await user.type(screen.getByLabelText('Title'), title)
  if (eventDate) fireEvent.change(screen.getByLabelText('Date'), { target: { value: eventDate } })
  if (startTime) fireEvent.change(screen.getByLabelText('Start time'), { target: { value: startTime } })
  if (endTime) fireEvent.change(screen.getByLabelText('End time (optional)'), { target: { value: endTime } })
  if (eventType) await user.selectOptions(screen.getByLabelText('Event type'), eventType)
}

const addButton = () => screen.getByRole('button', { name: /^(Add event|Adding…)$/ })

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

// --- Weekly view (FR-M3-03) ---

test("shows the child and the week's events by day, ordered by time, with time and title", async () => {
  await renderPage()

  await findWeek('16 Nov 2026 – 22 Nov 2026')
  expect(screen.getByRole('heading', { name: 'Zeynep Yılmaz' })).toBeTruthy()
  expect(eventsOf('Mon 16 Nov')).toEqual(['Speech therapy'])
  expect(eventsOf('Wed 18 Nov')).toEqual(['School trip', 'Swimming class'])

  const [trip, swim] = within(dayItem('Wed 18 Nov')).getAllByRole('listitem')
  expect(trip.textContent).toContain('09:00–15:00')
  expect(swim.textContent).toContain('16:00–17:00')
  expect(swim.textContent).toContain('sports')
  // Bitiş saati yoksa sadece başlangıç saati gösterilir
  expect(within(dayItem('Mon 16 Nov')).getByRole('listitem').textContent).toContain('10:00')
  expect(within(dayItem('Mon 16 Nov')).getByRole('listitem').textContent).not.toContain('–')
  expect(within(dayItem('Tue 17 Nov')).getByText('No events')).toBeTruthy()
})

test('shows all seven days, Monday to Sunday', async () => {
  await renderPage()
  await findWeek('16 Nov 2026 – 22 Nov 2026')

  const days = screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent)
  expect(days).toEqual(['Mon 16 Nov', 'Tue 17 Nov', 'Wed 18 Nov', 'Thu 19 Nov', 'Fri 20 Nov', 'Sat 21 Nov', 'Sun 22 Nov'])
})

test('a week without events shows "No events" on every day', async () => {
  await renderPage(PAGE, { routes: { [`GET ${API}`]: week('2026-11-16') } })
  await findWeek('16 Nov 2026 – 22 Nov 2026')

  expect(screen.getAllByText('No events')).toHaveLength(7)
})

// --- Week in the address and week navigation ---

test('opens the week given in the address', async () => {
  const fetchSpy = await renderPage(`${PAGE}?week=2026-11-25`, {
    routes: { [`GET ${API}?weekStart=2026-11-25`]: week('2026-11-23', [DENTIST]) },
  })

  await findWeek('23 Nov 2026 – 29 Nov 2026')
  expect(eventsOf('Fri 27 Nov')).toEqual(['Dentist'])
  expect(requests(fetchSpy)).not.toContain(`GET ${API}`)
})

test.each(['abc', '2026-02-30', ''])('ignores the invalid week %j in the address and shows the current week', async (value) => {
  const fetchSpy = await renderPage(`${PAGE}?week=${value}`)

  await findWeek('16 Nov 2026 – 22 Nov 2026')
  const scheduleRequests = requests(fetchSpy).filter((r) => r.includes('/schedule'))
  expect(scheduleRequests).toEqual([`GET ${API}`])
})

test('the previous and next week buttons load that week and keep it in the address', async () => {
  const user = userEvent.setup()
  await renderPage(PAGE, {
    routes: {
      [`GET ${API}?weekStart=2026-11-23`]: week('2026-11-23', [DENTIST]),
      [`GET ${API}?weekStart=2026-11-09`]: week('2026-11-09'),
    },
  })
  await findWeek('16 Nov 2026 – 22 Nov 2026')

  await user.click(screen.getByRole('button', { name: 'Next week ›' }))
  await findWeek('23 Nov 2026 – 29 Nov 2026')
  expect(currentAddress()).toBe(`${PAGE}?week=2026-11-23`)
  expect(eventsOf('Fri 27 Nov')).toEqual(['Dentist'])

  await user.click(screen.getByRole('button', { name: '‹ Previous week' }))
  await findWeek('16 Nov 2026 – 22 Nov 2026')
  await user.click(screen.getByRole('button', { name: '‹ Previous week' }))
  await findWeek('9 Nov 2026 – 15 Nov 2026')
  expect(currentAddress()).toBe(`${PAGE}?week=2026-11-09`)
})

test("while another week loads, the previous week's events are never shown", async () => {
  const user = userEvent.setup()
  const next = gate(week('2026-11-23', [DENTIST]))
  await renderPage(PAGE, { routes: { [`GET ${API}?weekStart=2026-11-23`]: next.handler } })
  await findWeek('16 Nov 2026 – 22 Nov 2026')

  await user.click(screen.getByRole('button', { name: 'Next week ›' }))

  expect(screen.getByText('Loading…')).toBeTruthy()
  expect(screen.queryByText('Swimming class')).toBeNull()
  expect(screen.queryByRole('heading', { name: '16 Nov 2026 – 22 Nov 2026' })).toBeNull()

  await act(async () => next.release())
  await findWeek('23 Nov 2026 – 29 Nov 2026')
  expect(screen.queryByText('Swimming class')).toBeNull()
})

// --- Adding an event (FR-M3-01, FR-M3-02) ---

test('adds an event in the shown week: sends the trimmed title and adds it to its day', async () => {
  const user = userEvent.setup()
  const post = vi.fn(async () => jsonResponse({ event: event(9, 'Piano lesson', '2026-11-17', '15:00', null, 'other') }, 201))
  const fetchSpy = await renderPage(PAGE, { routes: { [`POST ${API}`]: post } })
  await findWeek('16 Nov 2026 – 22 Nov 2026')

  await fillForm(user, { title: '  Piano lesson  ', eventDate: '2026-11-17', startTime: '15:00', eventType: 'other' })
  await user.click(addButton())

  expect(await screen.findByText('Piano lesson was added on 17 Nov 2026 at 15:00.')).toBeTruthy()
  expect(JSON.parse(post.mock.calls[0][0].body)).toEqual({
    title: 'Piano lesson',
    eventDate: '2026-11-17',
    startTime: '15:00',
    endTime: null,
    eventType: 'other',
  })
  expect(eventsOf('Tue 17 Nov')).toEqual(['Piano lesson'])
  // Form temizlenir, aynı hafta yeniden istenmez ve adres değişmez
  expect(screen.getByLabelText('Title').value).toBe('')
  expect(screen.getByLabelText('Event type').value).toBe('')
  expect(requests(fetchSpy).filter((r) => r.startsWith(`GET ${API}`))).toHaveLength(1)
  expect(currentAddress()).toBe(PAGE)
})

test('sends the end time when it is given', async () => {
  const user = userEvent.setup()
  const post = vi.fn(async () => jsonResponse({ event: SWIM }, 201))
  await renderPage(PAGE, { routes: { [`POST ${API}`]: post } })
  await findWeek('16 Nov 2026 – 22 Nov 2026')

  await fillForm(user, { endTime: '17:00' })
  await user.click(addButton())

  await screen.findByText(/was added on/)
  expect(JSON.parse(post.mock.calls[0][0].body).endTime).toBe('17:00')
})

test('an event added to another week switches the view to that week', async () => {
  const user = userEvent.setup()
  const concert = event(10, 'Concert', '2026-12-03', '18:00', null, 'other')
  await renderPage(PAGE, {
    routes: {
      [`POST ${API}`]: async () => jsonResponse({ event: concert }, 201),
      [`GET ${API}?weekStart=2026-11-30`]: week('2026-11-30', [concert]),
    },
  })
  await findWeek('16 Nov 2026 – 22 Nov 2026')

  await fillForm(user, { title: 'Concert', eventDate: '2026-12-03', startTime: '18:00', eventType: 'other' })
  await user.click(addButton())

  await findWeek('30 Nov 2026 – 6 Dec 2026')
  expect(currentAddress()).toBe(`${PAGE}?week=2026-11-30`)
  expect(eventsOf('Thu 3 Dec')).toEqual(['Concert'])
  expect(screen.getByText('Concert was added on 3 Dec 2026 at 18:00.')).toBeTruthy()
})

test.each([
  ['the title', { title: '' }, 'Title is required'],
  ['a title of only spaces', { title: '   ' }, 'Title is required'],
  ['the date', { eventDate: '' }, 'Date is required'],
  ['the start time', { startTime: '' }, 'Start time is required'],
  ['the event type', { eventType: '' }, 'Choose an event type'],
])('without %s it shows an error and sends nothing', async (_name, values, message) => {
  const user = userEvent.setup()
  const fetchSpy = await renderPage()
  await findWeek('16 Nov 2026 – 22 Nov 2026')

  await fillForm(user, values)
  await user.click(addButton())

  expect(screen.getByRole('alert').textContent).toBe(message)
  expect(requests(fetchSpy).some((r) => r.startsWith('POST'))).toBe(false)
})

test('offers exactly the five event types', async () => {
  await renderPage()
  await findWeek('16 Nov 2026 – 22 Nov 2026')

  const options = within(screen.getByLabelText('Event type'))
    .getAllByRole('option')
    .map((o) => o.value)
  expect(options).toEqual(['', 'school', 'support', 'health', 'sports', 'other'])
})

test('a backend error is shown as returned and the form keeps its values', async () => {
  const user = userEvent.setup()
  await renderPage(PAGE, {
    routes: { [`POST ${API}`]: async () => jsonResponse({ error: 'End time must be after the start time' }, 400) },
  })
  await findWeek('16 Nov 2026 – 22 Nov 2026')

  await fillForm(user, { endTime: '15:00' })
  await user.click(addButton())

  expect((await screen.findByRole('alert')).textContent).toBe('End time must be after the start time')
  expect(screen.getByLabelText('Title').value).toBe('Swim')
  expect(eventsOf('Wed 18 Nov')).toEqual(['School trip', 'Swimming class'])
})

test('while adding, the button is disabled and a second click sends nothing', async () => {
  const user = userEvent.setup()
  const post = gate(() => jsonResponse({ event: SWIM }, 201))
  await renderPage(PAGE, { routes: { [`POST ${API}`]: post.handler } })
  await findWeek('16 Nov 2026 – 22 Nov 2026')

  await fillForm(user)
  await user.click(addButton())
  expect(addButton().textContent).toBe('Adding…')
  expect(addButton().disabled).toBe(true)
  await user.click(addButton())

  await act(async () => post.release())
  await screen.findByText(/was added on/)
  expect(post.handler).toHaveBeenCalledTimes(1)
})

// --- Access and safety ---

test('a 403 from the backend is shown and no form is offered (FR-M3-05)', async () => {
  await renderPage(PAGE, {
    routes: { [`GET ${API}`]: () => jsonResponse({ error: 'You do not have access to this child' }, 403) },
  })

  expect((await screen.findByRole('alert')).textContent).toBe('You do not have access to this child')
  expect(screen.queryByLabelText('Title')).toBeNull()
  expect(screen.getByRole('link', { name: 'Back to home' }).getAttribute('href')).toBe('/parent')
})

test.each(['abc', '0', '..%2F..%2Fauth'])('the child id "%s" sends no schedule request', async (id) => {
  const fetchSpy = await renderPage(`/parent/children/${id}/schedule`)

  expect((await screen.findByRole('alert')).textContent).toBe('Child not found')
  expect(requests(fetchSpy).some((r) => r.includes('/schedule'))).toBe(false)
})

test('a 401 while loading logs the user out', async () => {
  renderAt(PAGE, { routes: { [`GET ${API}`]: () => jsonResponse({ error: 'Invalid or expired token' }, 401) } })

  expect(await screen.findByRole('heading', { name: 'Log in' })).toBeTruthy()
  expect(getToken()).toBeNull()
})

test('titles are shown as plain text and never interpreted as HTML', async () => {
  const html = '<img src=x onerror="alert(1)">'
  await renderPage(PAGE, { routes: { [`GET ${API}`]: week('2026-11-16', [{ ...SWIM, title: html }]) } })
  await findWeek('16 Nov 2026 – 22 Nov 2026')

  expect(screen.getByText(html)).toBeTruthy()
  expect(document.querySelector('img')).toBeNull()
})

test('a child who opens the page is sent to their own home and no schedule is requested', async () => {
  const fetchSpy = renderAt(PAGE, { role: 'child' })

  expect(await screen.findByRole('heading', { name: 'Child home' })).toBeTruthy()
  expect(requests(fetchSpy).some((r) => r.includes('/schedule'))).toBe(false)
})

// --- Specialist and home pages ---

test('a linked specialist uses the same page, with a link back to the specialist home', async () => {
  await renderPage('/specialist/children/2/schedule', {
    role: 'specialist',
    children: [{ ...ZEYNEP, specialistType: 'teacher' }],
  })

  await findWeek('16 Nov 2026 – 22 Nov 2026')
  expect(eventsOf('Wed 18 Nov')).toEqual(['School trip', 'Swimming class'])
  expect(screen.getByLabelText('Title')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Back to home' }).getAttribute('href')).toBe('/specialist')
})

test.each([
  ['parent', '/parent', '/parent/children/2/schedule'],
  ['specialist', '/specialist', '/specialist/children/2/schedule'],
])('the %s home links to this page for each child', async (role, home, href) => {
  renderAt(home, { role })

  const nav = await screen.findByRole('navigation', { name: 'Zeynep Yılmaz modules' })
  expect(within(nav).getByRole('link', { name: 'Schedule' }).getAttribute('href')).toBe(href)
})
