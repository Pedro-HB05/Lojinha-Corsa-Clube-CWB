import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, authStorage } from '../services/api'
import type { AuthResponse, Role } from '../types'

interface AuthContextValue {
  user: AuthResponse | null
  loading: boolean
  login(email: string, password: string): Promise<AuthResponse>
  register(data: { email: string; password: string; fullName: string; phone?: string; membershipNumber?: string }): Promise<AuthResponse>
  logout(): void
  hasRole(role: Role): boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthResponse | null>(() => {
    const session = authStorage.read<AuthResponse>()
    if (!session || new Date(session.expiresAt).getTime() <= Date.now()) {
      authStorage.clear()
      return null
    }
    return session
  })
  const [loading, setLoading] = useState(false)

  const save = useCallback((session: AuthResponse) => {
    authStorage.write(session)
    setUser(session)
    return session
  }, [])

  const logout = useCallback(() => {
    authStorage.clear()
    setUser(null)
  }, [])

  useEffect(() => {
    window.addEventListener('auth:expired', logout)
    return () => window.removeEventListener('auth:expired', logout)
  }, [logout])

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    async login(email, password) {
      setLoading(true)
      try { return save(await api.post<AuthResponse>('/auth/login', { email, password })) }
      finally { setLoading(false) }
    },
    async register(data) {
      setLoading(true)
      try { return save(await api.post<AuthResponse>('/auth/register', data)) }
      finally { setLoading(false) }
    },
    logout,
    hasRole: role => Boolean(user?.roles?.includes(role)),
  }), [user, loading, save, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return value
}
