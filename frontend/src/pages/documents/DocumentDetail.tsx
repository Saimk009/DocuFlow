import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Flag,
  Loader2,
  UserPlus,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { api, API_PREFIX } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useDocument } from '@/hooks/useDocuments'
import { PipelineStepper } from '@/components/shared/PipelineStepper'
import { StatusPip } from '@/components/shared/StatusPip'
import { Badge } from '@/components/shared/Badge'
import { Mono } from '@/components/shared/common'
import { Skeleton } from '@/components/shared/Skeleton'
import { DocumentViewer } from '@/components/document/DocumentViewer'
import { FieldPanel } from '@/components/document/FieldPanel'
import { AuditTrail } from '@/components/document/AuditTrail'
import { RelatedCases } from '@/components/document/RelatedCases'
import type { User } from '@/types'

type Tab = 'fields' | 'audit' | 'cases'

interface StatusPayload {
  action: 'approve' | 'reject' | 'flag' | 'reassign'
  reason?: string
  assigned_to?: string
}

export function DocumentDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: doc, isLoading } = useDocument(id)
  const [tab, setTab] = useState<Tab>('fields')
  const [approveDone, setApproveDone] = useState(false)

  const { data: users } = useQuery({
    queryKey: ['settings', 'users'],
    queryFn: () => api.get<User[]>(`${API_PREFIX}/settings/users`),
  })

  const action = useMutation({
    mutationFn: (payload: StatusPayload) =>
      api.patch(`${API_PREFIX}/documents/${id}/status`, payload),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['documents'] })
      if (vars.action === 'approve') {
        // Flash the success state on the button before navigating back.
        setApproveDone(true)
        toast.success('Document approved')
        setTimeout(() => navigate(-1), 750)
      } else {
        toast.success(`Document ${vars.action} applied`)
        queryClient.invalidateQueries({ queryKey: ['documents', 'detail', id] })
      }
    },
    onError: () => toast.error('Action failed'),
  })

  if (isLoading || !doc) return <DocumentDetailSkeleton />

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Header bar */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-surface-muted hover:text-surface-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <Mono className="text-sm text-ice-400">{doc.id.slice(0, 8)}</Mono>
        {doc.doc_type && <Badge tone="ai">{doc.doc_type}</Badge>}
        <Badge mono>{doc.file_type.toUpperCase()}</Badge>
        <StatusPip status={doc.status} />
        <div className="ml-1 hidden md:block">
          <PipelineStepper status={doc.status} size="md" />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => action.mutate({ action: 'reject', reason: 'Rejected on review' })}
            className="btn-outline border-rose-500/40 py-1.5 text-rose-400 hover:bg-rose-500/10"
          >
            <X className="h-3.5 w-3.5" />
            Reject
          </button>
          <button
            onClick={() => action.mutate({ action: 'flag', reason: 'Flagged for review' })}
            className="btn-outline border-amber-500/40 py-1.5 text-amber-400 hover:bg-amber-500/10"
          >
            <Flag className="h-3.5 w-3.5" />
            Flag Review
          </button>

          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="btn-ghost py-1.5">
                <UserPlus className="h-3.5 w-3.5" />
                Reassign
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={6}
                className="z-50 max-h-72 w-56 overflow-y-auto rounded-lg border border-surface-border bg-surface-700 p-1 shadow-xl"
              >
                <DropdownMenu.Label className="px-2 py-1.5 text-[10px] uppercase tracking-wide text-surface-muted">
                  Assign to
                </DropdownMenu.Label>
                {(users ?? []).map((u) => (
                  <DropdownMenu.Item
                    key={u.id}
                    onSelect={() =>
                      action.mutate({ action: 'reassign', assigned_to: u.id })
                    }
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-surface-100 outline-none data-[highlighted]:bg-surface-600"
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-600 text-[10px] font-medium">
                      {u.full_name.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{u.full_name}</span>
                  </DropdownMenu.Item>
                ))}
                {!users?.length && (
                  <div className="px-2 py-2 text-xs text-surface-muted">
                    No teammates found
                  </div>
                )}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>

          <button
            onClick={() => action.mutate({ action: 'approve' })}
            disabled={action.isPending || approveDone}
            className={cn(
              'btn-primary py-1.5 transition-colors',
              approveDone && 'bg-emerald-500 text-surface-900 hover:bg-emerald-500',
            )}
          >
            <AnimatePresence mode="wait" initial={false}>
              {approveDone ? (
                <motion.span
                  key="done"
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 18 }}
                  className="flex items-center gap-1.5"
                >
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  Approved
                </motion.span>
              ) : action.isPending && action.variables?.action === 'approve' ? (
                <motion.span key="pending" className="flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Approving…
                </motion.span>
              ) : (
                <motion.span key="idle" className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5" />
                  Approve
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>
      </div>

      {/* Split layout 60/40 */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="min-h-[560px] lg:col-span-3">
          <DocumentViewer document={doc} />
        </div>

        <div className="card flex min-h-[560px] flex-col overflow-hidden lg:col-span-2">
          {/* Tabs */}
          <div className="flex border-b border-surface-border">
            {(
              [
                { key: 'fields', label: 'Extracted Fields' },
                { key: 'audit', label: 'Audit Trail' },
                { key: 'cases', label: 'Related Cases' },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  'relative flex-1 px-3 py-2.5 text-xs font-medium transition-colors',
                  tab === t.key
                    ? 'text-ice-400'
                    : 'text-surface-muted hover:text-surface-100',
                )}
              >
                {t.label}
                {tab === t.key && (
                  <span className="absolute inset-x-0 bottom-0 h-0.5 bg-ice-500" />
                )}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === 'fields' && (
              <FieldPanel
                documentId={doc.id}
                docType={doc.doc_type}
                fields={doc.fields}
              />
            )}
            {tab === 'audit' && <AuditTrail events={doc.events} />}
            {tab === 'cases' && <RelatedCases documentId={doc.id} />}
          </div>
        </div>
      </div>
    </div>
  )
}

function DocumentDetailSkeleton() {
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-5 w-14 rounded-full" />
        <Skeleton className="h-5 w-20 rounded-full" />
        <div className="ml-auto flex gap-2">
          <Skeleton className="h-8 w-20 rounded" />
          <Skeleton className="h-8 w-24 rounded" />
          <Skeleton className="h-8 w-24 rounded" />
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="min-h-[560px] lg:col-span-3">
          <div className="skeleton h-full min-h-[560px] w-full rounded-lg" />
        </div>
        <div className="card flex min-h-[560px] flex-col gap-4 p-4 lg:col-span-2">
          <Skeleton className="h-4 w-32" />
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-8 w-full rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
