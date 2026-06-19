import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  Pencil,
  Sparkles,
  X,
} from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import { toast } from 'sonner'
import { api, API_PREFIX } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/shared/Badge'
import { CenteredSpinner, Spinner } from '@/components/shared/common'
import { Skeleton } from '@/components/shared/Skeleton'
import { DocumentViewer } from '@/components/document/DocumentViewer'
import { useDocument } from '@/hooks/useDocuments'
import { useExceptionGroup } from '@/hooks/useExceptions'
import { categoryMeta } from '@/lib/exceptionMeta'
import type {
  BulkResolveRequest,
  ExceptionGroupDetail as GroupDetail,
  ExceptionMemberDocument,
  User,
} from '@/types'

const DOC_TYPES = [
  'Invoice',
  'Contract',
  'Identity Document',
  'Form',
  'Statement',
  'Receipt',
  'Report',
  'Other',
]

const FIELD_CATEGORIES = new Set([
  'low_confidence',
  'vendor_format_change',
  'missing_field',
])

export function ExceptionGroupDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: group, isLoading } = useExceptionGroup(id)

  const members = group?.members ?? []
  const [repId, setRepId] = useState<string | null>(null)
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [completion, setCompletion] = useState<{ count: number } | null>(null)

  useEffect(() => {
    if (members.length && !repId) setRepId(members[0].id)
  }, [members, repId])

  const targetIds = useMemo(
    () => members.filter((m) => !excluded.has(m.id)).map((m) => m.id),
    [members, excluded],
  )

  const resolve = useMutation({
    mutationFn: (body: BulkResolveRequest) =>
      api.post(`${API_PREFIX}/exceptions/groups/${id}/bulk-resolve`, body),
    onSuccess: (_d, body) => {
      const count = body.document_ids?.length ?? targetIds.length
      setCompletion({ count })
      queryClient.invalidateQueries({ queryKey: ['exceptions'] })
      queryClient.invalidateQueries({ queryKey: ['documents'] })
      setTimeout(() => navigate('/exceptions'), 2000)
    },
    onError: () => toast.error('Could not resolve group'),
  })

  const ignore = useMutation({
    mutationFn: () => api.post(`${API_PREFIX}/exceptions/groups/${id}/ignore`),
    onSuccess: () => {
      toast.success('Marked as not an exception')
      queryClient.invalidateQueries({ queryKey: ['exceptions'] })
      navigate('/exceptions')
    },
  })

  if (isLoading || !group) return <CenteredSpinner label="Loading exception group" />

  const meta = categoryMeta(group.category)

  return (
    <div className="space-y-5">
      <Header group={group} />

      <SuggestionBanner
        suggestion={group.suggested_resolution.suggestion}
        confidence={group.suggested_resolution.confidence}
      />

      {/* Split layout */}
      <div className="grid gap-5 lg:grid-cols-[2fr_3fr]">
        {/* LEFT — representative document */}
        <RepresentativeDocument
          members={members}
          repId={repId}
          onSelect={setRepId}
        />

        {/* RIGHT — bulk resolution panel */}
        <div className="card p-5">
          {FIELD_CATEGORIES.has(group.category) ? (
            <FieldCorrectionPanel
              group={group}
              repId={repId}
              targetIds={targetIds}
              members={members}
              excluded={excluded}
              onResolve={(value, fieldKey) =>
                resolve.mutate({
                  action: 'approve_all',
                  field_corrections: { [fieldKey]: value },
                  document_ids: targetIds,
                  note: `Corrected ${fieldKey} to "${value}" via Exception Center`,
                })
              }
              pending={resolve.isPending}
            />
          ) : group.category === 'unclassified' ? (
            <UnclassifiedPanel
              count={targetIds.length}
              onReclassify={(docType, assignee) =>
                resolve.mutate({
                  action: 'reassign_all',
                  assigned_to: assignee,
                  document_ids: targetIds,
                  note: `Route for reclassification as ${docType}`,
                })
              }
              onReject={() =>
                resolve.mutate({ action: 'reject_all', document_ids: targetIds })
              }
              pending={resolve.isPending}
            />
          ) : group.category === 'duplicate' ? (
            <DuplicatePanel
              members={members}
              onResolve={(keepId) =>
                resolve.mutate({
                  action: 'reject_all',
                  document_ids: members.filter((m) => m.id !== keepId).map((m) => m.id),
                  note: 'Duplicates discarded via Exception Center',
                })
              }
              onNotDuplicate={() => ignore.mutate()}
              pending={resolve.isPending || ignore.isPending}
            />
          ) : (
            <FailurePanel
              count={targetIds.length}
              onManual={(assignee) =>
                resolve.mutate({
                  action: 'reassign_all',
                  assigned_to: assignee,
                  document_ids: targetIds,
                  note: 'Marked as manual entry required',
                })
              }
              onReject={() =>
                resolve.mutate({ action: 'reject_all', document_ids: targetIds })
              }
              pending={resolve.isPending}
            />
          )}
        </div>
      </div>

      {/* Member documents */}
      <MemberList
        members={members}
        excluded={excluded}
        onToggle={(docId) =>
          setExcluded((prev) => {
            const next = new Set(prev)
            if (next.has(docId)) next.delete(docId)
            else next.add(docId)
            return next
          })
        }
      />

      {/* Completion overlay */}
      <AnimatePresence>
        {completion && <CompletionOverlay count={completion.count} category={meta.label} />}
      </AnimatePresence>
    </div>
  )
}

/* ─────────────────────────────── Header ─────────────────────────────── */

function Header({ group }: { group: GroupDetail }) {
  const navigate = useNavigate()
  const meta = categoryMeta(group.category)
  const Icon = meta.icon
  const [editing, setEditing] = useState(false)
  const [label, setLabel] = useState(group.root_cause_label)

  return (
    <div className="space-y-3">
      <button
        onClick={() => navigate('/exceptions')}
        className="flex items-center gap-1.5 text-sm text-surface-muted hover:text-surface-100"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Exception Center
      </button>

      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={meta.tone}>
          <Icon className="h-3 w-3" />
          {meta.label}
        </Badge>
        <span className="rounded-full bg-surface-700 px-2 py-0.5 text-xs font-medium text-surface-100">
          {group.document_count} documents
        </span>
      </div>

      {editing ? (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setEditing(false)}
            className="input max-w-2xl text-lg"
          />
          <button
            onClick={() => setEditing(false)}
            className="rounded bg-ice-500/15 p-2 text-ice-400 hover:bg-ice-500/25"
          >
            <Check className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="group flex items-start gap-2">
          <h1 className="text-2xl font-semibold leading-tight text-surface-50">
            {label}
          </h1>
          <button
            onClick={() => setEditing(true)}
            className="mt-1.5 rounded p-1 text-surface-muted opacity-0 transition-opacity hover:text-surface-100 group-hover:opacity-100"
            title="Rename"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

/* ──────────────────────────── Suggestion banner ─────────────────────── */

function SuggestionBanner({
  suggestion,
  confidence,
}: {
  suggestion: string
  confidence: number
}) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-ai-500/30 bg-gradient-to-r from-ice-500/10 via-ai-500/10 to-ai-500/5 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ai-500/20 text-ai-400">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-surface-50">
              Suggested resolution
            </span>
            <span className="flex items-center gap-1 text-[11px] text-surface-muted">
              <span className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-700">
                <span
                  className="block h-full rounded-full bg-gradient-to-r from-ice-500 to-ai-500"
                  style={{ width: `${Math.round(confidence * 100)}%` }}
                />
              </span>
              {Math.round(confidence * 100)}% confident
            </span>
          </div>
          <p className="mt-1 text-sm text-surface-100">{suggestion}</p>
          <p className="mt-1.5 text-xs text-surface-muted">
            This is a suggestion — you're always in control.
          </p>
        </div>
      </div>
    </div>
  )
}

/* ────────────────────────── Representative doc ──────────────────────── */

function RepresentativeDocument({
  members,
  repId,
  onSelect,
}: {
  members: ExceptionMemberDocument[]
  repId: string | null
  onSelect: (id: string) => void
}) {
  const { data: doc, isLoading } = useDocument(repId ?? undefined)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-surface-muted">
          Showing 1 of {members.length} similar document
          {members.length === 1 ? '' : 's'}
        </span>
        {members.length > 1 && (
          <select
            value={repId ?? ''}
            onChange={(e) => onSelect(e.target.value)}
            className="input w-48 py-1 text-xs"
          >
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.filename}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="h-[520px]">
        {isLoading || !doc ? (
          <Skeleton className="h-full w-full rounded-lg" />
        ) : (
          <DocumentViewer document={doc} />
        )}
      </div>
    </div>
  )
}

/* ──────────────────────── Field correction panel ────────────────────── */

function FieldCorrectionPanel({
  group,
  repId,
  targetIds,
  members,
  excluded,
  onResolve,
  pending,
}: {
  group: GroupDetail
  repId: string | null
  targetIds: string[]
  members: ExceptionMemberDocument[]
  excluded: Set<string>
  onResolve: (value: string, fieldKey: string) => void
  pending: boolean
}) {
  const { data: doc } = useDocument(repId ?? undefined)

  // Resolve the problematic field from the representative document.
  const field = useMemo(() => {
    if (!doc) return null
    return (
      doc.fields.find(
        (f) =>
          f.field_label === group.affected_field ||
          f.field_key === group.affected_field,
      ) ??
      [...doc.fields].sort((a, b) => a.confidence - b.confidence)[0] ??
      null
    )
  }, [doc, group.affected_field])

  const [value, setValue] = useState('')
  useEffect(() => {
    if (field) setValue(field.validated_value ?? field.raw_value ?? '')
  }, [field])

  const targetMembers = members.filter((m) => !excluded.has(m.id))

  if (!doc || !field) {
    return <Skeleton className="h-64 w-full rounded-lg" />
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-surface-50">
          Correct this value once — apply it to all {targetIds.length} matching documents
        </h2>
        <p className="mt-0.5 text-xs text-surface-muted">
          Field: <span className="font-mono text-surface-100">{field.field_label}</span>
        </p>
      </div>

      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="input font-mono text-base"
        placeholder="Corrected value"
      />

      {/* Live blast-radius preview */}
      <div>
        <div className="mb-1.5 text-xs font-medium text-surface-muted">
          Preview — {targetMembers.length} document
          {targetMembers.length === 1 ? '' : 's'} will be updated
        </div>
        <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-surface-border bg-surface-800 p-2">
          {targetMembers.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between gap-2 rounded px-2 py-1.5 text-xs"
            >
              <span className="min-w-0 flex-1 truncate text-surface-100">
                {m.filename}
              </span>
              <span className="flex items-center gap-1.5 font-mono text-surface-muted">
                <span className="truncate text-emerald-400">{value || '—'}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={() => onResolve(value, field.field_key)}
        disabled={pending || targetIds.length === 0}
        className="btn-primary w-full py-3 text-base"
      >
        {pending ? <Spinner /> : <Check className="h-5 w-5" />}
        Apply to All {targetIds.length} Documents
      </button>
    </div>
  )
}

/* ──────────────────────────── Unclassified ──────────────────────────── */

function useUsers() {
  return useQuery({
    queryKey: ['settings', 'users'],
    queryFn: () => api.get<User[]>(`${API_PREFIX}/settings/users`),
  })
}

function UnclassifiedPanel({
  count,
  onReclassify,
  onReject,
  pending,
}: {
  count: number
  onReclassify: (docType: string, assignee: string) => void
  onReject: () => void
  pending: boolean
}) {
  const { data: users } = useUsers()
  const [docType, setDocType] = useState(DOC_TYPES[0])
  const [custom, setCustom] = useState('')
  const [assignee, setAssignee] = useState('')

  useEffect(() => {
    if (users?.length && !assignee) setAssignee(users[0].id)
  }, [users, assignee])

  const finalType = docType === '__new__' ? custom.trim() : docType

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-surface-50">
        These documents should be classified as:
      </h2>

      <select
        value={docType}
        onChange={(e) => setDocType(e.target.value)}
        className="input"
      >
        {DOC_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
        <option value="__new__">+ Create new type…</option>
      </select>

      {docType === '__new__' && (
        <input
          autoFocus
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="New document type name"
          className="input"
        />
      )}

      <div>
        <label className="mb-1.5 block text-xs font-medium text-surface-muted">
          Assign for review to
        </label>
        <select
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
          className="input"
        >
          {(users ?? []).map((u) => (
            <option key={u.id} value={u.id}>
              {u.full_name}
            </option>
          ))}
        </select>
      </div>

      <button
        onClick={() => onReclassify(finalType, assignee)}
        disabled={pending || !finalType || !assignee || count === 0}
        className="btn-primary w-full py-3"
      >
        {pending ? <Spinner /> : <Check className="h-4 w-4" />}
        Reclassify All {count} Documents
      </button>
      <button onClick={onReject} disabled={pending} className="btn-ghost w-full">
        Reject All Instead
      </button>
    </div>
  )
}

/* ───────────────────────────── Duplicate ────────────────────────────── */

function DuplicatePanel({
  members,
  onResolve,
  onNotDuplicate,
  pending,
}: {
  members: ExceptionMemberDocument[]
  onResolve: (keepId: string) => void
  onNotDuplicate: () => void
  pending: boolean
}) {
  const sorted = [...members].sort(
    (a, b) =>
      new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime(),
  )
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const { data: docA } = useDocument(first?.id)
  const { data: docB } = useDocument(last?.id)

  const fieldsA = docA?.fields ?? []
  const fieldsB = docB?.fields ?? []
  const keys = Array.from(
    new Set([...fieldsA, ...fieldsB].map((f) => f.field_key)),
  )

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-surface-50">
        Compare the duplicate pair
      </h2>

      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'First', m: first },
          { label: 'Most recent', m: last },
        ].map(({ label, m }) => (
          <div key={label} className="rounded-lg border border-surface-border p-3">
            <div className="text-[10px] uppercase tracking-wide text-surface-muted">
              {label}
            </div>
            <div className="mt-0.5 truncate text-sm text-surface-50" title={m?.filename}>
              {m?.filename}
            </div>
            <div className="text-xs text-surface-muted">
              {m ? format(new Date(m.submitted_at), 'MMM d, HH:mm') : '—'}
            </div>
          </div>
        ))}
      </div>

      {/* Field diff */}
      <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border border-surface-border bg-surface-800 p-2 text-xs">
        {keys.length === 0 && (
          <p className="px-2 py-1.5 text-surface-muted">No extracted fields to compare.</p>
        )}
        {keys.map((key) => {
          const a = fieldsA.find((f) => f.field_key === key)
          const b = fieldsB.find((f) => f.field_key === key)
          const va = a?.validated_value ?? a?.raw_value ?? ''
          const vb = b?.validated_value ?? b?.raw_value ?? ''
          const diff = va !== vb
          return (
            <div
              key={key}
              className={cn(
                'grid grid-cols-[1fr_1fr] gap-2 rounded px-2 py-1',
                diff && 'bg-amber-500/10',
              )}
            >
              <span className="truncate font-mono text-surface-100">{va || '—'}</span>
              <span
                className={cn(
                  'truncate font-mono',
                  diff ? 'text-amber-400' : 'text-surface-100',
                )}
              >
                {vb || '—'}
              </span>
            </div>
          )
        })}
      </div>

      <div className="space-y-2">
        <button
          onClick={() => onResolve(first.id)}
          disabled={pending}
          className="btn-primary w-full"
        >
          Keep First, Discard Rest
        </button>
        <button
          onClick={() => onResolve(last.id)}
          disabled={pending}
          className="btn-outline w-full"
        >
          Keep Most Recent
        </button>
        <button
          onClick={onNotDuplicate}
          disabled={pending}
          className="btn-ghost w-full"
        >
          These are NOT duplicates
        </button>
      </div>
    </div>
  )
}

/* ─────────────────────── OCR failure / timeout ──────────────────────── */

function FailurePanel({
  count,
  onManual,
  onReject,
  pending,
}: {
  count: number
  onManual: (assignee: string) => void
  onReject: () => void
  pending: boolean
}) {
  const { data: users } = useUsers()
  const [assignee, setAssignee] = useState('')
  useEffect(() => {
    if (users?.length && !assignee) setAssignee(users[0].id)
  }, [users, assignee])

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-surface-50">
        These documents failed processing. Choose an action:
      </h2>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-surface-muted">
          Assign manual entry to
        </label>
        <select
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
          className="input"
        >
          {(users ?? []).map((u) => (
            <option key={u.id} value={u.id}>
              {u.full_name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <button
          onClick={() => onManual(assignee)}
          disabled={pending || !assignee || count === 0}
          className="btn-primary w-full"
        >
          {pending ? <Spinner /> : <Check className="h-4 w-4" />}
          Mark as Manual Entry Required
        </button>
        <button onClick={onReject} disabled={pending} className="btn-ghost w-full">
          Reject &amp; Discard All
        </button>
      </div>
    </div>
  )
}

/* ─────────────────────────── Member list ────────────────────────────── */

function MemberList({
  members,
  excluded,
  onToggle,
}: {
  members: ExceptionMemberDocument[]
  excluded: Set<string>
  onToggle: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-surface-100 hover:bg-surface-700"
      >
        <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
        Member documents
        <span className="rounded-full bg-surface-700 px-1.5 text-xs font-mono text-surface-muted">
          {members.length}
        </span>
        {excluded.size > 0 && (
          <span className="ml-1 text-xs text-amber-400">
            {excluded.size} excluded
          </span>
        )}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-surface-border text-left text-xs uppercase tracking-wide text-surface-muted">
                  <th className="px-4 py-2 font-medium">Filename</th>
                  <th className="px-4 py-2 font-medium">Confidence</th>
                  <th className="px-4 py-2 font-medium">Submitted</th>
                  <th className="px-4 py-2 text-right font-medium">Exclude</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {members.map((m) => {
                  const isExcluded = excluded.has(m.id)
                  return (
                    <tr key={m.id} className={cn(isExcluded && 'opacity-50')}>
                      <td className="px-4 py-2.5 text-surface-100">{m.filename}</td>
                      <td className="px-4 py-2.5 font-mono text-surface-muted">
                        {m.confidence != null ? `${Math.round(m.confidence * 100)}%` : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-surface-muted">
                        {formatDistanceToNow(new Date(m.submitted_at), {
                          addSuffix: true,
                        })}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          onClick={() => onToggle(m.id)}
                          className={cn(
                            'inline-flex h-5 w-5 items-center justify-center rounded border transition-colors',
                            isExcluded
                              ? 'border-amber-500 bg-amber-500/20 text-amber-400'
                              : 'border-surface-border text-transparent hover:border-surface-muted',
                          )}
                          title={isExcluded ? 'Include' : 'Exclude from bulk action'}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ─────────────────────────── Completion ─────────────────────────────── */

function CompletionOverlay({ count }: { count: number; category: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-surface-900/80 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.95, y: 8 }}
        animate={{ scale: 1, y: 0 }}
        className="card flex w-[360px] flex-col items-center gap-4 p-8 text-center"
      >
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 380, damping: 16, delay: 0.1 }}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15"
        >
          <CheckCircle2 className="h-9 w-9 text-emerald-400" />
        </motion.div>
        <div>
          <div className="text-lg font-semibold text-surface-50">
            {count} document{count === 1 ? '' : 's'} resolved
          </div>
          <p className="mt-1 text-sm text-surface-muted">
            Returning to the Exception Center…
          </p>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-surface-700">
          <motion.div
            className="h-full bg-gradient-to-r from-ice-500 to-emerald-500"
            initial={{ width: '0%' }}
            animate={{ width: '100%' }}
            transition={{ duration: 2, ease: 'linear' }}
          />
        </div>
      </motion.div>
    </motion.div>
  )
}
