import {
  Archive,
  Bell,
  CheckCircle,
  Clock,
  GitBranch,
  Layers,
  Mail,
  Plug,
  ScanLine,
  Sparkles,
  Tags,
  Upload,
  UserCheck,
  type LucideIcon,
} from 'lucide-react'

export type NodeCategory =
  | 'trigger'
  | 'process'
  | 'human'
  | 'logic'
  | 'action'

export interface NodeKindMeta {
  kind: string
  label: string
  description: string
  category: NodeCategory
  Icon: LucideIcon
  defaultConfig?: Record<string, unknown>
}

export const NODE_KINDS: Record<string, NodeKindMeta> = {
  // Triggers
  file_upload: {
    kind: 'file_upload',
    label: 'File Upload',
    description: 'Documents uploaded via UI or API',
    category: 'trigger',
    Icon: Upload,
  },
  email_ingestion: {
    kind: 'email_ingestion',
    label: 'Email Ingestion',
    description: 'Monitor email inbox',
    category: 'trigger',
    Icon: Mail,
  },
  batch_import: {
    kind: 'batch_import',
    label: 'Batch Import',
    description: 'Triggered by batch creation',
    category: 'trigger',
    Icon: Layers,
  },
  // Processing
  ocr: {
    kind: 'ocr',
    label: 'OCR',
    description: 'Extract text from document image',
    category: 'process',
    Icon: ScanLine,
  },
  classify: {
    kind: 'classify',
    label: 'Classify',
    description: 'AI document type classification',
    category: 'process',
    Icon: Tags,
    defaultConfig: { ai_provider: 'claude', confidence_threshold: 0.7 },
  },
  extract: {
    kind: 'extract',
    label: 'Extract Fields',
    description: 'AI field extraction',
    category: 'process',
    Icon: Sparkles,
    defaultConfig: { fields: [] },
  },
  // Human
  validate: {
    kind: 'validate',
    label: 'Validate',
    description: 'Human review queue assignment',
    category: 'human',
    Icon: UserCheck,
    defaultConfig: { assignee_role: 'member', sla_hours: 24 },
  },
  approve_reject: {
    kind: 'approve_reject',
    label: 'Approve/Reject',
    description: 'Human decision gate',
    category: 'human',
    Icon: CheckCircle,
  },
  // Logic
  decision: {
    kind: 'decision',
    label: 'Decision',
    description: 'If/else branching on field value',
    category: 'logic',
    Icon: GitBranch,
    defaultConfig: { field: '', operator: 'equals', value: '' },
  },
  wait: {
    kind: 'wait',
    label: 'Wait',
    description: 'Delay or wait for external event',
    category: 'logic',
    Icon: Clock,
    defaultConfig: { delay_minutes: 60 },
  },
  // Actions
  integrate: {
    kind: 'integrate',
    label: 'Integrate',
    description: 'Send to external system via connector',
    category: 'action',
    Icon: Plug,
    defaultConfig: { connector_id: '', mappings: [] },
  },
  notify: {
    kind: 'notify',
    label: 'Notify',
    description: 'Send email/Slack notification',
    category: 'action',
    Icon: Bell,
    defaultConfig: { recipient: '', subject: '', body: '' },
  },
  archive: {
    kind: 'archive',
    label: 'Archive',
    description: 'Move to storage with metadata',
    category: 'action',
    Icon: Archive,
    defaultConfig: { retention_days: 365 },
  },
}

export const PALETTE_GROUPS: Array<{
  category: NodeCategory
  label: string
  kinds: string[]
}> = [
  { category: 'trigger', label: 'Triggers', kinds: ['file_upload', 'email_ingestion', 'batch_import'] },
  { category: 'process', label: 'Processing', kinds: ['ocr', 'classify', 'extract'] },
  { category: 'human', label: 'Human', kinds: ['validate', 'approve_reject'] },
  { category: 'logic', label: 'Logic', kinds: ['decision', 'wait'] },
  { category: 'action', label: 'Actions', kinds: ['integrate', 'notify', 'archive'] },
]

/** Per-category visual styling. `border` is an inline hex (top border accent). */
export const CATEGORY_STYLE: Record<
  NodeCategory,
  { border: string; text: string; chipBg: string; dot: string }
> = {
  trigger: {
    border: '#3B82F6',
    text: 'text-blue-400',
    chipBg: 'bg-blue-500/15 text-blue-300',
    dot: 'bg-blue-400',
  },
  process: {
    border: '#38BDF8',
    text: 'text-ice-400',
    chipBg: 'bg-ice-500/15 text-ice-400',
    dot: 'bg-ice-400',
  },
  human: {
    border: '#F59E0B',
    text: 'text-amber-400',
    chipBg: 'bg-amber-500/15 text-amber-400',
    dot: 'bg-amber-400',
  },
  logic: {
    border: '#94A3B8',
    text: 'text-slate-300',
    chipBg: 'bg-surface-600 text-surface-100',
    dot: 'bg-slate-400',
  },
  action: {
    border: '#10B981',
    text: 'text-emerald-400',
    chipBg: 'bg-emerald-500/15 text-emerald-400',
    dot: 'bg-emerald-400',
  },
}

export function categoryOfKind(kind: string): NodeCategory {
  return NODE_KINDS[kind]?.category ?? 'process'
}

export function defaultConfigFor(kind: string): Record<string, unknown> {
  return { ...(NODE_KINDS[kind]?.defaultConfig ?? {}) }
}
