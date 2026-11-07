import ModuleList from '../components/ModuleList.jsx'
import { useAuth } from '../auth/useAuth.js'

const MODULES = [
  { label: 'My children' },
  { label: 'Tasks' },
  { label: 'Schedule' },
  { label: 'Entries' },
  { label: 'Documents' },
  { label: 'Statistics' },
  { label: 'AI summary' },
]

export default function SpecialistHome() {
  const { user } = useAuth()

  return (
    <main>
      <h1>Specialist home</h1>
      <h2>Welcome, {user.name}</h2>
      <ModuleList modules={MODULES} />
    </main>
  )
}
