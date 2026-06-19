import { format } from 'date-fns'
import {
  AlertTriangle,
  CheckCircle,
  Cpu,
  Sparkles,
  Upload,
  UserCheck,
  type LucideIcon,
} from 'lucide-react'
import { Mono } from '@/components/shared/common'
import type { DocumentEvent } from '@/types'

interface EventStyle {
  icon: LucideIcon
  color: string
  ring: string
  label: (e: DocumentEvent) => string
}

const EVENT_STYLES: Record<string, EventStyle> = {
  uploaded: {
    icon: Upload,
    color: 'text-ice-400',
    ring: 'border-ice-500/40 bg-ice-500/10',
    label: () => 'Document uploaded',
  },
  ocr_completed: {
    icon: Cpu,
    color: 'text-ice-400',
    ring: 'border-ice-500/40 bg-ice-500/10',
    label: () => 'OCR text extracted',
  },
  classified: {
    icon: Sparkles,
    color: 'text-ai-400',
    ring: 'border-ai-500/40 bg-ai-500/10',
    label: (e) =>
      `Classified as ${(e.metadata.doc_type as string) ?? 'document'}`,
  },
  extracted: {
    icon: Sparkles,
    color: 'text-ai-400',
    ring: 'border-ai-500/40 bg-ai-500/10',
    label: (e) =>
      `AI extracted ${(e.metadata.field_count as number) ?? ''} fields`.trim(),
  },
  fields_validated: {
    icon: UserCheck,
    color: 'text-emerald-400',
    ring: 'border-emerald-500/40 bg-emerald-500/10',
    label: (e) =>
      `${(e.metadata.updated_count as number) ?? ''} field(s) validated`.trim(),
  },
  approved: {
    icon: CheckCircle,
    color: 'text-emerald-400',
    ring: 'border-emerald-500/40 bg-emerald-500/10',
    label: () => 'Document approved',
  },
  rejected: {
    icon: AlertTriangle,
    color: 'text-rose-400',
    ring: 'border-rose-500/40 bg-rose-500/10',
    label: (e) => `Rejected${e.metadata.reason ? `: ${e.metadata.reason}` : ''}`,
  },
  flagged: {
    icon: AlertTriangle,
    color: 'text-amber-400',
    ring: 'border-amber-500/40 bg-amber-500/10',
    label: (e) =>
      `Flagged for review${e.metadata.reason ? `: ${e.metadata.reason}` : ''}`,
  },
  reassigned: {
    icon: UserCheck,
    color: 'text-ice-400',
    ring: 'border-ice-500/40 bg-ice-500/10',
    label: () => 'Reassigned',
  },
}

function styleFor(type: string): EventStyle {
  return (
    EVENT_STYLES[type] ?? {
      icon: Cpu,
      color: 'text-surface-100',
      ring: 'border-surface-border bg-surface-700',
      label: (e) => e.event_type.replace(/_/g, ' '),
    }
  )
}

export function AuditTrail({ events }: { events: DocumentEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-sm text-surface-muted">
        No events recorded.
      </p>
    )
  }

  return (
    <div className="relative space-y-1 py-2 pl-4 pr-2">
      {/* vertical line */}
      <div className="absolute bottom-4 left-[26px] top-4 w-px bg-surface-border" />
      {events.map((event) => {
        const style = styleFor(event.event_type)
        const Icon = style.icon
        const actor = event.actor_id ? event.actor_id.slice(0, 2).toUpperCase() : 'AI'
        return (
          <div key={event.id} className="relative flex gap-3 py-2">
            <div
              className={`relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${style.ring}`}
            >
              <Icon className={`h-3.5 w-3.5 ${style.color}`} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-600 text-[9px] font-medium text-surface-100">
                  {actor}
                </span>
                <p className="text-sm text-surface-100">{style.label(event)}</p>
              </div>
              <Mono className="mt-0.5 block text-[10px] text-surface-muted">
                {format(new Date(event.created_at), 'MMM d, yyyy · HH:mm:ss')}
              </Mono>
            </div>
          </div>
        )
      })}
    </div>
  )
}
