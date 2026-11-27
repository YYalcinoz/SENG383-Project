// Tüm backend istekleri bu dosyadan geçer. Yol her zaman göreli yazılır (/api/...):
// Vite proxy'si isteği backend'e iletir, backend'de CORS yoktur.

const TOKEN_KEY = 'helix.token'

// Token yalnızca localStorage'da ve yalnızca bu tek anahtarda tutulur
export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token)
export const clearToken = () => localStorage.removeItem(TOKEN_KEY)

// Hata mesajını ve HTTP status'unu taşır (status 0 = sunucuya hiç ulaşılamadı)
export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

let unauthorizedHandler = null

// AuthContext "oturum bitti" haberini almak için kendini buraya kaydeder
export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler
}

// Sends a request with the token and returns the response when it is ok. Every other
// answer becomes an ApiError. expectUnauthorized: for requests where 401 is a normal
// answer (a wrong password, for example); then the token is kept and the session does not end.
async function send(path, { method = 'GET', headers = {}, body, expectUnauthorized = false }) {
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`

  let res
  try {
    res = await fetch(path, { method, headers, body })
  } catch {
    throw new ApiError('Cannot reach the server', 0)
  }

  if (res.ok) return res

  if (res.status === 401 && !expectUnauthorized) {
    clearToken()
    if (unauthorizedHandler) unauthorizedHandler()
  }

  // Backend errors are always JSON { error }; anything else (for example the Vite proxy's
  // 500 while the backend is down) means something in between is broken
  const data = await res.json().catch(() => null)
  const message =
    typeof data?.error === 'string'
      ? data.error
      : res.status >= 500
        ? 'Cannot reach the server'
        : `Request failed (${res.status})`
  throw new ApiError(message, res.status)
}

// A JSON request; body is sent as JSON and the JSON answer is returned
export async function apiFetch(path, { method = 'GET', body, expectUnauthorized = false } = {}) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await send(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    expectUnauthorized,
  })
  return res.status === 204 ? null : res.json()
}

// Uploads one file as multipart/form-data in the field "file" and returns the JSON answer.
// No Content-Type is set: the browser sets it with the boundary of the form data.
export async function apiUpload(path, file) {
  const form = new FormData()
  form.append('file', file)
  const res = await send(path, { method: 'POST', body: form })
  return res.json()
}

// Downloads a file and returns it as a Blob (for document downloads, which need the token)
export async function apiFetchBlob(path) {
  const res = await send(path, {})
  return res.blob()
}
