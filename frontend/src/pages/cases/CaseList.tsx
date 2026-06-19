import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { FolderOpen, KanbanSquare, Plus, Search, Table2 } from 'lucide-react'
import { format, isPast } from 'date-fns'
import { toast } from 'sonner'
import { api, API_PREFIX } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useUserMap } from '@/hooks/useUsers'
import { Badge } from '@/components/shared/Badge'
import { Avatar } from '@/components/shared/Avatar'
import { CenteredSpinner, Mono } from '@/components/shared/common'
import { EmptyState } from '@/components/shared/EmptyState'
import { NewCaseDialog } from './NewCaseDialog'
import type { Case, PaginatedResponse, User } from '@/types'

const STATUSES = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'pending_review', label: 'Pending Review' },
  { value: 'closed', label: 'Closed' },
]
const TYPES = ['loan', 'claim', 'onboarding', 'dispute', 'other']
const PRIORITIES = ['critical', 'high', 'normal', 'low']

export function priorityTone(p: string) {
  switch (p.toLowerCase()) {
    case 'critical':
      return 'red' as const
    case 'high':
      return 'amber' as const
    case 'normal':
      return 'ice' as const
    default:
      return 'neutral' as const
  }
}

const PRIORITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high: 'bg-amber-500',
  normal: 'bg-ice-500',
  low: 'bg-surface-muted',
}

function isOverdue(c: Case) {
  return (
    c.status !== 'closed' &&
    Boolean(c.due_date) &&
    isPast(new Date(c.due_date as string))
  )
}

export function CaseList() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const userMap = useUserMap()

  const [view, setView] = useState<'table' | 'kanban'>('table')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [type, setType] = useState('')
  const [priority, setPriority] = useState('')
  const [owner, setOwner] = useState('')
  const [dueFrom, setDueFrom] = useState('')
  const [dueTo, setDueTo] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['cases'],
    queryFn: () =>
      api.get<PaginatedResponse<Case>>(`${API_PREFIX}/cases`, {
        params: { page_size: 100 },
      }),
  })

  const updateStatus = useMutation({
    mutationFn: ({ id, next }: { id: string; next: string }) =>
      api.put(`${API_PREFIX}/cases/${id}`, { status: next }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cases'] }),
    onError: () => toast.error('Could not update case status'),
  })

  const all = data?.items ?? []
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return all.filter((c) => {
      if (status && c.status !== status) return false
      if (type && c.type !== type) return false
      if (priority && c.priority !== priority) return false
      if (owner && c.owner_id !== owner) return false
      if (q && !c.title.toLowerCase().includes(q) && !c.type.toLowerCase().includes(q))
        return false
      if (dueFrom && (!c.due_date || c.due_date < dueFrom)) return false
      if (dueTo && (!c.due_date || c.due_date > dueTo)) return false
      return true
    })
  }, [all, search, status, type, priority, owner, dueFrom, dueTo])

  const summary = useMemo(() => {
    const s: Record<string, number> = {}
    all.forEach((c) => (s[c.status] = (s[c.status] ?? 0) + 1))
    return s
  }, [all])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-surface-50">Case Management</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {STATUSES.map((s) => (
              <span
                key={s.value}
                className="inline-flex items-center gap-1.5 rounded-full bg-surface-700 px-2.5 py-0.5 text-xs text-surface-muted"
              >
                {s.label}
                <Mono className="text-surface-100">{summary[s.value] ?? 0}</Mono>
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded border border-surface-border">
            <button
              onClick={() => setView('table')}
              className={cn(
                'rounded-l px-2.5 py-1.5',
                view === 'table'
                  ? 'bg-surface-600 text-ice-400'
                  : 'text-surface-muted hover:text-surface-100',
              )}
              title="Table view"
            >
              <Table2 className="h-4 w-4" />
            </button>
            <button
              onClick={() => setView('kanban')}
              className={cn(
                'rounded-r border-l border-surface-border px-2.5 py-1.5',
                view === 'kanban'
                  ? 'bg-surface-600 text-ice-400'
                  : 'text-surface-muted hover:text-surface-100',
              )}
              title="Kanban view"
            >
              <KanbanSquare className="h-4 w-4" />
            </button>
          </div>
          <button onClick={() => setDialogOpen(true)} className="btn-primary">
            <Plus className="h-4 w-4" />
            New Case
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search cases…"
            className="input pl-9"
          />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="input w-auto">
          <option value="">All Status</option>
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)} className="input w-auto capitalize">
          <option value="">All Types</option>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value)} className="input w-auto capitalize">
          <option value="">All Priority</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select value={owner} onChange={(e) => setOwner(e.target.value)} className="input w-auto">
          <option value="">All Owners</option>
          {[...userMap.values()].map((u) => (
            <option key={u.id} value={u.id}>
              {u.full_name}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={dueFrom}
          onChange={(e) => setDueFrom(e.target.value)}
          className="input w-auto"
          title="Due from"
        />
        <input
          type="date"
          value={dueTo}
          onChange={(e) => setDueTo(e.target.value)}
          className="input w-auto"
          title="Due to"
        />
      </div>

      {isLoading ? (
        <CenteredSpinner />
      ) : all.length === 0 ? (
        <EmptyState
          icon={<FolderOpen className="h-7 w-7" />}
          title="No active cases"
          description="Create one to track complex processes."
          actionLabel="New Case"
          onAction={() => setDialogOpen(true)}
        />
      ) : view === 'table' ? (
        <TableView
          cases={filtered}
          userMap={userMap}
          onOpen={(id) => navigate(`/cases/${id}`)}
        />
      ) : (
        <KanbanView
          cases={filtered}
          userMap={userMap}
          onOpen={(id) => navigate(`/cases/${id}`)}
          onMove={(id, next) => updateStatus.mutate({ id, next })}
        />
      )}

      <NewCaseDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  )
}

function TableView({
  cases,
  userMap,
  onOpen,
}: {
  cases: Case[]
  userMap: Map<string, User>
  onOpen: (id: string) => void
}) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-border text-left text-xs uppercase tracking-wide text-surface-muted">
              <th className="px-4 py-2.5 font-medium">Case ID</th>
              <th className="px-4 py-2.5 font-medium">Title</th>
              <th className="px-4 py-2.5 font-medium">Type</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Priority</th>
              <th className="px-4 py-2.5 font-medium">Owner</th>
              <th className="px-4 py-2.5 font-medium">Due Date</th>
              <th className="px-4 py-2.5 font-medium">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {cases.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-surface-muted">
                  No cases match the current filters
                </td>
              </tr>
            )}
            {cases.map((c) => {
              const overdue = isOverdue(c)
              return (
                <tr
                  key={c.id}
                  onClick={() => onOpen(c.id)}
                  className={cn(
                    'cursor-pointer transition-colors hover:bg-surface-600',
                    overdue && 'bg-rose-500/[0.05]',
                  )}
                >
                  <td className="px-4 py-3">
                    <Mono className="text-xs text-ice-400">{c.id.slice(0, 8)}</Mono>
                  </td>
                  <td className="max-w-[240px] px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-surface-50">{c.title}</span>
                      {overdue && (
                        <Badge tone="red" className="shrink-0">
                          OVERDUE
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 capitalize text-surface-100">{c.type}</td>
                  <td className="px-4 py-3 capitalize text-surface-100">
                    {c.status.replace(/_/g, ' ')}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={priorityTone(c.priority)} className="capitalize">
                      {c.priority}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-surface-muted">
                    {c.owner_id ? userMap.get(c.owner_id)?.full_name ?? '—' : '—'}
                  </td>
                  <td className="px-4 py-3 text-surface-muted">
                    {c.due_date ? format(new Date(c.due_date), 'MMM d, yyyy') : '—'}
                  </td>
                  <td className="px-4 py-3 text-surface-muted">
                    {format(new Date(c.created_at), 'MMM d')}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function KanbanView({
  cases,
  userMap,
  onOpen,
  onMove,
}: {
  cases: Case[]
  userMap: Map<string, User>
  onOpen: (id: string) => void
  onMove: (id: string, next: string) => void
}) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<string | null>(null)

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {STATUSES.map((col) => {
        const items = cases.filter((c) => c.status === col.value)
        return (
          <div
            key={col.value}
            onDragOver={(e) => {
              e.preventDefault()
              setOverCol(col.value)
            }}
            onDrop={() => {
              if (dragId) onMove(dragId, col.value)
              setDragId(null)
              setOverCol(null)
            }}
            className={cn(
              'rounded-lg border bg-surface-800/50 p-2 transition-colors',
              overCol === col.value
                ? 'border-ice-500/50 bg-ice-500/[0.04]'
                : 'border-surface-border',
            )}
          >
            <div className="mb-2 flex items-center justify-between px-1.5 py-1">
              <span className="text-xs font-medium text-surface-100">{col.label}</span>
              <Mono className="text-xs text-surface-muted">{items.length}</Mono>
            </div>
            <div className="space-y-2">
              {items.map((c) => {
                const overdue = isOverdue(c)
                return (
                  <motion.div
                    layout
                    key={c.id}
                    draggable
                    onDragStart={() => setDragId(c.id)}
                    onDragEnd={() => setDragId(null)}
                    onClick={() => onOpen(c.id)}
                    className={cn(
                      'cursor-pointer rounded-lg border border-surface-border bg-surface-700 p-3 transition-shadow hover:border-ice-500/40',
                      overdue && 'border-rose-500/40',
                      dragId === c.id && 'opacity-50',
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={cn(
                          'mt-1 h-2 w-2 shrink-0 rounded-full',
                          PRIORITY_DOT[c.priority] ?? PRIORITY_DOT.low,
                        )}
                      />
                      <span className="text-sm text-surface-50">{c.title}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <Badge tone="neutral" className="capitalize">
                        {c.type}
                      </Badge>
                      <div className="flex items-center gap-2 text-[11px] text-surface-muted">
                        {c.due_date && (
                          <span className={overdue ? 'text-rose-400' : ''}>
                            {format(new Date(c.due_date), 'MMM d')}
                          </span>
                        )}
                        {c.owner_id && (
                          <Avatar name={userMap.get(c.owner_id)?.full_name} size="xs" />
                        )}
                      </div>
                    </div>
                  </motion.div>
                )
              })}
              {items.length === 0 && (
                <div className="rounded-lg border border-dashed border-surface-border py-6 text-center text-[11px] text-surface-muted">
                  Drop here
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
