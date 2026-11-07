import { useContext } from 'react'
import { AuthContext } from './context.js'

// { user, status, login, logout } döner; AuthProvider dışında kullanılırsa hata verir
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
