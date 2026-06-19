import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FileStack, Search } from 'lucide-react'
import { format } from 'date-fns'
import { useDocuments } from '@/hooks/useDocuments'
import { FlowRail } from '@/components/shared/FlowRail'
import { StatusPip } from '@/components/shared/StatusPip'
import { Badge } from '@/components/shared/Badge'
import {
  PageHeader,
  CenteredSpinner,
  EmptyState,
  Mono,
} from '@/components/shared/common'

const STATUS_OPTIONS = [
  '',
  'captured',
  'validating',
  'complete',
  'exception',
  'rejected',
]

export function DocumentList() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const { data, isLoading } = useDocuments({
    search: search || undefined,
    status: status || undefined,
    page,
    page_size: 20,
  })

  return (
    <div className="space-y-6">
      <FlowRail />
      <PageHeader
        title="Documents"
        subtitle="Every document captured across your workspace."
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-64">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-surface-muted" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            placeholder="Search filename or content"
            className="input pl-9"
          />
        </div>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value)
            setPage(1)
          }}
          className="input w-44"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s ? s : 'All statuses'}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <CenteredSpinner label="Loading documents" />
      ) : !data?.items.length ? (
        <EmptyState
          icon={<FileStack className="h-8 w-8" />}
          title="No documents found"
          description="Capture documents to populate this list."
        />
      ) : (
        <>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-border text-left text-xs uppercase tracking-wide text-surface-muted">
                  <th className="px-4 py-3 font-medium">Filename</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Fields</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {data.items.map((doc) => (
                  <tr key={doc.id} className="transition-colors hover:bg-surface-600">
                    <td className="px-4 py-3">
                      <Link
                        to={`/documents/${doc.id}`}
                        className="text-surface-50 hover:text-ice-400"
                      >
                        {doc.filename}
                      </Link>
                      <Mono className="ml-2 text-xs text-surface-muted">
                        {doc.id.slice(0, 8)}
                      </Mono>
                    </td>
                    <td className="px-4 py-3">
                      {doc.doc_type ? (
                        <Badge tone="ai">{doc.doc_type}</Badge>
                      ) : (
                        <span className="text-surface-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPip status={doc.status} />
                    </td>
                    <td className="px-4 py-3">
                      <Mono className="text-surface-100">{doc.field_count}</Mono>
                    </td>
                    <td className="px-4 py-3 text-surface-muted">
                      <Mono className="text-xs">
                        {format(new Date(doc.created_at), 'MMM d, HH:mm')}
                      </Mono>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-sm text-surface-muted">
            <span>
              Page {data.page} of {data.pages || 1} · {data.total} total
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="btn-outline"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= (data.pages || 1)}
                className="btn-outline"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
