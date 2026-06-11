import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

export default function Landing() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-transparent border-t-brand rounded-full animate-spin" />
      </div>
    )
  }

  if (user) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Background Gradient */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-brand-glow via-transparent to-transparent opacity-50 pointer-events-none" />

      {/* Navbar */}
      <header className="glass border-b border-border/60 sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="text-2xl">🏆</span>
          <span className="font-display font-black text-xl tracking-tight text-gradient">
            WC26 Predictor
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <Link to="/login" className="btn btn-ghost btn-sm font-bold">
            Sign In
          </Link>
          <Link to="/register" className="btn btn-primary btn-sm font-bold shadow-brand">
            Join Stadium
          </Link>
        </div>
      </header>

      {/* Hero Content */}
      <main className="flex-1 flex flex-col justify-center items-center text-center px-4 py-20 max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-muted border border-brand/20 text-brand text-xs font-semibold uppercase tracking-wider mb-6 animate-pulse">
          ⚽ FIFA World Cup 2026 Prediction League
        </div>

        <h1 className="text-4xl sm:text-6xl font-black font-display leading-tight tracking-tight mb-6">
          Predict the Glory. <br />
          <span className="text-gradient">Compete with Friends.</span>
        </h1>

        <p className="text-lg sm:text-xl text-text-secondary max-w-2xl mb-10 leading-relaxed">
          Join the ultimate prediction league for the FIFA World Cup 2026. Make predictions on all 104 matches, earn points based on accuracy, and create private pools to compete with friends.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center w-full sm:w-auto">
          <Link to="/register" className="btn btn-primary btn-lg font-bold text-base px-8 py-4 w-full sm:w-auto shadow-brand">
            Get Started Free
          </Link>
          <Link to="/login" className="btn btn-secondary btn-lg font-bold text-base px-8 py-4 w-full sm:w-auto">
            Join a Pool
          </Link>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-20 w-full text-left">
          <div className="glass p-6 rounded-xl border border-border/80 flex flex-col gap-3 card-hover">
            <span className="text-2xl">🎯</span>
            <h3 className="font-display font-bold text-lg text-text-primary">Match Predictions</h3>
            <p className="text-sm text-text-secondary">
              Predict scores before kickoff. Earn points for correct outcome, exact scores, goal difference, and goal counts.
            </p>
          </div>

          <div className="glass p-6 rounded-xl border border-border/80 flex flex-col gap-3 card-hover">
            <span className="text-2xl">🤝</span>
            <h3 className="font-display font-bold text-lg text-text-primary">Private & Public Pools</h3>
            <p className="text-sm text-text-secondary">
              Create custom prediction pools, invite friends via unique codes, and trash-talk your way to the top of your mini-leagues.
            </p>
          </div>

          <div className="glass p-6 rounded-xl border border-border/80 flex flex-col gap-3 card-hover">
            <span className="text-2xl">📈</span>
            <h3 className="font-display font-bold text-lg text-text-primary">Live Pool Standings</h3>
            <p className="text-sm text-text-secondary">
              Watch standings update instantly when matches finish. Track your pool rank and performance metrics in real-time.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 py-6 text-center text-xs text-text-muted">
        © 2026 World Cup Predictor League. All rights reserved.
      </footer>
    </div>
  )
}
