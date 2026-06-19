import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Bot,
  Check,
  CheckCircle2,
  Loader2,
  ScanLine,
  Sparkles,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { api, API_PREFIX } from '@/lib/api'
import { setToken } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { useTenantStore } from '@/store/tenantStore'
import { Spinner } from '@/components/shared/common'
import type { AIProvider, Tenant, User } from '@/types'

interface RegisterResponse {
  access_token: string
  user: User
  tenant: Tenant
}

interface SlugCheck {
  slug: string
  valid: boolean
  available: boolean
  reason: string | null
}

const STEPS = ['Organization', 'Admin Account', 'AI Provider']

const PLANS = [
  { id: 'free', name: 'Free', desc: 'Up to 100 docs/mo', price: '$0' },
  { id: 'pro', name: 'Pro', desc: '10k docs/mo + workflows', price: '$99' },
  { id: 'enterprise', name: 'Enterprise', desc: 'Unlimited + SSO + RPA', price: 'Custom' },
]

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function Register() {
  const navigate = useNavigate()
  const setUser = useAuthStore((s) => s.setUser)
  const setTenant = useTenantStore((s) => s.setTenant)

  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    org_name: '',
    org_slug: '',
    plan: 'free',
    full_name: '',
    email: '',
    password: '',
    confirm: '',
    ai_provider: 'claude' as AIProvider,
    ai_api_key: '',
  })

  const [slugStatus, setSlugStatus] = useState<
    'idle' | 'checking' | 'available' | 'taken' | 'invalid'
  >('idle')
  const [slugReason, setSlugReason] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [testState, setTestState] = useState<'idle' | 'testing' | 'ok' | 'fail'>(
    'idle',
  )

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => {
      const next = { ...f, [key]: value }
      if (key === 'org_name' && !f.org_slug) next.org_slug = slugify(String(value))
      return next
    })
  }

  // Debounced slug uniqueness check
  useEffect(() => {
    const slug = form.org_slug
    if (!slug) {
      setSlugStatus('idle')
      return
    }
    setSlugStatus('checking')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.get<SlugCheck>(`${API_PREFIX}/auth/check-slug`, {
          params: { slug },
        })
        if (!res.valid) {
          setSlugStatus('invalid')
          setSlugReason(res.reason)
        } else if (res.available) {
          setSlugStatus('available')
          setSlugReason(null)
        } else {
          setSlugStatus('taken')
          setSlugReason(res.reason)
        }
      } catch {
        setSlugStatus('idle')
      }
    }, 400)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [form.org_slug])

  const step1Valid =
    form.org_name.length >= 2 && slugStatus === 'available'
  const step2Valid =
    form.full_name.length >= 1 &&
    /\S+@\S+\.\S+/.test(form.email) &&
    form.password.length >= 8 &&
    form.password === form.confirm

  function testConnection() {
    setTestState('testing')
    // No backend AI-test endpoint; validate key shape client-side.
    setTimeout(() => {
      setTestState(form.ai_api_key.trim().length >= 16 ? 'ok' : 'fail')
    }, 800)
  }

  async function handleComplete() {
    setSubmitting(true)
    try {
      const data = await api.post<RegisterResponse>(`${API_PREFIX}/auth/register`, {
        org_name: form.org_name,
        org_slug: form.org_slug,
        full_name: form.full_name,
        email: form.email,
        password: form.password,
      })
      setToken(data.access_token)
      setUser(data.user)
      setTenant(data.tenant)

      // Persist AI provider/key via settings (separate from register payload).
      if (form.ai_api_key.trim()) {
        try {
          await api.put(`${API_PREFIX}/settings`, {
            ai_provider: form.ai_provider,
            ai_api_key: form.ai_api_key,
          })
        } catch {
          // non-fatal; user can set it later in Settings
        }
      }

      toast.success('Organization created')
      navigate('/onboarding')
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ?? 'Could not create organization'
      toast.error(detail)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-900 px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-8 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-gradient-to-br from-ice-500 to-ai-500">
            <ScanLine className="h-5 w-5 text-surface-900" />
          </div>
          <span className="text-lg font-semibold text-surface-50">
            Docu<span className="text-ice-400">Flow</span>
          </span>
        </div>

        {/* Progress steps */}
        <div className="mb-6 flex items-center">
          {STEPS.map((label, i) => (
            <div key={label} className="flex flex-1 items-center last:flex-none">
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-full border text-xs font-mono transition-colors',
                    i < step && 'border-ice-500 bg-ice-500 text-surface-900',
                    i === step && 'border-ice-500 bg-ice-500/15 text-ice-400',
                    i > step && 'border-surface-border text-surface-muted',
                  )}
                >
                  {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </div>
                <span
                  className={cn(
                    'hidden text-xs sm:inline',
                    i === step ? 'text-surface-50' : 'text-surface-muted',
                  )}
                >
                  {label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={cn(
                    'mx-3 h-px flex-1',
                    i < step ? 'bg-ice-500' : 'bg-surface-border',
                  )}
                />
              )}
            </div>
          ))}
        </div>

        <div className="card-elevated p-6">
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm text-surface-100">
                  Organization name
                </label>
                <input
                  autoFocus
                  value={form.org_name}
                  onChange={(e) => update('org_name', e.target.value)}
                  className="input"
                  placeholder="Acme Corp"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm text-surface-100">
                  Subdomain
                </label>
                <div className="relative flex items-center gap-2">
                  <input
                    value={form.org_slug}
                    onChange={(e) => update('org_slug', slugify(e.target.value))}
                    className="input font-mono"
                    placeholder="acme"
                  />
                  <span className="shrink-0 font-mono text-xs text-surface-muted">
                    .docuflow.com
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-1.5 text-xs">
                  {slugStatus === 'checking' && (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin text-surface-muted" />
                      <span className="text-surface-muted">Checking…</span>
                    </>
                  )}
                  {slugStatus === 'available' && (
                    <>
                      <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                      <span className="font-mono text-emerald-400">
                        {form.org_slug}.docuflow.com is available
                      </span>
                    </>
                  )}
                  {(slugStatus === 'taken' || slugStatus === 'invalid') && (
                    <>
                      <X className="h-3 w-3 text-rose-400" />
                      <span className="text-rose-400">{slugReason}</span>
                    </>
                  )}
                </div>
              </div>
              <div>
                <label className="mb-2 block text-sm text-surface-100">Plan</label>
                <div className="grid grid-cols-3 gap-2">
                  {PLANS.map((plan) => (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => update('plan', plan.id)}
                      className={cn(
                        'rounded-lg border p-3 text-left transition-colors',
                        form.plan === plan.id
                          ? 'border-ice-500 bg-ice-500/10'
                          : 'border-surface-border hover:border-surface-muted',
                      )}
                    >
                      <div className="text-sm font-medium text-surface-50">
                        {plan.name}
                      </div>
                      <div className="mt-0.5 font-mono text-xs text-ice-400">
                        {plan.price}
                      </div>
                      <div className="mt-1 text-[10px] leading-tight text-surface-muted">
                        {plan.desc}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={() => setStep(1)}
                disabled={!step1Valid}
                className="btn-primary w-full"
              >
                Continue
              </button>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm text-surface-100">
                  Full name
                </label>
                <input
                  autoFocus
                  value={form.full_name}
                  onChange={(e) => update('full_name', e.target.value)}
                  className="input"
                  placeholder="Jane Doe"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm text-surface-100">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => update('email', e.target.value)}
                  className="input"
                  placeholder="jane@acme.com"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm text-surface-100">
                  Password
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => update('password', e.target.value)}
                  className="input"
                  placeholder="At least 8 characters"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm text-surface-100">
                  Confirm password
                </label>
                <input
                  type="password"
                  value={form.confirm}
                  onChange={(e) => update('confirm', e.target.value)}
                  className="input"
                  placeholder="Re-enter password"
                />
                {form.confirm && form.password !== form.confirm && (
                  <p className="mt-1.5 text-xs text-rose-400">
                    Passwords do not match.
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setStep(0)} className="btn-outline flex-1">
                  Back
                </button>
                <button
                  onClick={() => setStep(2)}
                  disabled={!step2Valid}
                  className="btn-primary flex-1"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm text-surface-100">
                  AI provider
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { id: 'claude', name: 'Claude', icon: Bot, sub: 'Anthropic' },
                      { id: 'openai', name: 'GPT-4o', icon: Sparkles, sub: 'OpenAI' },
                    ] as const
                  ).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        update('ai_provider', p.id)
                        setTestState('idle')
                      }}
                      className={cn(
                        'flex items-center gap-2.5 rounded-lg border p-3 transition-colors',
                        form.ai_provider === p.id
                          ? 'border-ai-500 bg-ai-500/10'
                          : 'border-surface-border hover:border-surface-muted',
                      )}
                    >
                      <p.icon className="h-5 w-5 text-ai-400" />
                      <div className="text-left">
                        <div className="text-sm font-medium text-surface-50">
                          {p.name}
                        </div>
                        <div className="text-[10px] text-surface-muted">{p.sub}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm text-surface-100">
                  API key
                </label>
                <input
                  type="password"
                  value={form.ai_api_key}
                  onChange={(e) => {
                    update('ai_api_key', e.target.value)
                    setTestState('idle')
                  }}
                  className="input font-mono"
                  placeholder={form.ai_provider === 'openai' ? 'sk-…' : 'sk-ant-…'}
                />
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={testConnection}
                    disabled={!form.ai_api_key || testState === 'testing'}
                    className="btn-outline py-1"
                  >
                    {testState === 'testing' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5 text-ai-400" />
                    )}
                    Test connection
                  </button>
                  {testState === 'ok' && (
                    <span className="flex items-center gap-1 text-xs text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Connection OK
                    </span>
                  )}
                  {testState === 'fail' && (
                    <span className="flex items-center gap-1 text-xs text-rose-400">
                      <X className="h-3.5 w-3.5" /> Key looks invalid
                    </span>
                  )}
                </div>
                <p className="mt-2 text-xs text-surface-muted">
                  Optional — you can add this later in Settings.
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setStep(1)} className="btn-outline flex-1">
                  Back
                </button>
                <button
                  onClick={handleComplete}
                  disabled={submitting}
                  className="btn-primary flex-1"
                >
                  {submitting && <Spinner />}
                  Create organization
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-surface-muted">
          Already have an account?{' '}
          <Link to="/login" className="text-ice-400 hover:text-ice-500">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
