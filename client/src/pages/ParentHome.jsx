import ChildList from '../components/ChildList.jsx'
import { useAuth } from '../auth/useAuth.js'

// Her çocuğun altında gösterilen modüller; sayfası eklenince slug ekle (ör. slug: 'tasks')
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
      <ChildList
        title="Your children"
        basePath="/parent"
        modules={MODULES}
        emptyMessage="No children are registered to your account yet."
      />
    </main>
  )
}
