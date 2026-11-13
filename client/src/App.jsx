import { Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './auth/ProtectedRoute.jsx'
import RedirectIfAuthenticated from './auth/RedirectIfAuthenticated.jsx'
import RootRedirect from './auth/RootRedirect.jsx'
import AppLayout from './components/AppLayout.jsx'
import ChildHome from './pages/ChildHome.jsx'
import LinkedSpecialistsPage from './pages/LinkedSpecialistsPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import ParentHome from './pages/ParentHome.jsx'
import SchedulePage from './pages/SchedulePage.jsx'
import SpecialistHome from './pages/SpecialistHome.jsx'

// Yeni sayfa eklemek için: sayfa bileşenini src/pages altında yaz ve o rolün <Route> grubuna ekle,
// ör. parent için <Route path="/parent/children/:childId/tasks" element={<TasksPage />} />.
// Her rol grubu kendi rolüne korumalıdır, yanlış rol sayfayı hiç görmez.
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

      <Route
        element={
          <ProtectedRoute roles={['parent']}>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/parent" element={<ParentHome />} />
        <Route path="/parent/children/:childId/specialists" element={<LinkedSpecialistsPage />} />
        <Route path="/parent/children/:childId/schedule" element={<SchedulePage />} />
      </Route>

      <Route
        element={
          <ProtectedRoute roles={['specialist']}>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/specialist" element={<SpecialistHome />} />
        <Route path="/specialist/children/:childId/schedule" element={<SchedulePage />} />
      </Route>

      <Route
        element={
          <ProtectedRoute roles={['child']}>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/child" element={<ChildHome />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
