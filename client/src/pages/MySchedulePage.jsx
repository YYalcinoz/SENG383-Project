import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../api.js'
import { useAuth } from '../auth/useAuth.js'
import Loading from '../components/Loading.jsx'
import WeekDays from '../components/WeekDays.jsx'
import { byDateAndTime } from '../utils/events.js'
import { addDays, formatDate, isValidDate } from '../utils/week.js'
import './SchedulePage.css'

// Cevap beklenen biçimde değilse sayfa çökmesin, hata olarak gösterilsin
function checkWeek(data) {
  if (!Array.isArray(data?.events) || !isValidDate(data?.weekStart)) {
    throw new Error('Unexpected response from the server')
  }
  return { weekStart: data.weekStart, events: [...data.events].sort(byDateAndTime) }
}

const weekRange = (weekStart) => `${formatDate(weekStart)} – ${formatDate(addDays(weekStart, 6))}`

// FR-M3-04, FR-M1-07: the child sees their own schedule for this week and the events
// coming up next week, read-only. The child's id comes from the logged-in user, not from
// the URL, and GET /api/children is never called (it returns 403 for a child). Access is
// still enforced by the backend (requireChildAccess).
export default function MySchedulePage() {
  const { user } = useAuth()
  const [state, setState] = useState({ status: 'loading' })

  const base = `/api/children/${encodeURIComponent(user.id)}/schedule`

  useEffect(() => {
    // Sayfa cevaptan önce kapanırsa (ör. logout) gelen cevap state'e yazılmaz
    let ignore = false

    async function load() {
      // Hangi haftanın "bu hafta" olduğuna sunucu karar verir; gelecek hafta onun bir hafta sonrası
      const thisWeek = checkWeek(await apiFetch(base))
      const nextWeek = checkWeek(await apiFetch(`${base}?weekStart=${addDays(thisWeek.weekStart, 7)}`))
      return { thisWeek, nextWeek }
    }

    load()
      .then((weeks) => {
        if (!ignore) setState({ status: 'ready', ...weeks })
      })
      .catch((err) => {
        if (!ignore) setState({ status: 'error', message: err.message })
      })

    return () => {
      ignore = true
    }
  }, [base])

  return (
    <main className="schedule-page">
      <h1>My schedule</h1>
      <Link to="/child">Back to home</Link>

      {state.status === 'loading' && <Loading />}

      {state.status === 'error' && (
        <p role="alert" className="form-error">
          {state.message}
        </p>
      )}

      {state.status === 'ready' && (
        <>
          <section aria-labelledby="this-week-title">
            <h2 id="this-week-title">This week</h2>
            <p className="week-range">{weekRange(state.thisWeek.weekStart)}</p>
            <WeekDays weekStart={state.thisWeek.weekStart} events={state.thisWeek.events} dayHeading="h3" />
          </section>

          <section aria-labelledby="next-week-title">
            <h2 id="next-week-title">Coming up next week</h2>
            <p className="week-range">{weekRange(state.nextWeek.weekStart)}</p>
            {state.nextWeek.events.length === 0 ? (
              <p>Nothing planned for next week.</p>
            ) : (
              // Gelecek hafta için sadece etkinliği olan günler gösterilir
              <WeekDays
                weekStart={state.nextWeek.weekStart}
                events={state.nextWeek.events}
                showEmptyDays={false}
                dayHeading="h3"
              />
            )}
          </section>
        </>
      )}
    </main>
  )
}
