import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Trash2, X } from 'lucide-react'
import { api, API_PREFIX } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useWorkflowStore } from '@/store/workflowStore'
import { CATEGORY_STYLE, NODE_KINDS } from './catalog'
import type { Connector } from '@/types'

type Config = Record<string, unknown>

export function NodeConfigPanel() {
  const selectedId = useWorkflowStore((s) => s.selectedId)
  const node = useWorkflowStore((s) =>
    s.nodes.find((n) => n.id === s.selectedId),
  )
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData)
  const deleteNode = useWorkflowStore((s) => s.deleteNode)
  const setSelected = useWorkflowStore((s) => s.setSelected)

  const [label, setLabel] = useState('')
  const [config, setConfig] = useState<Config>({})

  useEffect(() => {
    if (node) {
      setLabel(node.data.label)
      setConfig({ ...(node.data.config ?? {}) })
    }
  }, [node?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!selectedId || !node) return null

  const meta = NODE_KINDS[node.data.kind]
  const style = CATEGORY_STYLE[meta?.category ?? 'process']
  const Icon = meta?.Icon

  const set = (key: string, value: unknown) =>
    setConfig((c) => ({ ...c, [key]: value }))

  function save() {
    updateNodeData(node!.id, { label, config })
  }

  return (
    <div className="flex h-full w-[280px] shrink-0 flex-col overflow-hidden border-l border-surface-border bg-surface-800">
      <div className="flex items-center gap-2 border-b border-surface-border px-4 py-3">
        {Icon && (
          <div
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-md',
              style.chipBg,
            )}
          >
            <Icon className={cn('h-4 w-4', style.text)} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-wide text-surface-muted">
            {meta?.category}
          </div>
          <div className="truncate text-sm font-medium text-surface-50">
            {meta?.label}
          </div>
        </div>
        <button
          onClick={() => setSelected(null)}
          className="rounded p-1 text-surface-muted hover:bg-surface-600 hover:text-surface-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <Field label="Node label">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="input"
          />
        </Field>

        {node.data.kind === 'classify' && (
          <ClassifyConfig config={config} set={set} />
        )}
        {node.data.kind === 'extract' && (
          <ExtractConfig config={config} setConfig={setConfig} />
        )}
        {node.data.kind === 'validate' && (
          <ValidateConfig config={config} set={set} />
        )}
        {node.data.kind === 'decision' && (
          <DecisionConfig config={config} set={set} />
        )}
        {node.data.kind === 'integrate' && (
          <IntegrateConfig config={config} set={set} setConfig={setConfig} />
        )}
        {node.data.kind === 'notify' && (
          <NotifyConfig config={config} set={set} />
        )}
        {node.data.kind === 'wait' && (
          <Field label="Delay (minutes)">
            <input
              type="number"
              value={Number(config.delay_minutes ?? 0)}
              onChange={(e) => set('delay_minutes', Number(e.target.value))}
              className="input"
            />
          </Field>
        )}
        {node.data.kind === 'archive' && (
          <Field label="Retention (days)">
            <input
              type="number"
              value={Number(config.retention_days ?? 0)}
              onChange={(e) => set('retention_days', Number(e.target.value))}
              className="input"
            />
          </Field>
        )}
        {['file_upload', 'email_ingestion', 'batch_import', 'ocr', 'approve_reject'].includes(
          node.data.kind,
        ) && (
          <p className="rounded-lg border border-surface-border bg-surface-900 p-3 text-xs text-surface-muted">
            {meta?.description}. No additional configuration required.
          </p>
        )}
      </div>

      <div className="space-y-2 border-t border-surface-border p-3">
        <button onClick={save} className="btn-primary w-full">
          Save Config
        </button>
        <button
          onClick={() => deleteNode(node.id)}
          className="btn-ghost w-full text-rose-400 hover:bg-rose-500/10"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete Node
        </button>
      </div>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1 block text-[10px] uppercase tracking-wide text-surface-muted">
        {label}
      </label>
      {children}
    </div>
  )
}

function ClassifyConfig({
  config,
  set,
}: {
  config: Config
  set: (k: string, v: unknown) => void
}) {
  const threshold = Number(config.confidence_threshold ?? 0.7)
  return (
    <>
      <Field label="AI provider">
        <select
          value={String(config.ai_provider ?? 'claude')}
          onChange={(e) => set('ai_provider', e.target.value)}
          className="input"
        >
          <option value="claude">Claude</option>
          <option value="openai">OpenAI (GPT-4o)</option>
        </select>
      </Field>
      <Field label={`Confidence threshold — ${Math.round(threshold * 100)}%`}>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={threshold}
          onChange={(e) => set('confidence_threshold', Number(e.target.value))}
          className="w-full accent-ice-500"
        />
      </Field>
    </>
  )
}

interface FieldDef {
  key: string
  label: string
}

function ExtractConfig({
  config,
  setConfig,
}: {
  config: Config
  setConfig: React.Dispatch<React.SetStateAction<Config>>
}) {
  const fields = (config.fields as FieldDef[]) ?? []
  const update = (next: FieldDef[]) =>
    setConfig((c) => ({ ...c, fields: next }))

  return (
    <Field label="Fields to extract">
      <div className="space-y-2">
        {fields.map((f, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input
              value={f.key}
              onChange={(e) => {
                const next = [...fields]
                next[i] = { ...f, key: e.target.value }
                update(next)
              }}
              placeholder="key"
              className="input font-mono text-xs"
            />
            <input
              value={f.label}
              onChange={(e) => {
                const next = [...fields]
                next[i] = { ...f, label: e.target.value }
                update(next)
              }}
              placeholder="Label"
              className="input text-xs"
            />
            <button
              onClick={() => update(fields.filter((_, idx) => idx !== i))}
              className="rounded p-1 text-surface-muted hover:text-rose-400"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <button
          onClick={() => update([...fields, { key: '', label: '' }])}
          className="btn-outline w-full py-1 text-xs"
        >
          <Plus className="h-3.5 w-3.5" />
          Add field
        </button>
      </div>
    </Field>
  )
}

function ValidateConfig({
  config,
  set,
}: {
  config: Config
  set: (k: string, v: unknown) => void
}) {
  return (
    <>
      <Field label="Assignee role">
        <select
          value={String(config.assignee_role ?? 'member')}
          onChange={(e) => set('assignee_role', e.target.value)}
          className="input"
        >
          <option value="owner">Owner</option>
          <option value="admin">Admin</option>
          <option value="member">Member</option>
          <option value="viewer">Viewer</option>
        </select>
      </Field>
      <Field label="SLA (hours)">
        <input
          type="number"
          value={Number(config.sla_hours ?? 24)}
          onChange={(e) => set('sla_hours', Number(e.target.value))}
          className="input"
        />
      </Field>
    </>
  )
}

function DecisionConfig({
  config,
  set,
}: {
  config: Config
  set: (k: string, v: unknown) => void
}) {
  return (
    <Field label="Condition">
      <div className="space-y-2">
        <input
          value={String(config.field ?? '')}
          onChange={(e) => set('field', e.target.value)}
          placeholder="Field key (e.g. total_amount)"
          className="input font-mono text-xs"
        />
        <select
          value={String(config.operator ?? 'equals')}
          onChange={(e) => set('operator', e.target.value)}
          className="input text-xs"
        >
          <option value="equals">equals</option>
          <option value="not_equals">not equals</option>
          <option value="greater_than">greater than</option>
          <option value="less_than">less than</option>
          <option value="contains">contains</option>
        </select>
        <input
          value={String(config.value ?? '')}
          onChange={(e) => set('value', e.target.value)}
          placeholder="Value"
          className="input text-xs"
        />
      </div>
    </Field>
  )
}

interface Mapping {
  source: string
  target: string
}

function IntegrateConfig({
  config,
  set,
  setConfig,
}: {
  config: Config
  set: (k: string, v: unknown) => void
  setConfig: React.Dispatch<React.SetStateAction<Config>>
}) {
  const { data: connectors } = useQuery({
    queryKey: ['connectors'],
    queryFn: () => api.get<Connector[]>(`${API_PREFIX}/connectors`),
  })
  const mappings = (config.mappings as Mapping[]) ?? []
  const update = (next: Mapping[]) =>
    setConfig((c) => ({ ...c, mappings: next }))

  return (
    <>
      <Field label="Connector">
        <select
          value={String(config.connector_id ?? '')}
          onChange={(e) => set('connector_id', e.target.value)}
          className="input"
        >
          <option value="">Select connector…</option>
          {connectors?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.type})
            </option>
          ))}
        </select>
      </Field>
      <Field label="Field mapping">
        <div className="space-y-2">
          {mappings.map((m, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input
                value={m.source}
                onChange={(e) => {
                  const next = [...mappings]
                  next[i] = { ...m, source: e.target.value }
                  update(next)
                }}
                placeholder="source"
                className="input font-mono text-xs"
              />
              <span className="text-surface-muted">→</span>
              <input
                value={m.target}
                onChange={(e) => {
                  const next = [...mappings]
                  next[i] = { ...m, target: e.target.value }
                  update(next)
                }}
                placeholder="target"
                className="input font-mono text-xs"
              />
              <button
                onClick={() => update(mappings.filter((_, idx) => idx !== i))}
                className="rounded p-1 text-surface-muted hover:text-rose-400"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <button
            onClick={() => update([...mappings, { source: '', target: '' }])}
            className="btn-outline w-full py-1 text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            Add mapping
          </button>
        </div>
      </Field>
    </>
  )
}

function NotifyConfig({
  config,
  set,
}: {
  config: Config
  set: (k: string, v: unknown) => void
}) {
  return (
    <>
      <Field label="Recipient">
        <input
          value={String(config.recipient ?? '')}
          onChange={(e) => set('recipient', e.target.value)}
          placeholder="email or #slack-channel"
          className="input text-sm"
        />
      </Field>
      <Field label="Subject template">
        <input
          value={String(config.subject ?? '')}
          onChange={(e) => set('subject', e.target.value)}
          placeholder="Document {{doc_id}} processed"
          className="input text-sm"
        />
      </Field>
      <Field label="Body template">
        <textarea
          value={String(config.body ?? '')}
          onChange={(e) => set('body', e.target.value)}
          rows={4}
          placeholder="The document {{filename}} completed with status {{status}}."
          className="input resize-none text-sm"
        />
      </Field>
    </>
  )
}
