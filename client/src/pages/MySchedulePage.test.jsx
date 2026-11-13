import { act, cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import App from '../App.jsx'
import { getToken, setToken } from '../api.js'
import { AuthProvider } from '../auth/AuthContext.jsx'
import { jsonResponse } from '../testUtils.js'
import { addDays } from '../utils/week.js'

const PAGE = '/child/schedule'
// Çocuğun kendi id'si 3; sayfa başka bir id'yle hiç istek atmamalı
const API = '/api/children/3/schedule'
const NEXT = `${API}?weekStart=2026-11-23`

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

const SWIM = event(1, 'Swimming class', '2026-11-18', '16:00', '17:00', 'sports')
const TRIP = event(2, 'School trip', '2026-11-18', '09:00', '15:00', 'school')
const DENTIST = event(3, 'Dentist', '2026-11-26', '11:00', null, 'health')
const PIANO = event(4, 'Piano lesson', '2026-11-24', '15:00', null, 'other')

const week = (weekStart, events = []) => () =>
  jsonResponse({ weekStart, weekEnd: addDays(weekStart, 6), events })

// Sahte backend; beklenmeyen bir istek 599 döner, böylece test sessizce geçemez
function mockApi({ role = 'child', routes = {} } = {}) {
  const all = {
    'GET /api/auth/me': () => jsonResponse({ user: { id: 3, name: 'Zeynep Yılmaz', role } }),
    [`GET ${API}`]: week('2026-11-16', [SWIM, TRIP]),
    [`GET ${NEXT}`]: week('2026-11-23', [DENTIST, PIANO]),
    ...routes,
  }
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options = {}) => {
    const handler = all[`${options.method ?? 'GET'} ${url}`]
    return handler ? handler(options) : jsonResponse({ error: `Unexpected request: ${url}` }, 599)
  })
}

const requests = (fetchSpy) => fetchSpy.mock.calls.map(([url, options]) => `${options?.method ?? 'GET'} ${url}`)

function renderAt(path, api) {
  setToken('good')
  const fetchSpy = mockApi(api)
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  )
  return fetchSpy
}

async function renderPage(api) {
  const fetchSpy = renderAt(PAGE, api)
  await screen.findByRole('heading', { name: 'My schedule' })
  return fetchSpy
}

const section = (title) => screen.getByRole('region', { name: title })
const findSection = async (title) => screen.findByRole('region', { name: title })
const dayNames = (title) =>
  within(section(title))
    .queryAllByRole('heading', { level: 3 })
    .map((h) => h.textContent)
const eventsOn = (title, day) =>
  within(within(section(title)).getByRole('listitem', { name: day }))
    .queryAllByRole('listitem')
    .map((li) => li.querySelector('.event-title').textContent)

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.clear()
})

// --- What the child sees (FR-M3-04, FR-M1-07) ---

test("shows this week's seven days with the events, ordered by time", async () => {
  await renderPage()
  await findSection('This week')

  expect(within(section('This week')).getByText('16 Nov 2026 – 22 Nov 2026')).toBeTruthy()
  expect(dayNames('This week')).toEqual([
    'Mon 16 Nov',
    'Tue 17 Nov',
    'Wed 18 Nov',
    'Thu 19 Nov',
    'Fri 20 Nov',
    'Sat 21 Nov',
    'Sun 22 Nov',
  ])
  expect(eventsOn('This week', 'Wed 18 Nov')).toEqual(['School trip', 'Swimming class'])
  const swim = within(within(section('This week')).getByRole('listitem', { name: 'Wed 18 Nov' })).getAllByRole('listitem')[1]
  expect(swim.textContent).toContain('16:00–17:00')
  expect(within(section('This week')).getAllByText('No events')).toHaveLength(6)
})

test('shows the events coming up next week with date, time and title, only on days that have events', async () => {
  await renderPage()
  await findSection('Coming up next week')

  expect(within(section('Coming up next week')).getByText('23 Nov 2026 – 29 Nov 2026')).toBeTruthy()
  expect(dayNames('Coming up next week')).toEqual(['Tue 24 Nov', 'Thu 26 Nov'])
  expect(eventsOn('Coming up next week', 'Tue 24 Nov')).toEqual(['Piano lesson'])
  expect(eventsOn('Coming up next week', 'Thu 26 Nov')).toEqual(['Dentist'])
  expect(within(section('Coming up next week')).queryByText('No events')).toBeNull()
})

test('says so when nothing is planned for next week', async () => {
  await renderPage({ routes: { [`GET ${NEXT}`]: week('2026-11-23') } })
  await findSection('Coming up next week')

  expect(within(section('Coming up next week')).getByText('Nothing planned for next week.')).toBeTruthy()
  expect(dayNames('Coming up next week')).toEqual([])
})

test('a week without events shows "No events" on every day', async () => {
  await renderPage({ routes: { [`GET ${API}`]: week('2026-11-16') } })
  await findSection('This week')

  expect(within(section('This week')).getAllByText('No events')).toHaveLength(7)
})

test('the page is read-only: no form and no add, edit or week buttons', async () => {
  await renderPage()
  await findSection('This week')

  expect(screen.queryByRole('textbox')).toBeNull()
  expect(screen.queryByRole('combobox')).toBeNull()
  // Üst menüdeki "Log out" dışında hiçbir buton yok
  expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Log out'])
})

// --- Requests ---

test("asks only for the child's own schedule: this week, then the week after the one the server returned", async () => {
  // Sunucu "bu hafta" için 30 Kasım'ı dönerse gelecek hafta 7 Aralık olmalı
  const fetchSpy = await renderPage({
    routes: {
      [`GET ${API}`]: week('2026-11-30'),
      [`GET ${API}?weekStart=2026-12-07`]: week('2026-12-07'),
    },
  })
  await findSection('Coming up next week')

  expect(requests(fetchSpy)).toEqual(['GET /api/auth/me', `GET ${API}`, `GET ${API}?weekStart=2026-12-07`])
})

test('never asks for the list of children (it returns 403 for a child)', async () => {
  const fetchSpy = await renderPage()
  await findSection('This week')

  expect(requests(fetchSpy)).not.toContain('GET /api/children')
})

// --- Errors ---

test('shows Loading while the schedule is being loaded', async () => {
  let release
  const gate = new Promise((resolve) => {
    release = resolve
  })
  await renderPage({
    routes: {
      [`GET ${API}`]: async () => {
        await gate
        return week('2026-11-16', [SWIM])()
      },
    },
  })

  expect(screen.getByText('Loading…')).toBeTruthy()
  expect(screen.queryByRole('region', { name: 'This week' })).toBeNull()

  await act(async () => release())
  expect(await findSection('This week')).toBeTruthy()
})

test.each([
  ['this week', { [`GET ${API}`]: () => jsonResponse({ error: 'Internal server error' }, 500) }, 'Internal server error'],
  ['next week', { [`GET ${NEXT}`]: () => jsonResponse({ error: 'Internal server error' }, 500) }, 'Internal server error'],
  ['this week (forbidden)', { [`GET ${API}`]: () => jsonResponse({ error: 'You do not have access to this child' }, 403) }, 'You do not have access to this child'],
])('shows the server error when %s cannot be loaded', async (_name, routes, message) => {
  await renderPage({ routes })

  expect((await screen.findByRole('alert')).textContent).toBe(message)
  expect(screen.queryByRole('region', { name: 'This week' })).toBeNull()
})

test.each([
  ['weekStart is missing', { events: [] }],
  ['weekStart is not a date', { weekStart: 'monday', events: [] }],
  ['events is not a list', { weekStart: '2026-11-16', events: null }],
])('shows an error instead of crashing when %s in the response', async (_name, body) => {
  await renderPage({ routes: { [`GET ${API}`]: () => jsonResponse(body) } })

  expect((await screen.findByRole('alert')).textContent).toBe('Unexpected response from the server')
})

// İlk istek doğru, ikincisi bozuk: ikinci cevap da aynı kontrolden geçmeli
test.each([
  ['weekStart is missing', { events: [] }],
  ['weekStart is not a date', { weekStart: 'monday', events: [] }],
  ['events is not a list', { weekStart: '2026-11-23', events: null }],
])('shows an error instead of crashing when %s in the response for next week', async (_name, body) => {
  await renderPage({ routes: { [`GET ${NEXT}`]: () => jsonResponse(body) } })

  expect((await screen.findByRole('alert')).textContent).toBe('Unexpected response from the server')
  expect(screen.queryByRole('region', { name: 'This week' })).toBeNull()
})

test('shows "Cannot reach the server" when the request fails', async () => {
  setToken('good')
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    if (url === '/api/auth/me') return jsonResponse({ user: { id: 3, name: 'Zeynep Yılmaz', role: 'child' } })
    throw new TypeError('Failed to fetch')
  })
  render(
    <MemoryRouter initialEntries={[PAGE]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  )

  expect((await screen.findByRole('alert')).textContent).toBe('Cannot reach the server')
})

test('a 401 while loading logs the child out', async () => {
  renderAt(PAGE, { routes: { [`GET ${API}`]: () => jsonResponse({ error: 'Invalid or expired token' }, 401) } })

  expect(await screen.findByRole('heading', { name: 'Log in' })).toBeTruthy()
  expect(getToken()).toBeNull()
})

// --- Safety and navigation ---

test('titles are shown as plain text and never interpreted as HTML', async () => {
  const html = '<img src=x onerror="alert(1)">'
  await renderPage({ routes: { [`GET ${API}`]: week('2026-11-16', [{ ...SWIM, title: html }]) } })
  await findSection('This week')

  expect(screen.getByText(html)).toBeTruthy()
  expect(document.querySelector('img')).toBeNull()
})

test.each([
  ['parent', 'Parent home'],
  ['specialist', 'Specialist home'],
])('a %s who opens the page is sent to their own home and no schedule is requested', async (role, home) => {
  const fetchSpy = renderAt(PAGE, {
    role,
    routes: { 'GET /api/children': () => jsonResponse({ children: [] }) },
  })

  expect(await screen.findByRole('heading', { name: home })).toBeTruthy()
  expect(requests(fetchSpy).some((r) => r.includes('/schedule'))).toBe(false)
})

test('the child home links to this page', async () => {
  renderAt('/child')

  const link = await screen.findByRole('link', { name: 'My schedule' })
  expect(link.getAttribute('href')).toBe(PAGE)
})

test('has a link back to the child home', async () => {
  await renderPage()

  expect(screen.getByRole('link', { name: 'Back to home' }).getAttribute('href')).toBe('/child')
})
