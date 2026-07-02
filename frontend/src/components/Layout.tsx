import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import './Layout.css'

function Logo() {
  return (
    <span className="logo">
      FOTUS<span className="logo__dot">.</span>
    </span>
  )
}

export function Layout() {
  const { user, logout } = useAuth()
  const isRestrito = user?.role === 'restrito'

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
            </>
          )}
        </nav>

        <div className="topbar__user">
          {user && (
            <>
              <div className="topbar__user-info">
                <span className="topbar__user-name">{user.name}</span>
                <span className="topbar__user-role">
                  {user.role === 'restrito' ? 'Acesso restrito' : 'Comercial'}
                </span>
              </div>
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
    </div>
  )
}
