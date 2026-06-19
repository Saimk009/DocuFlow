import {
  AlertTriangle,
  Copy,
  FileQuestion,
  Gauge,
  ScanLine,
  Store,
  Timer,
  type LucideIcon,
} from 'lucide-react'
import type { ExceptionCategory } from '@/types'

type BadgeTone = 'neutral' | 'ice' | 'ai' | 'amber' | 'green' | 'red'

export interface CategoryMeta {
  label: string
  icon: LucideIcon
  /** Badge tone (matches shared Badge component). */
  tone: BadgeTone
  /** Accent bar / dot background class. */
  accent: string
  /** Soft text color class for icons. */
  text: string
}

export const CATEGORY_META: Record<ExceptionCategory, CategoryMeta> = {
  low_confidence: {
    label: 'Low Confidence',
    icon: Gauge,
    tone: 'amber',
    accent: 'bg-amber-500',
    text: 'text-amber-400',
  },
  unclassified: {
    label: 'Unclassified',
    icon: FileQuestion,
    tone: 'ice',
    accent: 'bg-ice-500',
    text: 'text-ice-400',
  },
  vendor_format_change: {
    label: 'Vendor Format Change',
    icon: Store,
    tone: 'ai',
    accent: 'bg-ai-500',
    text: 'text-ai-400',
  },
  duplicate: {
    label: 'Duplicate',
    icon: Copy,
    tone: 'neutral',
    accent: 'bg-surface-muted',
    text: 'text-surface-100',
  },
  ocr_failure: {
    label: 'OCR Failure',
    icon: ScanLine,
    tone: 'red',
    accent: 'bg-rose-500',
    text: 'text-rose-400',
  },
  timeout: {
    label: 'Timeout',
    icon: Timer,
    tone: 'red',
    accent: 'bg-rose-600',
    text: 'text-rose-400',
  },
  missing_field: {
    label: 'Missing Field',
    icon: AlertTriangle,
    tone: 'amber',
    accent: 'bg-amber-600',
    text: 'text-amber-400',
  },
}

export function categoryMeta(category: string): CategoryMeta {
  return (
    CATEGORY_META[category as ExceptionCategory] ?? CATEGORY_META.low_confidence
  )
}

/** Categories shown as filter pills (in display order). */
export const PILL_CATEGORIES: ExceptionCategory[] = [
  'low_confidence',
  'unclassified',
  'vendor_format_change',
  'duplicate',
  'ocr_failure',
  'timeout',
]

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !isFinite(seconds) || seconds <= 0) return '—'
  const mins = Math.round(seconds / 60)
  if (mins < 60) return `${mins}m`
  const hours = seconds / 3600
  if (hours < 24) return `${hours.toFixed(hours < 10 ? 1 : 0)}h`
  const days = hours / 24
  return `${days.toFixed(days < 10 ? 1 : 0)}d`
}
