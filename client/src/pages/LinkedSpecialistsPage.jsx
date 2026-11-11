import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiFetch } from '../api.js'
import Loading from '../components/Loading.jsx'
import { useChild, VALID_CHILD_ID } from '../hooks/useChild.js'
import './LinkedSpecialistsPage.css'

// Backend'deki SPECIALIST_TYPES ile aynı olmalı (server/src/routes/specialists.js)
const SPECIALIST_TYPES = ['teacher', 'psychologist', 'doctor', 'special education teacher', 'coach']

const byName = (a, b) => a.name.localeCompare(b.name)

const formatDate = (iso) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

// FR-M2-01 … FR-M2-05: the parent links a specialist by email and type, sees the linked
// specialists and unlinks one after a confirmation step. Access is enforced by the backend
// (only the child's own parent); this page only shows what the API returns.
export default function LinkedSpecialistsPage() {
  const { childId } = useParams()
  const validId = VALID_CHILD_ID.test(childId)
  const childState = useChild(childId)

  // Specialist listesi: { base, status: 'ready' | 'error', specialists?, message? }.
  // base, sonucun hangi çocuğa ait olduğunu tutar; id değişince eski liste gösterilmez.
  const [result, setResult] = useState(null)
  const [email, setEmail] = useState('')
  const [specialistType, setSpecialistType] = useState('')
  const [formError, setFormError] = useState('')
  // Liste üzerindeki işlemlerin sonucu: başarı role="status", hata role="alert" ile okunur
  const [notice, setNotice] = useState('')
  const [unlinkError, setUnlinkError] = useState('')
  // Süren istek: 'link' | 'unlink' | null. Sürerken tüm butonlar kapalı, ikinci istek atılmaz
  const [busy, setBusy] = useState(null)
  const [confirmingId, setConfirmingId] = useState(null)

  const base = `/api/children/${encodeURIComponent(childId)}/specialists`

  useEffect(() => {
    if (!validId) return
    // Sayfa cevaptan önce kapanırsa gelen cevap state'e yazılmaz
    let ignore = false

    apiFetch(base)
      .then((data) => {
        if (!Array.isArray(data?.specialists)) throw new Error('Unexpected response from the server')
        if (!ignore) setResult({ base, status: 'ready', specialists: [...data.specialists].sort(byName) })
      })
      .catch((err) => {
        if (!ignore) setResult({ base, status: 'error', message: err.message })
      })

    return () => {
      ignore = true
    }
  }, [base, validId])

  async function handleLink(event) {
    event.preventDefault()
    if (busy) return // çift tıklama ikinci bir istek atmasın
    setNotice('')
    setUnlinkError('')

    if (!email.trim()) return setFormError('Email is required')
    if (!SPECIALIST_TYPES.includes(specialistType)) return setFormError('Choose a specialist type')

    setFormError('')
    setBusy('link')
    try {
      const { specialist } = await apiFetch(base, {
        method: 'POST',
        body: { email: email.trim(), specialistType },
      })
      setResult((prev) => ({ ...prev, specialists: [...prev.specialists, specialist].sort(byName) }))
      setEmail('')
      setSpecialistType('')
      setNotice(`${specialist.name} is now linked as ${specialist.specialistType}.`)
    } catch (err) {
      // Backend mesajı olduğu gibi gösterilir (ör. "No registered specialist with this email")
      setFormError(err.message)
    } finally {
      setBusy(null)
    }
  }

  async function handleUnlink(specialist) {
    if (busy) return
    setBusy('unlink')
    setNotice('')
    setUnlinkError('')
    setFormError('')
    try {
      await apiFetch(`${base}/${encodeURIComponent(specialist.id)}`, { method: 'DELETE' })
      setNotice(`${specialist.name} is no longer linked.`)
      removeFromList(specialist.id)
    } catch (err) {
      // 404: bağlantı zaten kaldırılmış (ör. başka bir sekmede), listeden de çıkar
      if (err.status === 404) removeFromList(specialist.id)
      setUnlinkError(err.message)
    } finally {
      setConfirmingId(null)
      setBusy(null)
    }
  }

  function removeFromList(id) {
    setResult((prev) => ({ ...prev, specialists: prev.specialists.filter((s) => s.id !== id) }))
  }

  const load = result?.base === base ? result : { status: 'loading' }

  // Önce çocuk, sonra liste hatası gösterilir (geçersiz id'de liste isteği hiç atılmaz)
  const pageError =
    childState.status === 'error' ? childState.error : load.status === 'error' ? load.message : null

  if (pageError) {
    return (
      <main className="specialists-page">
        <h1>Linked specialists</h1>
        <p role="alert" className="form-error">
          {pageError}
        </p>
        <Link to="/parent">Back to home</Link>
      </main>
    )
  }

  if (childState.status === 'loading' || load.status === 'loading') return <Loading />

  const { child } = childState
  const { specialists } = load

  return (
    <main className="specialists-page">
      <h1>Linked specialists</h1>
      <h2>{child.name}</h2>
      <Link to="/parent">Back to home</Link>

      <p role="status" className="notice">
        {notice}
      </p>
      {unlinkError && (
        <p role="alert" className="form-error">
          {unlinkError}
        </p>
      )}

      <section aria-labelledby="linked-title">
        <h3 id="linked-title">Specialists</h3>
        {specialists.length === 0 ? (
          <p>No specialists are linked to {child.name} yet.</p>
        ) : (
          <ul className="specialist-list">
            {specialists.map((s) => (
              <li key={s.id}>
                <span>
                  <strong>{s.name}</strong> ({s.specialistType})
                  {s.linkedAt && <small> · linked {formatDate(s.linkedAt)}</small>}
                </span>
                {confirmingId === s.id ? (
                  <span className="confirm" role="group" aria-label={`Confirm unlinking ${s.name}`}>
                    Unlink {s.name} from {child.name}?{' '}
                    <button type="button" onClick={() => handleUnlink(s)} disabled={Boolean(busy)}>
                      Yes, unlink
                    </button>{' '}
                    {/* Odak güvenli seçeneğe gelir: yanlışlıkla Enter'a basmak bağlantıyı kaldırmaz */}
                    <button
                      type="button"
                      onClick={() => setConfirmingId(null)}
                      disabled={Boolean(busy)}
                      autoFocus
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingId(s.id)}
                    disabled={Boolean(busy)}
                    aria-label={`Unlink ${s.name}`}
                  >
                    Unlink
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="link-title">
        <h3 id="link-title">Link a specialist</h3>
        {/* noValidate: kontrolü tarayıcı yerine biz yapıyoruz, mesaj hep aynı yerde çıksın */}
        <form className="link-form" onSubmit={handleLink} noValidate>
          <div className="form-field">
            <label htmlFor="link-email">Specialist email</label>
            <input
              id="link-email"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="form-field">
            <label htmlFor="link-type">Specialist type</label>
            <select id="link-type" value={specialistType} onChange={(event) => setSpecialistType(event.target.value)}>
              <option value="">Choose a type</option>
              {SPECIALIST_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
          {formError && (
            <p role="alert" className="form-error">
              {formError}
            </p>
          )}
          <button type="submit" disabled={Boolean(busy)}>
            {busy === 'link' ? 'Linking…' : 'Link specialist'}
          </button>
        </form>
      </section>
    </main>
  )
}
