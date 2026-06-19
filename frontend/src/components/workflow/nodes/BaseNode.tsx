import { Handle, Position, type NodeProps } from 'reactflow'
import { cn } from '@/lib/utils'
import { CATEGORY_STYLE, NODE_KINDS } from '../catalog'

export interface WorkflowNodeData {
  kind: string
  label: string
  config?: Record<string, unknown>
}

const HANDLE_CLASS =
  '!h-2.5 !w-2.5 !border-2 !border-surface-700 !bg-surface-muted'

export function BaseNode({ data, selected }: NodeProps<WorkflowNodeData>) {
  const meta = NODE_KINDS[data.kind]
  const category = meta?.category ?? 'process'
  const style = CATEGORY_STYLE[category]
  const Icon = meta?.Icon
  const showTarget = category !== 'trigger'

  return (
    <div
      className={cn(
        'min-w-[176px] overflow-hidden rounded-lg border bg-surface-700 shadow-sm transition-shadow',
        selected
          ? 'border-ice-500 shadow-[0_0_0_2px_rgba(56,189,248,0.35)]'
          : 'border-surface-border',
      )}
    >
      <div className="h-1 w-full" style={{ backgroundColor: style.border }} />

      {showTarget && (
        <Handle type="target" position={Position.Left} className={HANDLE_CLASS} />
      )}

      <div className="flex items-center gap-2.5 px-3 py-2.5">
        {Icon && (
          <div
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
              style.chipBg,
            )}
          >
            <Icon className={cn('h-4 w-4', style.text)} />
          </div>
        )}
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wide text-surface-muted">
            {meta?.label ?? data.kind}
          </div>
          <div className="truncate text-sm text-surface-50">{data.label}</div>
        </div>
        <span
          className={cn('ml-auto h-2 w-2 shrink-0 rounded-full', style.dot)}
          title="Configured"
        />
      </div>

      <Handle type="source" position={Position.Right} className={HANDLE_CLASS} />
    </div>
  )
}
