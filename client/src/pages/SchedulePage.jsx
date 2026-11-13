import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { apiFetch } from '../api.js'
import { useAuth } from '../auth/useAuth.js'
import { ROLE_HOME } from '../auth/roles.js'
import Loading from '../components/Loading.jsx'
import WeekDays from '../components/WeekDays.jsx'
import { useChild, VALID_CHILD_ID } from '../hooks/useChild.js'
import { byDateAndTime } from '../utils/events.js'
import { addDays, formatDate, isValidDate, weekStartOf } from '../utils/week.js'
import './SchedulePage.css'

// Backend'deki EVENT_TYPES ile aynı olmalı (server/src/routes/schedule.js)
const EVENT_TYPES = ['school', 'support', 'health', 'sports', 'other']

const EMPTY_FORM = { title: '', eventDate: '', startTime: '', endTime: '', eventType: '' }

// FR-M3-01 … FR-M3-03: the parent and linked specialists see the child's events for one
// week and add new events. Access is enforced by the backend (requireChildAccess); this
// page only shows what the API returns. The shown week is kept in the address (?week=),
// so a refresh or the Back button keeps it.
export default function SchedulePage() {
  const { childId } = useParams()
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const validId = VALID_CHILD_ID.test(childId)
  const childState = useChild(childId)
  const home = ROLE_HOME[user.role]

  // Adresteki hafta geçersizse yok sayılır ve backend bu haftayı döner
  const weekParam = searchParams.get('week')
  const requestedWeek = isValidDate(weekParam) ? weekParam : null

  const base = `/api/children/${encodeURIComponent(childId)}/schedule`
  const path = requestedWeek ? `${base}?weekStart=${encodeURIComponent(requestedWeek)}` : base

  // Haftanın etkinlikleri: { path, status: 'ready' | 'error', weekStart?, events?, message? }.
  // path, sonucun hangi çocuğa ve haftaya ait olduğunu tutar; hafta değişince eski
  // haftanın etkinlikleri bir an bile gösterilmez.
  const [result, setResult] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')
  // İstek sürerken buton kapalı, ikinci istek atılmaz
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!validId) return
    // Sayfa cevaptan önce kapanırsa ya da hafta değişirse gelen cevap state'e yazılmaz
    let ignore = false

    apiFetch(path)
      .then((data) => {
        if (!Array.isArray(data?.events) || !isValidDate(data?.weekStart)) {
          throw new Error('Unexpected response from the server')
        }
        if (!ignore) {
          setResult({ path, status: 'ready', weekStart: data.weekStart, events: [...data.events].sort(byDateAndTime) })
        }
      })
      .catch((err) => {
        if (!ignore) setResult({ path, status: 'error', message: err.message })
      })

    return () => {
      ignore = true
    }
  }, [path, validId])

  const load = result?.path === path ? result : { status: 'loading' }

  function goToWeek(weekStart) {
    setNotice('')
    setSearchParams({ week: weekStart })
  }

  const setField = (name) => (event) => setForm((prev) => ({ ...prev, [name]: event.target.value }))

  async function handleAdd(event) {
    event.preventDefault()
    if (busy) return // çift tıklama ikinci bir istek atmasın
    setNotice('')

    // Eksik alanlar istek atılmadan gösterilir (FR-M3-02); biçim hataları backend'den gelir
    if (!form.title.trim()) return setFormError('Title is required')
    if (!form.eventDate) return setFormError('Date is required')
    if (!form.startTime) return setFormError('Start time is required')
    if (!EVENT_TYPES.includes(form.eventType)) return setFormError('Choose an event type')

    setFormError('')
    setBusy(true)
    try {
      const { event: created } = await apiFetch(base, {
        method: 'POST',
        body: {
          title: form.title.trim(),
          eventDate: form.eventDate,
          startTime: form.startTime,
          endTime: form.endTime || null,
          eventType: form.eventType,
        },
      })
      setForm(EMPTY_FORM)
      setNotice(`${created.title} was added on ${formatDate(created.eventDate)} at ${created.startTime}.`)

      const createdWeek = weekStartOf(created.eventDate)
      if (load.status === 'ready' && createdWeek === load.weekStart) {
        setResult((prev) => ({ ...prev, events: [...prev.events, created].sort(byDateAndTime) }))
      } else {
        // Başka bir haftaya eklendi: o haftaya geçilir, böylece yeni etkinlik hemen görünür
        setSearchParams({ week: createdWeek })
      }
    } catch (err) {
      // Backend mesajı olduğu gibi gösterilir (ör. "End time must be after the start time")
      setFormError(err.message)
    } finally {
      setBusy(false)
    }
  }

  // Önce çocuk, sonra hafta hatası gösterilir (geçersiz id'de hiç istek atılmaz)
  const pageError =
    childState.status === 'error' ? childState.error : load.status === 'error' ? load.message : null

  if (pageError) {
    return (
      <main className="schedule-page">
        <h1>Weekly schedule</h1>
        <p role="alert" className="form-error">
          {pageError}
        </p>
        <Link to={home}>Back to home</Link>
      </main>
    )
  }

  if (childState.status === 'loading') return <Loading />

  const { child } = childState

  return (
    <main className="schedule-page">
      <h1>Weekly schedule</h1>
      <h2>{child.name}</h2>
      <Link to={home}>Back to home</Link>

      <p role="status" className="notice">
        {notice}
      </p>

      <section className="week" aria-label="Week">
        {load.status === 'loading' ? (
          <Loading />
        ) : (
          <>
            <div className="week-nav">
              <button type="button" onClick={() => goToWeek(addDays(load.weekStart, -7))}>
                ‹ Previous week
              </button>
              <h3>
                {formatDate(load.weekStart)} – {formatDate(addDays(load.weekStart, 6))}
              </h3>
              <button type="button" onClick={() => goToWeek(addDays(load.weekStart, 7))}>
                Next week ›
              </button>
            </div>

            <WeekDays weekStart={load.weekStart} events={load.events} />
          </>
        )}
      </section>

      <section aria-labelledby="add-title">
        <h3 id="add-title">Add an event</h3>
        {/* noValidate: kontrolü tarayıcı yerine biz yapıyoruz, mesaj hep aynı yerde çıksın */}
        <form className="event-form" onSubmit={handleAdd} noValidate>
          <div className="form-field">
            <label htmlFor="event-title">Title</label>
            <input id="event-title" type="text" maxLength={200} value={form.title} onChange={setField('title')} />
          </div>
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="event-date">Date</label>
              <input id="event-date" type="date" value={form.eventDate} onChange={setField('eventDate')} />
            </div>
            <div className="form-field">
              <label htmlFor="event-start">Start time</label>
              <input id="event-start" type="time" value={form.startTime} onChange={setField('startTime')} />
            </div>
            <div className="form-field">
              <label htmlFor="event-end">End time (optional)</label>
              <input id="event-end" type="time" value={form.endTime} onChange={setField('endTime')} />
            </div>
          </div>
          <div className="form-field">
            <label htmlFor="event-type">Event type</label>
            <select id="event-type" value={form.eventType} onChange={setField('eventType')}>
              <option value="">Choose a type</option>
              {EVENT_TYPES.map((type) => (
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
          <button type="submit" disabled={busy}>
            {busy ? 'Adding…' : 'Add event'}
          </button>
        </form>
      </section>
    </main>
  )
}
