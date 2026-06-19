import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Tone = 'neutral' | 'ice' | 'ai' | 'amber' | 'green' | 'red'

const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-600 text-surface-100 border-surface-border',
  ice: 'bg-ice-500/15 text-ice-400 border-ice-500/30',
  ai: 'bg-ai-500/15 text-ai-400 border-ai-500/30',
  amber: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  green: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  red: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
}

export function Badge({
  children,
  tone = 'neutral',
  mono = false,
  className,
}: {
  children: ReactNode
  tone?: Tone
  mono?: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium',
        TONES[tone],
        mono && 'font-mono',
        className,
      )}
    >
      {children}
    </span>
  )
}
