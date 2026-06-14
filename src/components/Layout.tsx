import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import footballImg from '@/assets/football.png'

interface LayoutProps {
  children: ReactNode
}

export function Layout({ children }: LayoutProps) {
  const { user, profile, signOut } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const [isMoreOpen, setIsMoreOpen] = useState(false)

  async function handleLogout() {
    setIsMoreOpen(false)
    await signOut()
    navigate('/')
  }

  const navItems = [
    { label: 'Dashboard', path: '/dashboard', icon: '📊' },
    { label: 'Bracket', path: '/bracket', icon: '🔮' },
    { label: 'Pools', path: '/pools', icon: '🤝' },
    // { label: 'Insights', path: '/insights', icon: '📈' },
    { label: 'Rules', path: '/rules', icon: '📜' },
    { label: 'Profile', path: '/profile', icon: '👤' },
    ...(profile?.role === 'admin'
      ? [
          { label: 'Simulator', path: '/simulator', icon: '⚙️' },
          { label: 'Admin View', path: '/admin/predictions', icon: '🔑' },
        ]
      : []),
  ]

  // Primary mobile items that fit perfectly in the bottom navigation
  const mobilePrimaryItems = [
    { label: 'Dashboard', path: '/dashboard', icon: '📊' },
    { label: 'Bracket', path: '/bracket', icon: '🔮' },
    { label: 'Pools', path: '/pools', icon: '🤝' },
    // { label: 'Insights', path: '/insights', icon: '📈' },
  ]

  // Secondary/More items for the bottom drawer
  const mobileMoreItems = [
    { label: 'Profile', path: '/profile', icon: '👤' },
    { label: 'Rules', path: '/rules', icon: '📜' },
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
          <img src={footballImg} alt="WeAre26" className="w-8 h-8 object-contain drop-shadow-md" />
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
          <button 
            onClick={toggleTheme} 
            className="w-10 h-10 rounded-full border border-border bg-surface-2 flex items-center justify-center hover:border-brand transition-colors text-lg"
            title="Toggle Theme"
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
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
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface-2/90 backdrop-blur-xl border-t border-border/60 px-3 py-2 flex justify-around items-center">
        {mobilePrimaryItems.map((item) => {
          const isActive = location.pathname === item.path
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex-1 flex flex-col items-center gap-0.5 py-1 px-1 rounded-xl transition-all ${
                isActive ? 'text-brand scale-105' : 'text-text-secondary'
              }`}
            >
              <span className="text-xl leading-none">{item.icon}</span>
              <span className="text-[10px] font-bold tracking-tight">{item.label}</span>
            </Link>
          )
        })}

        {/* "More" Trigger Button for mobile navigation */}
        <button
          onClick={() => setIsMoreOpen(true)}
          className={`flex-1 flex flex-col items-center gap-0.5 py-1 px-1 rounded-xl transition-all border-none bg-transparent cursor-pointer ${
            isMoreOpen || mobileMoreItems.some(item => location.pathname === item.path)
              ? 'text-brand scale-105'
              : 'text-text-secondary'
          }`}
        >
          <span className="text-xl leading-none">☰</span>
          <span className="text-[10px] font-bold tracking-tight">More</span>
        </button>
      </div>

      {/* Mobile "More" Bottom Sheet Overlay */}
      {isMoreOpen && (
        <>
          {/* Backdrop */}
          <div
            className="md:hidden fixed inset-0 z-50 bg-black/75 backdrop-blur-sm animate-fade-in"
            onClick={() => setIsMoreOpen(false)}
          />

          {/* Bottom Sheet Drawer */}
          <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-surface-2 border-t border-brand/20 p-6 rounded-t-2xl flex flex-col gap-4 animate-slide-up shadow-lg max-w-md mx-auto">
            {/* Header / Grab Handle */}
            <div className="flex flex-col items-center gap-2 mb-2">
              <div className="w-12 h-1 bg-border rounded-full" />
              <h3 className="font-display font-bold text-sm text-text-secondary uppercase tracking-widest mt-1">
                More Options
              </h3>
            </div>

            {/* Navigation options in the sheet */}
            <div className="flex flex-col gap-2">
              {mobileMoreItems.map((item) => {
                const isActive = location.pathname === item.path
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setIsMoreOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3.5 rounded-xl border border-border/40 font-semibold transition-all ${
                      isActive
                        ? 'bg-brand/10 text-brand border-brand/30'
                        : 'text-text-primary hover:bg-surface-3 hover:text-brand'
                    }`}
                  >
                    <span className="text-xl">{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                )
              })}
            </div>

            <hr className="border-border my-2" />

            {/* Theme Toggle Mobile */}
            <button
              onClick={toggleTheme}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-surface-3 border border-border font-bold hover:text-brand transition-colors"
            >
              <span className="text-xl">{theme === 'dark' ? '☀️' : '🌙'}</span>
              <span>Switch to {theme === 'dark' ? 'Light' : 'Dark'} Mode</span>
            </button>

            {/* Logout action in Mobile menu */}
            <button
              onClick={handleLogout}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-live/10 text-live border border-live/30 font-bold hover:bg-live/20 transition-colors"
            >
              <span>🚪</span>
              <span>Sign Out</span>
            </button>

            {/* Cancel/Close Button */}
            <button
              onClick={() => setIsMoreOpen(false)}
              className="w-full py-3 rounded-xl bg-surface-3 border border-border font-bold text-text-secondary hover:text-text-primary transition-colors mt-1"
            >
              Cancel
            </button>
          </div>
        </>
      )}

      {/* Spacer for mobile bottom nav */}
      <div className="md:hidden h-16" />
    </div>
  )
}
