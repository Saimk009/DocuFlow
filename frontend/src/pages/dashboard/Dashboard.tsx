import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Cpu,
  Database,
  FileStack,
  Gauge,
  HardDrive,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { format, formatDistanceToNow } from 'date-fns'
import { api, API_PREFIX } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useTenantStore } from '@/store/tenantStore'
import { useDocuments } from '@/hooks/useDocuments'
import { usePipelineCounts } from '@/hooks/usePipelineCounts'
import { useDocumentStream } from '@/hooks/useDocumentStream'
import { LivePipelineRail } from '@/components/shared/LivePipelineRail'
import { Badge } from '@/components/shared/Badge'
import { Mono } from '@/components/shared/common'
import { SkeletonCard, SkeletonKpi } from '@/components/shared/Skeleton'
import { GettingStartedWidget } from '@/components/onboarding/GettingStartedWidget'
import { ExceptionSummaryWidget } from '@/components/dashboard/ExceptionSummaryWidget'
import type { PaginatedResponse, Robot } from '@/types'

interface Overview {
  today: { processed: number; exceptions: number; avg_confidence: number }
  last_30_days: Array<{
    date: string
    processed: number
    exceptions: number
    avg_confidence: number
  }>
}

const SLA_ACCURACY = 0.9

export function Dashboard() {
  const queryClient = useQueryClient()
  const aiProvider = useTenantStore((s) => s.aiProvider)
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['analytics', 'overview'],
    queryFn: () => api.get<Overview>(`${API_PREFIX}/analytics/overview`),
    refetchInterval: 60_000,
  })
  const { data: robots } = useQuery({
    queryKey: ['robots', 'dashboard'],
    queryFn: () =>
      api.get<PaginatedResponse<Robot>>(`${API_PREFIX}/robots`, {
        params: { page_size: 100 },
      }),
    refetchInterval: 60_000,
  })
  const { data: counts } = usePipelineCounts()
  const { data: recent } = useDocuments({ page_size: 12 })

  // Live updates: keep KPIs, pipeline counts, and the activity feed current.
  useDocumentStream(
    useCallback(
      (msg) => {
        if (msg.type === 'document_updated' || msg.type === 'initial_state') {
          queryClient.invalidateQueries({ queryKey: ['documents'] })
          queryClient.invalidateQueries({ queryKey: ['analytics'] })
        }
      },
      [queryClient],
    ),
  )

  function refreshAll() {
    queryClient.invalidateQueries({ queryKey: ['analytics'] })
    queryClient.invalidateQueries({ queryKey: ['robots'] })
    queryClient.invalidateQueries({ queryKey: ['documents'] })
  }

  if (isLoading) return <DashboardSkeleton />

  const series = data?.last_30_days ?? []
  const last7 = series.slice(-7)
  const today = data?.today.processed ?? 0
  const yesterday = series.length >= 2 ? series[series.length - 2].processed : 0
  const pctChange =
    yesterday > 0 ? Math.round(((today - yesterday) / yesterday) * 100) : 0
  const accuracy = data?.today.avg_confidence ?? 0
  const aboveSla = accuracy >= SLA_ACCURACY

  const totalRobots = robots?.items.length ?? 0
  const activeRobots = robots?.items.filter((r) => r.status === 'running').length ?? 0
  const idleRobots = totalRobots - activeRobots

  const exceptions = data?.today.exceptions ?? 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-surface-50">Command Center</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-surface-muted">
            <span>{format(now, 'EEEE, MMMM d, yyyy')}</span>
            <span className="text-surface-border">·</span>
            <Mono className="text-ice-400">{format(now, 'HH:mm:ss')}</Mono>
          </p>
        </div>
        <button
          onClick={refreshAll}
          className="btn-outline"
          disabled={isFetching}
        >
          <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
          Refresh
        </button>
      </div>

      <GettingStartedWidget />

      {/* KPI ROW */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiSparkCard
          label="Documents Today"
          value={today}
          icon={FileStack}
          accent="ice"
          delta={pctChange}
          deltaLabel="vs yesterday"
          spark={last7.map((d) => d.processed)}
        />
        <KpiTrendCard
          label="Extraction Accuracy"
          value={`${Math.round(accuracy * 100)}%`}
          icon={Gauge}
          accent="ai"
          up={aboveSla}
          subLabel={aboveSla ? 'Above SLA' : 'Below SLA'}
        />
        <KpiSubCard
          label="Exceptions Pending"
          value={exceptions}
          icon={AlertTriangle}
          accent="amber"
          subLabel={`${Math.min(exceptions, Math.ceil(exceptions / 2))} high priority`}
        />
        <KpiSubCard
          label="Robots Active"
          value={`${activeRobots} / ${totalRobots}`}
          icon={Bot}
          accent="ice"
          subLabel={`${idleRobots} idle`}
        />
      </div>

      <ExceptionSummaryWidget />

      {/* MIDDLE ROW */}
      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="card flex-1 p-5">
          <h2 className="mb-4 text-sm font-medium text-surface-100">
            Throughput — 30 days
          </h2>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={series}>
              <XAxis
                dataKey="date"
                tickFormatter={(d) => format(new Date(d), 'MMM d')}
                tick={{ fill: '#2A3F5F', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                minTickGap={24}
              />
              <YAxis
                tick={{ fill: '#2A3F5F', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={28}
              />
              <Tooltip content={<ChartTooltip />} />
              <Line
                type="monotone"
                dataKey="processed"
                name="Processed"
                stroke="#38BDF8"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="exceptions"
                name="Exceptions"
                stroke="#F59E0B"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Activity feed */}
        <div className="card flex w-full flex-col lg:w-[380px]">
          <div className="flex items-center gap-2 border-b border-surface-border px-4 py-3">
            <Activity className="h-4 w-4 text-ice-400" />
            <span className="text-sm font-medium text-surface-50">
              Live Activity
            </span>
          </div>
          <div className="max-h-[300px] flex-1 divide-y divide-surface-border overflow-y-auto">
            {!recent?.items.length && (
              <div className="px-4 py-12 text-center text-sm text-surface-muted">
                No recent activity
              </div>
            )}
            {recent?.items.map((doc) => (
              <Link
                key={doc.id}
                to={`/documents/${doc.id}`}
                className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-600"
              >
                <ActivityIcon status={doc.status} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Mono className="text-xs text-ice-400">{doc.id.slice(0, 8)}</Mono>
                    <span className="truncate text-sm text-surface-50">
                      {doc.filename}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className="text-xs text-surface-muted">
                      {doc.status} ·{' '}
                      {formatDistanceToNow(new Date(doc.created_at), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                </div>
                {doc.doc_type && (
                  <Badge tone="ai" className="shrink-0">
                    {doc.doc_type}
                  </Badge>
                )}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* BOTTOM ROW */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <LivePipelineRail counts={counts ?? {}} />
        </div>
        <div className="card p-5">
          <h2 className="mb-4 text-sm font-medium text-surface-100">System Health</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <HealthTile
              icon={Cpu}
              name="OCR Engine"
              detail="Tesseract v5"
            />
            <HealthTile
              icon={Bot}
              name="AI Classifier"
              detail={aiProvider === 'openai' ? 'GPT-4o' : 'Claude'}
            />
            <HealthTile icon={Database} name="RPA Scheduler" detail="Celery · Redis" />
            <HealthTile icon={HardDrive} name="Storage" detail="MinIO · S3" />
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------- Sub-components ---------- */

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="skeleton h-6 w-44" />
          <div className="skeleton h-3 w-64" />
        </div>
        <div className="skeleton h-9 w-28 rounded" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonKpi key={i} />
        ))}
      </div>
      <div className="flex flex-col gap-4 lg:flex-row">
        <SkeletonCard className="flex-1" />
        <SkeletonCard className="w-full lg:w-[380px]" />
      </div>
    </div>
  )
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-surface-border bg-surface-700 px-3 py-2 text-xs">
      <div className="mb-1 font-mono text-surface-muted">
        {label ? format(new Date(label), 'MMM d, yyyy') : ''}
      </div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-surface-100">{p.name}</span>
          <Mono className="ml-auto text-surface-50">{p.value}</Mono>
        </div>
      ))}
    </div>
  )
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 1)
  return (
    <div className="flex h-8 items-end gap-0.5">
      {values.map((v, i) => (
        <div
          key={i}
          className="w-full rounded-sm"
          style={{
            height: `${Math.max((v / max) * 100, 6)}%`,
            backgroundColor: color,
            opacity: 0.4 + (i / values.length) * 0.6,
          }}
        />
      ))}
    </div>
  )
}

const ACCENT_TEXT = {
  ice: 'text-ice-400',
  ai: 'text-ai-400',
  amber: 'text-amber-400',
  neutral: 'text-surface-100',
} as const

type Accent = keyof typeof ACCENT_TEXT

function KpiSparkCard({
  label,
  value,
  icon: Icon,
  accent,
  delta,
  deltaLabel,
  spark,
}: {
  label: string
  value: number | string
  icon: typeof FileStack
  accent: Accent
  delta: number
  deltaLabel: string
  spark: number[]
}) {
  const up = delta >= 0
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-surface-muted">
          {label}
        </span>
        <Icon className={cn('h-4 w-4', ACCENT_TEXT[accent])} />
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <div>
          <div className="font-mono text-2xl font-medium text-surface-50">{value}</div>
          <div
            className={cn(
              'mt-1 flex items-center gap-1 text-xs',
              up ? 'text-emerald-400' : 'text-rose-400',
            )}
          >
            {up ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            {up ? '+' : ''}
            {delta}% <span className="text-surface-muted">{deltaLabel}</span>
          </div>
        </div>
        <div className="w-20">
          <Sparkline values={spark.length ? spark : [0]} color="#38BDF8" />
        </div>
      </div>
    </div>
  )
}

function KpiTrendCard({
  label,
  value,
  icon: Icon,
  accent,
  up,
  subLabel,
}: {
  label: string
  value: string
  icon: typeof Gauge
  accent: Accent
  up: boolean
  subLabel: string
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-surface-muted">
          {label}
        </span>
        <Icon className={cn('h-4 w-4', ACCENT_TEXT[accent])} />
      </div>
      <div className="mt-2 font-mono text-2xl font-medium text-surface-50">{value}</div>
      <div
        className={cn(
          'mt-1 flex items-center gap-1 text-xs',
          up ? 'text-emerald-400' : 'text-amber-400',
        )}
      >
        {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
        {subLabel}
      </div>
    </div>
  )
}

function KpiSubCard({
  label,
  value,
  icon: Icon,
  accent,
  subLabel,
}: {
  label: string
  value: number | string
  icon: typeof AlertTriangle
  accent: Accent
  subLabel: string
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-surface-muted">
          {label}
        </span>
        <Icon className={cn('h-4 w-4', ACCENT_TEXT[accent])} />
      </div>
      <div className="mt-2 font-mono text-2xl font-medium text-surface-50">{value}</div>
      <div className={cn('mt-1 text-xs', ACCENT_TEXT[accent])}>{subLabel}</div>
    </div>
  )
}

function ActivityIcon({ status }: { status: string }) {
  if (status === 'complete')
    return <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
  if (status === 'exception' || status === 'rejected')
    return <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
  return (
    <span className="mt-1.5 h-2 w-2 shrink-0 animate-pulse-soft rounded-full bg-ice-500" />
  )
}

function HealthTile({
  icon: Icon,
  name,
  detail,
}: {
  icon: typeof Cpu
  name: string
  detail: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-surface-border bg-surface-900 p-3">
      <Icon className="h-4 w-4 text-surface-muted" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-surface-50">{name}</div>
        <div className="truncate text-[10px] text-surface-muted">{detail}</div>
      </div>
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
    </div>
  )
}
