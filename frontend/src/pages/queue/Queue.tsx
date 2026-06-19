import { useCallback, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { formatDistanceToNow } from 'date-fns'
import {
  Download,
  Eye,
  FileImage,
  FileText,
  Inbox,
  MoreHorizontal,
  Search,
  UserPlus,
  X,
} from 'lucide-react'
import { useDocuments } from '@/hooks/useDocuments'
import { usePipelineCounts } from '@/hooks/usePipelineCounts'
import { useDocumentStream } from '@/hooks/useDocumentStream'
import { LivePipelineRail } from '@/components/shared/LivePipelineRail'
import { PipelineStepper } from '@/components/shared/PipelineStepper'
import { StatusPip } from '@/components/shared/StatusPip'
import { Badge } from '@/components/shared/Badge'
import { Mono } from '@/components/shared/common'
import { EmptyState } from '@/components/shared/EmptyState'
import { Skeleton } from '@/components/shared/Skeleton'
import { cn } from '@/lib/utils'
import type { DocumentSummary } from '@/types'

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'captured', label: 'Captured' },
  { value: 'ocr', label: 'OCR' },
  { value: 'extracting', label: 'Extracting' },
  { value: 'validating', label: 'Validating' },
  { value: 'exception', label: 'Exception' },
  { value: 'complete', label: 'Complete' },
]

const DOC_TYPES = ['Invoice', 'Contract', 'Identity', 'Form', 'Statement']

const SORTS = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'conf_asc', label: 'Confidence ↑' },
  { value: 'conf_desc', label: 'Confidence ↓' },
]

function fileIcon(name: string, type: string) {
  if (type.toLowerCase() === 'pdf' || name.toLowerCase().endsWith('.pdf'))
    return <FileText className="h-4 w-4 shrink-0 text-rose-400" />
  return <FileImage className="h-4 w-4 shrink-0 text-ice-400" />
}

function confidenceColor(c?: number | null) {
  if (c == null) return 'text-surface-muted'
  if (c >= 0.9) return 'text-emerald-400'
  if (c >= 0.7) return 'text-amber-400'
  return 'text-rose-400'
}

export function Queue() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const batchId = searchParams.get('batch') ?? undefined

  // Live updates: refresh the table the moment a document changes status.
  useDocumentStream(
    useCallback(
      (msg) => {
        if (msg.type === 'document_updated' || msg.type === 'initial_state') {
          queryClient.invalidateQueries({ queryKey: ['documents'] })
        }
      },
      [queryClient],
    ),
  )

  const [search, setSearch] = useState('')
  const [statusTab, setStatusTab] = useState('')
  const [docType, setDocType] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sort, setSort] = useState('newest')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  const serverSort = sort === 'oldest' ? 'oldest' : 'newest'

  const { data, isLoading } = useDocuments(
    {
      ...(batchId ? { batch_id: batchId } : {}),
      ...(statusTab ? { status: statusTab } : {}),
      ...(docType ? { doc_type: docType } : {}),
      ...(search ? { search } : {}),
      ...(dateFrom ? { date_from: dateFrom } : {}),
      ...(dateTo ? { date_to: `${dateTo}T23:59:59` } : {}),
      sort: serverSort,
      page,
      page_size: pageSize,
    },
    { refetchInterval: 5000 },
  )
  const { data: counts } = usePipelineCounts()

  const rows = useMemo(() => {
    const items = data?.items ?? []
    if (sort === 'conf_asc' || sort === 'conf_desc') {
      const sorted = [...items].sort(
        (a, b) => (a.avg_confidence ?? 0) - (b.avg_confidence ?? 0),
      )
      return sort === 'conf_desc' ? sorted.reverse() : sorted
    }
    return items
  }, [data?.items, sort])

  const total = data?.total ?? 0
  const pages = data?.pages ?? 0
  const exceptions = counts?.['exception'] ?? 0
  const hasActiveFilters = Boolean(
    search || statusTab || docType || dateFrom || dateTo || batchId,
  )

  function exportCsv() {
    const header = ['Doc ID', 'Filename', 'Type', 'Status', 'Confidence', 'Submitted']
    const lines = rows.map((d) =>
      [
        d.id,
        `"${d.filename.replace(/"/g, '""')}"`,
        d.doc_type ?? '',
        d.status,
        d.avg_confidence != null ? Math.round(d.avg_confidence * 100) + '%' : '',
        d.created_at,
      ].join(','),
    )
    const csv = [header.join(','), ...lines].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `queue-export-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function clearBatch() {
    searchParams.delete('batch')
    setSearchParams(searchParams)
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-surface-50">Processing Queue</h1>
          <p className="mt-1 text-sm text-surface-muted">
            <Mono>{total}</Mono> documents in view
          </p>
        </div>
        <div className="flex items-center gap-2">
          {exceptions > 0 && (
            <Badge tone="amber">{exceptions} exceptions need attention</Badge>
          )}
          {batchId && (
            <button onClick={clearBatch} className="btn-outline py-1.5">
              <X className="h-4 w-4" />
              Clear batch
            </button>
          )}
        </div>
      </div>

      {/* Flow rail */}
      <LivePipelineRail counts={counts ?? {}} />

      {/* Filter bar */}
      <div className="card space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-muted" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              placeholder="Search filename or doc ID…"
              className="input pl-9"
            />
          </div>
          <select
            value={docType}
            onChange={(e) => {
              setDocType(e.target.value)
              setPage(1)
            }}
            className="input w-auto"
          >
            <option value="">All Types</option>
            {DOC_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value)
              setPage(1)
            }}
            className="input w-auto"
            title="From date"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value)
              setPage(1)
            }}
            className="input w-auto"
            title="To date"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="input w-auto"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <button onClick={exportCsv} className="btn-outline">
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>

        {/* Status tabs */}
        <div className="flex flex-wrap gap-1.5">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => {
                setStatusTab(tab.value)
                setPage(1)
              }}
              className={cn(
                'rounded px-3 py-1 text-xs font-medium transition-colors',
                statusTab === tab.value
                  ? 'bg-ice-500/15 text-ice-400'
                  : 'text-surface-muted hover:bg-surface-600 hover:text-surface-100',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <QueueTableSkeleton />
      ) : rows.length === 0 ? (
        hasActiveFilters ? (
          <EmptyState
            icon={<Inbox className="h-7 w-7" />}
            title="No documents match"
            description="Try adjusting your filters or date range."
          />
        ) : (
          <EmptyState
            icon={<Inbox className="h-7 w-7" />}
            title="No documents yet"
            description="Upload a batch to get started."
            actionLabel="Upload Documents"
            onAction={() => navigate('/capture')}
          />
        )
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-border text-left text-xs uppercase tracking-wide text-surface-muted">
                  <th className="px-4 py-2.5 font-medium">Doc ID</th>
                  <th className="px-4 py-2.5 font-medium">Filename</th>
                  <th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-4 py-2.5 font-medium">Pipeline</th>
                  <th className="px-4 py-2.5 font-medium">Confidence</th>
                  <th className="px-4 py-2.5 font-medium">Submitted</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {rows.map((doc) => (
                  <QueueRow key={doc.id} doc={doc} onOpen={() => navigate(`/documents/${doc.id}`)} />
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-border px-4 py-3">
            <div className="flex items-center gap-2 text-xs text-surface-muted">
              <span>Rows per page</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value))
                  setPage(1)
                }}
                className="input w-auto py-1"
              >
                {[10, 25, 50].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="btn-ghost px-2 py-1 text-xs"
              >
                Prev
              </button>
              {Array.from({ length: pages }, (_, i) => i + 1)
                .filter((p) => Math.abs(p - page) <= 2 || p === 1 || p === pages)
                .map((p, idx, arr) => (
                  <span key={p} className="flex items-center">
                    {idx > 0 && p - arr[idx - 1] > 1 && (
                      <span className="px-1 text-surface-muted">…</span>
                    )}
                    <button
                      onClick={() => setPage(p)}
                      className={cn(
                        'min-w-[28px] rounded px-2 py-1 text-xs',
                        p === page
                          ? 'bg-ice-500/15 text-ice-400'
                          : 'text-surface-muted hover:bg-surface-600',
                      )}
                    >
                      {p}
                    </button>
                  </span>
                ))}
              <button
                onClick={() => setPage((p) => Math.min(pages || 1, p + 1))}
                disabled={page >= pages}
                className="btn-ghost px-2 py-1 text-xs"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function QueueTableSkeleton() {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-border text-left text-xs uppercase tracking-wide text-surface-muted">
              <th className="px-4 py-2.5 font-medium">Doc ID</th>
              <th className="px-4 py-2.5 font-medium">Filename</th>
              <th className="px-4 py-2.5 font-medium">Type</th>
              <th className="px-4 py-2.5 font-medium">Pipeline</th>
              <th className="px-4 py-2.5 font-medium">Confidence</th>
              <th className="px-4 py-2.5 font-medium">Submitted</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {Array.from({ length: 8 }).map((_, i) => (
              <tr key={i}>
                <td className="px-4 py-3.5">
                  <Skeleton className="h-3 w-14" />
                </td>
                <td className="px-4 py-3.5">
                  <Skeleton className="h-3 w-40" />
                </td>
                <td className="px-4 py-3.5">
                  <Skeleton className="h-5 w-16 rounded-full" />
                </td>
                <td className="px-4 py-3.5">
                  <Skeleton className="h-3 w-24" />
                </td>
                <td className="px-4 py-3.5">
                  <Skeleton className="h-3 w-10" />
                </td>
                <td className="px-4 py-3.5">
                  <Skeleton className="h-3 w-20" />
                </td>
                <td className="px-4 py-3.5">
                  <Skeleton className="h-5 w-20 rounded-full" />
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex justify-end gap-1">
                    <Skeleton className="h-6 w-6 rounded" />
                    <Skeleton className="h-6 w-6 rounded" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function QueueRow({
  doc,
  onOpen,
}: {
  doc: DocumentSummary
  onOpen: () => void
}) {
  const isException = doc.status === 'exception' || doc.status === 'rejected'
  return (
    <tr
      onClick={onOpen}
      className={cn(
        'group cursor-pointer border-l-2 border-transparent transition-colors hover:border-l-ice-500 hover:bg-surface-600',
        isException && 'border-l-amber-500/60',
      )}
    >
      <td className="px-4 py-3">
        <Mono className="text-xs text-ice-400">{doc.id.slice(0, 8)}</Mono>
      </td>
      <td className="max-w-[220px] px-4 py-3">
        <div className="flex items-center gap-2" title={doc.filename}>
          {fileIcon(doc.filename, doc.file_type)}
          <span className="truncate text-surface-50">{doc.filename}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        {doc.doc_type ? <Badge tone="ai">{doc.doc_type}</Badge> : <span className="text-surface-muted">—</span>}
      </td>
      <td className="px-4 py-3">
        <PipelineStepper status={doc.status} />
      </td>
      <td className="px-4 py-3">
        <span className={cn('font-mono text-sm', confidenceColor(doc.avg_confidence))}>
          {doc.avg_confidence != null ? `${Math.round(doc.avg_confidence * 100)}%` : '—'}
        </span>
      </td>
      <td className="px-4 py-3 text-xs text-surface-muted">
        {formatDistanceToNow(new Date(doc.created_at), { addSuffix: true })}
      </td>
      <td className="px-4 py-3">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={doc.status}
            initial={{ opacity: 0, y: -3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 3 }}
            transition={{ duration: 0.18 }}
          >
            <StatusPip status={doc.status} />
          </motion.div>
        </AnimatePresence>
      </td>
      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={onOpen}
            className="rounded p-1.5 text-surface-muted hover:bg-surface-500 hover:text-ice-400"
            title="View"
          >
            <Eye className="h-4 w-4" />
          </button>
          <button
            className="rounded p-1.5 text-surface-muted hover:bg-surface-500 hover:text-ice-400"
            title="Reassign"
          >
            <UserPlus className="h-4 w-4" />
          </button>
          <button
            className="rounded p-1.5 text-surface-muted hover:bg-surface-500 hover:text-surface-100"
            title="More"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  )
}
