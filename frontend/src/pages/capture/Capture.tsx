import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import { motion } from 'framer-motion'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Download,
  Eye,
  FileImage,
  FileText,
  UploadCloud,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { api, API_PREFIX } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/shared/Badge'
import { Mono } from '@/components/shared/common'
import type { Batch, PaginatedResponse, Workflow } from '@/types'

const ACCEPTED = {
  'application/pdf': ['.pdf'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/tiff': ['.tif', '.tiff'],
}
const MAX_SIZE = 50 * 1024 * 1024

type FileStatus = 'pending' | 'uploading' | 'queued'
interface QueuedFile {
  file: File
  status: FileStatus
}

const PRIORITIES = [
  { value: 'low', label: 'Low', tone: 'neutral' as const },
  { value: 'normal', label: 'Normal', tone: 'ice' as const },
  { value: 'high', label: 'High', tone: 'amber' as const },
  { value: 'urgent', label: 'Urgent', tone: 'red' as const },
]

function fileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext === 'pdf') return <FileText className="h-4 w-4 text-rose-400" />
  return <FileImage className="h-4 w-4 text-ice-400" />
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function batchStatusTone(status: string) {
  switch (status.toLowerCase()) {
    case 'complete':
      return 'green' as const
    case 'processing':
      return 'ice' as const
    case 'failed':
      return 'red' as const
    default:
      return 'neutral' as const
  }
}

export function Capture() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [queued, setQueued] = useState<QueuedFile[]>([])
  const [batchName, setBatchName] = useState('')
  const [workflowId, setWorkflowId] = useState('')
  const [priority, setPriority] = useState('normal')
  const [notes, setNotes] = useState('')

  const { data: workflows } = useQuery({
    queryKey: ['workflows', 'published'],
    queryFn: () =>
      api.get<PaginatedResponse<Workflow>>(`${API_PREFIX}/workflows`, {
        params: { status: 'published', page_size: 100 },
      }),
  })
  const { data: batches } = useQuery({
    queryKey: ['batches', 'recent'],
    queryFn: () =>
      api.get<PaginatedResponse<Batch>>(`${API_PREFIX}/batches`, {
        params: { page_size: 10 },
      }),
  })
  const { data: overview } = useQuery({
    queryKey: ['analytics', 'overview'],
    queryFn: () =>
      api.get<{ today: { processed: number } }>(
        `${API_PREFIX}/analytics/overview`,
      ),
  })

  const docsToday = overview?.today.processed ?? 0
  const openBatches =
    batches?.items.filter(
      (b) => !['complete', 'failed'].includes(b.status.toLowerCase()),
    ).length ?? 0

  const onDrop = useCallback((accepted: File[]) => {
    setQueued((prev) => [
      ...prev,
      ...accepted.map((file) => ({ file, status: 'pending' as FileStatus })),
    ])
  }, [])

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: ACCEPTED,
    maxSize: MAX_SIZE,
    noClick: true,
    noKeyboard: true,
  })

  function removeFile(idx: number) {
    setQueued((prev) => prev.filter((_, i) => i !== idx))
  }

  const submit = useMutation({
    mutationFn: async () => {
      const batch = await api.post<Batch>(`${API_PREFIX}/batches`, {
        name: batchName.trim(),
        workflow_id: workflowId || null,
        priority,
      })

      setQueued((prev) => prev.map((q) => ({ ...q, status: 'uploading' })))

      const formData = new FormData()
      queued.forEach((q) => formData.append('files', q.file))
      formData.append('batch_id', batch.id)
      if (workflowId) formData.append('workflow_id', workflowId)

      await api.post(`${API_PREFIX}/documents/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })

      setQueued((prev) => prev.map((q) => ({ ...q, status: 'queued' })))
      return batch
    },
    onSuccess: (batch) => {
      toast.success(`${queued.length} document(s) queued in "${batch.name}"`)
      queryClient.invalidateQueries({ queryKey: ['documents'] })
      queryClient.invalidateQueries({ queryKey: ['batches'] })
      navigate(`/queue?batch=${batch.id}`)
    },
    onError: () => {
      setQueued((prev) => prev.map((q) => ({ ...q, status: 'pending' })))
      toast.error('Failed to create batch or upload documents')
    },
  })

  const canSubmit = queued.length > 0 && batchName.trim().length > 0

  return (
    <div className="space-y-6">
      {/* Top section */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-surface-50">
            Document Capture
          </h1>
          <p className="mt-1 text-sm text-surface-muted">
            Upload documents and route them through a processing workflow.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="ice">{docsToday} docs today</Badge>
          <Badge tone="neutral">{openBatches} batches open</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Upload + file list */}
        <div className="space-y-4 lg:col-span-2">
          <div
            {...getRootProps()}
            className={cn(
              'card flex flex-col items-center justify-center gap-3 border-dashed py-16 transition-colors',
              isDragActive
                ? 'border-ice-500 bg-ice-500/5'
                : 'border-surface-border',
            )}
          >
            <input {...getInputProps()} />
            <UploadCloud
              className={cn(
                'h-12 w-12 transition-colors',
                isDragActive ? 'animate-bounce text-ice-400' : 'text-surface-muted',
              )}
            />
            <div className="text-center">
              <p className="text-base font-medium text-surface-50">
                {isDragActive ? 'Release to add files' : 'Drop documents here'}
              </p>
              <p className="mt-1 text-xs text-surface-muted">
                PDF, PNG, JPG, TIFF · Max 50MB per file
              </p>
            </div>
            <button type="button" onClick={open} className="btn-outline mt-1">
              Browse Files
            </button>
          </div>

          {queued.length > 0 && (
            <div className="card divide-y divide-surface-border">
              {queued.map((q, i) => (
                <div key={i} className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {fileIcon(q.file.name)}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-surface-50">
                        {q.file.name}
                      </p>
                      <Mono className="text-xs text-surface-muted">
                        {formatSize(q.file.size)}
                      </Mono>
                    </div>
                    <FileStatusChip status={q.status} />
                    {q.status === 'pending' && (
                      <button
                        onClick={() => removeFile(i)}
                        className="rounded p-1 text-surface-muted hover:bg-surface-600 hover:text-rose-400"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  {(q.status === 'uploading' || q.status === 'queued') && (
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-900">
                      <motion.div
                        className={cn(
                          'h-full rounded-full',
                          q.status === 'queued' ? 'bg-emerald-500' : 'bg-ice-500',
                        )}
                        initial={{ width: q.status === 'queued' ? '100%' : '0%' }}
                        animate={{ width: '100%' }}
                        transition={{
                          duration: q.status === 'queued' ? 0.2 : 2,
                          ease: 'easeInOut',
                        }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Batch configuration */}
        <div className="card h-fit space-y-4 p-5">
          <h2 className="text-sm font-medium text-surface-50">
            Batch Configuration
          </h2>

          <div>
            <label className="mb-1 block text-xs text-surface-muted">
              Batch name <span className="text-rose-400">*</span>
            </label>
            <input
              value={batchName}
              onChange={(e) => setBatchName(e.target.value)}
              placeholder="e.g. March Invoices"
              className="input"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-surface-muted">Workflow</label>
            <select
              value={workflowId}
              onChange={(e) => setWorkflowId(e.target.value)}
              className="input"
            >
              <option value="">No workflow (auto)</option>
              {workflows?.items.map((wf) => (
                <option key={wf.id} value={wf.id}>
                  {wf.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-surface-muted">Priority</label>
            <div className="flex flex-wrap gap-2">
              {PRIORITIES.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPriority(p.value)}
                  className={cn(
                    'rounded border px-2.5 py-1 text-xs font-medium transition-colors',
                    priority === p.value
                      ? 'border-ice-500 bg-ice-500/15 text-ice-400'
                      : 'border-surface-border text-surface-muted hover:text-surface-100',
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-surface-muted">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Internal notes for this batch…"
              className="input resize-none"
            />
          </div>

          <button
            onClick={() => submit.mutate()}
            disabled={!canSubmit || submit.isPending}
            className="btn-primary w-full"
          >
            {submit.isPending ? 'Processing…' : 'Create Batch & Process'}
          </button>
        </div>
      </div>

      {/* Recent batches */}
      <div className="card overflow-hidden">
        <div className="border-b border-surface-border px-5 py-3">
          <h2 className="text-sm font-medium text-surface-50">Recent Batches</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border text-left text-xs uppercase tracking-wide text-surface-muted">
                <th className="px-5 py-2.5 font-medium">Batch Name</th>
                <th className="px-5 py-2.5 font-medium">Documents</th>
                <th className="px-5 py-2.5 font-medium">Workflow</th>
                <th className="px-5 py-2.5 font-medium">Priority</th>
                <th className="px-5 py-2.5 font-medium">Status</th>
                <th className="px-5 py-2.5 font-medium">Created</th>
                <th className="px-5 py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {!batches?.items.length && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-5 py-10 text-center text-surface-muted"
                  >
                    No batches yet
                  </td>
                </tr>
              )}
              {batches?.items.map((b) => {
                const wf = workflows?.items.find((w) => w.id === b.workflow_id)
                return (
                  <tr key={b.id} className="hover:bg-surface-600/50">
                    <td className="px-5 py-3 font-medium text-surface-50">
                      {b.name}
                    </td>
                    <td className="px-5 py-3 text-surface-100">
                      <Mono>{b.doc_count}</Mono>
                    </td>
                    <td className="px-5 py-3 text-surface-muted">
                      {wf?.name ?? '—'}
                    </td>
                    <td className="px-5 py-3 capitalize text-surface-100">
                      {b.priority}
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={batchStatusTone(b.status)} className="capitalize">
                        {b.status}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-surface-muted">
                      {formatDistanceToNow(new Date(b.created_at), {
                        addSuffix: true,
                      })}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => navigate(`/queue?batch=${b.id}`)}
                          className="rounded p-1.5 text-surface-muted hover:bg-surface-600 hover:text-ice-400"
                          title="View details"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          className="rounded p-1.5 text-surface-muted hover:bg-surface-600 hover:text-ice-400"
                          title="Download report"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function FileStatusChip({ status }: { status: FileStatus }) {
  if (status === 'uploading')
    return (
      <Badge tone="ice" className="animate-pulse-soft">
        Uploading
      </Badge>
    )
  if (status === 'queued') return <Badge tone="green">Queued</Badge>
  return <Badge tone="neutral">Pending</Badge>
}
