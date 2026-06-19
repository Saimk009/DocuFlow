import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Bell,
  ChevronDown,
  ChevronRight,
  Clock,
  GitBranch,
  Globe,
  Pause,
  PenLine,
  Play,
  ScanText,
  Terminal,
  type LucideIcon,
} from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { api, API_PREFIX } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/shared/Badge'
import { CenteredSpinner, Mono, Spinner } from '@/components/shared/common'
import type {
  PaginatedResponse,
  Robot,
  RobotRun,
  User,
} from '@/types'

const STEP_ICONS: Record<string, LucideIcon> = {
  http_request: Globe,
  extract_text: ScanText,
  fill_field: PenLine,
  decision: GitBranch,
  notify: Bell,
  delay: Clock,
}

function runTone(status: string) {
  if (status === 'completed') return 'green' as const
  if (status === 'failed') return 'red' as const
  return 'ice' as const
}

function duration(start?: string, end?: string | null): string {
  if (!start || !end) return '—'
  const ms = new Date(end).getTime() - new Date(start).getTime()
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

function stepSummary(step: Record<string, unknown>): string {
  const t = step.type as string
  switch (t) {
    case 'http_request':
      return `${step.method ?? 'GET'} ${step.url ?? ''}`.trim()
    case 'extract_text':
      return `${step.field ?? ''} ~ /${step.regex ?? ''}/`
    case 'fill_field':
      return `${step.field ?? ''} = ${step.value ?? ''}`
    case 'decision':
      return String(step.condition ?? '')
    case 'notify':
      return `→ ${step.recipient ?? ''}`
    case 'delay':
      return `${step.seconds ?? 0}s`
    default:
      return ''
  }
}

export function RobotDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: robot, isLoading } = useQuery({
    queryKey: ['robots', id],
    enabled: Boolean(id),
    refetchInterval: 3000,
    queryFn: () => api.get<Robot>(`${API_PREFIX}/robots/${id}`),
  })

  const { data: runs } = useQuery({
    queryKey: ['robots', id, 'runs'],
    enabled: Boolean(id),
    refetchInterval: 2000,
    queryFn: () =>
      api.get<PaginatedResponse<RobotRun>>(`${API_PREFIX}/robots/${id}/runs`, {
        params: { page_size: 20 },
      }),
  })

  const { data: users } = useQuery({
    queryKey: ['settings', 'users'],
    queryFn: () => api.get<User[]>(`${API_PREFIX}/settings/users`),
  })
  const { data: stats } = useQuery({
    queryKey: ['analytics', 'robots'],
    queryFn: () =>
      api.get<Array<{ robot_id: string; runs: number; success_rate: number }>>(
        `${API_PREFIX}/analytics/robots`,
      ),
  })

  const run = useMutation({
    mutationFn: () => api.post(`${API_PREFIX}/robots/${id}/run`),
    onSuccess: () => {
      toast.success('Run triggered')
      queryClient.invalidateQueries({ queryKey: ['robots', id, 'runs'] })
    },
  })

  const togglePause = useMutation({
    mutationFn: (next: string) =>
      api.put(`${API_PREFIX}/robots/${id}`, { status: next }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['robots', id] })
    },
  })

  if (isLoading || !robot) return <CenteredSpinner label="Loading robot" />

  const stat = stats?.find((s) => s.robot_id === robot.id)
  const steps = (robot.definition_json?.steps as Array<Record<string, unknown>>) ?? []
  const createdBy =
    users?.find((u) => u.id === robot.created_by)?.full_name ?? 'Unknown'
  const isRunning = robot.status === 'running'
  const isPaused = robot.status === 'paused'
  const activeRun = runs?.items.find((r) => r.status === 'running')

  return (
    <div className="space-y-5">
      <button
        onClick={() => navigate('/robots')}
        className="flex items-center gap-1.5 text-sm text-surface-muted hover:text-surface-50"
      >
        <ArrowLeft className="h-4 w-4" />
        Robots
      </button>

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-surface-50">{robot.name}</h1>
          <Badge tone={isRunning ? 'ice' : isPaused ? 'amber' : 'neutral'} className="capitalize">
            {robot.status}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => run.mutate()}
            disabled={run.isPending || isRunning}
            className="btn-primary py-1.5"
          >
            {run.isPending ? <Spinner /> : <Play className="h-3.5 w-3.5" />}
            Run Now
          </button>
          <button
            onClick={() => togglePause.mutate(isPaused ? 'idle' : 'paused')}
            disabled={isRunning || togglePause.isPending}
            className="btn-outline py-1.5"
          >
            {isPaused ? (
              <>
                <Play className="h-3.5 w-3.5" />
                Resume
              </>
            ) : (
              <>
                <Pause className="h-3.5 w-3.5" />
                Pause
              </>
            )}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        {/* Left */}
        <div className="space-y-4 lg:col-span-2">
          <div className="card p-4">
            <h2 className="mb-3 text-sm font-medium text-surface-50">Configuration</h2>
            <dl className="space-y-2.5 text-sm">
              <Row label="Trigger">
                <Badge tone="ai" mono className="capitalize">
                  {robot.trigger_type}
                </Badge>
              </Row>
              <Row label="Schedule">
                <Mono className="text-xs text-surface-100">
                  {robot.schedule_cron ?? '—'}
                </Mono>
              </Row>
              <Row label="Created by">
                <span className="text-surface-100">{createdBy}</span>
              </Row>
              <Row label="Total runs">
                <Mono className="text-surface-100">{stat?.runs ?? 0}</Mono>
              </Row>
              <Row label="Success rate">
                <Mono className="text-emerald-400">{stat?.success_rate ?? 0}%</Mono>
              </Row>
            </dl>
          </div>

          <div className="card p-4">
            <h2 className="mb-3 text-sm font-medium text-surface-50">
              Steps <span className="text-surface-muted">({steps.length})</span>
            </h2>
            {steps.length === 0 ? (
              <p className="text-sm text-surface-muted">No steps defined.</p>
            ) : (
              <ol className="space-y-2">
                {steps.map((step, i) => {
                  const Icon = STEP_ICONS[step.type as string] ?? Terminal
                  return (
                    <li
                      key={i}
                      className="flex items-start gap-3 rounded-lg border border-surface-border bg-surface-800 p-2.5"
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-600 text-[10px] text-surface-100">
                        {i + 1}
                      </span>
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ice-400" />
                      <div className="min-w-0">
                        <div className="text-sm text-surface-50">
                          {String(step.label ?? step.type)}
                        </div>
                        <div className="truncate font-mono text-[11px] text-surface-muted">
                          {stepSummary(step)}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ol>
            )}
          </div>
        </div>

        {/* Right */}
        <div className="space-y-4 lg:col-span-3">
          {activeRun && <LiveLogs robotId={robot.id} runId={activeRun.id} />}

          <div className="card overflow-hidden">
            <div className="border-b border-surface-border px-4 py-3">
              <h2 className="text-sm font-medium text-surface-50">Recent Runs</h2>
            </div>
            {!runs?.items.length ? (
              <p className="px-4 py-10 text-center text-sm text-surface-muted">
                No runs yet. Trigger a run to see logs.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-border text-left text-xs uppercase tracking-wide text-surface-muted">
                    <th className="px-4 py-2 font-medium">Run ID</th>
                    <th className="px-4 py-2 font-medium">Started</th>
                    <th className="px-4 py-2 font-medium">Duration</th>
                    <th className="px-4 py-2 font-medium">Items</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {runs.items.map((r) => (
                    <RunRow key={r.id} robotId={robot.id} run={r} />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-xs text-surface-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function RunRow({ robotId, run }: { robotId: string; run: RobotRun }) {
  const [open, setOpen] = useState(false)

  const { data: detail } = useQuery({
    queryKey: ['robots', robotId, 'runs', run.id],
    enabled: open,
    queryFn: () =>
      api.get<RobotRun>(`${API_PREFIX}/robots/${robotId}/runs/${run.id}`),
  })

  return (
    <>
      <tr
        onClick={() => setOpen((o) => !o)}
        className="cursor-pointer hover:bg-surface-600/50"
      >
        <td className="px-4 py-2.5">
          <span className="flex items-center gap-1.5">
            {open ? (
              <ChevronDown className="h-3.5 w-3.5 text-surface-muted" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-surface-muted" />
            )}
            <Mono className="text-xs text-ice-400">{run.id.slice(0, 8)}</Mono>
          </span>
        </td>
        <td className="px-4 py-2.5 text-xs text-surface-muted">
          {format(new Date(run.started_at), 'MMM d, HH:mm:ss')}
        </td>
        <td className="px-4 py-2.5 text-xs text-surface-100">
          <Mono>{duration(run.started_at, run.finished_at)}</Mono>
        </td>
        <td className="px-4 py-2.5 text-xs text-surface-100">
          <Mono>{run.items_processed}</Mono>
        </td>
        <td className="px-4 py-2.5">
          <Badge tone={runTone(run.status)} className="capitalize">
            {run.status}
          </Badge>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={5} className="bg-surface-900 px-4 py-3">
            {run.error_message && (
              <p className="mb-2 rounded border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-400">
                {run.error_message}
              </p>
            )}
            <LogLines logs={detail?.logs_json ?? []} />
          </td>
        </tr>
      )}
    </>
  )
}

function LiveLogs({ robotId, runId }: { robotId: string; runId: string }) {
  const { data } = useQuery({
    queryKey: ['robots', robotId, 'runs', runId, 'live'],
    refetchInterval: 2000,
    queryFn: () =>
      api.get<RobotRun>(`${API_PREFIX}/robots/${robotId}/runs/${runId}`),
  })

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-surface-border px-4 py-2.5">
        <Terminal className="h-4 w-4 text-emerald-400" />
        <span className="text-sm font-medium text-surface-50">Live Logs</span>
        <span className="relative ml-1 flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
        </span>
      </div>
      <LogLines logs={data?.logs_json ?? []} terminal autoScroll />
    </div>
  )
}

function LogLines({
  logs,
  terminal = false,
  autoScroll = false,
}: {
  logs: Array<{ step: number; type: string; status: string; message: string; timestamp: string }>
  terminal?: boolean
  autoScroll?: boolean
}) {
  if (!logs.length)
    return (
      <p className={cn('text-xs text-surface-muted', terminal ? 'p-4' : '')}>
        No log output.
      </p>
    )
  return (
    <div
      ref={(el) => {
        if (autoScroll && el) el.scrollTop = el.scrollHeight
      }}
      className={cn(
        'max-h-64 space-y-0.5 overflow-y-auto font-mono text-[11px]',
        terminal ? 'bg-surface-900 p-4' : '',
      )}
    >
      {logs.map((log, i) => (
        <div key={i} className="flex gap-2">
          <span className="text-surface-muted">
            {log.timestamp ? `[${format(new Date(log.timestamp), 'HH:mm:ss')}]` : '[--:--:--]'}
          </span>
          <span
            className={cn(
              log.status === 'failed'
                ? 'text-rose-400'
                : log.status === 'completed'
                  ? 'text-emerald-400'
                  : 'text-ice-400',
            )}
          >
            Step {log.step}: {log.type}
          </span>
          <span className="text-surface-100">→ {log.message}</span>
        </div>
      ))}
    </div>
  )
}
