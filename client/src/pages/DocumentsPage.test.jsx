import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useEffect } from 'react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import App from '../App.jsx'
import { setToken } from '../api.js'
import { AuthProvider } from '../auth/AuthContext.jsx'
import { jsonResponse } from '../testUtils.js'
import { MAX_SIZE } from '../utils/documents.js'
import { URL_LIFETIME_MS } from './DocumentsPage.jsx'

const PAGE = '/parent/children/2/documents'
const API = '/api/children/2/documents'
const DENIZ = { id: 2, name: 'Deniz Kaya' }

const doc = (id, name, mimeType, sizeBytes, uploaderName, uploadedAt) => ({
  id,
  name,
  mimeType,
  sizeBytes,
  uploaderName,
  uploadedAt,
})

const REPORT = doc(1, 'school-report.pdf', 'application/pdf', 245760, 'Selin Kaya', '2026-11-20T12:00:00Z')
const DRAWING = doc(2, 'drawing.png', 'image/png', 1536, 'Burak Öztürk', '2026-11-24T12:00:00Z')
const PHOTO = doc(3, 'photo.jpg', 'image/jpeg', 3145728, 'Selin Kaya', '2026-11-10T12:00:00Z')
const NEW_DOC = doc(4, 'new-plan.pdf', 'application/pdf', 800, 'Selin Kaya', '2026-11-26T12:00:00Z')

const pdfResponse = (body = '%PDF-1.4', contentType = 'application/pdf') =>
  new Response(body, { status: 200, headers: { 'Content-Type': contentType } })

// A fake backend. Each key is one request; an unexpected request gets 599, so a test can
// never pass by accident. The documents are given in a mixed order on purpose.
function mockApi({ role = 'parent', children = [DENIZ], routes = {} } = {}) {
  const all = {
    'GET /api/auth/me': () => jsonResponse({ user: { id: 1, name: 'Selin Kaya', role } }),
    'GET /api/children': () => jsonResponse({ children }),
    [`GET ${API}`]: () => jsonResponse({ documents: [REPORT, DRAWING, PHOTO] }),
    ...routes,
  }
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options = {}) => {
    const handler = all[`${options.method ?? 'GET'} ${url}`]
    return handler ? handler(options) : jsonResponse({ error: `Unexpected request: ${url}` }, 599)
  })
}

const requests = (fetchSpy) => fetchSpy.mock.calls.map(([url, options]) => `${options?.method ?? 'GET'} ${url}`)
const posts = (fetchSpy) => fetchSpy.mock.calls.filter(([, options]) => options?.method === 'POST')

function LocationProbe() {
  const { pathname } = useLocation()
  return <span data-testid="location">{pathname}</span>
}

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
  return { fetchSpy }
}

async function renderPage(path = PAGE, api) {
  const rendered = renderAt(path, api)
  await screen.findByRole('heading', { name: 'Deniz Kaya' })
  await screen.findByRole('list', { name: 'Documents' })
  return rendered
}

const documentList = () => screen.getByRole('list', { name: 'Documents' })
const names = () =>
  within(documentList())
    .getAllByRole('listitem')
    .map((item) => item.querySelector('strong').textContent)
const itemOf = (name) => within(documentList()).getByRole('listitem', { name })
const fileInput = () => screen.getByLabelText('File')
const uploadButton = () => screen.getByRole('button', { name: /^Upload/ })

// The file picker's accept list is not applied, so a test can choose any file
const user = () => userEvent.setup({ applyAccept: false })

// A file of a given size without making that many bytes
function fileOfSize(name, size, type = 'application/pdf') {
  const file = new File(['%PDF-'], name, { type })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

// jsdom has no blob: URLs; these record which file was put in memory and freed
let createObjectURL
let revokeObjectURL
let anchorClicks

beforeEach(() => {
  createObjectURL = vi.fn(() => 'blob:http://localhost/1234')
  revokeObjectURL = vi.fn()
  URL.createObjectURL = createObjectURL
  URL.revokeObjectURL = revokeObjectURL
  // jsdom cannot download; the link that would start the download is recorded instead
  anchorClicks = []
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
    anchorClicks.push({ href: this.href, download: this.download, inDocument: document.body.contains(this) })
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.clear()
  delete URL.createObjectURL
  delete URL.revokeObjectURL
})

// --- List (FR-M6-03, FR-M6-05) ---

test("the parent sees the child's documents, newest first, with type, size, uploader and date", async () => {
  await renderPage()

  expect(screen.getByRole('heading', { level: 1, name: 'Documents' })).not.toBeNull()
  expect(names()).toEqual(['drawing.png', 'school-report.pdf', 'photo.jpg'])
  expect(within(itemOf('drawing.png')).getByText('PNG image · 1.5 KB · uploaded by Burak Öztürk on 24 Nov 2026')).not.toBeNull()
  expect(within(itemOf('school-report.pdf')).getByText('PDF · 240.0 KB · uploaded by Selin Kaya on 20 Nov 2026')).not.toBeNull()
  expect(within(itemOf('photo.jpg')).getByText('JPEG image · 3.0 MB · uploaded by Selin Kaya on 10 Nov 2026')).not.toBeNull()
  expect(screen.getByRole('link', { name: 'Back to home' }).getAttribute('href')).toBe('/parent')
})

test('a linked specialist sees the same page and can upload too', async () => {
  await renderPage('/specialist/children/2/documents', { role: 'specialist', children: [{ ...DENIZ, specialistType: 'psychologist' }] })

  expect(names()).toEqual(['drawing.png', 'school-report.pdf', 'photo.jpg'])
  expect(screen.getByRole('form', { name: 'Upload a document' })).not.toBeNull()
  expect(screen.getByRole('link', { name: 'Back to home' }).getAttribute('href')).toBe('/specialist')
})

test('the documents of each child are reached from the parent home', async () => {
  const { fetchSpy } = renderAt('/parent')
  const nav = await screen.findByRole('navigation', { name: 'Deniz Kaya modules' })

  await user().click(within(nav).getByRole('link', { name: 'Documents' }))

  await screen.findByRole('list', { name: 'Documents' })
  expect(screen.getByTestId('location').textContent).toBe(PAGE)
  expect(requests(fetchSpy)).toContain(`GET ${API}`)
})

test('the child cannot open the page and no document request is sent', async () => {
  const { fetchSpy } = renderAt(PAGE, { role: 'child' })

  await vi.waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/child'))
  expect(requests(fetchSpy)).not.toContain(`GET ${API}`)
})

test('an empty list says there are no documents yet', async () => {
  renderAt(PAGE, { routes: { [`GET ${API}`]: () => jsonResponse({ documents: [] }) } })

  expect(await screen.findByText('No documents yet.')).not.toBeNull()
  expect(screen.getByRole('form', { name: 'Upload a document' })).not.toBeNull()
})

test('an invalid child id sends no request for documents', async () => {
  const { fetchSpy } = renderAt('/parent/children/abc/documents')

  expect((await screen.findByRole('alert')).textContent).toBe('Child not found')
  expect(requests(fetchSpy).filter((r) => r.includes('/documents'))).toEqual([])
})

test("the backend's error is shown when the list cannot be loaded", async () => {
  renderAt(PAGE, {
    routes: { [`GET ${API}`]: () => jsonResponse({ error: 'You do not have access to this child' }, 403) },
  })

  expect((await screen.findByRole('alert')).textContent).toBe('You do not have access to this child')
  expect(screen.queryByRole('form', { name: 'Upload a document' })).toBeNull()
})

test.each([
  ['a list that is not a list', { documents: 'none' }],
  ['an HTML document', { documents: [REPORT, { ...DRAWING, mimeType: 'text/html' }] }],
])('%s is shown as an unexpected response', async (_name, body) => {
  renderAt(PAGE, { routes: { [`GET ${API}`]: () => jsonResponse(body) } })

  expect((await screen.findByRole('alert')).textContent).toBe('Unexpected response from the server')
  expect(screen.queryByRole('list', { name: 'Documents' })).toBeNull()
})

// --- Switching to another child ---

const ALI = { id: 5, name: 'Ali Şahin' }
const ALI_DOC = doc(9, 'ali-report.pdf', 'application/pdf', 2048, 'Fatma Şahin', '2026-11-25T12:00:00Z')
const ALI_API = '/api/children/5/documents'

// Holds a response back until the test releases it
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

// Gives the test the router's navigate function, to move the page to another child
function renderWithNavigation(api) {
  setToken('good')
  const router = {}
  function NavigateProbe() {
    const navigate = useNavigate()
    useEffect(() => {
      router.navigate = navigate
    }, [navigate])
    return null
  }
  const fetchSpy = mockApi({ children: [DENIZ, ALI], ...api })
  render(
    <MemoryRouter initialEntries={[PAGE]}>
      <AuthProvider>
        <NavigateProbe />
        <App />
      </AuthProvider>
    </MemoryRouter>,
  )
  return { router, fetchSpy }
}

test("switching to another child never shows the previous child's documents, not even while the new ones load", async () => {
  const second = gate(() => jsonResponse({ documents: [ALI_DOC] }))
  const { router } = renderWithNavigation({ routes: { [`GET ${ALI_API}`]: second.handler } })
  await screen.findByRole('list', { name: 'Documents' })

  act(() => router.navigate('/parent/children/5/documents'))

  expect(await screen.findByRole('heading', { name: 'Ali Şahin' })).toBeTruthy()
  expect(screen.getByText('Loading…')).toBeTruthy()
  expect(screen.queryByText('school-report.pdf')).toBeNull()

  await act(async () => second.release())
  expect(await screen.findByText('ali-report.pdf')).toBeTruthy()
  expect(names()).toEqual(['ali-report.pdf'])
})

test.each([
  ['list', () => jsonResponse({ documents: [REPORT] })],
  ['error', () => jsonResponse({ error: 'You do not have access to this child' }, 403)],
])('a late %s for the previous child is ignored', async (_name, response) => {
  const first = gate(response)
  const { router } = renderWithNavigation({
    routes: { [`GET ${API}`]: first.handler, [`GET ${ALI_API}`]: () => jsonResponse({ documents: [ALI_DOC] }) },
  })
  await screen.findByRole('heading', { name: 'Deniz Kaya' })

  act(() => router.navigate('/parent/children/5/documents'))
  expect(await screen.findByText('ali-report.pdf')).toBeTruthy()

  await act(async () => first.release())

  expect(names()).toEqual(['ali-report.pdf'])
  expect(screen.queryByRole('alert')).toBeNull()
})

test("an upload that finishes after switching child does not add the file to the other child's list", async () => {
  const upload = gate(() => jsonResponse({ document: NEW_DOC }, 201))
  const { router } = renderWithNavigation({
    routes: { [`POST ${API}`]: upload.handler, [`GET ${ALI_API}`]: () => jsonResponse({ documents: [ALI_DOC] }) },
  })
  await screen.findByRole('list', { name: 'Documents' })
  const u = user()
  await u.upload(fileInput(), new File(['%PDF-'], 'new-plan.pdf'))
  await u.click(uploadButton())

  act(() => router.navigate('/parent/children/5/documents'))
  expect(await screen.findByText('ali-report.pdf')).toBeTruthy()
  await act(async () => upload.release())

  expect(names()).toEqual(['ali-report.pdf'])
})

// --- Upload (FR-M6-01, FR-M6-02, FR-M6-06) ---

test('uploading sends the file, adds it to the top of the list and clears the form', async () => {
  const { fetchSpy } = await renderPage(PAGE, {
    routes: { [`POST ${API}`]: () => jsonResponse({ document: NEW_DOC }, 201) },
  })
  const u = user()
  const file = new File(['%PDF-1.4'], 'new-plan.pdf', { type: 'application/pdf' })

  expect(fileInput().getAttribute('accept')).toBe('.pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg')
  const hintId = fileInput().getAttribute('aria-describedby')
  expect(document.getElementById(hintId).textContent).toBe('PDF, PNG or JPEG, at most 10 MB')
  await u.upload(fileInput(), file)
  await u.click(uploadButton())

  expect((await screen.findByRole('status')).textContent).toBe('Document uploaded: new-plan.pdf')
  expect(names()).toEqual(['new-plan.pdf', 'drawing.png', 'school-report.pdf', 'photo.jpg'])
  const [[url, options]] = posts(fetchSpy)
  expect(url).toBe(API)
  expect(options.body.get('file')).toBe(file)
  expect(fileInput().value).toBe('')
  expect(fileInput().files).toHaveLength(0)

  // The same file is not sent again by a second click
  await u.click(uploadButton())
  expect(screen.getByRole('alert').textContent).toBe('Choose a file to upload')
  expect(posts(fetchSpy)).toHaveLength(1)
})

test('uploading without a file shows an error and sends nothing', async () => {
  const { fetchSpy } = await renderPage()

  await user().click(uploadButton())

  expect(within(screen.getByRole('form', { name: 'Upload a document' })).getByRole('alert').textContent).toBe('Choose a file to upload')
  expect(posts(fetchSpy)).toHaveLength(0)
})

test('a file larger than 10 MB is rejected before it is sent', async () => {
  const { fetchSpy } = await renderPage()
  const u = user()

  await u.upload(fileInput(), fileOfSize('big.pdf', MAX_SIZE + 1))
  await u.click(uploadButton())

  expect(screen.getByRole('alert').textContent).toBe('The file must be at most 10 MB')
  expect(posts(fetchSpy)).toHaveLength(0)
})

test('a file of exactly 10 MB is sent', async () => {
  const { fetchSpy } = await renderPage(PAGE, {
    routes: { [`POST ${API}`]: () => jsonResponse({ document: { ...NEW_DOC, sizeBytes: MAX_SIZE } }, 201) },
  })
  const u = user()

  await u.upload(fileInput(), fileOfSize('exact.pdf', MAX_SIZE))
  await u.click(uploadButton())

  await screen.findByText('Document uploaded: new-plan.pdf')
  expect(posts(fetchSpy)).toHaveLength(1)
})

test("the backend's error is shown and the chosen file stays, so it can be sent again", async () => {
  const { fetchSpy } = await renderPage(PAGE, {
    routes: {
      [`POST ${API}`]: () => jsonResponse({ error: 'Only PDF, PNG and JPEG files can be uploaded' }, 400),
    },
  })
  const u = user()
  const file = new File(['hello'], 'notes.txt', { type: 'text/plain' })

  await u.upload(fileInput(), file)
  await u.click(uploadButton())

  expect((await screen.findByRole('alert')).textContent).toBe('Only PDF, PNG and JPEG files can be uploaded')
  expect(names()).toEqual(['drawing.png', 'school-report.pdf', 'photo.jpg'])
  expect(fileInput().files[0]).toBe(file)
  expect(uploadButton().disabled).toBe(false)

  await u.click(uploadButton())
  await vi.waitFor(() => expect(posts(fetchSpy)).toHaveLength(2))
})

test('closing the file picker without a file leaves no file to upload', async () => {
  const { fetchSpy } = await renderPage()
  const u = user()
  await u.upload(fileInput(), new File(['%PDF-'], 'a.pdf'))

  // Choosing again and cancelling empties the input
  fireEvent.change(fileInput(), { target: { files: [] } })
  await u.click(uploadButton())

  expect(screen.getByRole('alert').textContent).toBe('Choose a file to upload')
  expect(posts(fetchSpy)).toHaveLength(0)
})

test('choosing another file clears the previous error', async () => {
  await renderPage()
  const u = user()

  await u.click(uploadButton())
  expect(screen.getByRole('alert').textContent).toBe('Choose a file to upload')

  await u.upload(fileInput(), new File(['%PDF-'], 'a.pdf'))

  expect(screen.queryByRole('alert')).toBeNull()
})

test('an unexpected answer to an upload is shown as an error and the list does not change', async () => {
  await renderPage(PAGE, {
    routes: { [`POST ${API}`]: () => jsonResponse({ document: { ...NEW_DOC, mimeType: 'text/html' } }, 201) },
  })
  const u = user()

  await u.upload(fileInput(), new File(['%PDF-'], 'a.pdf'))
  await u.click(uploadButton())

  expect((await screen.findByRole('alert')).textContent).toBe('Unexpected response from the server')
  expect(names()).toEqual(['drawing.png', 'school-report.pdf', 'photo.jpg'])
})

test('while the upload runs the button is off, so a double click sends one request', async () => {
  let finish
  const { fetchSpy } = await renderPage(PAGE, {
    routes: {
      [`POST ${API}`]: () =>
        new Promise((resolve) => {
          finish = () => resolve(jsonResponse({ document: NEW_DOC }, 201))
        }),
    },
  })
  const u = user()

  await u.upload(fileInput(), new File(['%PDF-'], 'a.pdf'))
  await u.dblClick(uploadButton())

  expect(uploadButton().disabled).toBe(true)
  expect(uploadButton().textContent).toBe('Uploading…')
  finish()
  await screen.findByText('Document uploaded: new-plan.pdf')
  expect(posts(fetchSpy)).toHaveLength(1)
  expect(uploadButton().disabled).toBe(false)
})

// --- Open and download (FR-M6-04) ---

test('Open opens a new tab at once and then shows the file in it as its own type', async () => {
  // The response says HTML, but the page must use the type from the list
  const { fetchSpy } = await renderPage(PAGE, {
    routes: { [`GET ${API}/1/download`]: () => pdfResponse('<script>alert(1)</script>', 'text/html') },
  })
  const tab = { opener: 'the app', location: { href: 'about:blank' }, close: vi.fn() }
  const open = vi.spyOn(window, 'open').mockReturnValue(tab)
  const timers = vi.spyOn(globalThis, 'setTimeout')

  await user().click(screen.getByRole('button', { name: 'Open school-report.pdf' }))

  await vi.waitFor(() => expect(tab.location.href).toBe('blob:http://localhost/1234'))
  expect(open).toHaveBeenCalledWith('', '_blank')
  expect(tab.opener).toBeNull()
  expect(requests(fetchSpy)).toContain(`GET ${API}/1/download`)
  expect(createObjectURL.mock.calls[0][0].type).toBe('application/pdf')
  expect(anchorClicks).toEqual([])

  // The file is freed from memory after a minute
  const revoke = timers.mock.calls.find(([, ms]) => ms === URL_LIFETIME_MS)
  expect(URL_LIFETIME_MS).toBe(60000)
  expect(revokeObjectURL).not.toHaveBeenCalled()
  revoke[0]()
  expect(revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/1234')
})

test('the tab is opened before the file arrives, so the browser does not block it as a pop-up', async () => {
  let finish
  await renderPage(PAGE, {
    routes: {
      [`GET ${API}/2/download`]: () =>
        new Promise((resolve) => {
          finish = () => resolve(pdfResponse('png', 'image/png'))
        }),
    },
  })
  const tab = { opener: null, location: { href: 'about:blank' }, close: vi.fn() }
  const open = vi.spyOn(window, 'open').mockReturnValue(tab)

  await user().click(screen.getByRole('button', { name: 'Open drawing.png' }))

  expect(open).toHaveBeenCalledTimes(1)
  expect(tab.location.href).toBe('about:blank')
  // Both buttons of that document are off while it loads; the others stay on
  expect(screen.getByRole('button', { name: 'Open drawing.png' }).disabled).toBe(true)
  expect(screen.getByRole('button', { name: 'Download drawing.png' }).disabled).toBe(true)
  expect(screen.getByRole('button', { name: 'Open photo.jpg' }).disabled).toBe(false)

  finish()
  await vi.waitFor(() => expect(tab.location.href).toBe('blob:http://localhost/1234'))
  expect(createObjectURL.mock.calls[0][0].type).toBe('image/png')
  expect(screen.getByRole('button', { name: 'Open drawing.png' }).disabled).toBe(false)
})

test('each document keeps its buttons off until its own file arrives, even when another one finishes first', async () => {
  const report = gate(() => pdfResponse())
  const drawing = gate(() => pdfResponse('png', 'image/png'))
  await renderPage(PAGE, {
    routes: { [`GET ${API}/1/download`]: report.handler, [`GET ${API}/2/download`]: drawing.handler },
  })
  const u = user()
  const button = (name) => screen.getByRole('button', { name })

  await u.click(button('Download school-report.pdf'))
  await u.click(button('Download drawing.png'))
  expect(button('Download school-report.pdf').disabled).toBe(true)
  expect(button('Download drawing.png').disabled).toBe(true)

  // The second one finishes first; the first one is still loading and stays off
  await act(async () => drawing.release())
  await vi.waitFor(() => expect(button('Download drawing.png').disabled).toBe(false))
  expect(button('Open school-report.pdf').disabled).toBe(true)
  expect(button('Download school-report.pdf').disabled).toBe(true)

  await act(async () => report.release())
  await vi.waitFor(() => expect(button('Download school-report.pdf').disabled).toBe(false))
  expect(anchorClicks.map((click) => click.download)).toEqual(['drawing.png', 'school-report.pdf'])
})

test('when pop-ups are blocked, Open downloads the file instead', async () => {
  await renderPage(PAGE, { routes: { [`GET ${API}/3/download`]: () => pdfResponse('jpg', 'image/jpeg') } })
  vi.spyOn(window, 'open').mockReturnValue(null)

  await user().click(screen.getByRole('button', { name: 'Open photo.jpg' }))

  await vi.waitFor(() => expect(anchorClicks).toHaveLength(1))
  expect(anchorClicks[0]).toEqual({ href: 'blob:http://localhost/1234', download: 'photo.jpg', inDocument: true })
  expect(createObjectURL.mock.calls[0][0].type).toBe('image/jpeg')
})

test('when Open fails, the empty tab is closed and the error is shown', async () => {
  await renderPage(PAGE, {
    routes: { [`GET ${API}/1/download`]: () => jsonResponse({ error: 'Document not found' }, 404) },
  })
  const tab = { opener: null, location: { href: 'about:blank' }, close: vi.fn() }
  vi.spyOn(window, 'open').mockReturnValue(tab)

  await user().click(screen.getByRole('button', { name: 'Open school-report.pdf' }))

  expect((await screen.findByRole('alert')).textContent).toBe('Document not found')
  expect(tab.close).toHaveBeenCalledTimes(1)
  expect(tab.location.href).toBe('about:blank')
  expect(createObjectURL).not.toHaveBeenCalled()
})

test('when Open fails with pop-ups blocked, only the error is shown', async () => {
  await renderPage(PAGE, {
    routes: { [`GET ${API}/1/download`]: () => jsonResponse({ error: 'Document not found' }, 404) },
  })
  vi.spyOn(window, 'open').mockReturnValue(null)

  await user().click(screen.getByRole('button', { name: 'Open school-report.pdf' }))

  expect((await screen.findByRole('alert')).textContent).toBe('Document not found')
  expect(anchorClicks).toEqual([])
})

test('Download saves the file under its name with the type from the list', async () => {
  const open = vi.spyOn(window, 'open')
  await renderPage(PAGE, {
    routes: { [`GET ${API}/1/download`]: () => pdfResponse('<html></html>', 'text/html') },
  })

  await user().click(screen.getByRole('button', { name: 'Download school-report.pdf' }))

  await vi.waitFor(() => expect(anchorClicks).toHaveLength(1))
  expect(anchorClicks[0]).toEqual({ href: 'blob:http://localhost/1234', download: 'school-report.pdf', inDocument: true })
  expect(createObjectURL.mock.calls[0][0].type).toBe('application/pdf')
  expect(open).not.toHaveBeenCalled()
  // The temporary link is removed again
  expect(document.querySelectorAll('a[download]')).toHaveLength(0)
  expect(screen.getByRole('button', { name: 'Download school-report.pdf' }).disabled).toBe(false)
})

test('when Download fails the error is shown, and the next action clears it', async () => {
  await renderPage(PAGE, {
    routes: {
      [`GET ${API}/1/download`]: () => jsonResponse({ error: 'Document not found' }, 404),
      [`GET ${API}/2/download`]: () => pdfResponse('png', 'image/png'),
    },
  })
  const u = user()

  await u.click(screen.getByRole('button', { name: 'Download school-report.pdf' }))
  expect((await screen.findByRole('alert')).textContent).toBe('Document not found')
  expect(anchorClicks).toEqual([])

  await u.click(screen.getByRole('button', { name: 'Download drawing.png' }))
  await vi.waitFor(() => expect(anchorClicks).toHaveLength(1))
  expect(screen.queryByRole('alert')).toBeNull()
})

test('an upload notice is cleared when a document is opened', async () => {
  await renderPage(PAGE, {
    routes: {
      [`POST ${API}`]: () => jsonResponse({ document: NEW_DOC }, 201),
      [`GET ${API}/4/download`]: () => pdfResponse(),
    },
  })
  vi.spyOn(window, 'open').mockReturnValue({ opener: null, location: { href: '' }, close: vi.fn() })
  const u = user()

  await u.upload(fileInput(), new File(['%PDF-'], 'new-plan.pdf'))
  await u.click(uploadButton())
  await screen.findByText('Document uploaded: new-plan.pdf')

  await u.click(screen.getByRole('button', { name: 'Open new-plan.pdf' }))

  expect(screen.getByRole('status').textContent).toBe('')
})
