import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import {
  CheckCircle2,
  ChevronDown,
  Clock,
  FileStack,
  Layers,
  Store,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { api, API_PREFIX } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/shared/Badge'
import { SkeletonCard } from '@/components/shared/Skeleton'
import { useExceptionGroups, useExceptionSummary } from '@/hooks/useExceptions'
import {
  PILL_CATEGORIES,
  categoryMeta,
  formatDuration,
} from '@/lib/exceptionMeta'
import type { ExceptionGroupSummary } from '@/types'

type SortKey = 'most_documents' | 'most_recent' | 'oldest'

const ACTIVE_STATUSES = new Set(['open', 'investigating'])

export function ExceptionCenter() {
  const { data: summary } = useExceptionSummary()
  const { data: groups, isLoading } = useExceptionGroups()
  const [category, setCategory] = useState<string | null>(null)
  const [sort, setSort] = useState<SortKey>('most_documents')

  const active = useMemo(
    () => (groups ?? []).filter((g) => ACTIVE_STATUSES.has(g.status)),
    [groups],
  )
  const resolved = useMemo(
    () => (groups ?? []).filter((g) => !ACTIVE_STATUSES.has(g.status)),
    [groups],
  )

  const pillCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const g of active) counts[g.category] = (counts[g.category] ?? 0) + 1
    return counts
  }, [active])

  const visible = useMemo(() => {
    const filtered = category
      ? active.filter((g) => g.category === category)
      : active
    const sorted = [...filtered]
    sorted.sort((a, b) => {
      if (sort === 'most_documents') return b.document_count - a.document_count
      const at = new Date(a.last_seen_at).getTime()
      const bt = new Date(b.last_seen_at).getTime()
      return sort === 'most_recent' ? bt - at : at - bt
    })
    return sorted
  }, [active, category, sort])

  const rootCauseCount = active.length
  const docsAffected = summary?.total_affected_docs ?? 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-surface-50">
          Exception Resolution Center
        </h1>
        <p className="mt-1 text-sm text-surface-muted">
          {rootCauseCount === 0 ? (
            'No active root causes — your pipeline is running clean.'
          ) : (
            <>
              <span className="font-medium text-surface-100">
                {rootCauseCount} root cause{rootCauseCount === 1 ? '' : 's'}
              </span>{' '}
              affecting{' '}
              <span className="font-medium text-surface-100">
                {docsAffected} document{docsAffected === 1 ? '' : 's'}
              </span>{' '}
              — fix once, resolve many.
            </>
          )}
        </p>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Open Groups"
          value={summary?.total_open_groups ?? 0}
          icon={Layers}
          accent="text-amber-400"
        />
        <StatCard
          label="Documents Affected"
          value={summary?.total_affected_docs ?? 0}
          icon={FileStack}
          accent="text-ice-400"
        />
        <StatCard
          label="Avg Time to Resolve"
          value={formatDuration(summary?.avg_resolution_seconds)}
          icon={Clock}
          accent="text-ai-400"
        />
        <StatCard
          label="Resolved This Week"
          value={summary?.resolved_this_week ?? 0}
          icon={TrendingUp}
          accent="text-emerald-400"
        />
      </div>

      {isLoading ? (
        <div className="grid gap-3">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : active.length === 0 ? (
        <CleanPipelineEmptyState />
      ) : (
        <>
          {/* Category pills + sort */}
          <div className="flex flex-wrap items-center gap-2">
            <Pill
              active={category === null}
              onClick={() => setCategory(null)}
              label="All"
              count={active.length}
            />
            {PILL_CATEGORIES.map((cat) => {
              const count = pillCounts[cat] ?? 0
              if (count === 0 && category !== cat) return null
              const meta = categoryMeta(cat)
              return (
                <Pill
                  key={cat}
                  active={category === cat}
                  onClick={() => setCategory(cat === category ? null : cat)}
                  label={meta.label}
                  count={count}
                  dot={meta.accent}
                />
              )
            })}

            <div className="ml-auto">
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="input w-44 py-1.5 text-sm"
              >
                <option value="most_documents">Most Documents</option>
                <option value="most_recent">Most Recent</option>
                <option value="oldest">Oldest</option>
              </select>
            </div>
          </div>

          {/* Group cards */}
          <div className="space-y-3">
            <AnimatePresence initial={false}>
              {visible.map((group) => (
                <ExceptionGroupCard key={group.id} group={group} />
              ))}
            </AnimatePresence>
          </div>

          {/* Recently resolved */}
          {resolved.length > 0 && <RecentlyResolved groups={resolved} />}
        </>
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string
  value: string | number
  icon: LucideIcon
  accent: string
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-surface-muted">{label}</span>
        <Icon className={cn('h-4 w-4', accent)} />
      </div>
      <div className="mt-2 text-2xl font-semibold text-surface-50">{value}</div>
    </div>
  )
}

function Pill({
  active,
  onClick,
  label,
  count,
  dot,
}: {
  active: boolean
  onClick: () => void
  label: string
  count: number
  dot?: string
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors',
        active
          ? 'border-ice-500/50 bg-ice-500/10 text-surface-50'
          : 'border-surface-border text-surface-muted hover:border-surface-muted hover:text-surface-100',
      )}
    >
      {dot && <span className={cn('h-2 w-2 rounded-full', dot)} />}
      {label}
      <span
        className={cn(
          'rounded-full px-1.5 text-xs font-mono',
          active ? 'bg-ice-500/20 text-ice-300' : 'bg-surface-700 text-surface-muted',
        )}
      >
        {count}
      </span>
    </button>
  )
}

function ExceptionGroupCard({ group }: { group: ExceptionGroupSummary }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const meta = categoryMeta(group.category)
  const Icon = meta.icon

  const ignore = useMutation({
    mutationFn: () =>
      api.post(`${API_PREFIX}/exceptions/groups/${group.id}/ignore`),
    onSuccess: () => {
      toast.success('Marked as ignored')
      queryClient.invalidateQueries({ queryKey: ['exceptions'] })
    },
    onError: () => toast.error('Could not ignore group'),
  })

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.2 }}
      className="card relative overflow-hidden pl-4"
    >
      {/* Left accent bar */}
      <span className={cn('absolute inset-y-0 left-0 w-1', meta.accent)} aria-hidden />

      <div className="p-4">
        {/* Top row */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={meta.tone}>
            <Icon className="h-3 w-3" />
            {meta.label}
          </Badge>
          <span className="rounded-full bg-surface-700 px-2 py-0.5 text-xs font-medium text-surface-100">
            {group.document_count} document{group.document_count === 1 ? '' : 's'}
          </span>
          <span className="text-xs text-surface-muted">
            {formatDistanceToNow(new Date(group.last_seen_at), { addSuffix: true })}
          </span>
        </div>

        {/* Headline */}
        <h3 className="mt-3 text-lg font-medium leading-snug text-surface-50">
          {group.root_cause_label}
        </h3>

        {/* Vendor chip */}
        {group.vendor_hint && (
          <div className="mt-2">
            <Badge tone="ai">
              <Store className="h-3 w-3" />
              {group.vendor_hint}
            </Badge>
          </div>
        )}

        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-3 grid grid-cols-2 gap-3 text-xs text-surface-muted sm:grid-cols-3"
          >
            <Meta label="Affected field" value={group.affected_field ?? '—'} />
            <Meta label="Document type" value={group.doc_type ?? '—'} />
            <Meta
              label="First seen"
              value={formatDistanceToNow(new Date(group.first_seen_at), {
                addSuffix: true,
              })}
            />
          </motion.div>
        )}

        {/* Bottom row */}
        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={() => navigate(`/exceptions/${group.id}`)}
            className="btn-primary"
          >
            Review &amp; Resolve
          </button>
          <button
            onClick={() => ignore.mutate()}
            disabled={ignore.isPending}
            className="btn-ghost"
          >
            Ignore
          </button>
          <button
            onClick={() => setExpanded((e) => !e)}
            className="ml-auto rounded p-1.5 text-surface-muted transition-colors hover:bg-surface-700 hover:text-surface-100"
            aria-label="Toggle details"
          >
            <ChevronDown
              className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')}
            />
          </button>
        </div>
      </div>
    </motion.div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-surface-muted">
        {label}
      </div>
      <div className="mt-0.5 text-surface-100">{value}</div>
    </div>
  )
}

function RecentlyResolved({ groups }: { groups: ExceptionGroupSummary[] }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  return (
    <div className="pt-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-sm text-surface-muted hover:text-surface-100"
      >
        <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
        Recently Resolved
        <span className="rounded-full bg-surface-700 px-1.5 text-xs font-mono">
          {groups.length}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 space-y-2 overflow-hidden"
          >
            {groups.map((g) => {
              const meta = categoryMeta(g.category)
              return (
                <button
                  key={g.id}
                  onClick={() => navigate(`/exceptions/${g.id}`)}
                  className="card flex w-full items-center gap-3 p-3 text-left opacity-70 transition-opacity hover:opacity-100"
                >
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                  <span className="min-w-0 flex-1 truncate text-sm text-surface-100">
                    {g.root_cause_label}
                  </span>
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                  <Badge tone={g.status === 'ignored' ? 'neutral' : 'green'}>
                    {g.status}
                  </Badge>
                </button>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function CleanPipelineEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      {/* CSS checkmark burst */}
      <div className="relative flex h-20 w-20 items-center justify-center">
        {[...Array(8)].map((_, i) => (
          <motion.span
            key={i}
            className="absolute h-1.5 w-1.5 rounded-full bg-emerald-400"
            initial={{ scale: 0, x: 0, y: 0, opacity: 0 }}
            animate={{
              scale: [0, 1, 0],
              x: Math.cos((i / 8) * Math.PI * 2) * 38,
              y: Math.sin((i / 8) * Math.PI * 2) * 38,
              opacity: [0, 1, 0],
            }}
            transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.05 }}
          />
        ))}
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 16 }}
          className="flex h-16 w-16 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10"
        >
          <CheckCircle2 className="h-8 w-8 text-emerald-400" />
        </motion.div>
      </div>
      <h3 className="mt-6 text-base font-medium text-surface-50">
        No exceptions right now
      </h3>
      <p className="mt-1 text-sm text-surface-muted">
        Your pipeline is running clean.
      </p>
    </div>
  )
}
