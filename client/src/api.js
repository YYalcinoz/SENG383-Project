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

// expectUnauthorized: 401'in normal bir cevap olduğu istekler için (yanlış şifre gibi);
// bu durumda token silinmez ve oturum bitti haberi verilmez
export async function apiFetch(path, { method = 'GET', body, expectUnauthorized = false } = {}) {
  const headers = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  let res
  try {
    res = await fetch(path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError('Cannot reach the server', 0)
  }

  if (res.ok) {
    return res.status === 204 ? null : res.json()
  }

  if (res.status === 401 && !expectUnauthorized) {
    clearToken()
    if (unauthorizedHandler) unauthorizedHandler()
  }

  // Backend hataları her zaman JSON { error } döner; JSON değilse (ör. backend kapalıyken
  // Vite proxy'sinin 500'ü) araya giren bir şey bozulmuştur
  const data = await res.json().catch(() => null)
  const message =
    typeof data?.error === 'string'
      ? data.error
      : res.status >= 500
        ? 'Cannot reach the server'
        : `Request failed (${res.status})`
  throw new ApiError(message, res.status)
}
