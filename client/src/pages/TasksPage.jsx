import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiFetch } from '../api.js'
import { useAuth } from '../auth/useAuth.js'
import { ROLE_HOME } from '../auth/roles.js'
import Loading from '../components/Loading.jsx'
import { useChild, VALID_CHILD_ID } from '../hooks/useChild.js'
import { areaLabel, byDueDate, DEVELOPMENT_AREAS, isTask, statusLabel } from '../utils/tasks.js'
import { formatDate } from '../utils/week.js'
import './TasksPage.css'

const EMPTY_FORM = { title: '', description: '', developmentArea: '', dueDate: '' }

// FR-M4-01, FR-M4-02, FR-M4-07: the parent and linked specialists see all of the child's
// tasks and assign new ones. Access is enforced by the backend (requireChildAccess and
// requireRole); this page only shows what the API returns.
export default function TasksPage() {
  const { childId } = useParams()
  const { user } = useAuth()
  const validId = VALID_CHILD_ID.test(childId)
  const childState = useChild(childId)
  const home = ROLE_HOME[user.role]

  const path = `/api/children/${encodeURIComponent(childId)}/tasks`

  // Görev listesi: { path, status: 'ready' | 'error', tasks?, message? }. path, sonucun hangi
  // çocuğa ait olduğunu tutar; çocuk değişince eski çocuğun görevleri bir an bile gösterilmez.
  const [result, setResult] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')
  // İstek sürerken buton kapalı, ikinci istek atılmaz
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!validId) return
    // Sayfa cevaptan önce kapanırsa ya da çocuk değişirse gelen cevap state'e yazılmaz
    let ignore = false

    apiFetch(path)
      .then((data) => {
        if (!Array.isArray(data?.tasks) || !data.tasks.every(isTask)) {
          throw new Error('Unexpected response from the server')
        }
        if (!ignore) setResult({ path, status: 'ready', tasks: [...data.tasks].sort(byDueDate) })
      })
      .catch((err) => {
        if (!ignore) setResult({ path, status: 'error', message: err.message })
      })

    return () => {
      ignore = true
    }
  }, [path, validId])

  const load = result?.path === path ? result : { status: 'loading' }

  const setField = (name) => (event) => setForm((prev) => ({ ...prev, [name]: event.target.value }))

  async function handleAssign(event) {
    event.preventDefault()
    if (busy) return // çift tıklama ikinci bir istek atmasın
    setNotice('')

    // Eksik alanlar istek atılmadan gösterilir (FR-M4-02); diğer hatalar backend'den gelir
    if (!form.title.trim()) return setFormError('Title is required')
    if (!DEVELOPMENT_AREAS.some(({ value }) => value === form.developmentArea)) {
      return setFormError('Choose a development area')
    }
    if (!form.dueDate) return setFormError('Due date is required')

    setFormError('')
    setBusy(true)
    try {
      const { task: created } = await apiFetch(path, {
        method: 'POST',
        body: {
          title: form.title.trim(),
          description: form.description.trim(),
          developmentArea: form.developmentArea,
          dueDate: form.dueDate,
        },
      })
      if (!isTask(created)) throw new Error('Unexpected response from the server')

      setForm(EMPTY_FORM)
      setNotice(`Task assigned: ${created.title}`)
      setResult((prev) =>
        prev?.path === path && prev.status === 'ready'
          ? { ...prev, tasks: [...prev.tasks, created].sort(byDueDate) }
          : prev,
      )
    } catch (err) {
      // Backend mesajı olduğu gibi gösterilir (ör. "Due date must be a valid date ...")
      setFormError(err.message)
    } finally {
      setBusy(false)
    }
  }

  // Önce çocuk, sonra görev listesi hatası gösterilir (geçersiz id'de hiç istek atılmaz)
  const pageError =
    childState.status === 'error' ? childState.error : load.status === 'error' ? load.message : null

  if (pageError) {
    return (
      <main className="tasks-page">
        <h1>Tasks</h1>
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
    <main className="tasks-page">
      <h1>Tasks</h1>
      <h2>{child.name}</h2>
      <Link to={home}>Back to home</Link>

      <p role="status" className="notice">
        {notice}
      </p>

      <section aria-labelledby="task-list-title">
        <h3 id="task-list-title">Assigned tasks</h3>
        {load.status === 'loading' ? (
          <Loading />
        ) : load.tasks.length === 0 ? (
          <p>No tasks have been assigned yet.</p>
        ) : (
          <ul className="task-list" aria-label="Tasks">
            {load.tasks.map((task) => (
              <li key={task.id} className="task-item">
                <div className="task-heading">
                  <strong className="task-title">{task.title}</strong>
                  <span className="task-status">{statusLabel(task.status)}</span>
                </div>
                {task.description && <p className="task-description">{task.description}</p>}
                <p className="task-meta">
                  {areaLabel(task.developmentArea)} · due {formatDate(task.dueDate)} · assigned by{' '}
                  {task.assignerName}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="assign-title">
        <h3 id="assign-title">Assign a task</h3>
        {/* noValidate: kontrolü tarayıcı yerine biz yapıyoruz, mesaj hep aynı yerde çıksın */}
        <form className="task-form" onSubmit={handleAssign} noValidate>
          <div className="form-field">
            <label htmlFor="task-title">Title</label>
            <input id="task-title" type="text" maxLength={200} value={form.title} onChange={setField('title')} />
          </div>
          <div className="form-field">
            <label htmlFor="task-description">Description (optional)</label>
            <textarea
              id="task-description"
              maxLength={2000}
              value={form.description}
              onChange={setField('description')}
            />
          </div>
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="task-area">Development area</label>
              <select id="task-area" value={form.developmentArea} onChange={setField('developmentArea')}>
                <option value="">Choose an area</option>
                {DEVELOPMENT_AREAS.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="task-due">Due date</label>
              <input id="task-due" type="date" value={form.dueDate} onChange={setField('dueDate')} />
            </div>
          </div>
          {formError && (
            <p role="alert" className="form-error">
              {formError}
            </p>
          )}
          <button type="submit" disabled={busy}>
            {busy ? 'Assigning…' : 'Assign task'}
          </button>
        </form>
      </section>
    </main>
  )
}
