import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertCircle, ScanLine } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { Spinner } from '@/components/shared/common'
import { BrandPanel } from './BrandPanel'

export function Login() {
  const login = useAuthStore((s) => s.login)
  const isLoading = useAuthStore((s) => s.isLoading)
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await login(email, password)
      navigate('/')
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ?? 'Invalid email or password.'
      setError(detail)
    }
  }

  return (
    <div className="flex min-h-screen bg-surface-900">
      <BrandPanel />

      {/* Form side */}
      <div className="flex flex-1 items-center justify-center px-6 lg:w-2/5">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-gradient-to-br from-ice-500 to-ai-500">
              <ScanLine className="h-5 w-5 text-surface-900" />
            </div>
            <span className="text-lg font-semibold text-surface-50">
              Docu<span className="text-ice-400">Flow</span>
            </span>
          </div>

          <h2 className="text-xl font-semibold text-surface-50">Welcome back</h2>
          <p className="mt-1 text-sm text-surface-muted">
            Sign in to your workspace to continue.
          </p>

          <div className="card-elevated mt-6 p-6">
            {error && (
              <div className="mb-4 flex items-start gap-2 rounded border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-400">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm text-surface-100">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input"
                  placeholder="you@company.com"
                />
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-sm text-surface-100">Password</label>
                  <button
                    type="button"
                    className="text-xs text-ice-400 hover:text-ice-500"
                  >
                    Forgot password?
                  </button>
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input"
                  placeholder="••••••••"
                />
              </div>
              <button type="submit" disabled={isLoading} className="btn-primary w-full">
                {isLoading ? <Spinner /> : <ScanLine className="h-4 w-4" />}
                Sign in
              </button>
            </form>
          </div>

          <p className="mt-6 text-center text-sm text-surface-muted">
            New organization?{' '}
            <Link to="/register" className="text-ice-400 hover:text-ice-500">
              Create one →
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
