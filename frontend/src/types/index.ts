export type Role = 'owner' | 'admin' | 'member' | 'viewer'
export type AIProvider = 'claude' | 'openai'

export type DocumentStatus =
  | 'captured'
  | 'ocr'
  | 'classifying'
  | 'extracting'
  | 'validating'
  | 'complete'
  | 'exception'
  | 'rejected'

export interface Tenant {
  id: string
  slug: string
  name: string
  plan: string
  ai_provider: AIProvider
  logo_url?: string | null
  is_active?: boolean
  created_at?: string
}

export interface User {
  id: string
  tenant_id: string
  email: string
  full_name: string
  role: Role
  avatar_url?: string | null
  is_active?: boolean
  created_at?: string
}

export interface DocumentField {
  id: string
  field_key: string
  field_label: string
  raw_value: string
  validated_value?: string | null
  confidence: number
  is_validated: boolean
  validator_id?: string | null
  validated_at?: string | null
}

export interface DocumentEvent {
  id: string
  event_type: string
  actor_id?: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface DocumentSummary {
  id: string
  filename: string
  file_type: string
  page_count: number
  status: DocumentStatus
  doc_type?: string | null
  batch_id?: string | null
  workflow_id?: string | null
  assigned_to?: string | null
  field_count: number
  event_count: number
  avg_confidence?: number | null
  created_at: string
  completed_at?: string | null
}

export interface DocumentDetail extends Omit<DocumentSummary, 'field_count' | 'event_count'> {
  ocr_text?: string | null
  file_url?: string | null
  fields: DocumentField[]
  events: DocumentEvent[]
}

export interface Batch {
  id: string
  name: string
  workflow_id?: string | null
  priority: string
  status: string
  doc_count: number
  submitted_by?: string | null
  created_at: string
  status_summary?: Record<string, number>
}

export interface WorkflowNode {
  id: string
  type: string
  label: string
  config?: Record<string, unknown>
  position?: { x: number; y: number }
}

export interface WorkflowEdge {
  source: string
  target: string
  condition?: string
}

export interface WorkflowDefinition {
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}

export interface Workflow {
  id: string
  name: string
  description?: string | null
  status: 'draft' | 'published' | 'archived'
  definition_json: WorkflowDefinition
  version: number
  created_by?: string | null
  published_at?: string | null
  created_at: string
}

export interface RobotRun {
  id: string
  robot_id: string
  status: 'running' | 'completed' | 'failed'
  started_at: string
  finished_at?: string | null
  items_processed: number
  error_message?: string | null
  logs_json?: RobotLogEntry[]
}

export interface RobotLogEntry {
  step: number
  type: string
  status: string
  message: string
  timestamp: string
}

export interface Robot {
  id: string
  name: string
  description?: string | null
  trigger_type: 'manual' | 'schedule' | 'event'
  schedule_cron?: string | null
  definition_json: Record<string, unknown>
  status: string
  created_by?: string | null
  created_at: string
  last_run?: RobotRun | null
  next_run?: string | null
}

export interface CaseTask {
  id: string
  title: string
  assignee_id?: string | null
  due_date?: string | null
  is_done: boolean
  created_at: string
}

export interface CaseNote {
  id: string
  author_id?: string | null
  content: string
  created_at: string
}

export interface CaseTimelineEntry {
  kind: string
  label: string
  at: string
}

export interface Case {
  id: string
  title: string
  type: string
  status: string
  priority: string
  owner_id?: string | null
  due_date?: string | null
  description?: string | null
  created_at: string
  tasks?: CaseTask[]
  notes?: CaseNote[]
  documents?: Array<Pick<DocumentSummary, 'id' | 'filename' | 'status' | 'doc_type'>>
  timeline?: CaseTimelineEntry[]
}

export type ConnectorAuthType =
  | 'none'
  | 'api_key'
  | 'bearer_token'
  | 'basic'
  | 'oauth2'

export type ConnectorTransform =
  | 'none'
  | 'uppercase'
  | 'date_iso'
  | 'currency_cents'

export interface ConnectorFieldMapping {
  source_field: string
  target_path: string
  transform: ConnectorTransform
}

export interface ConnectorRequestTemplate {
  method: string
  path?: string | null
  headers: Record<string, string>
  body_template?: string | null
}

export interface Connector {
  id: string
  type: string
  name: string
  status: string
  last_tested_at?: string | null
  config_keys?: string[]
  auth_type?: ConnectorAuthType
  base_url?: string | null
  field_mappings?: ConnectorFieldMapping[]
  request_template?: ConnectorRequestTemplate | null
  trigger_events?: string[]
  has_auth?: boolean
}

export interface ConnectorTestResult {
  status: string
  success: boolean
  status_code?: number | null
  message: string
  latency_ms: number
}

export interface ConnectorPreview {
  method: string
  url: string
  headers: Record<string, string>
  query: Record<string, string>
  body: unknown
}

export interface ConnectorLog {
  id: string
  connector_id: string
  document_id?: string | null
  request_summary: Record<string, unknown>
  response_status?: number | null
  response_body_truncated?: string | null
  success: boolean
  error_message?: string | null
  duration_ms: number
  created_at: string
}

export interface ConnectorLogList {
  items: ConnectorLog[]
  total: number
  page: number
  pages: number
}

export interface FieldMappingOption {
  field_key: string
  field_label: string
}

export interface ConnectorType {
  type: string
  name: string
  description: string
  icon: string
  fields_required: string[]
}

export interface Webhook {
  id: string
  url: string
  events: string[]
  secret: string
  is_active: boolean
}

export interface DailyStat {
  id?: string
  date: string
  docs_processed?: number
  docs_exceptions?: number
  avg_confidence?: number
  avg_processing_ms?: number
  // Overview-shaped variant
  processed?: number
  exceptions?: number
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pages: number
}

export type ExceptionCategory =
  | 'low_confidence'
  | 'unclassified'
  | 'missing_field'
  | 'ocr_failure'
  | 'duplicate'
  | 'timeout'
  | 'vendor_format_change'

export type ExceptionStatus = 'open' | 'investigating' | 'resolved' | 'ignored'

export interface ExceptionGroupSummary {
  id: string
  root_cause_label: string
  category: ExceptionCategory
  status: ExceptionStatus
  document_count: number
  affected_field?: string | null
  doc_type?: string | null
  vendor_hint?: string | null
  first_seen_at: string
  last_seen_at: string
}

export interface ExceptionMemberDocument {
  id: string
  filename: string
  confidence?: number | null
  status: DocumentStatus
  submitted_at: string
}

export interface ExceptionSuggestion {
  suggestion: string
  confidence: number
}

export interface ExceptionGroupDetail extends ExceptionGroupSummary {
  resolution_note?: string | null
  resolved_at?: string | null
  resolved_by?: string | null
  members: ExceptionMemberDocument[]
  suggested_resolution: ExceptionSuggestion
}

export interface ExceptionCategoryCount {
  category: ExceptionCategory
  count: number
}

export interface ExceptionTrendPoint {
  date: string
  count: number
}

export interface ExceptionSummary {
  total_open_groups: number
  total_affected_docs: number
  resolved_this_week: number
  avg_resolution_seconds: number | null
  top_3_categories: ExceptionCategoryCount[]
  trend_7d: ExceptionTrendPoint[]
}

export interface BulkResolveRequest {
  action: 'approve_all' | 'reject_all' | 'reassign_all'
  field_corrections?: Record<string, string>
  assigned_to?: string
  note?: string
  document_ids?: string[]
}
