import { Navigate, Route, Routes } from 'react-router-dom'
import RedirectIfAuthenticated from './auth/RedirectIfAuthenticated.jsx'
import RootRedirect from './auth/RootRedirect.jsx'
import ChildHome from './pages/ChildHome.jsx'
import LoginPage from './pages/LoginPage.jsx'
import ParentHome from './pages/ParentHome.jsx'
import SpecialistHome from './pages/SpecialistHome.jsx'

// Yeni sayfa eklemek için: sayfa bileşenini src/pages altında yaz ve buraya bir <Route> ekle,
// ör. <Route path="/parent/children/:childId/tasks" element={<TasksPage />} />
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route
        path="/login"
        element={
          <RedirectIfAuthenticated>
            <LoginPage />
          </RedirectIfAuthenticated>
        }
      />
      <Route path="/parent" element={<ParentHome />} />
      <Route path="/specialist" element={<SpecialistHome />} />
      <Route path="/child" element={<ChildHome />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
