import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import App from '../App.jsx'
import { getToken, setToken } from '../api.js'
import { AuthProvider } from './AuthContext.jsx'
import { jsonResponse, respondWith } from '../testUtils.js'

// Testte geçerli adresi gösterir. <output> yerine <span> kullanıyoruz, çünkü <output> "status"
// rolündedir ve "Loading…" testlerini karıştırırdı.
function LocationProbe() {
  const { pathname } = useLocation()
  return <span data-testid="location">{pathname}</span>
}

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
        <LocationProbe />
      </AuthProvider>
    </MemoryRouter>,
  )

const currentPath = () => screen.getByTestId('location').textContent

const HOME = { parent: 'Parent home', specialist: 'Specialist home', child: 'Child home' }
const PATH = { parent: '/parent', specialist: '/specialist', child: '/child' }

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.clear()
})

test.each(['/parent', '/specialist', '/child'])(
  'a visitor who is not logged in is sent from %s to the login page',
  async (path) => {
    renderAt(path)

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeTruthy()
  },
)

test('while the user is being loaded a protected page shows Loading and does not redirect', () => {
  setToken('good')
  vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}))

  renderAt('/parent')

  expect(screen.getByRole('status').textContent).toBe('Loading…')
  expect(screen.queryByRole('heading', { name: 'Log in' })).toBeNull()
  // Login sayfası da yüklenirken "Loading…" gösterir; bu yüzden asıl kanıt adresin değişmemesi
  expect(currentPath()).toBe('/parent')
})

// /api/auth/me cevabını biz istediğimiz anda vermek için: dönen release() fonksiyonu cevabı
// bırakır. Diğer istekler (ana sayfanın çocuk listesi) hemen boş liste alır.
function gatedMe(body, status = 200) {
  let release
  const gate = new Promise((resolve) => {
    release = resolve
  })
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    if (url !== '/api/auth/me') return jsonResponse({ children: [] })
    await gate
    return jsonResponse(body, status)
  })
  return release
}

test('while the user is being loaded the protected page is not shown, and it appears when the user has loaded', async () => {
  setToken('good')
  const release = gatedMe({ user: { id: 1, name: 'Test', role: 'parent' } })

  renderAt('/parent')

  expect(screen.getByRole('status').textContent).toBe('Loading…')
  expect(screen.queryByRole('heading', { name: 'Parent home' })).toBeNull()
  expect(currentPath()).toBe('/parent')

  release()

  // Sayfanın kendi içindeki çocuk listesi de "Loading…" gösterebilir, o yüzden başlığa bakıyoruz
  expect(await screen.findByRole('heading', { name: 'Parent home' })).toBeTruthy()
  expect(currentPath()).toBe('/parent')
})

test('while loading, a protected page does not guess the role: it shows Loading and no redirect', async () => {
  setToken('good')
  const release = gatedMe({ user: { id: 3, name: 'Elif', role: 'child' } })

  renderAt('/parent')

  expect(screen.getByRole('status').textContent).toBe('Loading…')
  expect(screen.queryByRole('heading', { name: 'Parent home' })).toBeNull()
  expect(screen.queryByRole('heading', { name: 'Child home' })).toBeNull()
  expect(screen.queryByRole('heading', { name: 'Log in' })).toBeNull()
  // Rol henüz bilinmiyor: adres /parent kalır, ne /login'e ne de /child'a gidilir
  expect(currentPath()).toBe('/parent')

  release()

  // Rol ancak cevap gelince bilinir; ondan sonra çocuk kendi sayfasına gider
  expect(await screen.findByRole('heading', { name: 'Child home' })).toBeTruthy()
  expect(screen.queryByRole('heading', { name: 'Parent home' })).toBeNull()
  expect(currentPath()).toBe('/child')
})

test('when loading ends with an invalid token, the visitor is sent to the login page and the token is removed', async () => {
  setToken('expired')
  const release = gatedMe({ error: 'Invalid or expired token' }, 401)

  renderAt('/specialist')

  expect(screen.getByRole('status').textContent).toBe('Loading…')
  expect(screen.queryByRole('heading', { name: 'Log in' })).toBeNull()
  expect(currentPath()).toBe('/specialist')

  release()

  expect(await screen.findByRole('heading', { name: 'Log in' })).toBeTruthy()
  expect(currentPath()).toBe('/login')
  expect(getToken()).toBeNull()
  expect(screen.queryByRole('heading', { name: 'Specialist home' })).toBeNull()
})

const crossRole = [
  ['parent', 'specialist'],
  ['parent', 'child'],
  ['specialist', 'parent'],
  ['specialist', 'child'],
  ['child', 'parent'],
  ['child', 'specialist'],
]

test.each(crossRole)('a %s who opens the %s page is sent to their own home page', async (role, other) => {
  setToken('good')
  vi.spyOn(globalThis, 'fetch').mockImplementation(respondWith({ user: { id: 1, name: 'Test', role } }))

  renderAt(PATH[other])

  expect(await screen.findByRole('heading', { name: HOME[role] })).toBeTruthy()
  expect(screen.queryByRole('heading', { name: HOME[other] })).toBeNull()
})

test('someone sent to the login page from another role page ends up on their own home page after logging in', async () => {
  const fetchSpy = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(respondWith({ token: 't', user: { id: 1, name: 'Ayşe', role: 'parent' } }))
  const user = userEvent.setup()
  renderAt('/child')

  await user.type(await screen.findByLabelText('Email'), 'ayse@example.com')
  await user.type(screen.getByLabelText('Password'), 'password123')
  await user.click(screen.getByRole('button', { name: 'Log in' }))

  expect(await screen.findByRole('heading', { name: 'Parent home' })).toBeTruthy()
  expect(screen.queryByRole('heading', { name: 'Child home' })).toBeNull()
  // Tek bir login isteği; sonra ana sayfa çocuk listesini ister
  expect(fetchSpy.mock.calls.map(([url]) => url)).toEqual(['/api/auth/login', '/api/children'])
})

test('Log out removes the token and shows the login page', async () => {
  setToken('good')
  vi.spyOn(globalThis, 'fetch').mockImplementation(respondWith({ user: { id: 1, name: 'Test', role: 'parent' } }))
  const user = userEvent.setup()
  renderAt('/parent')
  await screen.findByRole('heading', { name: 'Parent home' })

  await user.click(screen.getByRole('button', { name: 'Log out' }))

  expect(await screen.findByRole('heading', { name: 'Log in' })).toBeTruthy()
  expect(getToken()).toBeNull()
  expect(screen.queryByRole('heading', { name: 'Parent home' })).toBeNull()
})
