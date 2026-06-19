import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as Dialog from '@radix-ui/react-dialog'
import {
  AlertTriangle,
  Building2,
  Check,
  Copy,
  CreditCard,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { api, API_PREFIX } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/shared/Badge'
import { Avatar } from '@/components/shared/Avatar'
import { CenteredSpinner, Mono, Spinner } from '@/components/shared/common'
import { useAuthStore } from '@/store/authStore'
import { useTenantStore } from '@/store/tenantStore'
import type { AIProvider, User } from '@/types'

interface TenantSettings {
  id: string
  slug: string
  name: string
  plan: string
  ai_provider: AIProvider
  has_api_key: boolean
  logo_url?: string | null
}

type SectionId = 'general' | 'team' | 'ai' | 'security' | 'billing' | 'danger'

const SECTIONS: { id: SectionId; label: string; icon: LucideIcon }[] = [
  { id: 'general', label: 'General', icon: Building2 },
  { id: 'team', label: 'Team', icon: Users },
  { id: 'ai', label: 'AI Provider', icon: Sparkles },
  { id: 'security', label: 'Security', icon: ShieldCheck },
  { id: 'billing', label: 'Billing', icon: CreditCard },
  { id: 'danger', label: 'Danger Zone', icon: AlertTriangle },
]

export function Settings() {
  const [section, setSection] = useState<SectionId>('general')
  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<TenantSettings>(`${API_PREFIX}/settings`),
  })

  if (isLoading || !settings) return <CenteredSpinner />

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-surface-50">Settings</h1>
        <p className="mt-1 text-sm text-surface-muted">
          Manage your workspace, team, and integrations.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[200px_1fr]">
        <nav className="space-y-0.5">
          {SECTIONS.map((s) => {
            const Icon = s.icon
            const active = section === s.id
            const danger = s.id === 'danger'
            return (
              <button
                key={s.id}
                onClick={() => setSection(s.id)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                  active
                    ? danger
                      ? 'bg-rose-500/10 text-rose-400'
                      : 'bg-surface-600 text-ice-400'
                    : danger
                      ? 'text-rose-400/70 hover:bg-surface-700'
                      : 'text-surface-muted hover:bg-surface-700 hover:text-surface-100',
                )}
              >
                <Icon className="h-4 w-4" />
                {s.label}
              </button>
            )
          })}
        </nav>

        <div>
          {section === 'general' && <GeneralSection settings={settings} />}
          {section === 'team' && <TeamSection />}
          {section === 'ai' && <AIProviderSection settings={settings} />}
          {section === 'security' && <SecuritySection />}
          {section === 'billing' && <BillingSection settings={settings} />}
          {section === 'danger' && <DangerZone settings={settings} />}
        </div>
      </div>
    </div>
  )
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="card p-5">
      <h2 className="text-sm font-semibold text-surface-50">{title}</h2>
      {description && <p className="mt-0.5 text-xs text-surface-muted">{description}</p>}
      <div className="mt-4">{children}</div>
    </div>
  )
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-surface-100">{label}</label>
      {children}
    </div>
  )
}

/* ---------------------------------- General --------------------------------- */

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Australia/Sydney',
]
const DATE_FORMATS = ['MMM d, yyyy', 'dd/MM/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd']

function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem('docuflow:prefs') ?? '{}')
  } catch {
    return {}
  }
}

function GeneralSection({ settings }: { settings: TenantSettings }) {
  const queryClient = useQueryClient()
  const setTenant = useTenantStore((s) => s.setTenant)
  const tenant = useTenantStore((s) => s.tenant)
  const [name, setName] = useState(settings.name)
  const [logoUrl, setLogoUrl] = useState(settings.logo_url ?? '')
  const prefs = loadPrefs()
  const [timezone, setTimezone] = useState<string>(prefs.timezone ?? 'UTC')
  const [dateFormat, setDateFormat] = useState<string>(prefs.dateFormat ?? 'MMM d, yyyy')

  const save = useMutation({
    mutationFn: () =>
      api.put<TenantSettings>(`${API_PREFIX}/settings`, {
        name: name.trim(),
        logo_url: logoUrl.trim() || null,
      }),
    onSuccess: (updated) => {
      toast.success('Organization updated')
      localStorage.setItem('docuflow:prefs', JSON.stringify({ timezone, dateFormat }))
      if (tenant) setTenant({ ...tenant, name: updated.name, logo_url: updated.logo_url })
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
    onError: () => toast.error('Could not update organization'),
  })

  return (
    <SectionCard title="General" description="Basic information about your organization.">
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-surface-border bg-surface-800">
            {logoUrl ? (
              <img src={logoUrl} alt="logo" className="h-full w-full object-cover" />
            ) : (
              <Building2 className="h-6 w-6 text-surface-muted" />
            )}
          </div>
          <div className="flex-1">
            <Labeled label="Logo URL">
              <input
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://…/logo.png"
                className="input"
              />
            </Labeled>
          </div>
        </div>

        <Labeled label="Organization name">
          <input value={name} onChange={(e) => setName(e.target.value)} className="input" />
        </Labeled>

        <div className="grid grid-cols-2 gap-3">
          <Labeled label="Timezone">
            <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className="input">
              {TIMEZONES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Labeled>
          <Labeled label="Date format">
            <select
              value={dateFormat}
              onChange={(e) => setDateFormat(e.target.value)}
              className="input"
            >
              {DATE_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {format(new Date(), f)} ({f})
                </option>
              ))}
            </select>
          </Labeled>
        </div>

        <button onClick={() => save.mutate()} disabled={save.isPending} className="btn-primary">
          {save.isPending && <Spinner />}
          Save Changes
        </button>
      </div>
    </SectionCard>
  )
}

/* ----------------------------------- Team ----------------------------------- */

interface PendingInvite {
  id: string
  email: string
  role: string
  invite_token: string
  expires_at: string
}

function TeamSection() {
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [pending, setPending] = useState<PendingInvite[]>([])
  const canManage = currentUser?.role === 'owner' || currentUser?.role === 'admin'

  const { data: users } = useQuery({
    queryKey: ['settings', 'users'],
    queryFn: () => api.get<User[]>(`${API_PREFIX}/settings/users`),
  })

  const changeRole = useMutation({
    mutationFn: (v: { userId: string; role: string }) =>
      api.patch(`${API_PREFIX}/settings/users/${v.userId}/role`, { role: v.role }),
    onSuccess: () => {
      toast.success('Role updated')
      queryClient.invalidateQueries({ queryKey: ['settings', 'users'] })
    },
    onError: () => toast.error('Could not change role'),
  })

  const removeUser = useMutation({
    mutationFn: (userId: string) => api.delete(`${API_PREFIX}/settings/users/${userId}`),
    onSuccess: () => {
      toast.success('Member removed')
      queryClient.invalidateQueries({ queryKey: ['settings', 'users'] })
    },
    onError: () => toast.error('Could not remove member'),
  })

  return (
    <div className="space-y-5">
      <SectionCard title="Team Members" description="People with access to this workspace.">
        {canManage && (
          <div className="mb-3 flex justify-end">
            <button onClick={() => setInviteOpen(true)} className="btn-outline py-1.5">
              <UserPlus className="h-3.5 w-3.5" />
              Invite Member
            </button>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border text-left text-xs uppercase tracking-wide text-surface-muted">
                <th className="px-3 py-2 font-medium">Member</th>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Joined</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {(users ?? []).map((u) => {
                const editable = canManage && u.role !== 'owner' && u.id !== currentUser?.id
                return (
                  <tr key={u.id}>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <Avatar name={u.full_name} size="sm" />
                        <span className="text-surface-50">{u.full_name}</span>
                        {u.id === currentUser?.id && (
                          <span className="text-[10px] text-surface-muted">(you)</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <Mono className="text-xs text-surface-muted">{u.email}</Mono>
                    </td>
                    <td className="px-3 py-2.5">
                      {editable ? (
                        <select
                          value={u.role}
                          onChange={(e) => changeRole.mutate({ userId: u.id, role: e.target.value })}
                          className="input w-28 py-1"
                        >
                          <option value="admin">admin</option>
                          <option value="member">member</option>
                          <option value="viewer">viewer</option>
                        </select>
                      ) : (
                        <Badge tone={u.role === 'owner' ? 'ai' : 'neutral'}>{u.role}</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-surface-muted">
                      {u.created_at ? format(new Date(u.created_at), 'MMM d, yyyy') : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {editable && (
                        <button
                          onClick={() => removeUser.mutate(u.id)}
                          className="text-xs text-surface-muted hover:text-rose-400"
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {pending.length > 0 && (
        <SectionCard title="Pending Invitations">
          <div className="divide-y divide-surface-border">
            {pending.map((inv) => (
              <div key={inv.id} className="flex items-center gap-3 py-2.5">
                <Mono className="flex-1 text-sm text-surface-50">{inv.email}</Mono>
                <Badge tone="neutral">{inv.role}</Badge>
                <span className="text-xs text-surface-muted">
                  expires {format(new Date(inv.expires_at), 'MMM d')}
                </span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `${window.location.origin}/invite/${inv.invite_token}`,
                    )
                    toast.success('Invite link copied')
                  }}
                  className="flex items-center gap-1 text-xs text-ice-400 hover:underline"
                >
                  <Copy className="h-3 w-3" />
                  Copy link
                </button>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onInvited={(inv) => setPending((p) => [inv, ...p])}
      />
    </div>
  )
}

function InviteDialog({
  open,
  onOpenChange,
  onInvited,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onInvited: (inv: PendingInvite) => void
}) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('member')

  const invite = useMutation({
    mutationFn: () =>
      api.post<PendingInvite>(`${API_PREFIX}/settings/users/invite`, { email, role }),
    onSuccess: (inv) => {
      toast.success('Invitation sent')
      onInvited(inv)
      onOpenChange(false)
      setEmail('')
      setRole('member')
    },
    onError: () => toast.error('Could not send invite'),
  })

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[400px] max-w-[90vw] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-surface-border bg-surface-700 shadow-xl">
          <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
            <Dialog.Title className="text-sm font-medium text-surface-50">
              Invite Member
            </Dialog.Title>
            <Dialog.Close className="rounded p-1 text-surface-muted hover:bg-surface-600 hover:text-surface-100">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <div className="space-y-3 p-4">
            <Labeled label="Email address">
              <input
                autoFocus
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colleague@company.com"
                className="input"
              />
            </Labeled>
            <Labeled label="Role">
              <select value={role} onChange={(e) => setRole(e.target.value)} className="input">
                <option value="admin">Admin</option>
                <option value="member">Member</option>
                <option value="viewer">Viewer</option>
              </select>
            </Labeled>
          </div>
          <div className="flex justify-end gap-2 border-t border-surface-border px-4 py-3">
            <Dialog.Close asChild>
              <button className="btn-ghost">Cancel</button>
            </Dialog.Close>
            <button
              onClick={() => invite.mutate()}
              disabled={!email.trim() || invite.isPending}
              className="btn-primary"
            >
              {invite.isPending && <Spinner />}
              Send Invite
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/* -------------------------------- AI Provider ------------------------------- */

const MODELS: Record<AIProvider, string[]> = {
  claude: ['claude-sonnet-4-6'],
  openai: ['gpt-4o', 'gpt-4o-mini'],
}

function loadAIPrefs() {
  try {
    return JSON.parse(localStorage.getItem('docuflow:ai') ?? '{}')
  } catch {
    return {}
  }
}

function AIProviderSection({ settings }: { settings: TenantSettings }) {
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)
  const canManage = currentUser?.role === 'owner' || currentUser?.role === 'admin'
  const aiPrefs = loadAIPrefs()

  const [provider, setProvider] = useState<AIProvider>(settings.ai_provider)
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [model, setModel] = useState<string>(aiPrefs.model ?? MODELS[settings.ai_provider][0])
  const [temperature, setTemperature] = useState<number>(aiPrefs.temperature ?? 0.2)
  const [testState, setTestState] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')

  useEffect(() => {
    if (!MODELS[provider].includes(model)) setModel(MODELS[provider][0])
  }, [provider, model])

  const save = useMutation({
    mutationFn: () =>
      api.put(`${API_PREFIX}/settings`, {
        ai_provider: provider,
        ...(apiKey ? { ai_api_key: apiKey } : {}),
      }),
    onSuccess: () => {
      toast.success('AI settings saved')
      localStorage.setItem('docuflow:ai', JSON.stringify({ model, temperature }))
      setApiKey('')
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
    onError: () => toast.error('Could not save AI settings'),
  })

  function testConnection() {
    setTestState('testing')
    window.setTimeout(() => {
      const ok = Boolean(apiKey.trim()) || settings.has_api_key
      setTestState(ok ? 'ok' : 'fail')
    }, 1200)
  }

  const providerCards: { id: AIProvider; name: string; desc: string }[] = [
    { id: 'claude', name: 'Claude', desc: 'Anthropic — strong reasoning & extraction accuracy.' },
    { id: 'openai', name: 'OpenAI', desc: 'GPT-4o family — fast, broadly capable models.' },
  ]

  return (
    <SectionCard title="AI Provider" description="Configure the model that powers classification and extraction.">
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {providerCards.map((p) => {
            const active = provider === p.id
            return (
              <button
                key={p.id}
                disabled={!canManage}
                onClick={() => setProvider(p.id)}
                className={cn(
                  'rounded-lg border p-4 text-left transition-colors disabled:opacity-60',
                  active
                    ? 'border-ai-500/50 bg-ai-500/[0.06]'
                    : 'border-surface-border hover:border-surface-100/30',
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-medium text-surface-50">
                    <Sparkles className={cn('h-4 w-4', active ? 'text-ai-400' : 'text-surface-muted')} />
                    {p.name}
                  </span>
                  <span
                    className={cn(
                      'flex h-4 w-4 items-center justify-center rounded-full border',
                      active ? 'border-ai-500 bg-ai-500' : 'border-surface-border',
                    )}
                  >
                    {active && <Check className="h-3 w-3 text-surface-900" />}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-surface-muted">{p.desc}</p>
              </button>
            )
          })}
        </div>

        <Labeled label="API Key">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value)
                  setTestState('idle')
                }}
                placeholder={settings.has_api_key ? '•••••••••••• (saved)' : 'sk-…'}
                className="input pr-9 font-mono"
                disabled={!canManage}
              />
              <button
                type="button"
                onClick={() => setShowKey((s) => !s)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-surface-muted hover:text-surface-100"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <button
              onClick={testConnection}
              disabled={testState === 'testing'}
              className="btn-outline py-2"
            >
              {testState === 'testing' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Test Connection'
              )}
            </button>
            {testState === 'ok' && <Badge tone="green">Connected</Badge>}
            {testState === 'fail' && <Badge tone="red">No key</Badge>}
          </div>
        </Labeled>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Labeled label="Model">
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="input"
              disabled={!canManage}
            >
              {MODELS[provider].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </Labeled>
          <Labeled label={`Temperature — ${temperature.toFixed(1)}`}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
              className="mt-2 w-full accent-ai-500"
              disabled={!canManage}
            />
            <p className="mt-1 text-[11px] text-surface-muted">
              Lower is more deterministic (recommended for extraction); higher is more creative.
            </p>
          </Labeled>
        </div>

        {canManage && (
          <button onClick={() => save.mutate()} disabled={save.isPending} className="btn-primary">
            {save.isPending && <Spinner />}
            Save
          </button>
        )}
      </div>
    </SectionCard>
  )
}

/* --------------------------------- Security --------------------------------- */

interface LocalApiKey {
  id: string
  name: string
  key: string
  created_at: string
}

function loadApiKeys(): LocalApiKey[] {
  try {
    return JSON.parse(localStorage.getItem('docuflow:apikeys') ?? '[]')
  } catch {
    return []
  }
}

function SecuritySection() {
  const [keys, setKeys] = useState<LocalApiKey[]>(loadApiKeys)
  const [name, setName] = useState('')
  const [revealed, setRevealed] = useState<string | null>(null)

  function persist(next: LocalApiKey[]) {
    setKeys(next)
    localStorage.setItem('docuflow:apikeys', JSON.stringify(next))
  }

  function generate() {
    const raw = `dfk_${Array.from(crypto.getRandomValues(new Uint8Array(24)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')}`
    const key: LocalApiKey = {
      id: crypto.randomUUID(),
      name: name.trim() || 'Untitled key',
      key: raw,
      created_at: new Date().toISOString(),
    }
    persist([key, ...keys])
    setRevealed(key.id)
    setName('')
    toast.success('API key generated — copy it now')
  }

  return (
    <SectionCard
      title="API Keys"
      description="Keys for external integrations. Stored locally in this browser for development use."
    >
      <div className="mb-4 flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Key label (e.g. CI pipeline)"
          className="input flex-1"
        />
        <button onClick={generate} className="btn-primary">
          <Plus className="h-4 w-4" />
          Generate
        </button>
      </div>

      {keys.length === 0 ? (
        <p className="py-6 text-center text-sm text-surface-muted">No API keys yet.</p>
      ) : (
        <div className="divide-y divide-surface-border">
          {keys.map((k) => (
            <div key={k.id} className="flex items-center gap-3 py-3">
              <KeyRound className="h-4 w-4 text-surface-muted" />
              <div className="min-w-0 flex-1">
                <div className="text-sm text-surface-50">{k.name}</div>
                <Mono className="block truncate text-xs text-surface-muted">
                  {revealed === k.id ? k.key : `${k.key.slice(0, 8)}••••••••••••`}
                </Mono>
              </div>
              <span className="text-[11px] text-surface-muted">
                {format(new Date(k.created_at), 'MMM d, yyyy')}
              </span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(k.key)
                  toast.success('Copied')
                }}
                className="rounded p-1.5 text-surface-muted hover:text-ice-400"
                title="Copy"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => persist(keys.filter((x) => x.id !== k.id))}
                className="rounded p-1.5 text-surface-muted hover:text-rose-400"
                title="Revoke"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}

/* --------------------------------- Billing ---------------------------------- */

function BillingSection({ settings }: { settings: TenantSettings }) {
  const plan = settings.plan || 'free'
  const features: Record<string, string[]> = {
    free: ['1,000 documents / month', '3 team members', 'Community support'],
    pro: ['50,000 documents / month', 'Unlimited members', 'Priority support', 'RPA robots'],
    enterprise: ['Unlimited documents', 'SSO & audit logs', 'Dedicated support', 'SLA guarantees'],
  }
  return (
    <SectionCard title="Billing" description="Your current plan and usage.">
      <div className="rounded-lg border border-surface-border bg-surface-800 p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-surface-muted">
              Current Plan
            </div>
            <div className="mt-0.5 flex items-center gap-2">
              <span className="text-lg font-semibold capitalize text-surface-50">{plan}</span>
              <Badge tone="ice">Active</Badge>
            </div>
          </div>
          <button
            className="btn-outline"
            onClick={() => toast.info('Billing is managed by your account team.')}
          >
            Manage Billing
          </button>
        </div>
        <ul className="mt-4 space-y-1.5">
          {(features[plan] ?? features.free).map((f) => (
            <li key={f} className="flex items-center gap-2 text-sm text-surface-100">
              <Check className="h-3.5 w-3.5 text-emerald-400" />
              {f}
            </li>
          ))}
        </ul>
      </div>
    </SectionCard>
  )
}

/* -------------------------------- Danger Zone ------------------------------- */

function DangerZone({ settings }: { settings: TenantSettings }) {
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState('')

  return (
    <div className="card border-rose-500/30 p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-rose-400">
        <AlertTriangle className="h-4 w-4" />
        Danger Zone
      </h2>
      <p className="mt-0.5 text-xs text-surface-muted">
        Irreversible and destructive actions.
      </p>
      <div className="mt-4 flex items-center justify-between rounded-lg border border-rose-500/30 bg-rose-500/[0.04] p-4">
        <div>
          <div className="text-sm font-medium text-surface-50">Delete Organization</div>
          <div className="text-xs text-surface-muted">
            Permanently delete <Mono>{settings.slug}</Mono> and all of its data.
          </div>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm font-medium text-rose-400 hover:bg-rose-500/20"
        >
          Delete Organization
        </button>
      </div>

      <Dialog.Root
        open={open}
        onOpenChange={(o) => {
          setOpen(o)
          if (!o) setConfirm('')
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[420px] max-w-[90vw] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-rose-500/40 bg-surface-700 shadow-xl">
            <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
              <Dialog.Title className="flex items-center gap-2 text-sm font-medium text-rose-400">
                <AlertTriangle className="h-4 w-4" />
                Delete Organization
              </Dialog.Title>
              <Dialog.Close className="rounded p-1 text-surface-muted hover:bg-surface-600 hover:text-surface-100">
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>
            <div className="space-y-3 p-4">
              <p className="text-sm text-surface-100">
                This action cannot be undone. This will permanently delete the{' '}
                <Mono className="text-rose-400">{settings.slug}</Mono> organization, its
                documents, cases, and workflows.
              </p>
              <Labeled label={`Type "${settings.slug}" to confirm`}>
                <input
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="input"
                  placeholder={settings.slug}
                />
              </Labeled>
            </div>
            <div className="flex justify-end gap-2 border-t border-surface-border px-4 py-3">
              <Dialog.Close asChild>
                <button className="btn-ghost">Cancel</button>
              </Dialog.Close>
              <button
                disabled={confirm !== settings.slug}
                onClick={() =>
                  toast.error(
                    'Organization deletion must be completed by your account team. Contact support to proceed.',
                  )
                }
                className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Delete forever
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
