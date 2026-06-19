import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, X } from 'lucide-react'
import { toast } from 'sonner'
import { api, API_PREFIX } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useUsers } from '@/hooks/useUsers'
import { useDocuments } from '@/hooks/useDocuments'
import type { Case } from '@/types'

const TYPES = ['loan', 'claim', 'onboarding', 'dispute', 'other']
const PRIORITIES = ['low', 'normal', 'high', 'critical']

export function NewCaseDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const queryClient = useQueryClient()
  const { data: users } = useUsers()
  const { data: docs } = useDocuments({ page_size: 25 })

  const [title, setTitle] = useState('')
  const [type, setType] = useState('loan')
  const [priority, setPriority] = useState('normal')
  const [description, setDescription] = useState('')
  const [ownerId, setOwnerId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [docIds, setDocIds] = useState<string[]>([])

  function reset() {
    setTitle('')
    setType('loan')
    setPriority('normal')
    setDescription('')
    setOwnerId('')
    setDueDate('')
    setDocIds([])
  }

  const create = useMutation({
    mutationFn: async () => {
      const created = await api.post<Case>(`${API_PREFIX}/cases`, {
        title: title.trim(),
        type,
        priority,
        description: description.trim() || null,
        owner_id: ownerId || null,
        due_date: dueDate || null,
      })
      await Promise.all(
        docIds.map((id) =>
          api.post(`${API_PREFIX}/cases/${created.id}/documents`, {
            document_id: id,
          }),
        ),
      )
      return created
    },
    onSuccess: () => {
      toast.success('Case created')
      queryClient.invalidateQueries({ queryKey: ['cases'] })
      onOpenChange(false)
      reset()
    },
    onError: () => toast.error('Could not create case'),
  })

  function toggleDoc(id: string) {
    setDocIds((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id],
    )
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) reset()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[560px] max-w-[94vw] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-surface-border bg-surface-700 shadow-xl">
          <div className="flex items-center justify-between border-b border-surface-border px-5 py-3.5">
            <Dialog.Title className="text-sm font-semibold text-surface-50">
              New Case
            </Dialog.Title>
            <Dialog.Close className="rounded p-1 text-surface-muted hover:bg-surface-600 hover:text-surface-100">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            <Field label="Title">
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Loan application — Acme Corp"
                className="input"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Type">
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="input capitalize"
                >
                  {TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Priority">
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="input capitalize"
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Owner">
                <select
                  value={ownerId}
                  onChange={(e) => setOwnerId(e.target.value)}
                  className="input"
                >
                  <option value="">Unassigned</option>
                  {users?.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Due date">
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="input"
                />
              </Field>
            </div>

            <Field label="Description">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Context for this case…"
                className="input resize-none"
              />
            </Field>

            <Field label={`Link documents (${docIds.length} selected)`}>
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-surface-border bg-surface-800 p-2">
                {!docs?.items.length && (
                  <p className="px-1 py-2 text-xs text-surface-muted">
                    No recent documents
                  </p>
                )}
                {docs?.items.map((d) => {
                  const selected = docIds.includes(d.id)
                  return (
                    <button
                      key={d.id}
                      onClick={() => toggleDoc(d.id)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors',
                        selected
                          ? 'bg-ice-500/15 text-ice-300'
                          : 'text-surface-100 hover:bg-surface-600',
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-4 w-4 items-center justify-center rounded border',
                          selected
                            ? 'border-ice-500 bg-ice-500 text-surface-900'
                            : 'border-surface-border',
                        )}
                      >
                        {selected && <Check className="h-3 w-3" />}
                      </span>
                      <span className="truncate">{d.filename}</span>
                    </button>
                  )
                })}
              </div>
            </Field>
          </div>

          <div className="flex justify-end gap-2 border-t border-surface-border px-5 py-3">
            <Dialog.Close asChild>
              <button className="btn-ghost">Cancel</button>
            </Dialog.Close>
            <button
              onClick={() => create.mutate()}
              disabled={!title.trim() || create.isPending}
              className="btn-primary"
            >
              Create Case
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1 block text-[10px] uppercase tracking-wide text-surface-muted">
        {label}
      </label>
      {children}
    </div>
  )
}
