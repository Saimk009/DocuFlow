import { cn } from '@/lib/utils'
import type { DocumentStatus } from '@/types'

const STATUS_CONFIG: Record<string, { label: string; dot: string; text: string }> = {
  captured: { label: 'Captured', dot: 'bg-surface-100', text: 'text-surface-100' },
  ocr: { label: 'OCR', dot: 'bg-ice-500', text: 'text-ice-400' },
  classifying: { label: 'Classifying', dot: 'bg-ai-500', text: 'text-ai-400' },
  extracting: { label: 'Extracting', dot: 'bg-ai-500', text: 'text-ai-400' },
  validating: { label: 'Needs Review', dot: 'bg-amber-500', text: 'text-amber-400' },
  complete: { label: 'Complete', dot: 'bg-emerald-500', text: 'text-emerald-400' },
  exception: { label: 'Exception', dot: 'bg-rose-500', text: 'text-rose-400' },
  rejected: { label: 'Rejected', dot: 'bg-rose-500', text: 'text-rose-400' },
}

const ANIMATED = new Set(['ocr', 'classifying', 'extracting'])

export function StatusPip({ status }: { status: DocumentStatus | string }) {
  const cfg = STATUS_CONFIG[status] ?? {
    label: status,
    dot: 'bg-surface-100',
    text: 'text-surface-100',
  }
  return (
    <span className="inline-flex items-center gap-2 text-xs font-medium">
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          cfg.dot,
          ANIMATED.has(status) && 'animate-pulse-soft',
        )}
      />
      <span className={cfg.text}>{cfg.label}</span>
    </span>
  )
}
