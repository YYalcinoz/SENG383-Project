// Testlerde ortak kullanılan fetch yardımcıları

export const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

// fetch mock'u için: her istekte yeni bir Response üretir (bir Response'un gövdesi yalnızca
// bir kez okunabilir). Parent ve specialist ana sayfalarının istediği /api/children boş liste
// döner; diğer tüm istekler verilen cevabı alır.
// Kullanım: vi.spyOn(globalThis, 'fetch').mockImplementation(respondWith({ user }))
export const respondWith = (body, status = 200) => async (url) =>
  url === '/api/children' ? jsonResponse({ children: [] }) : jsonResponse(body, status)
