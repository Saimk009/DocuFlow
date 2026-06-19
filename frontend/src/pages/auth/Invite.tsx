import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { api, API_PREFIX } from '@/lib/api'
import { setToken } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { useTenantStore } from '@/store/tenantStore'
import { Spinner, Mono } from '@/components/shared/common'
import type { Tenant, User } from '@/types'
import { AuthLayout } from './AuthLayout'

interface AcceptResponse {
  access_token: string
  user: User
  tenant: Tenant
}

export function Invite() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const setUser = useAuthStore((s) => s.setUser)
  const setTenant = useTenantStore((s) => s.setTenant)
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!token) return
    setLoading(true)
    try {
      const data = await api.post<AcceptResponse>(
        `${API_PREFIX}/auth/accept-invite`,
        { token, full_name: fullName, password },
      )
      setToken(data.access_token)
      setUser(data.user)
      setTenant(data.tenant)
      toast.success('Welcome to the team')
      navigate('/')
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ?? 'Could not accept invitation'
      toast.error(detail)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title="Accept your invitation"
      subtitle="Set up your account to join the workspace."
    >
      <div className="mb-4 rounded border border-surface-border bg-surface-900 px-3 py-2 text-xs text-surface-muted">
        Invite token: <Mono className="text-ice-400">{token?.slice(0, 12)}…</Mono>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm text-surface-100">Your name</label>
          <input
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="input"
            placeholder="Jane Doe"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm text-surface-100">Password</label>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
            placeholder="At least 8 characters"
          />
        </div>
        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading && <Spinner />}
          Join workspace
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-surface-muted">
        <Link to="/login" className="text-ice-400 hover:text-ice-500">
          Back to sign in
        </Link>
      </p>
    </AuthLayout>
  )
}
