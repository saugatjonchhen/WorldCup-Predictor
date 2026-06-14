import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthGuard } from '@/components/AuthGuard'
import { AdminGuard } from '@/components/AdminGuard'

// Lazy-loaded public pages
const Landing = lazy(() => import('@/pages/Landing'))
const Login = lazy(() => import('@/pages/Login'))
const Register = lazy(() => import('@/pages/Register'))
const ForgotPassword = lazy(() => import('@/pages/ForgotPassword'))

// Lazy-loaded authenticated pages
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const MatchDetail = lazy(() => import('@/pages/MatchDetail'))
const Bracket = lazy(() => import('@/pages/Bracket'))
const Pools = lazy(() => import('@/pages/Pools'))
const PoolDetail = lazy(() => import('@/pages/PoolDetail'))
const Profile = lazy(() => import('@/pages/Profile'))
const Rules = lazy(() => import('@/pages/Rules'))
const Simulator = lazy(() => import('@/pages/Simulator'))
const AdminPredictions = lazy(() => import('@/pages/AdminPredictions'))
const Insights = lazy(() => import('@/pages/Insights'))

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-2 border-transparent border-t-green-400 rounded-full animate-spin" />
    </div>
  )
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />

          {/* Authenticated routes */}
          <Route element={<AuthGuard />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/match/:matchId" element={<MatchDetail />} />
            <Route path="/bracket" element={<Bracket />} />
            <Route path="/pools" element={<Pools />} />
            <Route path="/pools/:poolId" element={<PoolDetail />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/insights" element={<Insights />} />
            <Route path="/rules" element={<Rules />} />
            
            {/* Admin-only routes */}
            <Route element={<AdminGuard />}>
              <Route path="/simulator" element={<Simulator />} />
              <Route path="/admin/predictions" element={<AdminPredictions />} />
            </Route>
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
