import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, CheckCheck, Pencil, X } from 'lucide-react'
import { toast } from 'sonner'
import { api, API_PREFIX } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/shared/Badge'
import { Spinner } from '@/components/shared/common'
import type { DocumentField } from '@/types'

function confidenceTone(c: number) {
  if (c >= 0.9) return 'green' as const
  if (c >= 0.7) return 'ice' as const
  if (c >= 0.4) return 'amber' as const
  return 'red' as const
}

interface FieldUpdate {
  field_id: string
  validated_value: string
}

export function FieldPanel({
  documentId,
  docType,
  fields,
}: {
  documentId: string
  docType?: string | null
  fields: DocumentField[]
}) {
  const queryClient = useQueryClient()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const overall = fields.length
    ? fields.reduce((sum, f) => sum + f.confidence, 0) / fields.length
    : 0

  const save = useMutation({
    mutationFn: (updates: FieldUpdate[]) =>
      api.patch(`${API_PREFIX}/documents/${documentId}/fields`, updates),
    onSuccess: (_d, updates) => {
      toast.success(
        updates.length === 1 ? 'Field validated' : `${updates.length} fields validated`,
      )
      setEditingId(null)
      queryClient.invalidateQueries({ queryKey: ['documents', 'detail', documentId] })
    },
    onError: () => toast.error('Could not save fields'),
  })

  function startEdit(field: DocumentField) {
    setEditingId(field.id)
    setDraft(field.validated_value ?? field.raw_value)
  }

  function confirmEdit(field: DocumentField) {
    save.mutate([{ field_id: field.id, validated_value: draft }])
  }

  function validateAll() {
    save.mutate(
      fields.map((f) => ({
        field_id: f.id,
        validated_value: f.validated_value ?? f.raw_value,
      })),
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-surface-border px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-surface-50">
            AI Extracted{docType ? ` — ${docType}` : ''}
          </span>
          <span className="font-mono text-xs text-surface-muted">
            {Math.round(overall * 100)}%
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-900">
          <div
            className="h-full rounded-full bg-gradient-to-r from-ice-500 to-ai-500 transition-[width]"
            style={{ width: `${Math.round(overall * 100)}%` }}
          />
        </div>
      </div>

      {/* Fields */}
      <div className="flex-1 space-y-2.5 overflow-y-auto p-4">
        {fields.length === 0 && (
          <p className="text-sm text-surface-muted">No fields extracted yet.</p>
        )}
        {fields.map((field) => {
          const isEditing = editingId === field.id
          const value = field.validated_value ?? field.raw_value
          const lowConf = field.confidence < 0.7
          const veryLow = field.confidence < 0.4
          return (
            <div
              key={field.id}
              className={cn(
                'rounded-lg border p-3 transition-colors',
                veryLow
                  ? 'border-rose-500/40 bg-rose-500/5'
                  : lowConf
                    ? 'border-amber-500/40 bg-amber-500/5'
                    : 'border-surface-border bg-surface-800',
              )}
            >
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wide text-surface-muted">
                  {field.field_label}
                </span>
                <div className="flex items-center gap-2">
                  <Badge tone={confidenceTone(field.confidence)} mono>
                    {Math.round(field.confidence * 100)}%
                  </Badge>
                  {field.is_validated ? (
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <span
                      className="h-2 w-2 rounded-full bg-amber-500"
                      title="Unvalidated"
                    />
                  )}
                </div>
              </div>

              {isEditing ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') confirmEdit(field)
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                    className="input font-mono text-sm"
                  />
                  <button
                    onClick={() => confirmEdit(field)}
                    disabled={save.isPending}
                    className="rounded bg-ice-500/15 p-1.5 text-ice-400 hover:bg-ice-500/25"
                    title="Confirm"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="rounded p-1.5 text-surface-muted hover:bg-surface-600 hover:text-rose-400"
                    title="Cancel"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => startEdit(field)}
                  className="group flex w-full items-center justify-between gap-2 rounded text-left"
                >
                  <span className="truncate font-mono text-sm text-surface-50">
                    {value || <span className="text-surface-muted">empty</span>}
                  </span>
                  <Pencil className="h-3.5 w-3.5 shrink-0 text-surface-muted opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Footer */}
      {fields.length > 0 && (
        <div className="border-t border-surface-border p-3">
          <button
            onClick={validateAll}
            disabled={save.isPending}
            className="btn-primary w-full"
          >
            {save.isPending ? <Spinner /> : <CheckCheck className="h-4 w-4" />}
            Validate All Fields
          </button>
        </div>
      )}
    </div>
  )
}
