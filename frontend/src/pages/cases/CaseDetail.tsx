import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as Tabs from '@radix-ui/react-tabs'
import * as Dialog from '@radix-ui/react-dialog'
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  FileText,
  FilePlus2,
  Plus,
  Search,
  X,
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { api, API_PREFIX } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useUserMap } from '@/hooks/useUsers'
import { useDocuments } from '@/hooks/useDocuments'
import { Badge } from '@/components/shared/Badge'
import { Avatar } from '@/components/shared/Avatar'
import { Markdown } from '@/components/shared/Markdown'
import { CenteredSpinner, Mono } from '@/components/shared/common'
import { StatusPip } from '@/components/shared/StatusPip'
import { priorityTone } from './CaseList'
import type { Case, User } from '@/types'

export function CaseDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const userMap = useUserMap()
  const [linkOpen, setLinkOpen] = useState(false)

  const { data: caseData, isLoading } = useQuery({
    queryKey: ['cases', id],
    enabled: Boolean(id),
    queryFn: () => api.get<Case>(`${API_PREFIX}/cases/${id}`),
  })

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['cases', id] })

  const update = useMutation({
    mutationFn: (patch: Partial<Case>) =>
      api.put(`${API_PREFIX}/cases/${id}`, patch),
    onSuccess: () => {
      invalidate()
      queryClient.invalidateQueries({ queryKey: ['cases'] })
    },
    onError: () => toast.error('Update failed'),
  })

  if (isLoading || !caseData) return <CenteredSpinner label="Loading case" />
  const c = caseData
  const ownerName = c.owner_id ? userMap.get(c.owner_id)?.full_name ?? '—' : '—'

  return (
    <div className="space-y-5">
      <button
        onClick={() => navigate('/cases')}
        className="flex items-center gap-1.5 text-sm text-surface-muted hover:text-surface-50"
      >
        <ArrowLeft className="h-4 w-4" />
        Cases
      </button>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Mono className="text-xs text-ice-400">{c.id.slice(0, 8)}</Mono>
            <Badge tone={priorityTone(c.priority)} className="capitalize">
              {c.priority}
            </Badge>
            <Badge tone="neutral" className="capitalize">
              {c.status.replace(/_/g, ' ')}
            </Badge>
          </div>
          <h1 className="mt-1.5 text-xl font-semibold text-surface-50">{c.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          {c.status !== 'closed' && (
            <button
              onClick={() => update.mutate({ status: 'closed' })}
              className="btn-outline py-1.5"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Close Case
            </button>
          )}
          <button onClick={() => setLinkOpen(true)} className="btn-primary py-1.5">
            <FilePlus2 className="h-3.5 w-3.5" />
            Add Document
          </button>
        </div>
      </div>

      <Tabs.Root defaultValue="overview">
        <Tabs.List className="flex gap-1 border-b border-surface-border">
          {[
            ['overview', 'Overview'],
            ['documents', `Documents`],
            ['tasks', 'Tasks'],
            ['notes', 'Notes'],
            ['timeline', 'Timeline'],
          ].map(([v, label]) => (
            <Tabs.Trigger
              key={v}
              value={v}
              className="relative px-4 py-2.5 text-sm font-medium text-surface-muted transition-colors hover:text-surface-100 data-[state=active]:text-ice-400 data-[state=active]:after:absolute data-[state=active]:after:inset-x-0 data-[state=active]:after:bottom-0 data-[state=active]:after:h-0.5 data-[state=active]:after:bg-ice-500"
            >
              {label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <div className="pt-5">
          <Tabs.Content value="overview">
            <div className="card grid grid-cols-1 gap-x-8 gap-y-4 p-5 sm:grid-cols-2">
              <Meta label="Type" value={<span className="capitalize">{c.type}</span>} />
              <Meta label="Status" value={<span className="capitalize">{c.status.replace(/_/g, ' ')}</span>} />
              <Meta label="Owner" value={ownerName} />
              <Meta label="Created" value={format(new Date(c.created_at), 'MMM d, yyyy')} />
              <Meta
                label="Due date"
                value={c.due_date ? format(new Date(c.due_date), 'MMM d, yyyy') : '—'}
              />
              <Meta label="Priority" value={<span className="capitalize">{c.priority}</span>} />
              <div className="sm:col-span-2">
                <div className="mb-1 text-[10px] uppercase tracking-wide text-surface-muted">
                  Description
                </div>
                <p className="text-sm text-surface-100">
                  {c.description || 'No description provided.'}
                </p>
              </div>
            </div>
          </Tabs.Content>

          <Tabs.Content value="documents">
            <DocumentsTab caseData={c} onLink={() => setLinkOpen(true)} />
          </Tabs.Content>

          <Tabs.Content value="tasks">
            <TasksTab caseId={c.id} caseData={c} userMap={userMap} onChange={invalidate} />
          </Tabs.Content>

          <Tabs.Content value="notes">
            <NotesTab caseId={c.id} caseData={c} userMap={userMap} onChange={invalidate} />
          </Tabs.Content>

          <Tabs.Content value="timeline">
            <TimelineTab caseData={c} />
          </Tabs.Content>
        </div>
      </Tabs.Root>

      <LinkDocumentModal caseData={c} open={linkOpen} onOpenChange={setLinkOpen} onLinked={invalidate} />
    </div>
  )
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-surface-muted">{label}</div>
      <div className="mt-0.5 text-sm text-surface-100">{value}</div>
    </div>
  )
}

function DocumentsTab({
  caseData,
  onLink,
}: {
  caseData: Case
  onLink: () => void
}) {
  const docs = caseData.documents ?? []
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={onLink} className="btn-outline py-1.5">
          <Plus className="h-3.5 w-3.5" />
          Link Document
        </button>
      </div>
      {docs.length === 0 ? (
        <p className="card p-8 text-center text-sm text-surface-muted">
          No documents linked to this case.
        </p>
      ) : (
        <div className="card divide-y divide-surface-border">
          {docs.map((d) => (
            <div key={d.id} className="flex items-center gap-3 px-4 py-3">
              <FileText className="h-4 w-4 text-ice-400" />
              <span className="min-w-0 flex-1 truncate text-sm text-surface-50">
                {d.filename}
              </span>
              {d.doc_type && <Badge tone="ai">{d.doc_type}</Badge>}
              <StatusPip status={d.status} />
              <Link
                to={`/documents/${d.id}`}
                className="text-xs text-ice-400 hover:underline"
              >
                View
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TasksTab({
  caseId,
  caseData,
  userMap,
  onChange,
}: {
  caseId: string
  caseData: Case
  userMap: Map<string, User>
  onChange: () => void
}) {
  const [title, setTitle] = useState('')
  const tasks = caseData.tasks ?? []

  const toggle = useMutation({
    mutationFn: ({ taskId, done }: { taskId: string; done: boolean }) =>
      api.patch(`${API_PREFIX}/cases/${caseId}/tasks/${taskId}`, { is_done: done }),
    onSuccess: onChange,
  })
  const add = useMutation({
    mutationFn: () =>
      api.post(`${API_PREFIX}/cases/${caseId}/tasks`, { title: title.trim() }),
    onSuccess: () => {
      setTitle('')
      onChange()
    },
    onError: () => toast.error('Could not add task'),
  })

  return (
    <div className="card divide-y divide-surface-border">
      {tasks.length === 0 && (
        <p className="px-4 py-6 text-center text-sm text-surface-muted">
          No tasks yet.
        </p>
      )}
      {tasks.map((t) => (
        <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
          <button
            onClick={() => toggle.mutate({ taskId: t.id, done: !t.is_done })}
            className="shrink-0"
          >
            {t.is_done ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            ) : (
              <Circle className="h-4 w-4 text-surface-muted hover:text-ice-400" />
            )}
          </button>
          <span
            className={cn(
              'flex-1 text-sm',
              t.is_done ? 'text-surface-muted line-through' : 'text-surface-50',
            )}
          >
            {t.title}
          </span>
          {t.assignee_id && (
            <span className="flex items-center gap-1.5 text-xs text-surface-muted">
              <Avatar name={userMap.get(t.assignee_id)?.full_name} size="xs" />
              {userMap.get(t.assignee_id)?.full_name}
            </span>
          )}
          {t.due_date && (
            <span className="text-xs text-surface-muted">
              {format(new Date(t.due_date), 'MMM d')}
            </span>
          )}
        </div>
      ))}
      <div className="flex items-center gap-2 px-4 py-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && title.trim() && add.mutate()}
          placeholder="Add a task…"
          className="input flex-1"
        />
        <button
          onClick={() => add.mutate()}
          disabled={!title.trim() || add.isPending}
          className="btn-primary"
        >
          <Plus className="h-4 w-4" />
          Add
        </button>
      </div>
    </div>
  )
}

function NotesTab({
  caseId,
  caseData,
  userMap,
  onChange,
}: {
  caseId: string
  caseData: Case
  userMap: Map<string, User>
  onChange: () => void
}) {
  const [content, setContent] = useState('')
  const notes = [...(caseData.notes ?? [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )

  const add = useMutation({
    mutationFn: () =>
      api.post(`${API_PREFIX}/cases/${caseId}/notes`, { content: content.trim() }),
    onSuccess: () => {
      setContent('')
      onChange()
    },
    onError: () => toast.error('Could not add note'),
  })

  return (
    <div className="space-y-4">
      <div className="card p-3">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          placeholder="Write a note… (supports **bold**, *italic*, `code`)"
          className="input resize-none"
        />
        <div className="mt-2 flex justify-end">
          <button
            onClick={() => add.mutate()}
            disabled={!content.trim() || add.isPending}
            className="btn-primary"
          >
            Submit
          </button>
        </div>
      </div>

      {notes.length === 0 ? (
        <p className="card p-8 text-center text-sm text-surface-muted">No notes yet.</p>
      ) : (
        <div className="space-y-3">
          {notes.map((n) => (
            <div key={n.id} className="card p-4">
              <div className="mb-2 flex items-center gap-2">
                <Avatar name={userMap.get(n.author_id ?? '')?.full_name ?? '?'} size="sm" />
                <span className="text-sm font-medium text-surface-50">
                  {userMap.get(n.author_id ?? '')?.full_name ?? 'Unknown'}
                </span>
                <span className="text-xs text-surface-muted">
                  {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                </span>
              </div>
              <Markdown content={n.content} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const TIMELINE_TONE: Record<string, string> = {
  case_created: 'bg-ice-500',
  task_added: 'bg-ai-500',
  note_added: 'bg-emerald-500',
  status_changed: 'bg-amber-500',
  closed: 'bg-rose-500',
}

function TimelineTab({ caseData }: { caseData: Case }) {
  const entries = caseData.timeline ?? []
  if (entries.length === 0)
    return (
      <p className="card p-8 text-center text-sm text-surface-muted">
        No timeline events.
      </p>
    )
  return (
    <div className="card p-5">
      <div className="relative space-y-4 pl-4">
        <div className="absolute bottom-2 left-[5px] top-2 w-px bg-surface-border" />
        {entries.map((e, i) => (
          <div key={i} className="relative flex gap-3">
            <span
              className={cn(
                'relative z-10 mt-1 h-2.5 w-2.5 shrink-0 rounded-full ring-4 ring-surface-700',
                TIMELINE_TONE[e.kind] ?? 'bg-surface-muted',
              )}
            />
            <div>
              <p className="text-sm text-surface-100">{e.label}</p>
              <Mono className="text-[10px] text-surface-muted">
                {format(new Date(e.at), 'MMM d, yyyy · HH:mm')}
              </Mono>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function LinkDocumentModal({
  caseData,
  open,
  onOpenChange,
  onLinked,
}: {
  caseData: Case
  open: boolean
  onOpenChange: (o: boolean) => void
  onLinked: () => void
}) {
  const [search, setSearch] = useState('')
  const { data: docs } = useDocuments({ page_size: 50 })
  const linkedIds = new Set((caseData.documents ?? []).map((d) => d.id))

  const link = useMutation({
    mutationFn: (docId: string) =>
      api.post(`${API_PREFIX}/cases/${caseData.id}/documents`, { document_id: docId }),
    onSuccess: () => {
      toast.success('Document linked')
      onLinked()
    },
    onError: () => toast.error('Could not link document'),
  })

  const q = search.trim().toLowerCase()
  const candidates = (docs?.items ?? []).filter(
    (d) => !linkedIds.has(d.id) && (!q || d.filename.toLowerCase().includes(q)),
  )

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[440px] max-w-[90vw] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-surface-border bg-surface-700 shadow-xl">
          <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
            <Dialog.Title className="text-sm font-medium text-surface-50">
              Link Document
            </Dialog.Title>
            <Dialog.Close className="rounded p-1 text-surface-muted hover:bg-surface-600 hover:text-surface-100">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <div className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-muted" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search documents…"
                className="input pl-9"
              />
            </div>
            <div className="mt-3 max-h-72 space-y-1 overflow-y-auto">
              {candidates.length === 0 && (
                <p className="py-6 text-center text-sm text-surface-muted">
                  No matching documents
                </p>
              )}
              {candidates.map((d) => (
                <button
                  key={d.id}
                  onClick={() => link.mutate(d.id)}
                  disabled={link.isPending}
                  className="flex w-full items-center gap-3 rounded-lg border border-transparent px-3 py-2 text-left transition-colors hover:border-surface-border hover:bg-surface-600"
                >
                  <FileText className="h-4 w-4 text-surface-muted" />
                  <span className="min-w-0 flex-1 truncate text-sm text-surface-50">
                    {d.filename}
                  </span>
                  {d.doc_type && <Badge tone="ai">{d.doc_type}</Badge>}
                </button>
              ))}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
