import { useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowRight, FileStack, Layers } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useExceptionSummary } from '@/hooks/useExceptions'
import { categoryMeta } from '@/lib/exceptionMeta'

export function ExceptionSummaryWidget() {
  const navigate = useNavigate()
  const { data } = useExceptionSummary()

  // Stay out of the way when the pipeline is clean.
  if (!data || data.total_open_groups === 0) return null

  return (
    <button
      onClick={() => navigate('/exceptions')}
      className="card group flex w-full items-center gap-5 p-4 text-left transition-colors hover:border-amber-500/40"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400">
        <AlertTriangle className="h-5 w-5" />
      </div>

      <div className="flex items-center gap-6">
        <Stat icon={Layers} label="Open Groups" value={data.total_open_groups} />
        <span className="h-8 w-px bg-surface-border" />
        <Stat
          icon={FileStack}
          label="Documents Affected"
          value={data.total_affected_docs}
        />
      </div>

      {/* Top categories */}
      <div className="ml-2 hidden items-center gap-1.5 md:flex">
        {data.top_3_categories.map((c) => {
          const meta = categoryMeta(c.category)
          return (
            <span
              key={c.category}
              className="flex items-center gap-1.5 rounded-full border border-surface-border bg-surface-800 px-2.5 py-1 text-xs text-surface-100"
            >
              <span className={cn('h-2 w-2 rounded-full', meta.accent)} />
              {meta.label}
              <span className="font-mono text-surface-muted">{c.count}</span>
            </span>
          )
        })}
      </div>

      <span className="ml-auto flex shrink-0 items-center gap-1 text-sm font-medium text-amber-400">
        Resolve
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </button>
  )
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Layers
  label: string
  value: number
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="h-4 w-4 text-surface-muted" />
      <div>
        <div className="text-lg font-semibold leading-none text-surface-50">{value}</div>
        <div className="mt-0.5 text-[11px] text-surface-muted">{label}</div>
      </div>
    </div>
  )
}
