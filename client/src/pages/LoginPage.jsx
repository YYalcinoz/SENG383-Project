import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ApiError } from '../api.js'
import { afterLoginPath } from '../auth/loginRedirect.js'
import { useAuth } from '../auth/useAuth.js'
import './LoginPage.css'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    if (submitting) return // çift tıklama ikinci bir istek atmasın

    if (!email.trim() || !password) {
      setError('Email and password are required')
      return
    }

    setError('')
    setSubmitting(true)
    try {
      const user = await login(email.trim(), password)
      setPassword('') // şifre başarılı olunca da state'te kalmasın
      navigate(afterLoginPath(user, location), { replace: true })
    } catch (err) {
      // Backend mesajı olduğu gibi gösterilir (ör. "Invalid email or password")
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
      setPassword('') // e-posta kalır, şifre temizlenir
      setSubmitting(false)
    }
  }

  return (
    <main className="login-page">
      <h1>Log in</h1>
      {/* noValidate: boş alan kontrolünü tarayıcı yerine biz yapıyoruz, mesaj hep aynı yerde çıksın */}
      <form className="login-form" onSubmit={handleSubmit} noValidate>
        <div className="login-field">
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="login-field">
          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        {error && (
          <p role="alert" className="login-error">
            {error}
          </p>
        )}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Logging in…' : 'Log in'}
        </button>
      </form>
    </main>
  )
}
