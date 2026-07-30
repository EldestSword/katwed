import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { LoadingScreen } from '../../components/LoadingScreen'
import { useAuth } from './AuthProvider'

export function RequireHost() {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <LoadingScreen message="Checking host access…" />
  if (!user) return <Navigate to="/host/login" replace state={{ from: location.pathname }} />
  return <Outlet />
}
