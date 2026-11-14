import { ROLE_HOME } from './roles.js'

// Sadece uygulama içi ve güvenli karakterlerden oluşan yollar kabul edilir: tek bir "/" ile
// başlar ("//" başka bir siteyi gösterir) ve ters eğik çizgi, boşluk, tab ya da satır sonu
// içermez. Tarayıcılar "\" karakterini "/" gibi okur ve URL'deki tab ile satır sonlarını
// siler; yani "/\evil.example.com" ve "/<tab>/evil.example.com" aslında "//evil.example.com"
// demektir. Güvenli karakterler RFC 3986'daki yol karakterleridir (harf, rakam, - . _ ~ ! $ &
// ' ( ) * + , ; = : @, %-kodlamaları ve /); başka her şey reddedilir.
const SAFE_PATH = /^\/(?!\/)[\w\-.~!$&'()*+,;=:@%/]*$/

// Giriş sonrası nereye gidileceği: kullanıcı korumalı bir sayfadan login'e atıldıysa orası,
// yoksa rolünün ana sayfası. Hedef URL'den değil, yalnızca React Router'ın location.state'inden
// okunur (URL parametresi açık yönlendirme riski taşır) ve sadece güvenli bir uygulama içi yol
// kabul edilir. search ve hash, güvenli bir yolun ardına eklendiği için hedef siteyi değiştiremez.
export function afterLoginPath(user, location) {
  const from = location?.state?.from
  const path = from?.pathname
  if (typeof path === 'string' && SAFE_PATH.test(path) && path !== '/login') {
    return path + (from.search ?? '') + (from.hash ?? '')
  }
  return ROLE_HOME[user.role] ?? '/'
}
