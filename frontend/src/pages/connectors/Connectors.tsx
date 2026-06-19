import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as Dialog from '@radix-ui/react-dialog'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Check,
  Cloud,
  Copy,
  Database,
  Globe,
  Mail,
  Plug,
  Plus,
  RefreshCw,
  ScrollText,
  Settings2,
  Trash2,
  Webhook as WebhookIcon,
  X,
  type LucideIcon,
} from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { api, API_PREFIX } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/shared/Badge'
import { CenteredSpinner, Mono, Spinner } from '@/components/shared/common'
import type { Connector, ConnectorLogList, ConnectorType, Webhook } from '@/types'

const ICONS: Record<string, LucideIcon> = {
  webhook: WebhookIcon,
  slack: Mail,
  mail: Mail,
  sap: Database,
  salesforce: Cloud,
  sharepoint: Cloud,
  api: Globe,
}

const CATEGORY_OF: Record<string, string> = {
  email: 'Notifications',
  slack: 'Notifications',
  sharepoint: 'Storage',
  sap: 'ERP',
  salesforce: 'CRM',
  rest_api: 'Custom',
  webhook: 'Custom',
}
const CATEGORY_ORDER = ['Notifications', 'Storage', 'ERP', 'CRM', 'Custom']

const WEBHOOK_EVENTS = [
  'document.completed',
  'document.exception',
  'batch.created',
  'workflow.published',
  'case.created',
]

function statusBadge(status: string) {
  if (status === 'connected') return { tone: 'green' as const, label: 'Healthy' }
  if (status === 'failed') return { tone: 'red' as const, label: 'Error' }
  return { tone: 'neutral' as const, label: 'Untested' }
}

export function Connectors() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [configureType, setConfigureType] = useState<ConnectorType | null>(null)
  const [editing, setEditing] = useState<Connector | null>(null)
  const [webhookOpen, setWebhookOpen] = useState(false)

  const { data: available, isLoading } = useQuery({
    queryKey: ['connectors', 'available'],
    queryFn: () => api.get<ConnectorType[]>(`${API_PREFIX}/connectors/available`),
  })
  const { data: configured } = useQuery({
    queryKey: ['connectors'],
    queryFn: () => api.get<Connector[]>(`${API_PREFIX}/connectors`),
  })
  const { data: webhooks } = useQuery({
    queryKey: ['connectors', 'webhooks'],
    queryFn: () => api.get<Webhook[]>(`${API_PREFIX}/connectors/webhooks`),
  })

  const test = useMutation({
    mutationFn: (cid: string) =>
      api.post<{ status: string; message: string }>(
        `${API_PREFIX}/connectors/${cid}/test`,
      ),
    onSuccess: (res) => {
      if (res.status === 'connected') toast.success(res.message)
      else toast.error(res.message)
      queryClient.invalidateQueries({ queryKey: ['connectors'] })
    },
  })
  const remove = useMutation({
    mutationFn: (cid: string) => api.delete(`${API_PREFIX}/connectors/${cid}`),
    onSuccess: () => {
      toast.success('Connector deleted')
      queryClient.invalidateQueries({ queryKey: ['connectors'] })
    },
  })

  if (isLoading) return <CenteredSpinner />

  const installedTypes = new Set((configured ?? []).map((c) => c.type))
  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    items: (available ?? []).filter((a) => CATEGORY_OF[a.type] === cat),
  })).filter((g) => g.items.length)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-surface-50">Connectors</h1>
        <p className="mt-1 text-sm text-surface-muted">
          Integrate DocuFlow with your notification, storage, ERP, and CRM systems.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Directory */}
        <div className="space-y-5 lg:col-span-2">
          {grouped.map((group) => (
            <div key={group.category}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-surface-muted">
                {group.category}
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {group.items.map((conn) => {
                  const Icon = ICONS[conn.icon] ?? Plug
                  const installed = installedTypes.has(conn.type)
                  return (
                    <div key={conn.type} className="card flex flex-col p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-600">
                          <Icon className="h-4.5 w-4.5 text-ice-400" />
                        </div>
                        {installed && (
                          <Badge tone="green">
                            <Check className="h-3 w-3" />
                            Configured
                          </Badge>
                        )}
                      </div>
                      <h3 className="mt-2.5 text-sm font-medium text-surface-50">
                        {conn.name}
                      </h3>
                      <p className="mt-1 line-clamp-2 flex-1 text-xs text-surface-muted">
                        {conn.description}
                      </p>
                      <button
                        onClick={() =>
                          conn.type === 'rest_api'
                            ? navigate('/connectors/new')
                            : setConfigureType(conn)
                        }
                        className="btn-outline mt-3 py-1.5 text-xs"
                      >
                        Configure
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Configured panel */}
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-surface-muted">
            Configured ({configured?.length ?? 0})
          </h2>
          {!configured?.length ? (
            <p className="card p-6 text-center text-sm text-surface-muted">
              No connectors configured yet.
            </p>
          ) : (
            <div className="space-y-3">
              {configured.map((c) => {
                const Icon = ICONS[c.type] ?? Plug
                const sb = statusBadge(c.status)
                return (
                  <div key={c.id} className="card p-4">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-600">
                        <Icon className="h-4 w-4 text-ice-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-surface-50">
                          {c.name}
                        </div>
                        <div className="text-[11px] text-surface-muted">
                          {c.last_tested_at
                            ? `Tested ${format(new Date(c.last_tested_at), 'MMM d, HH:mm')}`
                            : 'Never tested'}
                        </div>
                      </div>
                      <Badge tone={sb.tone}>{sb.label}</Badge>
                    </div>
                    <ConnectorHealth connectorId={c.id} />
                    <div className="mt-3 flex items-center gap-1.5">
                      <button
                        onClick={() =>
                          c.type === 'rest_api'
                            ? navigate(`/connectors/${c.id}/edit`)
                            : setEditing(c)
                        }
                        className="btn-outline flex-1 py-1 text-xs"
                      >
                        {c.type === 'rest_api' ? (
                          <>
                            <Settings2 className="h-3.5 w-3.5" />
                            Configure
                          </>
                        ) : (
                          'Edit'
                        )}
                      </button>
                      <button
                        onClick={() => navigate(`/connectors/${c.id}/logs`)}
                        className="btn-outline py-1 text-xs"
                        title="View logs"
                      >
                        <ScrollText className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => test.mutate(c.id)}
                        disabled={test.isPending}
                        className="btn-outline py-1 text-xs"
                        title="Test connection"
                      >
                        <RefreshCw className={cn('h-3.5 w-3.5', test.isPending && 'animate-spin')} />
                      </button>
                      <button
                        onClick={() => remove.mutate(c.id)}
                        className="rounded border border-surface-border p-1.5 text-surface-muted hover:text-rose-400"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Webhooks */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-surface-border px-5 py-3">
          <div className="flex items-center gap-2">
            <WebhookIcon className="h-4 w-4 text-ice-400" />
            <h2 className="text-sm font-medium text-surface-50">Webhooks</h2>
          </div>
          <button onClick={() => setWebhookOpen(true)} className="btn-outline py-1.5">
            <Plus className="h-3.5 w-3.5" />
            Add Webhook
          </button>
        </div>
        {!webhooks?.length ? (
          <p className="px-5 py-8 text-center text-sm text-surface-muted">
            No webhooks configured.
          </p>
        ) : (
          <div className="divide-y divide-surface-border">
            {webhooks.map((w) => (
              <WebhookRow key={w.id} webhook={w} />
            ))}
          </div>
        )}
      </div>

      <ConfigureDialog
        type={configureType}
        onClose={() => setConfigureType(null)}
      />
      <EditConnectorDialog connector={editing} onClose={() => setEditing(null)} />
      <AddWebhookDialog open={webhookOpen} onOpenChange={setWebhookOpen} />
    </div>
  )
}

function ConnectorHealth({ connectorId }: { connectorId: string }) {
  const { data } = useQuery({
    queryKey: ['connectors', connectorId, 'health'],
    queryFn: () =>
      api.get<ConnectorLogList>(`${API_PREFIX}/connectors/${connectorId}/logs`, {
        params: { page_size: 50 },
      }),
  })

  const logs = data?.items ?? []
  if (logs.length === 0) return null

  const successes = logs.filter((l) => l.success).length
  const rate = Math.round((successes / logs.length) * 100)
  const tone = rate >= 95 ? 'text-emerald-400' : rate >= 80 ? 'text-amber-400' : 'text-rose-400'
  const dot = rate >= 95 ? 'bg-emerald-400' : rate >= 80 ? 'bg-amber-400' : 'bg-rose-400'

  return (
    <div className="mt-2.5 flex items-center gap-1.5 text-[11px]">
      <span className={cn('h-1.5 w-1.5 rounded-full', dot)} />
      <span className={tone}>{rate}% success</span>
      <span className="text-surface-muted">· {logs.length} calls</span>
    </div>
  )
}

function WebhookRow({ webhook }: { webhook: Webhook }) {
  const queryClient = useQueryClient()
  const [revealed, setRevealed] = useState(false)

  const toggle = useMutation({
    mutationFn: (active: boolean) =>
      api.patch(`${API_PREFIX}/connectors/webhooks/${webhook.id}`, { is_active: active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['connectors', 'webhooks'] }),
  })
  const remove = useMutation({
    mutationFn: () => api.delete(`${API_PREFIX}/connectors/webhooks/${webhook.id}`),
    onSuccess: () => {
      toast.success('Webhook deleted')
      queryClient.invalidateQueries({ queryKey: ['connectors', 'webhooks'] })
    },
  })

  return (
    <div className="flex flex-wrap items-center gap-3 px-5 py-3">
      <div className="min-w-0 flex-1">
        <Mono className="block truncate text-sm text-surface-50">{webhook.url}</Mono>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {webhook.events.length ? (
            webhook.events.map((e) => (
              <Badge key={e} tone="ice" className="text-[10px]">
                {e}
              </Badge>
            ))
          ) : (
            <span className="text-[11px] text-surface-muted">All events</span>
          )}
        </div>
        <button
          onClick={() => {
            navigator.clipboard.writeText(webhook.secret)
            toast.success('Secret copied')
          }}
          className="mt-1 flex items-center gap-1 text-[11px] text-surface-muted hover:text-ice-400"
        >
          <Copy className="h-3 w-3" />
          {revealed ? webhook.secret : 'Copy signing secret'}
          <span
            onClick={(e) => {
              e.stopPropagation()
              setRevealed((r) => !r)
            }}
            className="ml-1 underline"
          >
            {revealed ? 'hide' : 'show'}
          </span>
        </button>
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-xs text-surface-muted">
        <input
          type="checkbox"
          checked={webhook.is_active}
          onChange={(e) => toggle.mutate(e.target.checked)}
          className="h-4 w-4 rounded border-surface-border bg-surface-800 text-ice-500"
        />
        Active
      </label>
      <button
        onClick={() => remove.mutate()}
        className="rounded p-1.5 text-surface-muted hover:text-rose-400"
        title="Delete"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )
}

function ConfigureDialog({
  type,
  onClose,
}: {
  type: ConnectorType | null
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [config, setConfig] = useState<Record<string, string>>({})

  const create = useMutation({
    mutationFn: () =>
      api.post(`${API_PREFIX}/connectors`, {
        type: type!.type,
        name: name.trim() || type!.name,
        config,
      }),
    onSuccess: () => {
      toast.success('Connector configured')
      queryClient.invalidateQueries({ queryKey: ['connectors'] })
      onClose()
      setName('')
      setConfig({})
    },
    onError: () => toast.error('Could not configure connector'),
  })

  return (
    <Dialog.Root open={Boolean(type)} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[440px] max-w-[90vw] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-surface-border bg-surface-700 shadow-xl">
          <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
            <Dialog.Title className="text-sm font-medium text-surface-50">
              Configure {type?.name}
            </Dialog.Title>
            <Dialog.Close className="rounded p-1 text-surface-muted hover:bg-surface-600 hover:text-surface-100">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <div className="space-y-3 p-4">
            <FieldInput label="Connection name" value={name} onChange={setName} placeholder={type?.name} />
            {type?.fields_required.map((f) => (
              <FieldInput
                key={f}
                label={f.replace(/_/g, ' ')}
                value={config[f] ?? ''}
                onChange={(v) => setConfig((c) => ({ ...c, [f]: v }))}
                masked={/password|secret|key|token/.test(f)}
              />
            ))}
          </div>
          <div className="flex justify-end gap-2 border-t border-surface-border px-4 py-3">
            <Dialog.Close asChild>
              <button className="btn-ghost">Cancel</button>
            </Dialog.Close>
            <button
              onClick={() => create.mutate()}
              disabled={create.isPending}
              className="btn-primary"
            >
              Save Connector
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function EditConnectorDialog({
  connector,
  onClose,
}: {
  connector: Connector | null
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [config, setConfig] = useState<Record<string, string>>({})

  const save = useMutation({
    mutationFn: () =>
      api.put(`${API_PREFIX}/connectors/${connector!.id}`, {
        name: name || connector!.name,
        config: Object.keys(config).length ? config : undefined,
      }),
    onSuccess: () => {
      toast.success('Connector updated')
      queryClient.invalidateQueries({ queryKey: ['connectors'] })
      onClose()
      setName('')
      setConfig({})
    },
    onError: () => toast.error('Could not update connector'),
  })

  return (
    <Dialog.Root open={Boolean(connector)} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[440px] max-w-[90vw] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-surface-border bg-surface-700 shadow-xl">
          <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
            <Dialog.Title className="text-sm font-medium text-surface-50">
              Edit {connector?.name}
            </Dialog.Title>
            <Dialog.Close className="rounded p-1 text-surface-muted hover:bg-surface-600 hover:text-surface-100">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <div className="space-y-3 p-4">
            <FieldInput
              label="Connection name"
              value={name}
              onChange={setName}
              placeholder={connector?.name}
            />
            {(connector?.config_keys ?? []).map((f) => (
              <FieldInput
                key={f}
                label={f.replace(/_/g, ' ')}
                value={config[f] ?? ''}
                onChange={(v) => setConfig((c) => ({ ...c, [f]: v }))}
                masked={/password|secret|key|token/.test(f)}
                placeholder="•••••• (leave blank to keep)"
              />
            ))}
            <p className="text-[11px] text-surface-muted">
              Re-entering a value replaces the encrypted config and resets test status.
            </p>
          </div>
          <div className="flex justify-end gap-2 border-t border-surface-border px-4 py-3">
            <Dialog.Close asChild>
              <button className="btn-ghost">Cancel</button>
            </Dialog.Close>
            <button onClick={() => save.mutate()} disabled={save.isPending} className="btn-primary">
              Save
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function AddWebhookDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [url, setUrl] = useState('')
  const [events, setEvents] = useState<string[]>([])
  const [created, setCreated] = useState<Webhook | null>(null)

  const create = useMutation({
    mutationFn: () =>
      api.post<Webhook>(`${API_PREFIX}/connectors/webhooks`, { url: url.trim(), events }),
    onSuccess: (wh) => {
      toast.success('Webhook created')
      queryClient.invalidateQueries({ queryKey: ['connectors', 'webhooks'] })
      setCreated(wh)
    },
    onError: () => toast.error('Could not create webhook'),
  })

  function close() {
    onOpenChange(false)
    setUrl('')
    setEvents([])
    setCreated(null)
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => (o ? onOpenChange(o) : close())}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[440px] max-w-[90vw] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-surface-border bg-surface-700 shadow-xl">
          <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
            <Dialog.Title className="text-sm font-medium text-surface-50">
              Add Webhook
            </Dialog.Title>
            <Dialog.Close className="rounded p-1 text-surface-muted hover:bg-surface-600 hover:text-surface-100">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          {created ? (
            <div className="space-y-3 p-4">
              <p className="text-sm text-surface-100">
                Webhook created. Copy your signing secret now — it is used to verify
                payloads.
              </p>
              <div className="flex items-center gap-2 rounded-lg border border-surface-border bg-surface-900 p-2">
                <Mono className="min-w-0 flex-1 truncate text-xs text-ice-400">
                  {created.secret}
                </Mono>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(created.secret)
                    toast.success('Secret copied')
                  }}
                  className="btn-outline py-1 text-xs"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy
                </button>
              </div>
              <div className="flex justify-end">
                <button onClick={close} className="btn-primary">
                  Done
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-3 p-4">
                <FieldInput
                  label="Endpoint URL"
                  value={url}
                  onChange={setUrl}
                  placeholder="https://example.com/webhooks/docuflow"
                />
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-wide text-surface-muted">
                    Events
                  </label>
                  <div className="space-y-1">
                    {WEBHOOK_EVENTS.map((e) => (
                      <label
                        key={e}
                        className="flex cursor-pointer items-center gap-2 text-sm text-surface-100"
                      >
                        <input
                          type="checkbox"
                          checked={events.includes(e)}
                          onChange={(ev) =>
                            setEvents((prev) =>
                              ev.target.checked
                                ? [...prev, e]
                                : prev.filter((x) => x !== e),
                            )
                          }
                          className="h-4 w-4 rounded border-surface-border bg-surface-800 text-ice-500"
                        />
                        <Mono className="text-xs">{e}</Mono>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t border-surface-border px-4 py-3">
                <button onClick={close} className="btn-ghost">
                  Cancel
                </button>
                <button
                  onClick={() => create.mutate()}
                  disabled={!url.trim() || create.isPending}
                  className="btn-primary"
                >
                  {create.isPending ? <Spinner /> : null}
                  Create Webhook
                </button>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function FieldInput({
  label,
  value,
  onChange,
  placeholder,
  masked,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  masked?: boolean
}) {
  return (
    <div>
      <label className="mb-1 block text-[10px] uppercase tracking-wide text-surface-muted">
        {label}
      </label>
      <input
        type={masked ? 'password' : 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input"
      />
    </div>
  )
}
