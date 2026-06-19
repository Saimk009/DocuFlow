import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import * as Dialog from '@radix-ui/react-dialog'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Briefcase, Plus, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { api, API_PREFIX } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/shared/Badge'
import { Spinner } from '@/components/shared/common'
import type { Case, PaginatedResponse } from '@/types'

function priorityTone(p: string) {
  switch (p.toLowerCase()) {
    case 'urgent':
      return 'red' as const
    case 'high':
      return 'amber' as const
    default:
      return 'neutral' as const
  }
}

export function RelatedCases({ documentId }: { documentId: string }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  // Cases this document is linked to during the session (no backend lookup exists).
  const [linkedIds, setLinkedIds] = useState<string[]>([])

  const { data: cases } = useQuery({
    queryKey: ['cases', 'all'],
    queryFn: () =>
      api.get<PaginatedResponse<Case>>(`${API_PREFIX}/cases`, {
        params: { page_size: 100 },
      }),
  })

  const link = useMutation({
    mutationFn: (caseId: string) =>
      api.post(`${API_PREFIX}/cases/${caseId}/documents`, {
        document_id: documentId,
      }),
    onSuccess: (_d, caseId) => {
      toast.success('Document linked to case')
      setLinkedIds((prev) => [...new Set([...prev, caseId])])
      setOpen(false)
      queryClient.invalidateQueries({ queryKey: ['cases'] })
    },
    onError: () => toast.error('Could not link document'),
  })

  const allCases = cases?.items ?? []
  const linked = allCases.filter((c) => linkedIds.includes(c.id))

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase()
    return allCases.filter(
      (c) =>
        !linkedIds.includes(c.id) &&
        (!q || c.title.toLowerCase().includes(q) || c.type.toLowerCase().includes(q)),
    )
  }, [allCases, linkedIds, search])

  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-surface-50">Linked Cases</span>
        <button onClick={() => setOpen(true)} className="btn-outline py-1">
          <Plus className="h-3.5 w-3.5" />
          Link to Case
        </button>
      </div>

      {linked.length === 0 ? (
        <div className="rounded-lg border border-dashed border-surface-border px-4 py-10 text-center">
          <Briefcase className="mx-auto h-6 w-6 text-surface-muted" />
          <p className="mt-2 text-sm text-surface-muted">
            This document isn't linked to any case yet.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {linked.map((c) => (
            <Link
              key={c.id}
              to={`/cases/${c.id}`}
              className="flex items-center gap-3 rounded-lg border border-surface-border bg-surface-800 px-3 py-2.5 transition-colors hover:bg-surface-600"
            >
              <Briefcase className="h-4 w-4 text-ice-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-surface-50">{c.title}</p>
                <p className="text-xs capitalize text-surface-muted">{c.type}</p>
              </div>
              <Badge tone={priorityTone(c.priority)} className="capitalize">
                {c.priority}
              </Badge>
            </Link>
          ))}
        </div>
      )}

      {/* Link modal */}
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[440px] max-w-[90vw] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-surface-border bg-surface-700 shadow-xl">
            <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
              <Dialog.Title className="text-sm font-medium text-surface-50">
                Link to Case
              </Dialog.Title>
              <Dialog.Close className="rounded p-1 text-surface-muted hover:bg-surface-600 hover:text-surface-100">
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>
            <div className="p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-muted" />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search cases…"
                  className="input pl-9"
                />
              </div>
              <div className="mt-3 max-h-72 space-y-1 overflow-y-auto">
                {candidates.length === 0 && (
                  <p className="py-6 text-center text-sm text-surface-muted">
                    No matching cases
                  </p>
                )}
                {candidates.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => link.mutate(c.id)}
                    disabled={link.isPending}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg border border-transparent px-3 py-2 text-left transition-colors hover:border-surface-border hover:bg-surface-600',
                    )}
                  >
                    <Briefcase className="h-4 w-4 text-surface-muted" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-surface-50">{c.title}</p>
                      <p className="text-xs capitalize text-surface-muted">{c.type}</p>
                    </div>
                    {link.isPending && <Spinner />}
                  </button>
                ))}
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
