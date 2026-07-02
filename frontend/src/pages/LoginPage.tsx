import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext'
import { extractErrorMessage } from '../api/client'
import './LoginPage.css'

export function LoginPage() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!email.trim()) {
      setError('Informe seu e-mail Fotus.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await login(email)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card card">
        <span className="logo login-card__logo">
          FOTUS<span className="logo__dot">.</span>
        </span>
        <h1 className="login-card__title">Calculadora de Dimensionamento</h1>
        <p className="muted">Entre com seu e-mail corporativo para continuar.</p>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="field">
            <label htmlFor="email">Seu e-mail Fotus</label>
            <input
              id="email"
              type="email"
              className="input"
              placeholder="nome.sobrenome@fotus.com.br"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              autoComplete="email"
            />
          </div>

          {error && (
            <div className="alert alert--danger" role="alert">
              {error}
            </div>
          )}

          <button type="submit" className="btn btn--primary btn--block" disabled={submitting}>
            {submitting ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <p className="login-note">Login temporário (SSO Microsoft 365 em breve)</p>
      </div>
    </div>
  )
}
