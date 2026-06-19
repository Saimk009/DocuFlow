import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Archive,
  Copy,
  GitBranch,
  Layers,
  Pencil,
  Plus,
  Workflow as WorkflowIcon,
} from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { api, API_PREFIX } from '@/lib/api'
import { useDocuments } from '@/hooks/useDocuments'
import { Badge } from '@/components/shared/Badge'
import { CenteredSpinner, EmptyState, Mono } from '@/components/shared/common'
import type { PaginatedResponse, User, Workflow } from '@/types'

export function WorkflowList() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['workflows'],
    queryFn: () =>
      api.get<PaginatedResponse<Workflow>>(`${API_PREFIX}/workflows`, {
        params: { page_size: 50 },
      }),
  })
  const { data: users } = useQuery({
    queryKey: ['settings', 'users'],
    queryFn: () => api.get<User[]>(`${API_PREFIX}/settings/users`),
  })

  const userName = (uid?: string | null) =>
    users?.find((u) => u.id === uid)?.full_name ?? 'Unknown'

  const create = useMutation({
    mutationFn: () =>
      api.post<Workflow>(`${API_PREFIX}/workflows`, {
        name,
        definition_json: { nodes: [], edges: [] },
      }),
    onSuccess: (wf) => {
      toast.success('Workflow created')
      setCreating(false)
      setName('')
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
      navigate(`/workflows/${wf.id}`)
    },
    onError: () => toast.error('Could not create workflow'),
  })

  const duplicate = useMutation({
    mutationFn: (wf: Workflow) =>
      api.post<Workflow>(`${API_PREFIX}/workflows`, {
        name: `${wf.name} (copy)`,
        description: wf.description,
        definition_json: wf.definition_json,
      }),
    onSuccess: () => {
      toast.success('Workflow duplicated')
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
    },
    onError: () => toast.error('Could not duplicate'),
  })

  const archive = useMutation({
    mutationFn: (wfId: string) =>
      api.delete(`${API_PREFIX}/workflows/${wfId}`),
    onSuccess: () => {
      toast.success('Workflow archived')
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
    },
    onError: () => toast.error('Could not archive'),
  })

  const items = data?.items ?? []
  const published = items.filter((w) => w.status === 'published')
  const drafts = items.filter((w) => w.status !== 'published')

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-surface-50">Workflows</h1>
          <p className="mt-1 text-sm text-surface-muted">
            Design how documents flow through your pipeline.
          </p>
        </div>
        <button onClick={() => setCreating(true)} className="btn-primary">
          <Plus className="h-4 w-4" />
          New Workflow
        </button>
      </div>

      {creating && (
        <div className="card flex items-center gap-3 p-4">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && name && create.mutate()}
            placeholder="Workflow name"
            className="input flex-1"
          />
          <button
            onClick={() => create.mutate()}
            disabled={!name || create.isPending}
            className="btn-primary"
          >
            Create
          </button>
          <button onClick={() => setCreating(false)} className="btn-ghost">
            Cancel
          </button>
        </div>
      )}

      {isLoading ? (
        <CenteredSpinner />
      ) : !items.length ? (
        <EmptyState
          icon={<WorkflowIcon className="h-8 w-8" />}
          title="No workflows yet"
          description="Create your first automated document workflow."
        />
      ) : (
        <div className="space-y-8">
          <Section
            title="Published"
            count={published.length}
            tone="green"
            empty="No published workflows."
          >
            {published.map((wf) => (
              <WorkflowCard
                key={wf.id}
                wf={wf}
                userName={userName(wf.created_by)}
                onEdit={() => navigate(`/workflows/${wf.id}`)}
                onDuplicate={() => duplicate.mutate(wf)}
                onArchive={() => archive.mutate(wf.id)}
              />
            ))}
          </Section>

          <Section
            title="Drafts"
            count={drafts.length}
            tone="muted"
            empty="No drafts in progress."
          >
            {drafts.map((wf) => (
              <WorkflowCard
                key={wf.id}
                wf={wf}
                userName={userName(wf.created_by)}
                onEdit={() => navigate(`/workflows/${wf.id}`)}
                onDuplicate={() => duplicate.mutate(wf)}
                onArchive={() => archive.mutate(wf.id)}
              />
            ))}
          </Section>
        </div>
      )}
    </div>
  )
}

function Section({
  title,
  count,
  tone,
  empty,
  children,
}: {
  title: string
  count: number
  tone: 'green' | 'muted'
  empty: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div
        className={
          'mb-3 flex items-center gap-2 rounded-md border-l-2 px-3 py-1.5 ' +
          (tone === 'green'
            ? 'border-l-emerald-500 bg-emerald-500/10'
            : 'border-l-surface-muted bg-surface-700')
        }
      >
        <span className="text-sm font-medium text-surface-50">{title}</span>
        <span className="text-xs text-surface-muted">{count}</span>
      </div>
      {count === 0 ? (
        <p className="px-1 text-sm text-surface-muted">{empty}</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {children}
        </div>
      )}
    </div>
  )
}

function WorkflowCard({
  wf,
  userName,
  onEdit,
  onDuplicate,
  onArchive,
}: {
  wf: Workflow
  userName: string
  onEdit: () => void
  onDuplicate: () => void
  onArchive: () => void
}) {
  const nodeCount = wf.definition_json?.nodes?.length ?? 0
  const stepCount = wf.definition_json?.edges?.length ?? 0
  const modified = wf.published_at ?? wf.created_at

  return (
    <div className="card flex flex-col p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <WorkflowIcon className="h-5 w-5 text-ai-400" />
          <h3 className="text-sm font-medium text-surface-50">{wf.name}</h3>
        </div>
        <Mono className="text-xs text-surface-muted">v{wf.version}</Mono>
      </div>

      <p className="mt-1 line-clamp-2 min-h-[2rem] text-xs text-surface-muted">
        {wf.description || 'No description'}
      </p>

      <div className="mt-3 flex items-center gap-2">
        <Badge tone={wf.status === 'published' ? 'green' : 'neutral'} className="capitalize">
          {wf.status}
        </Badge>
        <span className="text-[11px] text-surface-muted">
          {format(new Date(wf.created_at), 'MMM d, yyyy')}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-4 border-t border-surface-border pt-3 text-xs text-surface-muted">
        <span className="flex items-center gap-1">
          <Layers className="h-3.5 w-3.5" />
          <Mono>{nodeCount}</Mono> nodes
        </span>
        <span className="flex items-center gap-1">
          <GitBranch className="h-3.5 w-3.5" />
          <Mono>{stepCount}</Mono> steps
        </span>
        {wf.status === 'published' && <DocCount workflowId={wf.id} />}
      </div>

      <div className="mt-2 text-[11px] text-surface-muted">
        Modified {format(new Date(modified), 'MMM d')} · by {userName}
      </div>

      <div className="mt-4 flex items-center gap-1.5">
        <button onClick={onEdit} className="btn-outline flex-1 py-1.5 text-xs">
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </button>
        <button
          onClick={onDuplicate}
          className="rounded border border-surface-border p-1.5 text-surface-muted hover:bg-surface-600 hover:text-surface-100"
          title="Duplicate"
        >
          <Copy className="h-4 w-4" />
        </button>
        <button
          onClick={onArchive}
          className="rounded border border-surface-border p-1.5 text-surface-muted hover:bg-surface-600 hover:text-amber-400"
          title="Archive"
        >
          <Archive className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

function DocCount({ workflowId }: { workflowId: string }) {
  const { data } = useDocuments({ workflow_id: workflowId, page_size: 1 })
  return (
    <span className="flex items-center gap-1 text-ice-400">
      <Mono>{data?.total ?? 0}</Mono> processed
    </span>
  )
}
