import { cn } from '@/lib/utils'

/** Base shimmering block. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} />
}

export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number
  className?: string
}) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn('h-3', i === lines - 1 ? 'w-2/3' : 'w-full')}
        />
      ))}
    </div>
  )
}

export function SkeletonKpi() {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-4 w-4 rounded-full" />
      </div>
      <Skeleton className="mt-3 h-7 w-20" />
      <Skeleton className="mt-2 h-3 w-28" />
    </div>
  )
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('card p-5', className)}>
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-4 h-[220px] w-full" />
    </div>
  )
}

export function SkeletonTable({
  rows = 8,
  columns = 6,
}: {
  rows?: number
  columns?: number
}) {
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-surface-border px-4 py-3">
        <Skeleton className="h-3 w-32" />
      </div>
      <div className="divide-y divide-surface-border">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-4 px-4 py-3.5">
            {Array.from({ length: columns }).map((_, c) => (
              <Skeleton
                key={c}
                className={cn('h-3.5', c === 0 ? 'w-16' : c === 1 ? 'flex-1' : 'w-20')}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
