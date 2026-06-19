import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export function KpiCard({
  label,
  value,
  delta,
  icon: Icon,
  accent = 'ice',
}: {
  label: string
  value: string | number
  delta?: string
  icon?: LucideIcon
  accent?: 'ice' | 'ai' | 'amber' | 'neutral'
}) {
  const accentColor = {
    ice: 'text-ice-400',
    ai: 'text-ai-400',
    amber: 'text-amber-400',
    neutral: 'text-surface-100',
  }[accent]

  return (
    <div className="card p-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-surface-muted">
          {label}
        </span>
        {Icon && <Icon className={cn('h-4 w-4', accentColor)} />}
      </div>
      <div className="mt-3 font-mono text-2xl font-medium text-surface-50">
        {value}
      </div>
      {delta && <div className="mt-1 text-xs text-surface-muted">{delta}</div>}
    </div>
  )
}
