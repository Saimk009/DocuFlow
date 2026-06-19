import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold text-surface-50">{title}</h1>
        {subtitle && (
          <p className="mt-1 text-sm text-surface-muted">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-4 w-4 animate-spin', className)} />
}

export function CenteredSpinner({ label }: { label?: string }) {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-3 text-surface-muted">
      <Spinner className="h-6 w-6 text-ice-500" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  )
}

export { EmptyState } from './EmptyState'

export function Mono({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return <span className={cn('font-mono', className)}>{children}</span>
}
