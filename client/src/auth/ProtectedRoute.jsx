import { Navigate, useLocation } from 'react-router-dom'
import Loading from '../components/Loading.jsx'
import { useAuth } from './useAuth.js'
import { ROLE_HOME } from './roles.js'

// Kullanım: <ProtectedRoute roles={['parent']}>...</ProtectedRoute>
// Bu kontrol yalnızca kullanıcı deneyimi içindir; asıl güvenlik backend'dedir (FR-M1-06).
export default function ProtectedRoute({ roles, children }) {
  const { user, status } = useAuth()
  const location = useLocation()

  // /me cevabı gelmeden yönlendirme yapma, yoksa her yenilemede login'e atılırdı
  if (status === 'loading') return <Loading />

  if (status !== 'authenticated') {
    // Geldiği sayfayı URL'ye değil location.state'e koyuyoruz
    const from = { pathname: location.pathname, search: location.search, hash: location.hash }
    return <Navigate to="/login" replace state={{ from }} />
  }

  // Yanlış rol: sayfayı render etme, kullanıcıyı kendi ana sayfasına gönder (FR-M1-05)
  if (roles && !roles.includes(user.role)) {
    return <Navigate to={ROLE_HOME[user.role] ?? '/login'} replace />
  }

  return children
}
