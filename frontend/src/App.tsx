import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { Layout } from './components/Layout'
import { RestrictedRoute } from './components/RestrictedRoute'
import { Spinner } from './components/Spinner'
import { LoginPage } from './pages/LoginPage'
import { WizardPage } from './pages/WizardPage'
import { AreaComparePage } from './pages/AreaComparePage'
import { MismatchPage } from './pages/MismatchPage'
import { BdPage } from './pages/BdPage'

function AppRoutes() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner label="Carregando…" size="lg" />
      </div>
    )
  }

  if (!user) {
    return <LoginPage />
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<WizardPage />} />
        <Route path="/area" element={<AreaComparePage />} />
        <Route
          path="/mismatch"
          element={
            <RestrictedRoute>
              <MismatchPage />
            </RestrictedRoute>
          }
        />
        <Route
          path="/bd"
          element={
            <RestrictedRoute>
              <BdPage />
            </RestrictedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
