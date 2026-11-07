import { Navigate } from 'react-router-dom'
import Loading from '../components/Loading.jsx'
import { useAuth } from './useAuth.js'
import { ROLE_HOME } from './roles.js'

// "/" adresi: giriş yapmışsa rolünün ana sayfasına, yapmamışsa login'e gider
export default function RootRedirect() {
  const { user, status } = useAuth()

  if (status === 'loading') return <Loading />

  const home = status === 'authenticated' ? ROLE_HOME[user.role] : undefined
  return <Navigate to={home ?? '/login'} replace />
}
