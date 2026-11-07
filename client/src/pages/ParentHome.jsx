import ModuleList from '../components/ModuleList.jsx'
import { useAuth } from '../auth/useAuth.js'

const MODULES = [
  { label: 'Specialists' },
  { label: 'Tasks' },
  { label: 'Schedule' },
  { label: 'Entries' },
  { label: 'Documents' },
  { label: 'Statistics' },
  { label: 'AI summary' },
]

export default function ParentHome() {
  const { user } = useAuth()

  return (
    <main>
      <h1>Parent home</h1>
      <h2>Welcome, {user.name}</h2>
      <ModuleList modules={MODULES} />
    </main>
  )
}
