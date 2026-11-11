import { useEffect, useState } from 'react'
import { apiFetch } from '../api.js'
import Loading from './Loading.jsx'
import ModuleList from './ModuleList.jsx'
import './ChildList.css'

// Kullanıcının çocuklarını (GET /api/children) listeler ve her çocuğun altında o çocuğun
// modül linklerini gösterir. Linkler yalnızca backend'in döndürdüğü çocuklardan üretilir;
// erişim kontrolü yine backend'deki requireChildAccess'tedir.
//
// basePath: rolün ana yolu ('/parent' veya '/specialist')
// modules: [{ label, slug? }]. Sayfası henüz yoksa slug verme; sayfa eklenince slug ekle,
// madde {basePath}/children/{childId}/{slug} adresine giden bir linke dönüşür.
export default function ChildList({ title, basePath, modules, emptyMessage }) {
  const [state, setState] = useState({ status: 'loading' })

  useEffect(() => {
    // Sayfa cevaptan önce kapanırsa (ör. logout) gelen cevap state'e yazılmaz
    let ignore = false

    apiFetch('/api/children')
      .then((data) => {
        // Beklenmeyen bir cevap sayfayı çökertmesin, hata olarak gösterilsin
        if (!Array.isArray(data?.children)) throw new Error('Unexpected response from the server')
        if (!ignore) setState({ status: 'ready', children: data.children })
      })
      .catch((err) => {
        if (!ignore) setState({ status: 'error', message: err.message })
      })

    return () => {
      ignore = true
    }
  }, [])

  return (
    <section className="child-list" aria-labelledby="child-list-title">
      <h2 id="child-list-title">{title}</h2>
      {state.status === 'loading' && <Loading />}
      {state.status === 'error' && <p role="alert">{state.message}</p>}
      {state.status === 'ready' && state.children.length === 0 && <p>{emptyMessage}</p>}
      {state.status === 'ready' &&
        state.children.map((child) => (
          <article key={child.id} className="child-card" aria-labelledby={`child-${child.id}`}>
            <h3 id={`child-${child.id}`}>
              {child.specialistType ? `${child.name} (${child.specialistType})` : child.name}
            </h3>
            <ModuleList
              label={`${child.name} modules`}
              modules={modules.map(({ label, slug }) => ({
                label,
                path: slug
                  ? `${basePath}/children/${encodeURIComponent(child.id)}/${slug}`
                  : undefined,
              }))}
            />
          </article>
        ))}
    </section>
  )
}
