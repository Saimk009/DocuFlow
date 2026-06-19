import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as Dialog from '@radix-ui/react-dialog'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  Activity,
  AlertTriangle,
  Building2,
  Cpu,
  Database,
  FileStack,
  HardDrive,
  MemoryStick,
  MoreHorizontal,
  ServerCog,
  ShieldAlert,
  ShieldX,
  X,
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { api, API_PREFIX } from '@/lib/api'
import { cn } from '@/lib/utils'
import { SUPER_ADMIN_EMAIL } from '@/lib/config'
import { Badge } from '@/components/shared/Badge'
import { KpiCard } from '@/components/shared/KpiCard'
import { CenteredSpinner, Mono } from '@/components/shared/common'
import { useAuthStore } from '@/store/authStore'

interface TenantStats {
  id: string
  slug: string
  name: string
  plan: string
  is_active: boolean
  created_at: string
  user_count: number
  document_count: number
  docs_month: number
  storage_bytes: number
}

interface PlatformStats {
  total_tenants: number
  active_tenants: number
  active_today: number
  total_users: number
  docs_today: number
  docs_month: number
  errors_today: number
  storage_bytes: number
  uptime_seconds: number
}

interface PlatformHealth {
  cpu_percent: number
  memory_percent: number
  celery_workers: number
  redis_queue_depth: number
  docs_24h: number
  errors_24h: number
  error_rate_24h: number
}

interface ExceptionEntry {
  id: string
  tenant: string
  doc_type?: string | null
  reason: string
  created_at: string
}

const PLANS = ['free', 'pro', 'enterprise']
const PLAN_TONE: Record<string, 'neutral' | 'ice' | 'ai'> = {
  free: 'neutral',
  pro: 'ice',
  enterprise: 'ai',
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${units[i]}`
}

function uptime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h) return `${h}h ${m}m`
  return `${m}m`
}

export function SuperAdmin() {
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()
  const [activeTenant, setActiveTenant] = useState<TenantStats | null>(null)

  const isSuperAdmin =
    !!user &&
    (user.email.toLowerCase() === SUPER_ADMIN_EMAIL ||
      (user.role as string) === 'super_admin')

  const { data: stats } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: () => api.get<PlatformStats>(`${API_PREFIX}/admin/stats`),
    enabled: isSuperAdmin,
    refetchInterval: 10_000,
  })
  const { data: tenants, isLoading } = useQuery({
    queryKey: ['admin', 'tenants'],
    queryFn: () => api.get<TenantStats[]>(`${API_PREFIX}/admin/tenants`),
    enabled: isSuperAdmin,
  })

  const toggleActive = useMutation({
    mutationFn: (vars: { id: string; is_active: boolean }) =>
      api.patch(`${API_PREFIX}/admin/tenants/${vars.id}`, { is_active: vars.is_active }),
    onSuccess: (_d, vars) => {
      toast.success(vars.is_active ? 'Tenant activated' : 'Tenant suspended')
      queryClient.invalidateQueries({ queryKey: ['admin', 'tenants'] })
    },
    onError: () => toast.error('Update failed'),
  })

  if (!isSuperAdmin) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <ShieldX className="h-10 w-10 text-rose-400" />
        <h1 className="text-lg font-semibold text-surface-50">Access Restricted</h1>
        <p className="max-w-sm text-sm text-surface-muted">
          The platform super-admin console is only available to the platform operator.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-surface-50">DocuFlow Super Admin</h1>
            <Badge tone="amber">
              <ShieldAlert className="h-3 w-3" />
              Restricted
            </Badge>
          </div>
          <p className="mt-1 text-sm text-surface-muted">
            Platform-wide administration across all tenants.
          </p>
        </div>
        {stats && (
          <div className="flex items-center gap-4 text-xs text-surface-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-emerald-400" />
              Live
            </span>
            <span>Uptime {uptime(stats.uptime_seconds)}</span>
          </div>
        )}
      </div>

      {/* Platform overview */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total Tenants"
          value={stats?.total_tenants ?? 0}
          delta={`${stats?.active_tenants ?? 0} active`}
          icon={Building2}
          accent="ice"
        />
        <KpiCard
          label="Active Today"
          value={stats?.active_today ?? 0}
          delta="tenants with activity"
          icon={Activity}
          accent="ai"
        />
        <KpiCard
          label="Docs This Month"
          value={stats?.docs_month?.toLocaleString() ?? 0}
          delta={`${stats?.docs_today ?? 0} today`}
          icon={FileStack}
          accent="neutral"
        />
        <KpiCard
          label="Total Storage"
          value={formatBytes(stats?.storage_bytes ?? 0)}
          delta="estimated"
          icon={HardDrive}
          accent="neutral"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_300px]">
        {/* Tenant table */}
        <div>
          {isLoading ? (
            <CenteredSpinner />
          ) : (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-surface-border text-left text-xs uppercase tracking-wide text-surface-muted">
                      <th className="px-4 py-3 font-medium">Slug</th>
                      <th className="px-4 py-3 font-medium">Organization</th>
                      <th className="px-4 py-3 font-medium">Plan</th>
                      <th className="px-4 py-3 font-medium">Users</th>
                      <th className="px-4 py-3 font-medium">Docs</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Created</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-border">
                    {(tenants ?? []).map((t) => (
                      <tr key={t.id} className={cn(!t.is_active && 'bg-rose-500/[0.04]')}>
                        <td className="px-4 py-3">
                          <Mono className="text-xs text-ice-400">{t.slug}</Mono>
                        </td>
                        <td className="px-4 py-3 text-surface-50">{t.name}</td>
                        <td className="px-4 py-3">
                          <Badge tone={PLAN_TONE[t.plan] ?? 'neutral'} className="capitalize">
                            {t.plan}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Mono className="text-surface-100">{t.user_count}</Mono>
                        </td>
                        <td className="px-4 py-3">
                          <Mono className="text-surface-100">
                            {t.document_count.toLocaleString()}
                          </Mono>
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={t.is_active ? 'green' : 'red'}>
                            {t.is_active ? 'Active' : 'Suspended'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-surface-muted">
                          <Mono className="text-xs">
                            {format(new Date(t.created_at), 'MMM d, yyyy')}
                          </Mono>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <DropdownMenu.Root>
                            <DropdownMenu.Trigger asChild>
                              <button className="rounded p-1.5 text-surface-muted hover:bg-surface-600 hover:text-surface-100">
                                <MoreHorizontal className="h-4 w-4" />
                              </button>
                            </DropdownMenu.Trigger>
                            <DropdownMenu.Portal>
                              <DropdownMenu.Content
                                align="end"
                                sideOffset={4}
                                className="z-50 min-w-[160px] rounded-lg border border-surface-border bg-surface-700 p-1 shadow-xl"
                              >
                                <DropdownMenu.Item
                                  onSelect={() => setActiveTenant(t)}
                                  className="cursor-pointer rounded px-2 py-1.5 text-sm text-surface-100 outline-none data-[highlighted]:bg-surface-600"
                                >
                                  View Details
                                </DropdownMenu.Item>
                                <DropdownMenu.Item
                                  onSelect={() => setActiveTenant(t)}
                                  className="cursor-pointer rounded px-2 py-1.5 text-sm text-surface-100 outline-none data-[highlighted]:bg-surface-600"
                                >
                                  Change Plan
                                </DropdownMenu.Item>
                                <DropdownMenu.Separator className="my-1 h-px bg-surface-border" />
                                <DropdownMenu.Item
                                  onSelect={() =>
                                    toggleActive.mutate({ id: t.id, is_active: !t.is_active })
                                  }
                                  className={cn(
                                    'cursor-pointer rounded px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-surface-600',
                                    t.is_active ? 'text-rose-400' : 'text-emerald-400',
                                  )}
                                >
                                  {t.is_active ? 'Suspend' : 'Activate'}
                                </DropdownMenu.Item>
                              </DropdownMenu.Content>
                            </DropdownMenu.Portal>
                          </DropdownMenu.Root>
                        </td>
                      </tr>
                    ))}
                    {tenants?.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-4 py-12 text-center text-surface-muted">
                          No tenants yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Platform health sidebar */}
        <PlatformHealthPanel enabled={isSuperAdmin} />
      </div>

      <TenantModal
        tenant={activeTenant}
        onClose={() => setActiveTenant(null)}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ['admin', 'tenants'] })}
      />
    </div>
  )
}

function PlatformHealthPanel({ enabled }: { enabled: boolean }) {
  const { data: health } = useQuery({
    queryKey: ['admin', 'health'],
    queryFn: () => api.get<PlatformHealth>(`${API_PREFIX}/admin/health`),
    enabled,
    refetchInterval: 5_000,
  })
  const { data: exceptions } = useQuery({
    queryKey: ['admin', 'exceptions'],
    queryFn: () => api.get<ExceptionEntry[]>(`${API_PREFIX}/admin/exceptions`),
    enabled,
    refetchInterval: 15_000,
  })

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <h2 className="flex items-center gap-2 text-sm font-medium text-surface-50">
          <ServerCog className="h-4 w-4 text-ice-400" />
          Platform Health
        </h2>
        <div className="mt-4 space-y-3">
          <Gauge label="CPU" icon={Cpu} value={health?.cpu_percent ?? 0} suffix="%" />
          <Gauge label="Memory" icon={MemoryStick} value={health?.memory_percent ?? 0} suffix="%" />
          <Stat
            label="Celery Workers"
            icon={ServerCog}
            value={health?.celery_workers ?? 0}
            tone={health && health.celery_workers > 0 ? 'ok' : 'warn'}
          />
          <Stat
            label="Redis Queue Depth"
            icon={Database}
            value={health?.redis_queue_depth ?? 0}
            tone={health && health.redis_queue_depth > 50 ? 'warn' : 'ok'}
          />
        </div>
        <div className="mt-4 rounded-lg border border-surface-border bg-surface-800 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-surface-muted">Error rate (24h)</span>
            <span
              className={cn(
                'font-mono text-sm font-medium',
                (health?.error_rate_24h ?? 0) > 5 ? 'text-rose-400' : 'text-emerald-400',
              )}
            >
              {(health?.error_rate_24h ?? 0).toFixed(1)}%
            </span>
          </div>
          <div className="mt-1 text-[11px] text-surface-muted">
            {health?.errors_24h ?? 0} of {health?.docs_24h ?? 0} docs
          </div>
        </div>
      </div>

      <div className="card p-4">
        <h2 className="flex items-center gap-2 text-sm font-medium text-surface-50">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          Recent Exceptions
        </h2>
        <div className="mt-3 space-y-2">
          {!exceptions?.length && (
            <p className="py-4 text-center text-xs text-surface-muted">
              No recent exceptions
            </p>
          )}
          {exceptions?.map((e) => (
            <div
              key={e.id}
              className="rounded-lg border border-surface-border bg-surface-800 p-2.5"
            >
              <div className="flex items-center justify-between">
                <Mono className="text-xs text-surface-100">{e.tenant}</Mono>
                <span className="text-[10px] text-surface-muted">
                  {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-1.5">
                {e.doc_type && <Badge tone="neutral">{e.doc_type}</Badge>}
                <span className="text-[11px] text-rose-400">{e.reason}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Gauge({
  label,
  icon: Icon,
  value,
  suffix,
}: {
  label: string
  icon: typeof Cpu
  value: number
  suffix?: string
}) {
  const tone =
    value > 85 ? 'bg-rose-500' : value > 60 ? 'bg-amber-500' : 'bg-ice-500'
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-surface-muted">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </span>
        <Mono className="text-surface-100">
          {value.toFixed(0)}
          {suffix}
        </Mono>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-800">
        <div className={cn('h-full rounded-full transition-all', tone)} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
    </div>
  )
}

function Stat({
  label,
  icon: Icon,
  value,
  tone,
}: {
  label: string
  icon: typeof Cpu
  value: number
  tone: 'ok' | 'warn'
}) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="flex items-center gap-1.5 text-surface-muted">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </span>
      <span className="flex items-center gap-1.5">
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            tone === 'ok' ? 'bg-emerald-400' : 'bg-amber-400',
          )}
        />
        <Mono className="text-surface-100">{value}</Mono>
      </span>
    </div>
  )
}

interface TenantLimits {
  maxUsers: number
  maxDocsMonth: number
  storageGb: number
}

const PLAN_DEFAULT_LIMITS: Record<string, TenantLimits> = {
  free: { maxUsers: 3, maxDocsMonth: 1000, storageGb: 5 },
  pro: { maxUsers: 25, maxDocsMonth: 50000, storageGb: 100 },
  enterprise: { maxUsers: 999, maxDocsMonth: 1000000, storageGb: 1000 },
}

function loadLimits(tenantId: string, plan: string): TenantLimits {
  try {
    const raw = localStorage.getItem(`docuflow:admin:limits:${tenantId}`)
    if (raw) return JSON.parse(raw)
  } catch {
    /* ignore */
  }
  return PLAN_DEFAULT_LIMITS[plan] ?? PLAN_DEFAULT_LIMITS.free
}

function TenantModal({
  tenant,
  onClose,
  onSaved,
}: {
  tenant: TenantStats | null
  onClose: () => void
  onSaved: () => void
}) {
  return (
    <Dialog.Root open={Boolean(tenant)} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[460px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-surface-border bg-surface-700 shadow-xl">
          {tenant && (
            <TenantModalBody tenant={tenant} onClose={onClose} onSaved={onSaved} />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function TenantModalBody({
  tenant,
  onClose,
  onSaved,
}: {
  tenant: TenantStats
  onClose: () => void
  onSaved: () => void
}) {
  const [plan, setPlan] = useState(tenant.plan)
  const [limits, setLimits] = useState<TenantLimits>(() =>
    loadLimits(tenant.id, tenant.plan),
  )

  const save = useMutation({
    mutationFn: () =>
      api.patch(`${API_PREFIX}/admin/tenants/${tenant.id}`, { plan }),
    onSuccess: () => {
      localStorage.setItem(`docuflow:admin:limits:${tenant.id}`, JSON.stringify(limits))
      toast.success('Tenant plan updated')
      onSaved()
      onClose()
    },
    onError: () => toast.error('Could not update tenant'),
  })

  return (
    <>
      <div className="flex items-center justify-between border-b border-surface-border px-5 py-3.5">
        <div>
          <Dialog.Title className="text-sm font-semibold text-surface-50">
            {tenant.name}
          </Dialog.Title>
          <Mono className="text-xs text-ice-400">{tenant.slug}.docuflow.com</Mono>
        </div>
        <Dialog.Close className="rounded p-1 text-surface-muted hover:bg-surface-600 hover:text-surface-100">
          <X className="h-4 w-4" />
        </Dialog.Close>
      </div>

      <div className="space-y-5 p-5">
        <div className="grid grid-cols-3 gap-3">
          <Metric label="Users" value={tenant.user_count} />
          <Metric label="Docs (month)" value={tenant.docs_month.toLocaleString()} />
          <Metric label="Storage" value={formatBytes(tenant.storage_bytes)} />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-surface-100">
            Plan
          </label>
          <select value={plan} onChange={(e) => setPlan(e.target.value)} className="input capitalize">
            {PLANS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className="mb-2 text-xs font-medium text-surface-100">Custom Limits</div>
          <div className="grid grid-cols-3 gap-3">
            <LimitInput
              label="Max users"
              value={limits.maxUsers}
              onChange={(v) => setLimits((l) => ({ ...l, maxUsers: v }))}
            />
            <LimitInput
              label="Docs / month"
              value={limits.maxDocsMonth}
              onChange={(v) => setLimits((l) => ({ ...l, maxDocsMonth: v }))}
            />
            <LimitInput
              label="Storage (GB)"
              value={limits.storageGb}
              onChange={(v) => setLimits((l) => ({ ...l, storageGb: v }))}
            />
          </div>
          <button
            onClick={() => setLimits(PLAN_DEFAULT_LIMITS[plan] ?? PLAN_DEFAULT_LIMITS.free)}
            className="mt-2 text-[11px] text-ice-400 hover:underline"
          >
            Reset to {plan} defaults
          </button>
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-surface-border px-5 py-3">
        <Dialog.Close asChild>
          <button className="btn-ghost">Cancel</button>
        </Dialog.Close>
        <button onClick={() => save.mutate()} disabled={save.isPending} className="btn-primary">
          Save Changes
        </button>
      </div>
    </>
  )
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-surface-border bg-surface-800 p-3 text-center">
      <div className="font-mono text-lg font-medium text-surface-50">{value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wide text-surface-muted">
        {label}
      </div>
    </div>
  )
}

function LimitInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div>
      <label className="mb-1 block text-[10px] uppercase tracking-wide text-surface-muted">
        {label}
      </label>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="input"
      />
    </div>
  )
}
