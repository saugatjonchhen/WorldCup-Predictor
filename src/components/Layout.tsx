import type { ReactNode } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

interface LayoutProps {
  children: ReactNode
}

export function Layout({ children }: LayoutProps) {
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  async function handleLogout() {
    await signOut()
    navigate('/')
  }

  const navItems = [
    { label: 'Dashboard', path: '/dashboard', icon: '📊' },
    { label: 'Bracket', path: '/bracket', icon: '🔮' },
    { label: 'Pools', path: '/pools', icon: '🤝' },
    { label: 'Rules', path: '/rules', icon: '📜' },
    { label: 'Profile', path: '/profile', icon: '👤' },
    ...(profile?.role === 'admin'
      ? [
          { label: 'Simulator', path: '/simulator', icon: '⚙️' },
          { label: 'Admin View', path: '/admin/predictions', icon: '🔑' },
        ]
      : []),
  ]

  return (
    <div className="flex flex-col min-h-screen bg-background text-text-primary">
      {/* Background radial gradient */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-brand-glow via-transparent to-transparent opacity-30 pointer-events-none" />

      {/* Top Navbar */}
      <nav className="glass border-b border-border/60 sticky top-0 z-40 px-6 py-4 flex items-center justify-between">
        <Link to="/dashboard" className="flex items-center gap-2">
          <span className="text-2xl">🏆</span>
          <span className="font-display font-black text-lg tracking-tight text-gradient">
            WC26 Predictor
          </span>
        </Link>

        {/* Desktop Navigation Links */}
        <div className="hidden md:flex items-center gap-1 bg-surface-2 border border-border p-1 rounded-xl">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  isActive
                    ? 'bg-brand text-text-inverse shadow-brand'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface-3'
                }`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            )
          })}
        </div>

        {/* User profile dropdown / signout action */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex flex-col items-end text-right">
            <span className="text-sm font-bold">
              {profile?.display_name || profile?.username || user?.email?.split('@')[0]}
            </span>
            <span className="text-xs text-text-secondary">
              @{profile?.username || 'user'}
            </span>
          </div>

          <Link to="/profile" className="w-10 h-10 rounded-full border border-border bg-surface-2 overflow-hidden flex items-center justify-center font-bold text-gradient hover:border-brand transition-colors">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              (profile?.display_name || profile?.username || 'U').charAt(0).toUpperCase()
            )}
          </Link>

          <button
            onClick={handleLogout}
            className="btn btn-ghost btn-sm font-bold text-xs border border-border/40"
          >
            Sign Out
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 py-8 md:px-8">
        {children}
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface/90 backdrop-blur-lg border-t border-border/80 px-6 py-2 flex justify-around items-center">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-lg transition-colors ${
                isActive ? 'text-brand' : 'text-text-secondary'
              }`}
            >
              <span className="text-xl">{item.icon}</span>
              <span className="text-[10px] font-bold tracking-wide">{item.label}</span>
            </Link>
          )
        })}
      </div>

      {/* Spacer for mobile bottom nav */}
      <div className="md:hidden h-16" />
    </div>
  )
}
