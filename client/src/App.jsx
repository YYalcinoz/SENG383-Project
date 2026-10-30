import { useEffect, useState } from 'react'

export default function App() {
  const [status, setStatus] = useState('loading...')

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => setStatus(data.status))
      .catch(() => setStatus('unreachable'))
  }, [])

  return (
    <main>
      <h1>Team Helix – Child Development Platform</h1>
      <p>Backend status: {status}</p>
    </main>
  )
}