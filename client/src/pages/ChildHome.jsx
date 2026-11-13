import ModuleList from '../components/ModuleList.jsx'
import { useAuth } from '../auth/useAuth.js'

const MODULES = [
  { label: 'My tasks' },
  { label: 'My schedule', path: '/child/schedule' },
]

export default function ChildHome() {
  const { user } = useAuth()

  return (
    <main>
      <h1>Child home</h1>
      <h2>Welcome, {user.name}</h2>
      <ModuleList modules={MODULES} />
    </main>
  )
}
