import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const navigate = useNavigate()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setErrorMsg(null)

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) throw error
      navigate('/dashboard')
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred during sign in.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 py-12 sm:px-6 lg:px-8">
      {/* Background elements */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-brand-glow via-transparent to-transparent opacity-40 pointer-events-none" />

      <div className="w-full max-w-md space-y-8 glass p-8 rounded-2xl shadow-lg border border-border/80">
        <div className="flex flex-col items-center">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-brand-muted border border-brand/20 shadow-brand animate-pulse">
            <span className="text-3xl">🏆</span>
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold font-display text-gradient">
            Welcome Back
          </h2>
          <p className="mt-2 text-center text-sm text-text-secondary">
            Predict matches, join pools, and compete with friends!
          </p>
        </div>

        {errorMsg && (
          <div className="p-3 text-sm rounded-md bg-live-muted border border-live text-live animate-shake">
            {errorMsg}
          </div>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleLogin}>
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-text-secondary mb-1">
                Email Address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg bg-surface-2 border border-border text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none transition-colors"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label htmlFor="password" className="block text-sm font-medium text-text-secondary">
                  Password
                </label>
                <Link
                  to="/forgot-password"
                  className="text-xs font-semibold text-brand hover:text-brand-dim transition-colors"
                >
                  Forgot your password?
                </Link>
              </div>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg bg-surface-2 border border-border text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none transition-colors"
                placeholder="••••••••"
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="w-full btn btn-primary py-3 flex justify-center items-center font-bold text-sm tracking-wide transition-all"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-transparent border-t-text-inverse rounded-full animate-spin" />
              ) : (
                'Sign In'
              )}
            </button>
          </div>
        </form>

        <p className="mt-8 text-center text-xs text-text-secondary">
          Don't have an account?{' '}
          <Link
            to="/register"
            className="font-bold text-brand hover:text-brand-dim transition-colors"
          >
            Create an Account
          </Link>
        </p>
      </div>
    </div>
  )
}
