import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import type { Role } from '../types'

export function ProtectedRoute({ role }: { role?: Role }) {
  const { user, hasRole } = useAuth()
  const location = useLocation()
  if (!user) return <Navigate to="/entrar" replace state={{ from: location }} />
  if (role && !hasRole(role)) return <Navigate to={hasRole('administrator') ? '/admin' : '/'} replace />
  return <Outlet />
}
