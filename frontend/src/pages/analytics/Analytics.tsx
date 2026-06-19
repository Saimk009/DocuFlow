import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import * as Tabs from '@radix-ui/react-tabs'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { format } from 'date-fns'
import { BarChart3, TrendingDown, TrendingUp } from 'lucide-react'
import { api, API_PREFIX } from '@/lib/api'
import { cn } from '@/lib/utils'
import { CenteredSpinner, Mono } from '@/components/shared/common'
import { EmptyState } from '@/components/shared/EmptyState'
import { Badge } from '@/components/shared/Badge'

interface DayStat {
  date: string
  processed: number
  exceptions: number
  avg_confidence: number
}
interface DocTypeStat {
  doc_type: string
  count: number
  pct: number
}
interface SlaStat {
  workflow_name: string
  avg_processing_ms: number
  p95_processing_ms: number
}
interface Overview {
  today: { processed: number; exceptions: number; avg_confidence: number }
  last_30_days: DayStat[]
  by_doc_type: DocTypeStat[]
  sla: SlaStat[]
  top_exceptions: Array<{ reason: string; count: number }>
}
interface FieldStat {
  field_key: string
  field_label: string
  avg_confidence: number
  sample_count: number
  low_confidence_rate: number
}

const COLORS = ['#38BDF8', '#6366F1', '#F59E0B', '#34D399', '#A78BFA', '#F472B6']
const ACCURACY_SLA = 0.9
const SLA_TARGET_MS = 300_000 // 5 minutes

const TOOLTIP = {
  contentStyle: {
    background: '#162238',
    border: '1px solid #1F3050',
    borderRadius: 8,
    fontSize: 12,
  },
  labelStyle: { color: '#E2EAF4' },
  itemStyle: { color: '#E2EAF4' },
}
const AXIS = { fill: '#2A3F5F', fontSize: 11 }

export function Analytics() {
  const { data: overview, isLoading } = useQuery({
    queryKey: ['analytics', 'overview'],
    queryFn: () => api.get<Overview>(`${API_PREFIX}/analytics/overview`),
  })
  const { data: fields } = useQuery({
    queryKey: ['analytics', 'fields'],
    queryFn: () => api.get<FieldStat[]>(`${API_PREFIX}/analytics/fields`),
  })

  if (isLoading || !overview) return <CenteredSpinner label="Loading analytics" />

  const totalProcessed =
    overview.today.processed +
    overview.last_30_days.reduce((sum, d) => sum + d.processed, 0)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-surface-50">Analytics</h1>
        <p className="mt-1 text-sm text-surface-muted">
          Volume, accuracy, exceptions, and SLA compliance.
        </p>
      </div>

      {totalProcessed === 0 ? (
        <EmptyState
          icon={<BarChart3 className="h-7 w-7" />}
          title="Not enough data yet"
          description="Processing activity will appear here after 24 hours."
        />
      ) : (

      <Tabs.Root defaultValue="volume">
        <Tabs.List className="flex gap-1 border-b border-surface-border">
          {[
            ['volume', 'Volume'],
            ['accuracy', 'Accuracy'],
            ['exceptions', 'Exceptions'],
            ['sla', 'SLA'],
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
          <Tabs.Content value="volume">
            <VolumeTab overview={overview} />
          </Tabs.Content>
          <Tabs.Content value="accuracy">
            <AccuracyTab overview={overview} fields={fields ?? []} />
          </Tabs.Content>
          <Tabs.Content value="exceptions">
            <ExceptionsTab overview={overview} />
          </Tabs.Content>
          <Tabs.Content value="sla">
            <SlaTab overview={overview} />
          </Tabs.Content>
        </div>
      </Tabs.Root>
      )}
    </div>
  )
}

/* ----------------------------- shared bits ----------------------------- */

function Card({
  title,
  children,
  className,
}: {
  title?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('card p-5', className)}>
      {title && (
        <h2 className="mb-4 text-sm font-medium text-surface-100">{title}</h2>
      )}
      {children}
    </div>
  )
}

function KpiNumber({
  label,
  value,
  sub,
}: {
  label: string
  value: string
  sub?: React.ReactNode
}) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wide text-surface-muted">
        {label}
      </div>
      <div className="mt-1 font-mono text-2xl font-medium text-surface-50">
        {value}
      </div>
      {sub && <div className="mt-1 text-xs">{sub}</div>}
    </div>
  )
}

/* ------------------------------- Volume -------------------------------- */

function VolumeTab({ overview }: { overview: Overview }) {
  const { thisMonth, lastMonth, growth } = useMemo(() => {
    const byMonth = new Map<string, number>()
    overview.last_30_days.forEach((d) => {
      const key = d.date.slice(0, 7)
      byMonth.set(key, (byMonth.get(key) ?? 0) + d.processed)
    })
    const keys = [...byMonth.keys()].sort()
    const tm = keys.length ? byMonth.get(keys[keys.length - 1]) ?? 0 : 0
    const lm = keys.length > 1 ? byMonth.get(keys[keys.length - 2]) ?? 0 : 0
    const g = lm > 0 ? Math.round(((tm - lm) / lm) * 100) : 0
    return { thisMonth: tm, lastMonth: lm, growth: g }
  }, [overview])

  const types = overview.by_doc_type.map((t) => t.doc_type)
  const stacked = useMemo(() => {
    return overview.last_30_days.slice(-14).map((d) => {
      const row: Record<string, number | string> = {
        date: format(new Date(d.date), 'MMM d'),
      }
      overview.by_doc_type.forEach((t) => {
        row[t.doc_type] = Math.round((d.processed * t.pct) / 100)
      })
      return row
    })
  }, [overview])

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiNumber label="This Month" value={thisMonth.toLocaleString()} />
        <KpiNumber label="Last Month" value={lastMonth.toLocaleString()} />
        <KpiNumber
          label="Growth"
          value={`${growth >= 0 ? '+' : ''}${growth}%`}
          sub={
            <span
              className={cn(
                'flex items-center gap-1',
                growth >= 0 ? 'text-emerald-400' : 'text-rose-400',
              )}
            >
              {growth >= 0 ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              vs last month
            </span>
          }
        />
      </div>

      <Card title="Documents by type — last 14 days">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={stacked}>
            <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={false} minTickGap={16} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} width={28} />
            <Tooltip {...TOOLTIP} cursor={{ fill: '#1C2D45' }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {types.map((t, i) => (
              <Bar
                key={t}
                dataKey={t}
                stackId="docs"
                fill={COLORS[i % COLORS.length]}
                radius={i === types.length - 1 ? [4, 4, 0, 0] : undefined}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card title="Document type distribution">
        {overview.by_doc_type.length === 0 ? (
          <p className="text-sm text-surface-muted">No classified documents yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={overview.by_doc_type}
                dataKey="count"
                nameKey="doc_type"
                innerRadius={70}
                outerRadius={110}
                paddingAngle={2}
                stroke="none"
              >
                {overview.by_doc_type.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip {...TOOLTIP} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </Card>
    </div>
  )
}

/* ------------------------------ Accuracy ------------------------------- */

function AccuracyTab({
  overview,
  fields,
}: {
  overview: Overview
  fields: FieldStat[]
}) {
  const series = overview.last_30_days
  const latest = series.length ? series[series.length - 1].avg_confidence : overview.today.avg_confidence
  const accuracy = latest || overview.today.avg_confidence
  const aboveSla = accuracy >= ACCURACY_SLA
  const gaugeData = [{ name: 'accuracy', value: Math.round(accuracy * 100) }]
  const spark = series.slice(-14).map((d) => ({ date: d.date, v: d.avg_confidence * 100 }))

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Overall accuracy">
          <div className="flex items-center gap-4">
            <div className="relative h-[140px] w-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart
                  innerRadius="70%"
                  outerRadius="100%"
                  data={gaugeData}
                  startAngle={180}
                  endAngle={0}
                >
                  <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                  <RadialBar
                    dataKey="value"
                    cornerRadius={8}
                    fill={aboveSla ? '#34D399' : '#F59E0B'}
                    background={{ fill: '#1C2D45' }}
                  />
                </RadialBarChart>
              </ResponsiveContainer>
              <div className="absolute inset-x-0 bottom-3 text-center">
                <div className="font-mono text-2xl font-medium text-surface-50">
                  {Math.round(accuracy * 100)}%
                </div>
              </div>
            </div>
            <div>
              <Badge tone={aboveSla ? 'green' : 'amber'}>
                {aboveSla ? 'Above SLA' : 'Below SLA'}
              </Badge>
              <p className="mt-2 text-xs text-surface-muted">
                SLA target {Math.round(ACCURACY_SLA * 100)}%
              </p>
            </div>
          </div>
        </Card>

        <Card title="Confidence trend — 14 days">
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={spark}>
              <defs>
                <linearGradient id="confGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#38BDF8" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#38BDF8" stopOpacity={0} />
                </linearGradient>
              </defs>
              <YAxis domain={[0, 100]} hide />
              <Tooltip {...TOOLTIP} />
              <Area
                type="monotone"
                dataKey="v"
                stroke="#38BDF8"
                strokeWidth={2}
                fill="url(#confGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card title="Average extraction confidence — last 30 days">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={series}>
            <XAxis
              dataKey="date"
              tickFormatter={(d) => format(new Date(d), 'MMM d')}
              tick={AXIS}
              tickLine={false}
              axisLine={false}
              minTickGap={24}
            />
            <YAxis
              domain={[0, 1]}
              tickFormatter={(v) => `${Math.round(v * 100)}%`}
              tick={AXIS}
              tickLine={false}
              axisLine={false}
              width={36}
            />
            <Tooltip
              {...TOOLTIP}
              formatter={(v) => `${Math.round(Number(v) * 100)}%`}
            />
            <Line
              type="monotone"
              dataKey="avg_confidence"
              stroke="#6366F1"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <Card title="Field extraction accuracy">
        {fields.length === 0 ? (
          <p className="text-sm text-surface-muted">No field data yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border text-left text-xs uppercase tracking-wide text-surface-muted">
                <th className="py-2 pr-4 font-medium">Field</th>
                <th className="py-2 pr-4 font-medium">Avg Confidence</th>
                <th className="py-2 pr-4 font-medium">Sample Count</th>
                <th className="py-2 font-medium">Low Confidence Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {fields.map((f) => (
                <tr key={f.field_key}>
                  <td className="py-2.5 pr-4 text-surface-50">{f.field_label}</td>
                  <td className="py-2.5 pr-4">
                    <span
                      className={cn(
                        'font-mono',
                        f.avg_confidence >= 0.9
                          ? 'text-emerald-400'
                          : f.avg_confidence >= 0.7
                            ? 'text-amber-400'
                            : 'text-rose-400',
                      )}
                    >
                      {Math.round(f.avg_confidence * 100)}%
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 text-surface-muted">
                    <Mono>{f.sample_count}</Mono>
                  </td>
                  <td className="py-2.5">
                    <Mono className="text-surface-100">
                      {Math.round(f.low_confidence_rate * 100)}%
                    </Mono>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}

/* ----------------------------- Exceptions ------------------------------ */

function ExceptionsTab({ overview }: { overview: Overview }) {
  const series = overview.last_30_days
  const monthProcessed = series.reduce((s, d) => s + d.processed, 0)
  const monthExceptions = series.reduce((s, d) => s + d.exceptions, 0)
  const rate = monthProcessed > 0 ? (monthExceptions / monthProcessed) * 100 : 0
  const trend = series.slice(-14).map((d) => ({
    date: format(new Date(d.date), 'MMM d'),
    exceptions: d.exceptions,
  }))
  const byReason = overview.top_exceptions.length
    ? overview.top_exceptions
    : [{ reason: 'No exceptions', count: 0 }]

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <KpiNumber label="Exception Rate" value={`${rate.toFixed(1)}%`} />
        <KpiNumber
          label="Total Exceptions (30d)"
          value={monthExceptions.toLocaleString()}
        />
      </div>

      <Card title="Exceptions by reason">
        <ResponsiveContainer width="100%" height={Math.max(180, byReason.length * 42)}>
          <BarChart data={byReason} layout="vertical" margin={{ left: 24 }}>
            <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} />
            <YAxis
              type="category"
              dataKey="reason"
              tick={AXIS}
              tickLine={false}
              axisLine={false}
              width={140}
            />
            <Tooltip {...TOOLTIP} cursor={{ fill: '#1C2D45' }} />
            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
              {byReason.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card title="Exception trend — last 14 days">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={trend}>
            <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={false} minTickGap={16} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} width={28} />
            <Tooltip {...TOOLTIP} />
            <Line
              type="monotone"
              dataKey="exceptions"
              stroke="#F59E0B"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <Card title="Top exception reasons">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-border text-left text-xs uppercase tracking-wide text-surface-muted">
              <th className="py-2 pr-4 font-medium">Reason</th>
              <th className="py-2 font-medium">Count</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {overview.top_exceptions.length === 0 ? (
              <tr>
                <td colSpan={2} className="py-6 text-center text-surface-muted">
                  No exceptions recorded
                </td>
              </tr>
            ) : (
              overview.top_exceptions.map((e) => (
                <tr key={e.reason}>
                  <td className="py-2.5 pr-4 text-surface-50">{e.reason}</td>
                  <td className="py-2.5">
                    <Mono className="text-amber-400">{e.count}</Mono>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

/* -------------------------------- SLA ---------------------------------- */

function SlaTab({ overview }: { overview: Overview }) {
  const sla = overview.sla
  const compliant = sla.filter((s) => s.avg_processing_ms <= SLA_TARGET_MS).length
  const atRisk = sla.length - compliant
  const compliancePct = sla.length ? Math.round((compliant / sla.length) * 100) : 100

  const barData = sla.map((s) => ({
    name: s.workflow_name,
    avg: Math.round(s.avg_processing_ms / 1000),
  }))
  const p95Data = sla.map((s) => ({
    name: s.workflow_name,
    p95: Math.round(s.p95_processing_ms / 1000),
  }))

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <KpiNumber
          label="SLA Compliance"
          value={`${compliancePct}%`}
          sub={
            <span className={compliancePct >= 90 ? 'text-emerald-400' : 'text-amber-400'}>
              target {SLA_TARGET_MS / 60000} min avg
            </span>
          }
        />
        <KpiNumber
          label="At-risk Workflows"
          value={String(atRisk)}
          sub={<span className="text-surface-muted">over SLA target</span>}
        />
      </div>

      <Card title="Average processing time by workflow (seconds)">
        {barData.length === 0 ? (
          <p className="text-sm text-surface-muted">No SLA data yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(180, barData.length * 42)}>
            <BarChart data={barData} layout="vertical" margin={{ left: 24 }}>
              <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} />
              <YAxis
                type="category"
                dataKey="name"
                tick={AXIS}
                tickLine={false}
                axisLine={false}
                width={140}
              />
              <Tooltip {...TOOLTIP} cursor={{ fill: '#1C2D45' }} />
              <Bar dataKey="avg" radius={[0, 4, 4, 0]} fill="#38BDF8" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card title="P95 processing time by workflow (seconds)">
        {p95Data.length === 0 ? (
          <p className="text-sm text-surface-muted">No SLA data yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={p95Data}>
              <XAxis dataKey="name" tick={AXIS} tickLine={false} axisLine={false} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} width={36} />
              <Tooltip {...TOOLTIP} />
              <Line type="monotone" dataKey="p95" stroke="#6366F1" strokeWidth={2} dot />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card title="SLA by workflow">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-border text-left text-xs uppercase tracking-wide text-surface-muted">
              <th className="py-2 pr-4 font-medium">Workflow</th>
              <th className="py-2 pr-4 font-medium">Avg Time</th>
              <th className="py-2 pr-4 font-medium">P95</th>
              <th className="py-2 pr-4 font-medium">SLA Target</th>
              <th className="py-2 font-medium">Compliance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {sla.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-surface-muted">
                  No SLA data yet
                </td>
              </tr>
            ) : (
              sla.map((s) => {
                const ok = s.avg_processing_ms <= SLA_TARGET_MS
                return (
                  <tr key={s.workflow_name}>
                    <td className="py-2.5 pr-4 text-surface-50">{s.workflow_name}</td>
                    <td className="py-2.5 pr-4">
                      <Mono className="text-surface-100">
                        {(s.avg_processing_ms / 1000).toFixed(1)}s
                      </Mono>
                    </td>
                    <td className="py-2.5 pr-4">
                      <Mono className="text-surface-100">
                        {(s.p95_processing_ms / 1000).toFixed(1)}s
                      </Mono>
                    </td>
                    <td className="py-2.5 pr-4 text-surface-muted">
                      <Mono>{SLA_TARGET_MS / 1000}s</Mono>
                    </td>
                    <td className="py-2.5">
                      <Badge tone={ok ? 'green' : 'red'}>{ok ? 'Met' : 'At risk'}</Badge>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
