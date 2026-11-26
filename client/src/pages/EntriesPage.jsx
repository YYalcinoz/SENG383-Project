import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiFetch } from '../api.js'
import { useAuth } from '../auth/useAuth.js'
import { ROLE_HOME } from '../auth/roles.js'
import Loading from '../components/Loading.jsx'
import { useChild, VALID_CHILD_ID } from '../hooks/useChild.js'
import { byEntryDate, ENTRY_TYPES, entryTypeLabel, isEntry } from '../utils/entries.js'
import { areaLabel, DEVELOPMENT_AREAS } from '../utils/tasks.js'
import { formatDate, today } from '../utils/week.js'
import './EntriesPage.css'

const EMPTY_FORM = { entryDate: '', entryType: '', developmentArea: '', title: '', observationText: '' }

// Eksik alanlar istek atılmadan gösterilir (FR-M5-02); sıra formdaki ve backend'deki sırayla aynı.
// Diğer hatalar (ör. gelecek tarih) backend'den gelir.
function missingField(form) {
  if (!form.entryDate) return 'Date is required'
  if (!ENTRY_TYPES.some(({ value }) => value === form.entryType)) return 'Choose an entry type'
  if (!DEVELOPMENT_AREAS.some(({ value }) => value === form.developmentArea)) return 'Choose a development area'
  if (!form.title.trim()) return 'Title is required'
  if (!form.observationText.trim()) return 'Text is required'
  return null
}

const toBody = (form) => ({
  entryDate: form.entryDate,
  entryType: form.entryType,
  developmentArea: form.developmentArea,
  title: form.title.trim(),
  observationText: form.observationText.trim(),
})

// Ekleme ve düzenleme için aynı form. idPrefix, sayfada iki form birden açıkken label'ların
// doğru alana bağlanması için. onSave başarısız olursa fırlattığı hata formda gösterilir ve
// yazılanlar kaybolmaz. onCancel verilirse (düzenleme) Cancel butonu çıkar ve ilk alana odaklanılır.
function EntryForm({ idPrefix, label, initial = EMPTY_FORM, submitLabel, busyLabel, onSave, onCancel }) {
  const [form, setForm] = useState(initial)
  const [error, setError] = useState('')
  // İstek sürerken buton kapalı, ikinci istek atılmaz
  const [busy, setBusy] = useState(false)
  const firstField = useRef(null)
  const editing = Boolean(onCancel)

  useEffect(() => {
    if (editing) firstField.current?.focus()
  }, [editing])

  const setField = (name) => (event) => setForm((prev) => ({ ...prev, [name]: event.target.value }))
  const id = (name) => `${idPrefix}-${name}`

  async function handleSubmit(event) {
    event.preventDefault()
    if (busy) return // çift tıklama ikinci bir istek atmasın

    const missing = missingField(form)
    if (missing) return setError(missing)

    setError('')
    setBusy(true)
    try {
      await onSave(toBody(form))
      // Ekleme formu bir sonraki giriş için boşalır; düzenleme formu zaten kapanır
      if (!editing) setForm(EMPTY_FORM)
    } catch (err) {
      // Backend mesajı olduğu gibi gösterilir (ör. "Date cannot be in the future")
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    // noValidate: kontrolü tarayıcı yerine biz yapıyoruz, mesaj hep aynı yerde çıksın
    <form className="entry-form" aria-label={label} onSubmit={handleSubmit} noValidate>
      <div className="form-row">
        <div className="form-field">
          <label htmlFor={id('date')}>Date</label>
          {/* max: takvim gelecek günleri seçtirmez; asıl kontrol backend'de */}
          <input
            id={id('date')}
            ref={firstField}
            type="date"
            max={today()}
            value={form.entryDate}
            onChange={setField('entryDate')}
          />
        </div>
        <div className="form-field">
          <label htmlFor={id('type')}>Entry type</label>
          <select id={id('type')} value={form.entryType} onChange={setField('entryType')}>
            <option value="">Choose a type</option>
            {ENTRY_TYPES.map(({ value, label: typeLabel }) => (
              <option key={value} value={value}>
                {typeLabel}
              </option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label htmlFor={id('area')}>Development area</label>
          <select id={id('area')} value={form.developmentArea} onChange={setField('developmentArea')}>
            <option value="">Choose an area</option>
            {DEVELOPMENT_AREAS.map(({ value, label: areaName }) => (
              <option key={value} value={value}>
                {areaName}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="form-field">
        <label htmlFor={id('title')}>Title</label>
        <input id={id('title')} type="text" maxLength={200} value={form.title} onChange={setField('title')} />
      </div>
      <div className="form-field">
        <label htmlFor={id('text')}>Text</label>
        <textarea
          id={id('text')}
          maxLength={5000}
          value={form.observationText}
          onChange={setField('observationText')}
        />
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="form-buttons">
        <button type="submit" disabled={busy}>
          {busy ? busyLabel : submitLabel}
        </button>
        {editing && (
          <button type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}

// FR-M5-01 … FR-M5-06: the parent and linked specialists see all of the child's entries;
// a linked specialist adds entries and edits their own. Access is enforced by the backend
// (requireRole and requireChildAccess, and only the author may edit); this page only
// hides what a user cannot do anyway. The child has no route to this page.
export default function EntriesPage() {
  const { childId } = useParams()
  const { user } = useAuth()
  const validId = VALID_CHILD_ID.test(childId)
  const childState = useChild(childId)
  const home = ROLE_HOME[user.role]
  const isSpecialist = user.role === 'specialist'

  const path = `/api/children/${encodeURIComponent(childId)}/entries`

  // Giriş listesi: { path, status: 'ready' | 'error', entries?, message? }. path, sonucun hangi
  // çocuğa ait olduğunu tutar; çocuk değişince eski çocuğun girişleri bir an bile gösterilmez.
  const [result, setResult] = useState(null)
  const [notice, setNotice] = useState('')
  // Düzenlenen girişin id'si; aynı anda tek giriş düzenlenir
  const [editingId, setEditingId] = useState(null)

  // Düzenleme kapanınca (Save ya da Cancel) odak o girişin Edit butonuna döner, sayfanın
  // başına düşmez. Butonlar id'ye göre tutulur; odak, buton ekrana geldikten sonra verilir.
  const editButtons = useRef(new Map())
  const returnFocusTo = useRef(null)

  useEffect(() => {
    if (editingId !== null || returnFocusTo.current === null) return
    editButtons.current.get(returnFocusTo.current)?.focus()
    returnFocusTo.current = null
  }, [editingId])

  useEffect(() => {
    if (!validId) return
    // Sayfa cevaptan önce kapanırsa ya da çocuk değişirse gelen cevap state'e yazılmaz
    let ignore = false

    apiFetch(path)
      .then((data) => {
        if (!Array.isArray(data?.entries) || !data.entries.every(isEntry)) {
          throw new Error('Unexpected response from the server')
        }
        if (!ignore) setResult({ path, status: 'ready', entries: [...data.entries].sort(byEntryDate) })
      })
      .catch((err) => {
        if (!ignore) setResult({ path, status: 'error', message: err.message })
      })

    return () => {
      ignore = true
    }
  }, [path, validId])

  const load = result?.path === path ? result : { status: 'loading' }

  // Listedeki girişleri değiştirir; sonuç başka bir çocuğa aitse dokunmaz
  const updateEntries = (change) =>
    setResult((prev) =>
      prev?.path === path && prev.status === 'ready'
        ? { ...prev, entries: change(prev.entries).sort(byEntryDate) }
        : prev,
    )

  async function addEntry(body) {
    setNotice('')
    const { entry } = await apiFetch(path, { method: 'POST', body })
    if (!isEntry(entry)) throw new Error('Unexpected response from the server')
    updateEntries((entries) => [...entries, entry])
    setNotice(`Entry added: ${entry.title}`)
  }

  async function saveEntry(id, body) {
    setNotice('')
    const { entry } = await apiFetch(`${path}/${id}`, { method: 'PATCH', body })
    if (!isEntry(entry)) throw new Error('Unexpected response from the server')
    updateEntries((entries) => entries.map((e) => (e.id === id ? entry : e)))
    setNotice(`Entry saved: ${entry.title}`)
    closeEditor(id)
  }

  function startEditing(id) {
    setNotice('')
    setEditingId(id)
  }

  function closeEditor(id) {
    returnFocusTo.current = id
    setEditingId(null)
  }

  // Önce çocuk, sonra liste hatası gösterilir (geçersiz id'de hiç istek atılmaz)
  const pageError =
    childState.status === 'error' ? childState.error : load.status === 'error' ? load.message : null

  if (pageError) {
    return (
      <main className="entries-page">
        <h1>Specialist entries</h1>
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
    <main className="entries-page">
      <h1>Specialist entries</h1>
      <h2>{child.name}</h2>
      <Link to={home}>Back to home</Link>

      <p role="status" className="notice">
        {notice}
      </p>

      <section aria-labelledby="entry-list-title">
        <h3 id="entry-list-title">Entries</h3>
        {load.status === 'loading' ? (
          <Loading />
        ) : load.entries.length === 0 ? (
          <p>No entries yet.</p>
        ) : (
          <ul className="entry-list" aria-label="Entries">
            {load.entries.map((entry) => (
              <li key={entry.id} className="entry-item" aria-labelledby={`entry-${entry.id}`}>
                {editingId === entry.id ? (
                  <>
                    <strong id={`entry-${entry.id}`} className="entry-title">
                      Editing: {entry.title}
                    </strong>
                    <EntryForm
                      idPrefix={`edit-${entry.id}`}
                      label={`Edit ${entry.title}`}
                      initial={{
                        entryDate: entry.entryDate,
                        entryType: entry.entryType,
                        developmentArea: entry.developmentArea,
                        title: entry.title,
                        observationText: entry.observationText,
                      }}
                      submitLabel="Save"
                      busyLabel="Saving…"
                      onSave={(body) => saveEntry(entry.id, body)}
                      onCancel={() => closeEditor(entry.id)}
                    />
                  </>
                ) : (
                  <>
                    <div className="entry-heading">
                      <strong id={`entry-${entry.id}`} className="entry-title">
                        {entry.title}
                      </strong>
                      {/* FR-M5-05: düzenlendiği yazıyla da belirtilir, renk tek başına anlam taşımaz */}
                      {entry.isEdited && <span className="entry-edited">Edited</span>}
                    </div>
                    <p className="entry-meta">
                      {entryTypeLabel(entry.entryType)} · {areaLabel(entry.developmentArea)} ·{' '}
                      {formatDate(entry.entryDate)} · by {entry.authorName}
                    </p>
                    <p className="entry-text">{entry.observationText}</p>
                    {/* Backend de sadece yazarın düzenlemesine izin verir (FR-M5-04) */}
                    {entry.isOwn && (
                      <button
                        type="button"
                        className="entry-edit"
                        aria-label={`Edit ${entry.title}`}
                        ref={(button) => {
                          if (button) editButtons.current.set(entry.id, button)
                          else editButtons.current.delete(entry.id)
                        }}
                        onClick={() => startEditing(entry.id)}
                        disabled={editingId !== null}
                      >
                        Edit
                      </button>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* FR-M5-01: sadece uzman ekler; ebeveyn formu hiç görmez (backend de reddeder) */}
      {isSpecialist && (
        <section aria-labelledby="add-entry-title">
          <h3 id="add-entry-title">Add an entry</h3>
          <EntryForm
            idPrefix="new-entry"
            label="Add an entry"
            submitLabel="Add entry"
            busyLabel="Adding…"
            onSave={addEntry}
          />
        </section>
      )}
    </main>
  )
}
