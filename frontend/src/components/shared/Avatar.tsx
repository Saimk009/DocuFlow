import { cn } from '@/lib/utils'

function initials(name?: string | null): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  return (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')
}

export function Avatar({
  name,
  size = 'sm',
  className,
}: {
  name?: string | null
  size?: 'xs' | 'sm' | 'md'
  className?: string
}) {
  const sizes = {
    xs: 'h-5 w-5 text-[9px]',
    sm: 'h-6 w-6 text-[10px]',
    md: 'h-8 w-8 text-xs',
  }
  return (
    <span
      title={name ?? undefined}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-surface-600 font-medium uppercase text-surface-100',
        sizes[size],
        className,
      )}
    >
      {initials(name).toUpperCase()}
    </span>
  )
}
