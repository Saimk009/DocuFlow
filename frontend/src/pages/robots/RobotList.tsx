import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bot,
  CalendarClock,
  CheckCircle2,
  FileText,
  Loader2,
  Play,
  Plus,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { api, API_PREFIX } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/shared/Badge'
import { CenteredSpinner, EmptyState, Mono } from '@/components/shared/common'
import { NewRobotWizard } from './NewRobotWizard'
import type { PaginatedResponse, Robot } from '@/types'

type EffectiveStatus = 'running' | 'idle' | 'scheduled' | 'error'

interface RobotStat {
  robot_id: string
  name: string
  runs: number
  success_rate: number
  avg_duration_ms: number
}

function effectiveStatus(robot: Robot): EffectiveStatus {
  if (robot.status === 'running' || robot.last_run?.status === 'running')
    return 'running'
  if (robot.last_run?.status === 'failed') return 'error'
  if (robot.trigger_type === 'schedule') return 'scheduled'
  return 'idle'
}

function humanizeCron(cron?: string | null): string | null {
  if (!cron) return null
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) return cron
  const [min, hour, , , dow] = parts
  if (hour === '*') return 'Every hour'
  const h = Number(hour)
  const m = Number(min)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  const time = `${h12}:${String(m).padStart(2, '0')} ${period}`
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  if (dow !== '*' && !Number.isNaN(Number(dow)))
    return `Every ${days[Number(dow)]} at ${time}`
  return `Every day at ${time}`
}

function durationMs(start?: string, end?: string | null): string {
  if (!start || !end) return '—'
  const ms = new Date(end).getTime() - new Date(start).getTime()
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function RobotList() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [wizardOpen, setWizardOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['robots'],
    refetchInterval: 5000,
    queryFn: () =>
      api.get<PaginatedResponse<Robot>>(`${API_PREFIX}/robots`, {
        params: { page_size: 50 },
      }),
  })
  const { data: stats } = useQuery({
    queryKey: ['analytics', 'robots'],
    refetchInterval: 10000,
    queryFn: () => api.get<RobotStat[]>(`${API_PREFIX}/analytics/robots`),
  })

  const run = useMutation({
    mutationFn: (robotId: string) => api.post(`${API_PREFIX}/robots/${robotId}/run`),
    onSuccess: () => {
      toast.success('Robot run triggered')
      queryClient.invalidateQueries({ queryKey: ['robots'] })
    },
    onError: () => toast.error('Could not trigger run'),
  })

  const robots = data?.items ?? []
  const statMap = useMemo(() => {
    const m = new Map<string, RobotStat>()
    stats?.forEach((s) => m.set(s.robot_id, s))
    return m
  }, [stats])

  const counts = useMemo(() => {
    const c = { running: 0, idle: 0, scheduled: 0, error: 0 }
    robots.forEach((r) => {
      c[effectiveStatus(r)] += 1
    })
    return c
  }, [robots])

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-surface-50">RPA Robots</h1>
            {counts.running > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-ice-500/15 px-2.5 py-0.5 text-xs font-medium text-ice-400">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ice-400 opacity-70" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-ice-400" />
                </span>
                {counts.running} running
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-surface-muted">
            Automated processes triggered manually, on schedule, or by events.
          </p>
        </div>
        <button onClick={() => setWizardOpen(true)} className="btn-primary">
          <Plus className="h-4 w-4" />
          New Robot
        </button>
      </div>

      {/* Status overview bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatusChip label="Running" count={counts.running} tone="ice" />
        <StatusChip label="Idle" count={counts.idle} tone="muted" />
        <StatusChip label="Scheduled" count={counts.scheduled} tone="indigo" />
        <StatusChip label="Error" count={counts.error} tone="red" />
      </div>

      {isLoading ? (
        <CenteredSpinner />
      ) : !robots.length ? (
        <EmptyState
          icon={<Bot className="h-7 w-7" />}
          title="No robots configured"
          description="Automate your first workflow."
          actionLabel="New Robot"
          onAction={() => setWizardOpen(true)}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {robots.map((robot) => (
            <RobotCard
              key={robot.id}
              robot={robot}
              stat={statMap.get(robot.id)}
              onView={() => navigate(`/robots/${robot.id}`)}
              onRun={() => run.mutate(robot.id)}
              running={run.isPending && run.variables === robot.id}
            />
          ))}
        </div>
      )}

      <NewRobotWizard open={wizardOpen} onOpenChange={setWizardOpen} />
    </div>
  )
}

function StatusChip({
  label,
  count,
  tone,
}: {
  label: string
  count: number
  tone: 'ice' | 'muted' | 'indigo' | 'red'
}) {
  const toneClass = {
    ice: 'text-ice-400',
    muted: 'text-surface-100',
    indigo: 'text-ai-400',
    red: 'text-rose-400',
  }[tone]
  const dot = {
    ice: 'bg-ice-500',
    muted: 'bg-surface-muted',
    indigo: 'bg-ai-500',
    red: 'bg-rose-500',
  }[tone]
  return (
    <div className="card flex items-center justify-between px-4 py-3">
      <div className="flex items-center gap-2">
        <span className={cn('h-2 w-2 rounded-full', dot)} />
        <span className="text-xs text-surface-muted">{label}</span>
      </div>
      <span className={cn('font-mono text-lg font-medium', toneClass)}>{count}</span>
    </div>
  )
}

function RobotCard({
  robot,
  stat,
  onView,
  onRun,
  running,
}: {
  robot: Robot
  stat?: RobotStat
  onView: () => void
  onRun: () => void
  running: boolean
}) {
  const status = effectiveStatus(robot)
  const isRunning = status === 'running'
  const isError = status === 'error'
  const schedule = humanizeCron(robot.schedule_cron)
  const successRate = stat?.success_rate ?? 0

  const badgeTone = {
    running: 'ice',
    idle: 'neutral',
    scheduled: 'ai',
    error: 'red',
  }[status] as 'ice' | 'neutral' | 'ai' | 'red'

  return (
    <div
      className={cn(
        'card relative flex flex-col overflow-hidden p-4',
        isRunning && 'bg-ice-500/[0.06]',
        isError && 'bg-rose-500/[0.06]',
      )}
    >
      {isRunning && (
        <div
          className="absolute inset-x-0 top-0 h-0.5"
          style={{
            backgroundImage:
              'linear-gradient(90deg, #1F3050 0%, #38BDF8 50%, #1F3050 100%)',
            backgroundSize: '200% 100%',
            animation: 'flow-rail 2s linear infinite',
          }}
        />
      )}

      {/* Top */}
      <div className="flex items-start justify-between">
        <button
          onClick={onView}
          className="text-left text-sm font-medium text-surface-50 hover:text-ice-400"
        >
          {robot.name}
        </button>
        <Badge tone={badgeTone} className="capitalize">
          {isRunning && (
            <span className="relative mr-0.5 flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ice-400 opacity-70" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-ice-400" />
            </span>
          )}
          {status}
        </Badge>
      </div>

      {/* Middle */}
      <p className="mt-1.5 line-clamp-2 min-h-[2rem] text-xs text-surface-muted">
        {robot.description || 'No description'}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Badge tone="ai" mono className="capitalize">
          {robot.trigger_type}
        </Badge>
        {schedule && (
          <span className="flex items-center gap-1 text-xs text-surface-muted">
            <CalendarClock className="h-3.5 w-3.5" />
            {schedule}
          </span>
        )}
      </div>

      {/* Metrics */}
      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-surface-border pt-3 text-xs">
        <Metric
          label="Last run"
          value={
            robot.last_run
              ? formatDistanceToNow(new Date(robot.last_run.started_at), {
                  addSuffix: true,
                })
              : 'Never'
          }
        />
        <Metric
          label="Duration"
          value={durationMs(robot.last_run?.started_at, robot.last_run?.finished_at)}
        />
        <Metric
          label="Items"
          value={String(robot.last_run?.items_processed ?? 0)}
        />
      </div>

      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-[10px] text-surface-muted">
          <span className="flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Success rate
          </span>
          <Mono>{successRate}%</Mono>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-900">
          <div
            className={cn(
              'h-full rounded-full',
              successRate >= 90
                ? 'bg-emerald-500'
                : successRate >= 60
                  ? 'bg-amber-500'
                  : 'bg-rose-500',
            )}
            style={{ width: `${successRate}%` }}
          />
        </div>
      </div>

      {/* Bottom */}
      <div className="mt-4 flex items-center gap-2">
        <button onClick={onView} className="btn-outline flex-1 py-1.5 text-xs">
          <FileText className="h-3.5 w-3.5" />
          View Logs
        </button>
        <button
          onClick={onRun}
          disabled={isRunning || running}
          className="btn-primary flex-1 py-1.5 text-xs"
        >
          {running || isRunning ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
          {running ? 'Starting…' : isRunning ? 'Running…' : 'Run Now'}
        </button>
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-surface-muted">
        {label}
      </div>
      <div className="mt-0.5 truncate text-surface-100">{value}</div>
    </div>
  )
}
