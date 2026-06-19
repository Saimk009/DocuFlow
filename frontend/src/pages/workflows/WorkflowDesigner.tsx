import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as Dialog from '@radix-ui/react-dialog'
import { ReactFlowProvider } from 'reactflow'
import {
  ArrowLeft,
  Redo2,
  Rocket,
  Save,
  Undo2,
} from 'lucide-react'
import { toast } from 'sonner'
import { api, API_PREFIX } from '@/lib/api'
import { Badge } from '@/components/shared/Badge'
import { CenteredSpinner, Mono, Spinner } from '@/components/shared/common'
import { WorkflowCanvas } from '@/components/workflow/WorkflowCanvas'
import { NodePalette } from '@/components/workflow/NodePalette'
import { NodeConfigPanel } from '@/components/workflow/NodeConfigPanel'
import { useWorkflowStore } from '@/store/workflowStore'
import type { Workflow } from '@/types'

export function WorkflowDesigner() {
  return (
    <ReactFlowProvider>
      <DesignerInner />
    </ReactFlowProvider>
  )
}

function DesignerInner() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [name, setName] = useState('')
  const [publishOpen, setPublishOpen] = useState(false)

  const load = useWorkflowStore((s) => s.load)
  const loadDefaults = useWorkflowStore((s) => s.loadDefaults)
  const serialize = useWorkflowStore((s) => s.serialize)
  const undo = useWorkflowStore((s) => s.undo)
  const redo = useWorkflowStore((s) => s.redo)
  const canUndo = useWorkflowStore((s) => s.past.length > 0)
  const canRedo = useWorkflowStore((s) => s.future.length > 0)
  const nodeCount = useWorkflowStore((s) => s.nodes.length)
  const edgeCount = useWorkflowStore((s) => s.edges.length)
  const selectedId = useWorkflowStore((s) => s.selectedId)

  const { data: wf, isLoading } = useQuery({
    queryKey: ['workflows', id],
    enabled: Boolean(id),
    queryFn: () => api.get<Workflow>(`${API_PREFIX}/workflows/${id}`),
  })

  useEffect(() => {
    if (!wf) return
    setName(wf.name)
    const hasNodes = (wf.definition_json?.nodes?.length ?? 0) > 0
    if (hasNodes) load(wf.definition_json)
    else loadDefaults()
  }, [wf, load, loadDefaults])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  const save = useMutation({
    mutationFn: () =>
      api.put<Workflow>(`${API_PREFIX}/workflows/${id}`, {
        name,
        definition_json: serialize(),
      }),
    onSuccess: () => {
      toast.success('Draft saved')
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
    },
    onError: () => toast.error('Save failed — check node/edge validity'),
  })

  const publish = useMutation({
    mutationFn: async () => {
      await api.put<Workflow>(`${API_PREFIX}/workflows/${id}`, {
        name,
        definition_json: serialize(),
      })
      return api.post<Workflow>(`${API_PREFIX}/workflows/${id}/publish`)
    },
    onSuccess: () => {
      toast.success('Workflow published')
      setPublishOpen(false)
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
    },
    onError: () => toast.error('Publish failed — check node/edge validity'),
  })

  if (isLoading || !wf) return <CenteredSpinner label="Loading designer" />

  return (
    <div className="flex h-[calc(100vh-6.5rem)] flex-col overflow-hidden rounded-lg border border-surface-border">
      {/* Top bar */}
      <div className="flex shrink-0 items-center gap-3 border-b border-surface-border bg-surface-800 px-4 py-2.5">
        <button
          onClick={() => navigate('/workflows')}
          className="flex items-center gap-1.5 text-sm text-surface-muted hover:text-surface-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <div className="h-5 w-px bg-surface-border" />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="min-w-0 max-w-[280px] rounded border border-transparent bg-transparent px-1.5 py-1 text-sm font-medium text-surface-50 hover:border-surface-border focus:border-ice-500 focus:outline-none"
        />
        <Mono className="text-xs text-surface-muted">v{wf.version}</Mono>
        <Badge tone={wf.status === 'published' ? 'green' : 'neutral'} className="capitalize">
          {wf.status}
        </Badge>

        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center rounded border border-surface-border">
            <button
              onClick={undo}
              disabled={!canUndo}
              title="Undo (⌘Z)"
              className="rounded-l px-2 py-1.5 text-surface-muted hover:bg-surface-600 hover:text-surface-100 disabled:opacity-40"
            >
              <Undo2 className="h-4 w-4" />
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              title="Redo (⌘⇧Z)"
              className="rounded-r border-l border-surface-border px-2 py-1.5 text-surface-muted hover:bg-surface-600 hover:text-surface-100 disabled:opacity-40"
            >
              <Redo2 className="h-4 w-4" />
            </button>
          </div>
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="btn-outline py-1.5"
          >
            {save.isPending ? <Spinner /> : <Save className="h-3.5 w-3.5" />}
            Save Draft
          </button>
          <button
            onClick={() => setPublishOpen(true)}
            className="btn-primary py-1.5"
          >
            <Rocket className="h-3.5 w-3.5" />
            Publish
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        <NodePalette />
        <div className="relative min-w-0 flex-1">
          <WorkflowCanvas />
          <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded border border-surface-border bg-surface-800/80 px-2 py-1 text-[10px] text-surface-muted backdrop-blur">
            <Mono>{nodeCount}</Mono> nodes · <Mono>{edgeCount}</Mono> connections
          </div>
        </div>
        {selectedId && <NodeConfigPanel />}
      </div>

      {/* Publish confirm */}
      <Dialog.Root open={publishOpen} onOpenChange={setPublishOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[400px] max-w-[90vw] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-surface-border bg-surface-700 p-5 shadow-xl">
            <Dialog.Title className="text-base font-semibold text-surface-50">
              Publish workflow?
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-surface-muted">
              This will make the workflow available for new documents. The current
              draft will be saved and the version incremented.
            </Dialog.Description>
            <div className="mt-5 flex justify-end gap-2">
              <Dialog.Close asChild>
                <button className="btn-ghost">Cancel</button>
              </Dialog.Close>
              <button
                onClick={() => publish.mutate()}
                disabled={publish.isPending}
                className="btn-primary"
              >
                {publish.isPending ? <Spinner /> : <Rocket className="h-4 w-4" />}
                Publish
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
