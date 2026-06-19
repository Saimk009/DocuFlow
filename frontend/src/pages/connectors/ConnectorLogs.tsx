import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  RotateCw,
} from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { api, API_PREFIX } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/shared/Badge'
import { CenteredSpinner } from '@/components/shared/common'
import { CodeBlock } from '@/components/shared/CodeBlock'
import type { Connector, ConnectorLog, ConnectorLogList } from '@/types'

type LogFilter = 'all' | 'success' | 'failed'

export function ConnectorLogs() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<LogFilter>('all')
  const [expanded, setExpanded] = useState<string | null>(null)

  const { data: connectors } = useQuery({
    queryKey: ['connectors'],
    queryFn: () => api.get<Connector[]>(`${API_PREFIX}/connectors`),
  })
  const connector = connectors?.find((c) => c.id === id)

  const successParam =
    filter === 'success' ? { success: true } : filter === 'failed' ? { success: false } : {}

  const { data, isLoading } = useQuery({
    queryKey: ['connectors', id, 'logs', filter],
    enabled: Boolean(id),
    queryFn: () =>
      api.get<ConnectorLogList>(`${API_PREFIX}/connectors/${id}/logs`, {
        params: { page_size: 100, ...successParam },
      }),
  })

  const retry = useMutation({
    mutationFn: () =>
      api.post<{ requeued: number }>(`${API_PREFIX}/connectors/${id}/retry`),
    onSuccess: (res) => {
      toast.success(`Re-queued ${res.requeued} failed execution${res.requeued === 1 ? '' : 's'}`)
      queryClient.invalidateQueries({ queryKey: ['connectors', id, 'logs'] })
    },
    onError: () => toast.error('Could not re-queue'),
  })

  const logs = data?.items ?? []
  const failedCount = logs.filter((l) => !l.success).length

  if (isLoading) return <CenteredSpinner />

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
            Execution Logs{connector ? ` · ${connector.name}` : ''}
          </h1>
          <p className="mt-0.5 text-sm text-surface-muted">
            {data?.total ?? 0} total executions
          </p>
        </div>
        {failedCount > 0 && (
          <button
            onClick={() => retry.mutate()}
            disabled={retry.isPending}
            className="btn-outline"
          >
            <RotateCw className={cn('h-4 w-4', retry.isPending && 'animate-spin')} />
            Retry Failed ({failedCount})
          </button>
        )}
      </div>

      <div className="flex items-center gap-1">
        {(['all', 'success', 'failed'] as LogFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors',
              filter === f
                ? 'bg-ice-500/15 text-ice-400'
                : 'text-surface-muted hover:text-surface-100',
            )}
          >
            {f === 'all' ? 'All' : f === 'success' ? 'Success only' : 'Failures only'}
          </button>
        ))}
      </div>

      {logs.length === 0 ? (
        <p className="card p-10 text-center text-sm text-surface-muted">
          No executions recorded yet.
        </p>
      ) : (
        <div className="card overflow-hidden">
          <div className="grid grid-cols-[160px_1fr_110px_90px_90px_32px] gap-3 border-b border-surface-border bg-surface-800/60 px-4 py-2.5 text-[11px] font-medium uppercase tracking-wide text-surface-muted">
            <span>Timestamp</span>
            <span>Document</span>
            <span>Status</span>
            <span>Duration</span>
            <span>Code</span>
            <span />
          </div>
          <div className="divide-y divide-surface-border">
            {logs.map((log) => (
              <LogRow
                key={log.id}
                log={log}
                expanded={expanded === log.id}
                onToggle={() => setExpanded((e) => (e === log.id ? null : log.id))}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function LogRow({
  log,
  expanded,
  onToggle,
}: {
  log: ConnectorLog
  expanded: boolean
  onToggle: () => void
}) {
  const filename =
    (log.request_summary?.['document_filename'] as string | undefined) ??
    (log.document_id ? log.document_id.slice(0, 8) : '—')

  return (
    <div>
      <button
        onClick={onToggle}
        className="grid w-full grid-cols-[160px_1fr_110px_90px_90px_32px] items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-surface-800/40"
      >
        <span className="text-xs text-surface-muted">
          {format(new Date(log.created_at), 'MMM d, HH:mm:ss')}
        </span>
        <span className="truncate text-surface-100">{filename}</span>
        <span>
          <Badge tone={log.success ? 'green' : 'red'}>
            {log.success ? 'Success' : 'Failed'}
          </Badge>
        </span>
        <span className="text-xs text-surface-muted">{log.duration_ms}ms</span>
        <span className="font-mono text-xs text-surface-muted">
          {log.response_status ?? '—'}
        </span>
        <span className="flex justify-center text-surface-muted">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-surface-border bg-surface-900/40 px-4 py-4">
          {log.error_message && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              {log.error_message}
            </div>
          )}
          <div className="grid gap-3 lg:grid-cols-2">
            <div>
              <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-surface-muted">
                Request
              </h4>
              <CodeBlock code={log.request_summary} maxHeight="280px" />
            </div>
            <div>
              <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-surface-muted">
                Response {log.response_status ? `· ${log.response_status}` : ''}
              </h4>
              <CodeBlock code={log.response_body_truncated || '(empty response body)'} maxHeight="280px" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
