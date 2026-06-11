import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

/**
 * Wraps admin-only routes. Redirects non-admin users to /dashboard.
 * Shows a loading spinner while the auth state and profile are loading.
 */
export function AdminGuard() {
  const { profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-transparent border-t-green-400 rounded-full animate-spin" />
      </div>
    )
  }

  // Redirect to dashboard if the user is not an admin
  if (profile?.role !== 'admin') {
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}
