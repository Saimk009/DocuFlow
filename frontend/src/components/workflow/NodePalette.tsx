import { useWorkflowStore } from '@/store/workflowStore'
import { cn } from '@/lib/utils'
import {
  CATEGORY_STYLE,
  NODE_KINDS,
  PALETTE_GROUPS,
} from './catalog'
import { DRAG_MIME } from './WorkflowCanvas'

export function NodePalette() {
  const addNode = useWorkflowStore((s) => s.addNode)

  return (
    <div className="flex h-full w-[240px] shrink-0 flex-col overflow-hidden border-r border-surface-border bg-surface-800">
      <div className="border-b border-surface-border px-4 py-3">
        <h2 className="text-sm font-medium text-surface-50">Node Palette</h2>
        <p className="mt-0.5 text-[11px] text-surface-muted">
          Drag onto the canvas or click to add
        </p>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        {PALETTE_GROUPS.map((group) => {
          const style = CATEGORY_STYLE[group.category]
          return (
            <div key={group.category}>
              <div className="mb-2 flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: style.border }}
                />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-surface-muted">
                  {group.label}
                </span>
              </div>
              <div className="space-y-1.5">
                {group.kinds.map((kind) => {
                  const meta = NODE_KINDS[kind]
                  const Icon = meta.Icon
                  return (
                    <div
                      key={kind}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(DRAG_MIME, kind)
                        e.dataTransfer.effectAllowed = 'move'
                      }}
                      onClick={() =>
                        addNode(kind, {
                          x: 200 + Math.random() * 120,
                          y: 120 + Math.random() * 120,
                        })
                      }
                      className={cn(
                        'group flex cursor-grab items-start gap-2.5 rounded-lg border border-surface-border bg-surface-700 p-2.5 transition-colors hover:border-ice-500/40 hover:bg-surface-600 active:cursor-grabbing',
                      )}
                    >
                      <div
                        className={cn(
                          'flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
                          style.chipBg,
                        )}
                      >
                        <Icon className={cn('h-4 w-4', style.text)} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-surface-50">
                          {meta.label}
                        </div>
                        <div className="text-[10px] leading-tight text-surface-muted">
                          {meta.description}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
