import { Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth.js'
import './AppLayout.css'

// Giriş yapmış kullanıcıların ortak üst menüsü: kullanıcı adı ve Log out (FR-M1-08)
export default function AppLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <>
      <header className="app-header">
        <span className="app-title">Team Helix</span>
        <span className="app-user">
          {/* Düz metin olarak gösterilir, HTML olarak eklenmez */}
          {user.name}
          <button type="button" onClick={handleLogout}>
            Log out
          </button>
        </span>
      </header>
      <Outlet />
    </>
  )
}
