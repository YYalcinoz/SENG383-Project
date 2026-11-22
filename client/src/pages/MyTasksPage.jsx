import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../api.js'
import { useAuth } from '../auth/useAuth.js'
import Loading from '../components/Loading.jsx'
import { areaLabel, byDueDate, isTask, statusLabel } from '../utils/tasks.js'
import { formatDate } from '../utils/week.js'
// Görev listesi ve düğme stilleri parent/specialist görev sayfasıyla ortaktır
import './TasksPage.css'

// FR-M4-04, FR-M4-05, FR-M1-07: the child sees their own tasks and marks them as done. The
// child's id comes from the logged-in user, not from the URL, and GET /api/children is never
// called (it returns 403 for a child). Access is still enforced by the backend: only the
// child can mark a task as done (requireRole('child') and requireChildAccess).
export default function MyTasksPage() {
  const { user } = useAuth()
  const path = `/api/children/${encodeURIComponent(user.id)}/tasks`

  // Görev listesi: { path, status: 'ready' | 'error', tasks?, message? }. path, sonucun hangi
  // çocuğa ait olduğunu tutar.
  const [result, setResult] = useState(null)
  // Kaydı süren görevlerin id'leri: o görevin düğmesi kapalı, ikinci istek atılmaz
  const [saving, setSaving] = useState([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  // Hangi görevlerin isteği sürüyor: state sonraki çizime kadar eski kalır, bu yüzden aynı
  // anda gelen ikinci çağrıyı yakalamak için ref kullanılır
  const inFlight = useRef(new Set())

  useEffect(() => {
    // Sayfa cevaptan önce kapanırsa (ör. logout) gelen cevap state'e yazılmaz
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
  }, [path])

  const load = result?.path === path ? result : { status: 'loading' }

  async function markDone(task) {
    if (inFlight.current.has(task.id)) return // çift tıklama ikinci bir istek atmasın
    inFlight.current.add(task.id)
    setError('')
    setNotice('')
    setSaving((ids) => [...ids, task.id])
    try {
      const { task: updated } = await apiFetch(`${path}/${task.id}/done`, { method: 'PATCH' })
      if (!isTask(updated)) throw new Error('Unexpected response from the server')

      setNotice(`Marked as done: ${updated.title}`)
      setResult((prev) =>
        prev?.path === path && prev.status === 'ready'
          ? { ...prev, tasks: prev.tasks.map((t) => (t.id === updated.id ? updated : t)) }
          : prev,
      )
    } catch (err) {
      // Backend mesajı olduğu gibi gösterilir (ör. "Task not found")
      setError(err.message)
    } finally {
      inFlight.current.delete(task.id)
      setSaving((ids) => ids.filter((id) => id !== task.id))
    }
  }

  if (load.status === 'error') {
    return (
      <main className="tasks-page">
        <h1>My tasks</h1>
        <p role="alert" className="form-error">
          {load.message}
        </p>
        <Link to="/child">Back to home</Link>
      </main>
    )
  }

  return (
    <main className="tasks-page">
      <h1>My tasks</h1>
      <Link to="/child">Back to home</Link>

      <p role="status" className="notice">
        {notice}
      </p>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}

      <section aria-labelledby="my-task-list-title">
        <h2 id="my-task-list-title">Your tasks</h2>
        {load.status === 'loading' ? (
          <Loading />
        ) : load.tasks.length === 0 ? (
          <p>You have no tasks right now.</p>
        ) : (
          <ul className="task-list" aria-label="Tasks">
            {load.tasks.map((task) => (
              <li key={task.id} className="task-item">
                <div className="task-heading">
                  <strong className="task-title" id={`task-title-${task.id}`}>
                    {task.title}
                  </strong>
                  <span className="task-status">{statusLabel(task.status)}</span>
                </div>
                {task.description && <p className="task-description">{task.description}</p>}
                <p className="task-meta">
                  {areaLabel(task.developmentArea)} · due {formatDate(task.dueDate)} · assigned by{' '}
                  {task.assignerName}
                </p>
                {task.status === 'todo' && (
                  // Görünen metin aynı kalır; hangi görev olduğu aria-describedby ile okunur
                  <button
                    type="button"
                    disabled={saving.includes(task.id)}
                    aria-describedby={`task-title-${task.id}`}
                    onClick={() => markDone(task)}
                  >
                    {saving.includes(task.id) ? 'Saving…' : 'Mark as done'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
