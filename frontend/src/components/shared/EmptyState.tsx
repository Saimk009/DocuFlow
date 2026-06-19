import type { ReactNode } from 'react'

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  action,
}: {
  icon?: ReactNode
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  /** Optional custom action node (takes precedence over actionLabel/onAction). */
  action?: ReactNode
}) {
  return (
    <div className="card flex flex-col items-center justify-center gap-4 px-6 py-16 text-center animate-fade-in">
      {icon && (
        <div className="relative">
          {/* Subtle glow behind the icon */}
          <div
            className="absolute inset-0 -z-10 rounded-full bg-ice-500/20 blur-2xl"
            aria-hidden
          />
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-surface-border bg-surface-800 text-ice-400">
            {icon}
          </div>
        </div>
      )}
      <div className="max-w-sm">
        <p className="text-sm font-medium text-surface-50">{title}</p>
        {description && (
          <p className="mt-1.5 text-sm text-surface-muted">{description}</p>
        )}
      </div>
      {action ??
        (actionLabel && onAction ? (
          <button onClick={onAction} className="btn-primary">
            {actionLabel}
          </button>
        ) : null)}
    </div>
  )
}
