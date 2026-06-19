import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import * as Tabs from '@radix-ui/react-tabs'
import * as Dialog from '@radix-ui/react-dialog'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Check,
  Lock,
  Plus,
  ShieldCheck,
  Trash2,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { api, API_PREFIX } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Spinner } from '@/components/shared/common'
import { CodeBlock } from '@/components/shared/CodeBlock'
import { useDocuments, useDocument } from '@/hooks/useDocuments'
import type {
  Connector,
  ConnectorAuthType,
  ConnectorFieldMapping,
  ConnectorPreview,
  ConnectorTestResult,
  ConnectorTransform,
  FieldMappingOption,
} from '@/types'

const AUTH_TYPES: { value: ConnectorAuthType; label: string; desc: string }[] = [
  { value: 'none', label: 'None', desc: 'No authentication' },
  { value: 'api_key', label: 'API Key', desc: 'Header or query param' },
  { value: 'bearer_token', label: 'Bearer Token', desc: 'Authorization: Bearer' },
  { value: 'basic', label: 'Basic Auth', desc: 'Username & password' },
  { value: 'oauth2', label: 'OAuth 2.0', desc: 'Authorize via provider' },
]

const TRANSFORMS: { value: ConnectorTransform; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'uppercase', label: 'Uppercase' },
  { value: 'date_iso', label: 'Date ISO' },
  { value: 'currency_cents', label: 'Currency Cents' },
]

const TRIGGER_EVENTS: { value: string; label: string }[] = [
  { value: 'document.completed', label: 'Document Completed' },
  { value: 'document.exception', label: 'Document Exception' },
  { value: 'batch.completed', label: 'Batch Completed' },
  { value: 'case.updated', label: 'Case Updated' },
]

const METHODS = ['GET', 'POST', 'PUT', 'PATCH']
const DOC_TYPE_SUGGESTIONS = [
  'invoice',
  'receipt',
  'purchase_order',
  'contract',
  'bank_statement',
  'tax_form',
  'id_document',
]

type AuthConfig = Record<string, string>
type HeaderRow = { key: string; value: string }

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function cleanObject(obj: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v != null && String(v).trim() !== '') out[k] = String(v)
  }
  return out
}

export function ConnectorBuilder() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [connectorId, setConnectorId] = useState<string | null>(id ?? null)
  const initialized = useRef(false)

  // Connection tab state
  const [name, setName] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [authType, setAuthType] = useState<ConnectorAuthType>('none')
  const [authConfig, setAuthConfig] = useState<AuthConfig>({ placement: 'header' })
  const [authTouched, setAuthTouched] = useState(false)
  const [originalAuthType, setOriginalAuthType] = useState<ConnectorAuthType>('none')
  const [method, setMethod] = useState('POST')
  const [path, setPath] = useState('')
  const [headers, setHeaders] = useState<HeaderRow[]>([{ key: '', value: '' }])
  const [bodyTemplate, setBodyTemplate] = useState('')

  // Field mapping tab state
  const [docType, setDocType] = useState('')
  const [mappings, setMappings] = useState<ConnectorFieldMapping[]>([])
  const [previewOpen, setPreviewOpen] = useState(false)

  // Trigger tab state
  const [triggerEvents, setTriggerEvents] = useState<string[]>(['document.completed'])
  const [triggerDocType, setTriggerDocType] = useState('')

  const [testResult, setTestResult] = useState<ConnectorTestResult | null>(null)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)

  // Load existing connector for edit mode.
  const { data: connectors } = useQuery({
    queryKey: ['connectors'],
    queryFn: () => api.get<Connector[]>(`${API_PREFIX}/connectors`),
    enabled: Boolean(id),
  })

  useEffect(() => {
    if (initialized.current || !id || !connectors) return
    const existing = connectors.find((c) => c.id === id)
    if (!existing) return
    initialized.current = true
    setName(existing.name)
    setBaseUrl(existing.base_url ?? '')
    setAuthType((existing.auth_type as ConnectorAuthType) ?? 'none')
    setOriginalAuthType((existing.auth_type as ConnectorAuthType) ?? 'none')
    setAuthConfig({ placement: 'header' })
    const rt = existing.request_template
    if (rt) {
      setMethod(rt.method || 'POST')
      setPath(rt.path ?? '')
      const hdrs = Object.entries(rt.headers ?? {}).map(([key, value]) => ({
        key,
        value: String(value),
      }))
      setHeaders(hdrs.length ? hdrs : [{ key: '', value: '' }])
      setBodyTemplate(typeof rt.body_template === 'string' ? rt.body_template : '')
    }
    setMappings(existing.field_mappings ?? [])
    setTriggerEvents(existing.trigger_events?.length ? existing.trigger_events : ['document.completed'])
  }, [id, connectors])

  function patchAuth(patch: AuthConfig) {
    setAuthConfig((c) => ({ ...c, ...patch }))
    setAuthTouched(true)
  }

  function buildAuthConfig(): Record<string, string> {
    const a = authConfig
    switch (authType) {
      case 'api_key':
        return cleanObject({ name: a.name, placement: a.placement || 'header', value: a.value })
      case 'bearer_token':
        return cleanObject({ token: a.token })
      case 'basic':
        return cleanObject({ username: a.username, password: a.password })
      case 'oauth2':
        return cleanObject({
          client_id: a.client_id,
          client_secret: a.client_secret,
          token_url: a.token_url,
          scope: a.scope,
          authorize_url: a.authorize_url,
          access_token: a.access_token,
          refresh_token: a.refresh_token,
        })
      default:
        return {}
    }
  }

  function buildPayload(): Record<string, unknown> {
    const headersObj = Object.fromEntries(
      headers.filter((h) => h.key.trim()).map((h) => [h.key.trim(), h.value]),
    )
    const payload: Record<string, unknown> = {
      name: name.trim() || 'Custom REST API',
      base_url: baseUrl.trim() || null,
      field_mappings: mappings
        .filter((m) => m.source_field && m.target_path.trim())
        .map((m) => ({
          source_field: m.source_field,
          target_path: m.target_path.trim(),
          transform: m.transform,
        })),
      request_template: {
        method,
        path: path.trim() || null,
        headers: headersObj,
        body_template: bodyTemplate.trim() || null,
      },
      trigger_events: triggerEvents,
      config: triggerDocType.trim() ? { doc_type_filter: triggerDocType.trim() } : {},
    }
    if (!connectorId) {
      payload.type = 'rest_api'
      payload.auth_type = authType
      payload.auth_config = buildAuthConfig()
    } else {
      if (authType !== originalAuthType) payload.auth_type = authType
      if (authTouched) payload.auth_config = buildAuthConfig()
    }
    return payload
  }

  async function persist(): Promise<string | null> {
    setSaving(true)
    try {
      const payload = buildPayload()
      if (connectorId) {
        await api.put(`${API_PREFIX}/connectors/${connectorId}`, payload)
        setOriginalAuthType(authType)
        setAuthTouched(false)
        queryClient.invalidateQueries({ queryKey: ['connectors'] })
        return connectorId
      }
      const created = await api.post<Connector>(`${API_PREFIX}/connectors`, payload)
      setConnectorId(created.id)
      setOriginalAuthType(authType)
      setAuthTouched(false)
      initialized.current = true
      queryClient.invalidateQueries({ queryKey: ['connectors'] })
      navigate(`/connectors/${created.id}/edit`, { replace: true })
      return created.id
    } catch {
      toast.error('Could not save connector')
      return null
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    const cid = await persist()
    if (!cid) return
    setTesting(true)
    setTestResult(null)
    try {
      const res = await api.post<ConnectorTestResult>(`${API_PREFIX}/connectors/${cid}/test`)
      setTestResult(res)
    } catch {
      toast.error('Test request failed')
    } finally {
      setTesting(false)
    }
  }

  async function handlePreview() {
    if (!baseUrl.trim() && !bodyTemplate.trim() && mappings.length === 0) {
      toast.error('Add a request template or field mappings first')
      return
    }
    const cid = await persist()
    if (!cid) return
    setPreviewOpen(true)
  }

  async function saveDraft() {
    const cid = await persist()
    if (cid) {
      toast.success('Saved as draft')
      navigate('/connectors')
    }
  }

  async function saveAndActivate() {
    const cid = await persist()
    if (!cid) return
    try {
      const res = await api.post<ConnectorTestResult>(`${API_PREFIX}/connectors/${cid}/test`)
      if (res.success) toast.success('Connector activated — connection verified')
      else toast.warning(`Saved, but test failed: ${res.message}`)
    } catch {
      toast.warning('Saved, but connection test could not run')
    }
    navigate('/connectors')
  }

  function authorizeOAuth() {
    const url = authConfig.authorize_url || authConfig.token_url
    if (!url) {
      toast.error('Set an authorize or token URL first')
      return
    }
    const redirect = `${window.location.origin}/oauth/callback`
    const qs = new URLSearchParams({
      client_id: authConfig.client_id || '',
      scope: authConfig.scope || '',
      response_type: 'code',
      redirect_uri: redirect,
    })
    const popup = window.open(`${url}?${qs.toString()}`, 'docuflow-oauth', 'width=620,height=720')
    const handler = (event: MessageEvent) => {
      const data = event.data as { type?: string; access_token?: string; refresh_token?: string }
      if (data?.type === 'oauth_token' && data.access_token) {
        patchAuth({
          access_token: data.access_token,
          refresh_token: data.refresh_token ?? '',
        })
        toast.success('Authorized — tokens captured')
        window.removeEventListener('message', handler)
        popup?.close()
      }
    }
    window.addEventListener('message', handler)
  }

  const busy = saving || testing

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/connectors')}
          className="rounded-lg border border-surface-border p-2 text-surface-muted hover:text-surface-100"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-surface-50">
            {connectorId ? 'Configure Connector' : 'New Custom REST Connector'}
          </h1>
          <p className="mt-0.5 text-sm text-surface-muted">
            Wire DocuFlow to any REST API — no native connector required.
          </p>
        </div>
      </div>

      <Tabs.Root defaultValue="connection">
        <Tabs.List className="flex gap-1 border-b border-surface-border">
          {[
            { v: 'connection', l: 'Connection' },
            { v: 'mapping', l: 'Field Mapping' },
            { v: 'triggers', l: 'Trigger Rules' },
          ].map((t) => (
            <Tabs.Trigger
              key={t.v}
              value={t.v}
              className={cn(
                'border-b-2 border-transparent px-4 py-2.5 text-sm font-medium text-surface-muted transition-colors',
                'hover:text-surface-100 data-[state=active]:border-ice-500 data-[state=active]:text-surface-50',
              )}
            >
              {t.l}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        {/* TAB 1 — Connection */}
        <Tabs.Content value="connection" className="mt-5 space-y-5 focus:outline-none">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Connector name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My ERP Integration"
                className="input"
              />
            </Field>
            <Field label="Base URL">
              <input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.acme.com"
                className="input font-mono"
              />
            </Field>
          </div>

          <div>
            <SectionLabel>Authentication</SectionLabel>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {AUTH_TYPES.map((a) => (
                <button
                  key={a.value}
                  onClick={() => {
                    setAuthType(a.value)
                    setAuthTouched(true)
                  }}
                  className={cn(
                    'rounded-lg border p-3 text-left transition-colors',
                    authType === a.value
                      ? 'border-ice-500 bg-ice-500/10'
                      : 'border-surface-border hover:border-surface-500',
                  )}
                >
                  <div className="flex items-center gap-1.5 text-sm font-medium text-surface-50">
                    {authType === a.value && <Check className="h-3.5 w-3.5 text-ice-400" />}
                    {a.label}
                  </div>
                  <div className="mt-0.5 text-[11px] text-surface-muted">{a.desc}</div>
                </button>
              ))}
            </div>

            <div className="mt-3">
              <AuthFields
                authType={authType}
                config={authConfig}
                onChange={patchAuth}
                onAuthorize={authorizeOAuth}
                hasStoredAuth={Boolean(connectorId) && !authTouched}
              />
            </div>
          </div>

          <div>
            <SectionLabel>Request Template</SectionLabel>
            <div className="flex gap-2">
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="input w-32"
              >
                {METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <input
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="/api/v2/invoices"
                className="input flex-1 font-mono"
              />
            </div>

            <div className="mt-3">
              <span className="mb-1.5 block text-[11px] font-medium text-surface-muted">Headers</span>
              <div className="space-y-1.5">
                {headers.map((h, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      value={h.key}
                      onChange={(e) =>
                        setHeaders((rows) =>
                          rows.map((r, idx) => (idx === i ? { ...r, key: e.target.value } : r)),
                        )
                      }
                      placeholder="Header name"
                      className="input flex-1 font-mono text-xs"
                    />
                    <input
                      value={h.value}
                      onChange={(e) =>
                        setHeaders((rows) =>
                          rows.map((r, idx) => (idx === i ? { ...r, value: e.target.value } : r)),
                        )
                      }
                      placeholder="Value (supports {{field_key}})"
                      className="input flex-1 font-mono text-xs"
                    />
                    <button
                      onClick={() => setHeaders((rows) => rows.filter((_, idx) => idx !== i))}
                      className="rounded border border-surface-border p-2 text-surface-muted hover:text-rose-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setHeaders((rows) => [...rows, { key: '', value: '' }])}
                className="btn-ghost mt-1.5 py-1 text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Header
              </button>
            </div>

            <div className="mt-3">
              <span className="mb-1.5 block text-[11px] font-medium text-surface-muted">
                Body template <span className="text-surface-500">(JSON with {`{{field_key}}`} placeholders)</span>
              </span>
              <BodyTemplateEditor value={bodyTemplate} onChange={setBodyTemplate} />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={handleTest} disabled={busy} className="btn-outline">
              {testing ? <Spinner /> : <Wifi className="h-4 w-4" />}
              Test Connection
            </button>
            {testResult && <TestChip result={testResult} />}
          </div>
        </Tabs.Content>

        {/* TAB 2 — Field Mapping */}
        <Tabs.Content value="mapping" className="mt-5 space-y-4 focus:outline-none">
          <FieldMappingTab
            docType={docType}
            setDocType={setDocType}
            mappings={mappings}
            setMappings={setMappings}
            onPreview={handlePreview}
            busy={busy}
          />
        </Tabs.Content>

        {/* TAB 3 — Trigger Rules */}
        <Tabs.Content value="triggers" className="mt-5 space-y-5 focus:outline-none">
          <div>
            <SectionLabel>Trigger Events</SectionLabel>
            <div className="space-y-1.5">
              {TRIGGER_EVENTS.map((e) => (
                <label
                  key={e.value}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-surface-border px-3 py-2.5 text-sm text-surface-100 hover:border-surface-500"
                >
                  <input
                    type="checkbox"
                    checked={triggerEvents.includes(e.value)}
                    onChange={(ev) =>
                      setTriggerEvents((prev) =>
                        ev.target.checked
                          ? [...prev, e.value]
                          : prev.filter((x) => x !== e.value),
                      )
                    }
                    className="h-4 w-4 rounded border-surface-border bg-surface-800 text-ice-500"
                  />
                  <span>{e.label}</span>
                  <span className="ml-auto font-mono text-[11px] text-surface-muted">{e.value}</span>
                </label>
              ))}
            </div>
          </div>

          <Field label="Only trigger for doc type">
            <input
              value={triggerDocType}
              onChange={(e) => setTriggerDocType(e.target.value)}
              placeholder="All types (leave blank)"
              list="builder-doc-types"
              className="input max-w-sm"
            />
            <datalist id="builder-doc-types">
              {DOC_TYPE_SUGGESTIONS.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </Field>

          <div className="flex items-start gap-2.5 rounded-lg border border-surface-border bg-surface-800/50 p-3.5 text-sm text-surface-muted">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-ice-400" />
            <span>
              Failed requests retry 3x with exponential backoff. After that, it&apos;s logged as an
              integration failure and surfaces in the Exception Resolution Center.
            </span>
          </div>
        </Tabs.Content>
      </Tabs.Root>

      {/* Sticky action bar — bleeds to the content column edges */}
      <div className="sticky bottom-0 z-30 -mx-6 -mb-6 border-t border-surface-border bg-surface-800/95 px-6 py-3 backdrop-blur">
        <div className="flex items-center justify-end gap-2">
          <button onClick={saveDraft} disabled={busy} className="btn-ghost">
            {saving ? <Spinner /> : null}
            Save as Draft
          </button>
          <button onClick={saveAndActivate} disabled={busy} className="btn-primary">
            <Check className="h-4 w-4" />
            Save &amp; Activate
          </button>
        </div>
      </div>

      {connectorId && (
        <PreviewModal
          connectorId={connectorId}
          docType={docType}
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  )
}

function AuthFields({
  authType,
  config,
  onChange,
  onAuthorize,
  hasStoredAuth,
}: {
  authType: ConnectorAuthType
  config: AuthConfig
  onChange: (patch: AuthConfig) => void
  onAuthorize: () => void
  hasStoredAuth: boolean
}) {
  if (authType === 'none') return null

  const storedHint = hasStoredAuth ? '•••••• stored (leave blank to keep)' : undefined

  return (
    <div className="rounded-lg border border-surface-border bg-surface-800/40 p-4">
      {hasStoredAuth && (
        <div className="mb-3 flex items-center gap-1.5 text-[11px] text-surface-muted">
          <Lock className="h-3 w-3" />
          Credentials are stored encrypted. Re-enter to replace them.
        </div>
      )}
      {authType === 'api_key' && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Key name">
            <input
              value={config.name ?? ''}
              onChange={(e) => onChange({ name: e.target.value })}
              placeholder="X-API-Key"
              className="input font-mono"
            />
          </Field>
          <Field label="Placement">
            <select
              value={config.placement || 'header'}
              onChange={(e) => onChange({ placement: e.target.value })}
              className="input"
            >
              <option value="header">Header</option>
              <option value="query">Query param</option>
            </select>
          </Field>
          <Field label="Value">
            <input
              type="password"
              value={config.value ?? ''}
              onChange={(e) => onChange({ value: e.target.value })}
              placeholder={storedHint}
              className="input font-mono"
            />
          </Field>
        </div>
      )}
      {authType === 'bearer_token' && (
        <Field label="Token">
          <input
            type="password"
            value={config.token ?? ''}
            onChange={(e) => onChange({ token: e.target.value })}
            placeholder={storedHint}
            className="input font-mono"
          />
        </Field>
      )}
      {authType === 'basic' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Username">
            <input
              value={config.username ?? ''}
              onChange={(e) => onChange({ username: e.target.value })}
              className="input"
            />
          </Field>
          <Field label="Password">
            <input
              type="password"
              value={config.password ?? ''}
              onChange={(e) => onChange({ password: e.target.value })}
              placeholder={storedHint}
              className="input font-mono"
            />
          </Field>
        </div>
      )}
      {authType === 'oauth2' && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Client ID">
              <input
                value={config.client_id ?? ''}
                onChange={(e) => onChange({ client_id: e.target.value })}
                className="input font-mono"
              />
            </Field>
            <Field label="Client Secret">
              <input
                type="password"
                value={config.client_secret ?? ''}
                onChange={(e) => onChange({ client_secret: e.target.value })}
                placeholder={storedHint}
                className="input font-mono"
              />
            </Field>
            <Field label="Token URL">
              <input
                value={config.token_url ?? ''}
                onChange={(e) => onChange({ token_url: e.target.value })}
                placeholder="https://auth.acme.com/oauth/token"
                className="input font-mono"
              />
            </Field>
            <Field label="Scope">
              <input
                value={config.scope ?? ''}
                onChange={(e) => onChange({ scope: e.target.value })}
                placeholder="read write"
                className="input font-mono"
              />
            </Field>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onAuthorize} className="btn-outline">
              <ShieldCheck className="h-4 w-4" />
              Authorize
            </button>
            {config.access_token ? (
              <span className="flex items-center gap-1 text-xs text-emerald-400">
                <Check className="h-3.5 w-3.5" />
                Access token captured
              </span>
            ) : (
              <span className="text-xs text-surface-muted">
                Opens the provider login in a popup to capture tokens.
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function FieldMappingTab({
  docType,
  setDocType,
  mappings,
  setMappings,
  onPreview,
  busy,
}: {
  docType: string
  setDocType: (v: string) => void
  mappings: ConnectorFieldMapping[]
  setMappings: React.Dispatch<React.SetStateAction<ConnectorFieldMapping[]>>
  onPreview: () => void
  busy: boolean
}) {
  const { data: options, isFetching } = useQuery({
    queryKey: ['connectors', 'field-helper', docType],
    enabled: Boolean(docType.trim()),
    queryFn: () =>
      api.get<FieldMappingOption[]>(`${API_PREFIX}/connectors/field-mapping-helper`, {
        params: { doc_type: docType.trim() },
      }),
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Field label="Document type this connector applies to">
          <input
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            placeholder="invoice"
            list="builder-doc-types"
            className="input w-64"
          />
        </Field>
        <button onClick={onPreview} disabled={busy} className="btn-outline">
          Preview Payload
        </button>
      </div>

      {!docType.trim() ? (
        <p className="rounded-lg border border-dashed border-surface-border px-4 py-10 text-center text-sm text-surface-muted">
          Enter a document type to load its available source fields.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-surface-border">
          <div className="grid grid-cols-[1fr_1fr_180px_40px] gap-2 border-b border-surface-border bg-surface-800/60 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-surface-muted">
            <span>Source Field (DocuFlow)</span>
            <span>Target Path</span>
            <span>Transform</span>
            <span />
          </div>
          <div className="divide-y divide-surface-border">
            {mappings.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-surface-muted">
                No mappings yet. Add one to shape the outbound payload.
              </p>
            )}
            {mappings.map((m, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_180px_40px] items-center gap-2 px-3 py-2">
                <select
                  value={m.source_field}
                  onChange={(e) =>
                    setMappings((rows) =>
                      rows.map((r, idx) => (idx === i ? { ...r, source_field: e.target.value } : r)),
                    )
                  }
                  className="input text-xs"
                >
                  <option value="">Select field…</option>
                  {(options ?? []).map((o) => (
                    <option key={o.field_key} value={o.field_key}>
                      {o.field_label}
                    </option>
                  ))}
                  {m.source_field && !(options ?? []).some((o) => o.field_key === m.source_field) && (
                    <option value={m.source_field}>{m.source_field}</option>
                  )}
                </select>
                <input
                  value={m.target_path}
                  onChange={(e) =>
                    setMappings((rows) =>
                      rows.map((r, idx) => (idx === i ? { ...r, target_path: e.target.value } : r)),
                    )
                  }
                  placeholder="$.invoice.vendor.name"
                  className="input font-mono text-xs"
                />
                <select
                  value={m.transform}
                  onChange={(e) =>
                    setMappings((rows) =>
                      rows.map((r, idx) =>
                        idx === i ? { ...r, transform: e.target.value as ConnectorTransform } : r,
                      ),
                    )
                  }
                  className="input text-xs"
                >
                  {TRANSFORMS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setMappings((rows) => rows.filter((_, idx) => idx !== i))}
                  className="flex justify-center text-surface-muted hover:text-rose-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <div className="border-t border-surface-border px-3 py-2">
            <button
              onClick={() =>
                setMappings((rows) => [...rows, { source_field: '', target_path: '', transform: 'none' }])
              }
              className="btn-ghost py-1 text-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Mapping
            </button>
            {isFetching && <span className="ml-2 text-[11px] text-surface-muted">Loading fields…</span>}
          </div>
        </div>
      )}
    </div>
  )
}

function PreviewModal({
  connectorId,
  docType,
  open,
  onClose,
}: {
  connectorId: string
  docType: string
  open: boolean
  onClose: () => void
}) {
  const [docId, setDocId] = useState('')

  const { data: docs } = useDocuments(
    { page_size: 50, ...(docType.trim() ? { doc_type: docType.trim() } : {}) },
  )
  const items = docs?.items ?? []
  const { data: detail } = useDocument(docId || undefined)

  const preview = useMutation({
    mutationFn: () =>
      api.post<ConnectorPreview>(`${API_PREFIX}/connectors/${connectorId}/preview`, {
        sample_document_id: docId,
      }),
  })

  useEffect(() => {
    if (open && !docId && items.length) setDocId(items[0].id)
  }, [open, items, docId])

  useEffect(() => {
    if (open && docId) preview.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, docId])

  const sourceFields = detail?.fields ?? []

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex h-[80vh] w-[900px] max-w-[94vw] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-surface-border bg-surface-700 shadow-xl">
          <div className="flex items-center justify-between border-b border-surface-border px-5 py-3">
            <div>
              <Dialog.Title className="text-sm font-medium text-surface-50">
                Preview Payload
              </Dialog.Title>
              <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ice-400">
                <ShieldCheck className="h-3 w-3" />
                This is exactly what will be sent.
              </p>
            </div>
            <Dialog.Close className="rounded p-1 text-surface-muted hover:bg-surface-600 hover:text-surface-100">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <div className="border-b border-surface-border px-5 py-3">
            <label className="mb-1 block text-[10px] uppercase tracking-wide text-surface-muted">
              Sample document
            </label>
            <select
              value={docId}
              onChange={(e) => setDocId(e.target.value)}
              className="input max-w-md"
            >
              <option value="">Select a document…</option>
              {items.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.filename}
                  {d.doc_type ? ` · ${d.doc_type}` : ''}
                </option>
              ))}
            </select>
            {items.length === 0 && (
              <p className="mt-1 text-[11px] text-surface-muted">
                No documents available to preview with.
              </p>
            )}
          </div>

          <div className="grid flex-1 grid-cols-2 gap-4 overflow-hidden p-5">
            <div className="flex flex-col overflow-hidden">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-surface-muted">
                Source document fields
              </h3>
              <div className="flex-1 overflow-auto rounded-lg border border-surface-border bg-surface-900 p-3">
                {sourceFields.length ? (
                  <dl className="space-y-1.5 text-xs">
                    {sourceFields.map((f) => (
                      <div key={f.id} className="flex justify-between gap-3">
                        <dt className="font-mono text-surface-muted">{f.field_key}</dt>
                        <dd className="truncate text-right text-surface-100">
                          {f.validated_value || f.raw_value || '—'}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="text-xs text-surface-muted">No fields on this document.</p>
                )}
              </div>
            </div>

            <div className="flex flex-col overflow-hidden">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-surface-muted">
                Generated payload
              </h3>
              {preview.isPending ? (
                <div className="flex flex-1 items-center justify-center rounded-lg border border-surface-border bg-surface-900">
                  <Spinner />
                </div>
              ) : preview.data ? (
                <div className="flex flex-1 flex-col overflow-hidden">
                  <div className="mb-2 flex items-center gap-2 text-[11px]">
                    <span className="rounded bg-ice-500/15 px-1.5 py-0.5 font-mono font-semibold text-ice-400">
                      {preview.data.method}
                    </span>
                    <span className="truncate font-mono text-surface-muted">{preview.data.url}</span>
                  </div>
                  <CodeBlock code={preview.data.body} className="flex-1" maxHeight="100%" />
                </div>
              ) : (
                <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-surface-border text-xs text-surface-muted">
                  Pick a document to generate the payload.
                </div>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function BodyTemplateEditor({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const preRef = useRef<HTMLPreElement>(null)

  const html = useMemo(() => {
    const esc = escapeHtml(value)
    return (
      esc.replace(
        /(\{\{[^}]+\}\})/g,
        '<span style="color:#38BDF8;font-weight:600">$1</span>',
      ) + '\n'
    )
  }, [value])

  return (
    <div className="relative h-56 overflow-hidden rounded-lg border border-surface-border bg-surface-900 font-mono text-xs leading-relaxed">
      <pre
        ref={preRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-auto whitespace-pre-wrap break-words p-3 text-surface-100"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <textarea
        value={value}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        onScroll={(e) => {
          if (preRef.current) {
            preRef.current.scrollTop = e.currentTarget.scrollTop
            preRef.current.scrollLeft = e.currentTarget.scrollLeft
          }
        }}
        placeholder={'{\n  "invoice_number": "{{invoice_number}}",\n  "total": "{{total}}"\n}'}
        className="absolute inset-0 h-full w-full resize-none overflow-auto whitespace-pre-wrap break-words bg-transparent p-3 text-transparent caret-ice-300 outline-none placeholder:text-surface-600"
      />
    </div>
  )
}

function TestChip({ result }: { result: ConnectorTestResult }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
        result.success
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
          : 'border-rose-500/30 bg-rose-500/10 text-rose-400',
      )}
    >
      {result.success ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
      {result.status_code ? `${result.status_code} · ` : ''}
      {result.success ? 'Connected' : 'Failed'}
      <span className="text-surface-muted">· {result.latency_ms}ms</span>
    </span>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <label className="mb-1 block text-[10px] uppercase tracking-wide text-surface-muted">
        {label}
      </label>
      {children}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-surface-muted">
      {children}
    </h2>
  )
}
