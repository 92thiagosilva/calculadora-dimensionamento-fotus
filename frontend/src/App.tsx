import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { Layout } from './components/Layout'
import { RestrictedRoute } from './components/RestrictedRoute'
import { Spinner } from './components/Spinner'
import { ErrorAlert } from './components/ErrorAlert'
import { WizardPage } from './pages/WizardPage'
import { AreaComparePage } from './pages/AreaComparePage'
import { MismatchPage } from './pages/MismatchPage'
import { BdPage } from './pages/BdPage'
import { CalcSettingsPage } from './pages/CalcSettingsPage'

function AppRoutes() {
  const { user, loading, error } = useAuth()

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner label="Carregando…" size="lg" />
      </div>
    )
  }

  // So chega aqui sem `user` se ate o login automatico (identidade padrao
  // "comercial") falhou — normalmente por causa do backend estar fora do ar.
  if (!user) {
    return (
      <div style={{ maxWidth: 480, margin: '4rem auto' }}>
        <ErrorAlert message={error ?? 'Não foi possível conectar à API.'} />
      </div>
    )
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
        <Route
          path="/calc-settings"
          element={
            <RestrictedRoute>
              <CalcSettingsPage />
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
