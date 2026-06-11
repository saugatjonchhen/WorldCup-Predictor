import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/profile`, // user will be redirected here after clicking the link
      })

      if (error) throw error
      setSuccessMsg('Password reset link sent! Please check your email inbox.')
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred while sending reset email.')
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
            <span className="text-3xl">🔑</span>
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold font-display text-gradient">
            Reset Password
          </h2>
          <p className="mt-2 text-center text-sm text-text-secondary">
            Enter your email address to receive a password reset link.
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

        <form className="mt-8 space-y-6" onSubmit={handleReset}>
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
            <button
              type="submit"
              disabled={loading}
              className="w-full btn btn-primary py-3 flex justify-center items-center font-bold text-sm tracking-wide transition-all"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-transparent border-t-text-inverse rounded-full animate-spin" />
              ) : (
                'Send Reset Link'
              )}
            </button>
          </div>
        </form>

        <p className="mt-8 text-center text-xs text-text-secondary">
          Back to{' '}
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
