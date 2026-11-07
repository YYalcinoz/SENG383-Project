import { Navigate } from 'react-router-dom'
import Loading from '../components/Loading.jsx'
import { useAuth } from './useAuth.js'
import { ROLE_HOME } from './roles.js'

// Giriş yapmış kullanıcı login sayfasını görmez, kendi ana sayfasına gider
export default function RedirectIfAuthenticated({ children }) {
  const { user, status } = useAuth()

  // Yüklenirken login formunu göstermiyoruz, yoksa yenilenince form bir an görünür
  if (status === 'loading') return <Loading />

  const home = status === 'authenticated' ? ROLE_HOME[user.role] : undefined
  return home ? <Navigate to={home} replace /> : children
}
