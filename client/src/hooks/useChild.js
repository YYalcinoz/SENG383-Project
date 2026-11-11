import { useEffect, useState } from 'react'
import { apiFetch } from '../api.js'

// Backend'in kabul ettiği id biçimi (pozitif tamsayı). URL'ye başka bir şey yazılırsa
// API'ye hiç istek atılmaz.
export const VALID_CHILD_ID = /^[1-9]\d{0,9}$/

// Bir modül sayfasının başlığı için URL'deki çocuğu bulur:
//   const { status, child, error } = useChild(childId)
// status: 'loading' | 'ready' | 'error'. ready ise child = { id, name, specialistType? }.
//
// Çocuk, kullanıcının görebildiği çocuklar listesinden (GET /api/children) bulunur; listede
// yoksa "Child not found" döner. Bu yalnızca arayüz içindir: modülün kendi endpoint'i yine
// requireChildAccess ile korunur ve asıl kontrol oradadır.
export function useChild(childId) {
  const validId = VALID_CHILD_ID.test(childId ?? '')
  // Sonuç hangi childId için olduğunu tutar; id değişince eski çocuk bir an bile gösterilmez
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (!validId) return
    // Sayfa cevaptan önce kapanırsa ya da id değişirse gelen cevap state'e yazılmaz
    let ignore = false

    apiFetch('/api/children')
      .then((data) => {
        if (!Array.isArray(data?.children)) throw new Error('Unexpected response from the server')
        const child = data.children.find((c) => String(c.id) === childId)
        if (!child) throw new Error('Child not found')
        if (!ignore) setResult({ childId, status: 'ready', child })
      })
      .catch((err) => {
        if (!ignore) setResult({ childId, status: 'error', error: err.message })
      })

    return () => {
      ignore = true
    }
  }, [childId, validId])

  if (!validId) return { status: 'error', child: null, error: 'Child not found' }
  if (!result || result.childId !== childId) return { status: 'loading', child: null, error: null }
  return { status: result.status, child: result.child ?? null, error: result.error ?? null }
}
