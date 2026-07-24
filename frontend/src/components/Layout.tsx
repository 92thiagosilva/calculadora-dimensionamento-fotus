import { useState } from 'react'
import type { FormEvent } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { extractErrorMessage } from '../api/client'
import { Modal } from './Modal'
import { ErrorAlert } from './ErrorAlert'
import './Layout.css'

function Logo() {
  return (
    <span className="logo">
      FOTUS<span className="logo__dot">.</span>
    </span>
  )
}

/** Modal simples para trocar de usuário (ex.: identificar-se como acesso restrito). */
function SwitchUserModal({ onClose }: { onClose: () => void }) {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!email.trim()) {
      setError('Informe um e-mail Fotus.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await login(email)
      onClose()
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal title="Trocar de usuário" onClose={onClose}>
      <form onSubmit={handleSubmit} className="switch-user-form">
        <div className="field">
          <label htmlFor="switch-email">E-mail Fotus</label>
          <input
            id="switch-email"
            type="email"
            className="input"
            placeholder="nome.sobrenome@fotus.com.br"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
            autoComplete="email"
          />
        </div>

        <ErrorAlert message={error} />

        <button type="submit" className="btn btn--primary btn--block" disabled={submitting}>
          {submitting ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </Modal>
  )
}

export function Layout() {
  const { user, logout } = useAuth()
  const isRestrito = user?.role === 'restrito'
  const [switching, setSwitching] = useState(false)

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar__brand">
          <Logo />
          <span className="topbar__subtitle">Calculadora de Dimensionamento</span>
        </div>

        <nav className="topbar__nav">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
            Dimensionar
          </NavLink>
          <NavLink to="/area" className={({ isActive }) => (isActive ? 'active' : '')}>
            Comparativo de Área
          </NavLink>
          {isRestrito && (
            <>
              <NavLink to="/mismatch" className={({ isActive }) => (isActive ? 'active' : '')}>
                Mismatch
              </NavLink>
              <NavLink to="/bd" className={({ isActive }) => (isActive ? 'active' : '')}>
                Base de Dados
              </NavLink>
              <NavLink to="/calc-settings" className={({ isActive }) => (isActive ? 'active' : '')}>
                Configurações
              </NavLink>
            </>
          )}
        </nav>

        <div className="topbar__user">
          {user && (
            <>
              <button
                type="button"
                className="topbar__user-info topbar__user-info--button"
                onClick={() => setSwitching(true)}
                title="Trocar de usuário"
              >
                <span className="topbar__user-name">{user.name}</span>
                <span className="topbar__user-role">
                  {user.role === 'restrito' ? 'Acesso restrito' : 'Comercial'}
                </span>
              </button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={logout}>
                Sair
              </button>
            </>
          )}
        </div>
      </header>

      <main className="app-content">
        <Outlet />
      </main>

      {switching && <SwitchUserModal onClose={() => setSwitching(false)} />}
    </div>
  )
}
