import { Navigate, useLocation } from 'react-router-dom'
import Loading from '../components/Loading.jsx'
import { useAuth } from './useAuth.js'
import { afterLoginPath } from './loginRedirect.js'
import { ROLE_HOME } from './roles.js'

// Giriş yapmış kullanıcı login sayfasını görmez, gideceği sayfaya yönlendirilir
export default function RedirectIfAuthenticated({ children }) {
  const { user, status } = useAuth()
  const location = useLocation()

  // Yüklenirken login formunu göstermiyoruz, yoksa yenilenince form bir an görünür
  if (status === 'loading') return <Loading />

  // Rolü bilinmiyorsa yönlendirme yok (login'e geri dönen döngüyü önler)
  if (status === 'authenticated' && ROLE_HOME[user.role]) {
    return <Navigate to={afterLoginPath(user, location)} replace />
  }
  return children
}
