import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiFetch, apiFetchBlob, apiUpload } from '../api.js'
import { useAuth } from '../auth/useAuth.js'
import { ROLE_HOME } from '../auth/roles.js'
import Loading from '../components/Loading.jsx'
import { useChild, VALID_CHILD_ID } from '../hooks/useChild.js'
import {
  ACCEPT,
  byUploadedAt,
  formatSize,
  formatUploadDate,
  isDocument,
  MAX_SIZE,
  typeLabel,
} from '../utils/documents.js'
import './DocumentsPage.css'

// How long a file stays in the browser's memory after it is opened or downloaded. The
// new tab or the download needs it only while it starts, but it must not be freed at once.
export const URL_LIFETIME_MS = 60_000

// Puts a downloaded file in the browser's memory and returns its blob: URL. The type is
// always the document's type from the list, which isDocument has checked to be PDF, PNG or
// JPEG, and never the one in the response: a file is never opened as HTML, which could run
// scripts on the app's own origin.
function objectUrl(blob, mimeType) {
  const url = URL.createObjectURL(new Blob([blob], { type: mimeType }))
  setTimeout(() => URL.revokeObjectURL(url), URL_LIFETIME_MS)
  return url
}

// FR-M6-01 … FR-M6-05: the parent and linked specialists see the child's documents, open
// or download them, and upload new ones. Access is enforced by the backend (requireRole
// and requireChildAccess); the child has no route to this page.
export default function DocumentsPage() {
  const { childId } = useParams()
  const { user } = useAuth()
  const validId = VALID_CHILD_ID.test(childId)
  const childState = useChild(childId)
  const home = ROLE_HOME[user.role]

  const path = `/api/children/${encodeURIComponent(childId)}/documents`

  // The list: { path, status: 'ready' | 'error', documents?, message? }. path records which
  // child the result is for, so another child's documents are never shown, not even for a moment.
  const [result, setResult] = useState(null)
  const [notice, setNotice] = useState('')
  // An error from opening or downloading a document
  const [actionError, setActionError] = useState('')
  // The ids of the documents being opened or downloaded; their buttons are off meanwhile.
  // A set, because another document can be opened while the first one still loads.
  const [busyIds, setBusyIds] = useState(() => new Set())

  const [file, setFile] = useState(null)
  const [uploadError, setUploadError] = useState('')
  // While the upload runs the button is off, so a second request is never sent
  const [uploading, setUploading] = useState(false)
  const fileInput = useRef(null)

  useEffect(() => {
    if (!validId) return
    // A response that arrives after the page is closed or the child changes is ignored
    let ignore = false

    apiFetch(path)
      .then((data) => {
        if (!Array.isArray(data?.documents) || !data.documents.every(isDocument)) {
          throw new Error('Unexpected response from the server')
        }
        if (!ignore) setResult({ path, status: 'ready', documents: [...data.documents].sort(byUploadedAt) })
      })
      .catch((err) => {
        if (!ignore) setResult({ path, status: 'error', message: err.message })
      })

    return () => {
      ignore = true
    }
  }, [path, validId])

  const load = result?.path === path ? result : { status: 'loading' }

  function setBusy(id, busy) {
    setBusyIds((prev) => {
      const next = new Set(prev)
      if (busy) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function chooseFile(event) {
    setFile(event.target.files[0] ?? null)
    setUploadError('')
  }

  async function handleUpload(event) {
    event.preventDefault()
    if (uploading) return // a double click must not send a second request

    setNotice('')
    // FR-M6-06: checked here too, so a large file is not sent only to be rejected
    if (!file) return setUploadError('Choose a file to upload')
    if (file.size > MAX_SIZE) return setUploadError('The file must be at most 10 MB')

    setUploadError('')
    setUploading(true)
    try {
      const { document } = await apiUpload(path, file)
      if (!isDocument(document)) throw new Error('Unexpected response from the server')
      // The list is changed only if it still belongs to this child
      setResult((prev) =>
        prev?.path === path && prev.status === 'ready'
          ? { ...prev, documents: [...prev.documents, document].sort(byUploadedAt) }
          : prev,
      )
      setNotice(`Document uploaded: ${document.name}`)
      setFile(null)
      fileInput.current.value = ''
    } catch (err) {
      // The backend's message is shown as it is (for example "Only PDF, PNG and JPEG files
      // can be uploaded"); the chosen file stays selected
      setUploadError(err.message)
    } finally {
      setUploading(false)
    }
  }

  // FR-M6-04: view a document in a new tab
  async function openDocument(document) {
    setNotice('')
    setActionError('')
    // The tab is opened now, while the click still counts as the user's action; a tab
    // opened after the download would be blocked as a pop-up. It must not be able to
    // reach this page, so its link back (opener) is removed.
    const tab = window.open('', '_blank')
    if (tab) tab.opener = null
    setBusy(document.id, true)
    try {
      const blob = await apiFetchBlob(`${path}/${document.id}/download`)
      const url = objectUrl(blob, document.mimeType)
      if (tab) {
        tab.location.href = url
      } else {
        // Pop-ups are blocked: the document is downloaded instead
        saveFile(url, document.name)
      }
    } catch (err) {
      tab?.close()
      setActionError(err.message)
    } finally {
      setBusy(document.id, false)
    }
  }

  // FR-M6-04: download a document under its name
  async function downloadDocument(document) {
    setNotice('')
    setActionError('')
    setBusy(document.id, true)
    try {
      const blob = await apiFetchBlob(`${path}/${document.id}/download`)
      saveFile(objectUrl(blob, document.mimeType), document.name)
    } catch (err) {
      setActionError(err.message)
    } finally {
      setBusy(document.id, false)
    }
  }

  // The child comes first, then the list's error (an invalid id sends no request at all)
  const pageError =
    childState.status === 'error' ? childState.error : load.status === 'error' ? load.message : null

  if (pageError) {
    return (
      <main className="documents-page">
        <h1>Documents</h1>
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
    <main className="documents-page">
      <h1>Documents</h1>
      <h2>{child.name}</h2>
      <Link to={home}>Back to home</Link>

      <p role="status" className="notice">
        {notice}
      </p>

      <section aria-labelledby="document-list-title">
        <h3 id="document-list-title">Documents</h3>
        {actionError && (
          <p role="alert" className="form-error">
            {actionError}
          </p>
        )}
        {load.status === 'loading' ? (
          <Loading />
        ) : load.documents.length === 0 ? (
          <p>No documents yet.</p>
        ) : (
          <ul className="document-list" aria-label="Documents">
            {load.documents.map((document) => (
              <li key={document.id} className="document-item" aria-labelledby={`document-${document.id}`}>
                {/* FR-M6-03: name, type, uploader and upload date */}
                <strong id={`document-${document.id}`} className="document-name">
                  {document.name}
                </strong>
                <p className="document-meta">
                  {typeLabel(document.mimeType)} · {formatSize(document.sizeBytes)} · uploaded by{' '}
                  {document.uploaderName} on {formatUploadDate(document.uploadedAt)}
                </p>
                <div className="document-buttons">
                  <button
                    type="button"
                    aria-label={`Open ${document.name}`}
                    onClick={() => openDocument(document)}
                    disabled={busyIds.has(document.id)}
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    aria-label={`Download ${document.name}`}
                    onClick={() => downloadDocument(document)}
                    disabled={busyIds.has(document.id)}
                  >
                    Download
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* FR-M6-01: the parent and linked specialists upload */}
      <section aria-labelledby="upload-title">
        <h3 id="upload-title">Upload a document</h3>
        {/* noValidate: the page checks the form, so the message is always in the same place */}
        <form className="upload-form" aria-label="Upload a document" onSubmit={handleUpload} noValidate>
          <div className="form-field">
            <label htmlFor="document-file">File</label>
            <input
              id="document-file"
              ref={fileInput}
              type="file"
              accept={ACCEPT}
              aria-describedby="document-file-hint"
              onChange={chooseFile}
            />
            <small id="document-file-hint">PDF, PNG or JPEG, at most 10 MB</small>
          </div>
          {uploadError && (
            <p role="alert" className="form-error">
              {uploadError}
            </p>
          )}
          <div>
            <button type="submit" disabled={uploading}>
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
          </div>
        </form>
      </section>
    </main>
  )
}

// Starts a download of a blob: URL under the given name
function saveFile(url, name) {
  const link = window.document.createElement('a')
  link.href = url
  link.download = name
  window.document.body.append(link)
  link.click()
  link.remove()
}
