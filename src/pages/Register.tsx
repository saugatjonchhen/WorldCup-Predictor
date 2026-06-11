import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

export default function Register() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const navigate = useNavigate()

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    // Form validation
    if (username.length < 3) {
      setErrorMsg('Username must be at least 3 characters long.')
      setLoading(false)
      return
    }

    try {
      // 1. Sign up user
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username: username.toLowerCase().trim(),
            display_name: displayName.trim(),
          },
        },
      })

      if (error) throw error

      // If email confirmation is required, show message
      if (data?.session === null) {
        setSuccessMsg('Registration successful! Please check your email for a verification link.')
      } else {
        // Logged in immediately
        navigate('/dashboard')
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred during registration.')
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
            <span className="text-3xl">🏟️</span>
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold font-display text-gradient">
            Join the Stadium
          </h2>
          <p className="mt-2 text-center text-sm text-text-secondary">
            Create an account to start predicting match outcomes!
          </p>
        </div>

        {errorMsg && (
          <div className="p-3 text-sm rounded-md bg-live-muted border border-live text-live animate-shake">
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="p-3 text-sm rounded-md bg-brand-muted border border-brand text-brand">
            {successMsg}
          </div>
        )}

        <form className="mt-8 space-y-4" onSubmit={handleRegister}>
          <div className="space-y-3">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-text-secondary mb-1">
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-2 rounded-lg bg-surface-2 border border-border text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none transition-colors"
                placeholder="soccerfan99"
              />
            </div>

            <div>
              <label htmlFor="displayName" className="block text-sm font-medium text-text-secondary mb-1">
                Display Name (Optional)
              </label>
              <input
                id="displayName"
                name="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-4 py-2 rounded-lg bg-surface-2 border border-border text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none transition-colors"
                placeholder="John Doe"
              />
            </div>

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
                className="w-full px-4 py-2 rounded-lg bg-surface-2 border border-border text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none transition-colors"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-text-secondary mb-1">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 rounded-lg bg-surface-2 border border-border text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none transition-colors"
                placeholder="••••••••"
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full btn btn-primary py-3 flex justify-center items-center font-bold text-sm tracking-wide transition-all"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-transparent border-t-text-inverse rounded-full animate-spin" />
              ) : (
                'Create Account'
              )}
            </button>
          </div>
        </form>

        <p className="mt-8 text-center text-xs text-text-secondary">
          Already have an account?{' '}
          <Link
            to="/login"
            className="font-bold text-brand hover:text-brand-dim transition-colors"
          >
            Sign In
          </Link>
        </p>
      </div>
    </div>
  )
}
