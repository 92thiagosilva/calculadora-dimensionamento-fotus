import type { ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'

/**
 * Envolve paginas restritas (Mismatch, BD). Se o usuario logado nao tiver
 * role "restrito", mostra uma mensagem de acesso negado em vez do conteudo —
 * a pagina nunca chega a ser renderizada para quem nao deveria ve-la.
 */
export function RestrictedRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth()

  if (user?.role !== 'restrito') {
    return (
      <div className="empty-state card">
        <h2>Acesso restrito</h2>
        <p>
          Esta área é reservada à equipe de engenharia autorizada. Se você acredita que deveria
          ter acesso, contate o time responsável pelo catálogo.
        </p>
      </div>
    )
  }

  return <>{children}</>
}
