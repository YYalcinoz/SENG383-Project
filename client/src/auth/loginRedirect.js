import { ROLE_HOME } from './roles.js'

// Giriş sonrası nereye gidileceği: kullanıcı korumalı bir sayfadan login'e atıldıysa orası,
// yoksa rolünün ana sayfası. Hedef URL'den değil, yalnızca React Router'ın location.state'inden
// okunur (URL parametresi açık yönlendirme riski taşır) ve sadece uygulama içi yol kabul edilir.
export function afterLoginPath(user, location) {
  const from = location?.state?.from
  const path = from?.pathname
  if (typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') && path !== '/login') {
    return path + (from.search ?? '') + (from.hash ?? '')
  }
  return ROLE_HOME[user.role] ?? '/'
}
