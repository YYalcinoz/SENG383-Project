import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch, clearToken, getToken, setToken, setUnauthorizedHandler } from '../api.js'
import { AuthContext } from './context.js'

// status: 'loading' (token var, /me cevabı bekleniyor) | 'authenticated' | 'anonymous'
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState(() => (getToken() ? 'loading' : 'anonymous'))

  useEffect(() => {
    let cancelled = false

    // apiFetch herhangi bir istekte 401 görürse token'ı siler ve bunu çağırır
    setUnauthorizedHandler(() => {
      setUser(null)
      setStatus('anonymous')
    })

    // Sayfa yenilenince kullanıcıyı token ile geri yükle (rol yalnızca backend'den gelir)
    if (getToken()) {
      apiFetch('/api/auth/me')
        .then((data) => {
          if (cancelled) return
          setUser(data.user)
          setStatus('authenticated')
        })
        .catch(() => {
          // 401'de apiFetch token'ı zaten sildi; ağ hatasında token kalır, kullanıcı login'e düşer
          if (cancelled) return
          setUser(null)
          setStatus('anonymous')
        })
    }

    return () => {
      cancelled = true
      setUnauthorizedHandler(null)
    }
  }, [])

  const login = useCallback(async (email, password) => {
    // Yanlış şifre 401 döner; bu bir "oturum bitti" durumu değil, hata olarak fırlar
    const data = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: { email, password },
      expectUnauthorized: true,
    })
    setToken(data.token)
    setUser(data.user)
    setStatus('authenticated')
    return data.user
  }, [])

  const logout = useCallback(() => {
    clearToken()
    setUser(null)
    setStatus('anonymous')
  }, [])

  const value = useMemo(() => ({ user, status, login, logout }), [user, status, login, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
