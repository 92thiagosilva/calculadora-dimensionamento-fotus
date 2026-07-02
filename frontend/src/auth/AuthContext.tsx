import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { DEV_EMAIL_STORAGE_KEY } from '../api/client'
import { getMe } from '../api/endpoints'
import { extractErrorMessage } from '../api/client'
import type { MeOut } from '../types/api'

interface AuthContextValue {
  user: MeOut | null
  loading: boolean
  error: string | null
  /** Faz login com o e-mail informado, salva no localStorage e busca /api/auth/me. */
  login: (email: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MeOut | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchMe = useCallback(async (email: string) => {
    setLoading(true)
    setError(null)
    try {
      localStorage.setItem(DEV_EMAIL_STORAGE_KEY, email.trim().toLowerCase())
      const me = await getMe()
      setUser(me)
    } catch (err) {
      localStorage.removeItem(DEV_EMAIL_STORAGE_KEY)
      setUser(null)
      setError(extractErrorMessage(err))
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const stored = localStorage.getItem(DEV_EMAIL_STORAGE_KEY)
    if (stored) {
      fetchMe(stored).catch(() => {
        // erro ja armazenado em `error`; permanece na tela de login
      })
    } else {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const login = useCallback(
    async (email: string) => {
      await fetchMe(email)
    },
    [fetchMe],
  )

  const logout = useCallback(() => {
    localStorage.removeItem(DEV_EMAIL_STORAGE_KEY)
    setUser(null)
    setError(null)
  }, [])

  const value = useMemo(
    () => ({ user, loading, error, login, logout }),
    [user, loading, error, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>')
  return ctx
}
