import ChildList from '../components/ChildList.jsx'
import { useAuth } from '../auth/useAuth.js'

// Her çocuğun altında gösterilen modüller; sayfası eklenince slug ekle (ör. slug: 'tasks')
const MODULES = [
  { label: 'Tasks' },
  { label: 'Schedule', slug: 'schedule' },
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
      <ChildList
        title="Children linked to you"
        basePath="/specialist"
        modules={MODULES}
        emptyMessage="No children are linked to you yet. A parent can link you from their child's Specialists page."
      />
    </main>
  )
}
