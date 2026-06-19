import { useCallback, useMemo, useRef } from 'react'
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useReactFlow,
  type Node,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { useWorkflowStore } from '@/store/workflowStore'
import { CATEGORY_STYLE, categoryOfKind } from './catalog'
import type { WorkflowNodeData } from './nodes/BaseNode'
import { TriggerNode } from './nodes/TriggerNode'
import { ProcessNode } from './nodes/ProcessNode'
import { HumanNode } from './nodes/HumanNode'
import { LogicNode } from './nodes/LogicNode'
import { ActionNode } from './nodes/ActionNode'

export const DRAG_MIME = 'application/docuflow-node'

export function WorkflowCanvas() {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const { project } = useReactFlow()

  const nodes = useWorkflowStore((s) => s.nodes)
  const edges = useWorkflowStore((s) => s.edges)
  const onNodesChange = useWorkflowStore((s) => s.onNodesChange)
  const onEdgesChange = useWorkflowStore((s) => s.onEdgesChange)
  const onConnect = useWorkflowStore((s) => s.onConnect)
  const addNode = useWorkflowStore((s) => s.addNode)
  const setSelected = useWorkflowStore((s) => s.setSelected)
  const commit = useWorkflowStore((s) => s.commit)

  const nodeTypes = useMemo(
    () => ({
      trigger: TriggerNode,
      process: ProcessNode,
      human: HumanNode,
      logic: LogicNode,
      action: ActionNode,
    }),
    [],
  )

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      const kind = event.dataTransfer.getData(DRAG_MIME)
      if (!kind || !wrapperRef.current) return
      const bounds = wrapperRef.current.getBoundingClientRect()
      const position = project({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      })
      addNode(kind, position)
    },
    [project, addNode],
  )

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  return (
    <div
      ref={wrapperRef}
      className="h-full w-full overflow-hidden rounded-lg border border-surface-border bg-surface-900"
      onDrop={onDrop}
      onDragOver={onDragOver}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_e, node) => setSelected(node.id)}
        onNodeDragStart={() => commit()}
        onPaneClick={() => setSelected(null)}
        defaultEdgeOptions={{
          animated: true,
          style: { stroke: '#38BDF8', strokeWidth: 1.5 },
        }}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#1F3050" />
        <Controls className="!border-surface-border !bg-surface-700 !shadow-none [&_button]:!border-surface-border [&_button]:!bg-surface-700 [&_button]:!text-surface-100 [&_button:hover]:!bg-surface-600" />
        <MiniMap
          pannable
          zoomable
          className="!bg-surface-800"
          maskColor="rgba(13,21,37,0.6)"
          nodeColor={(n: Node<WorkflowNodeData>) =>
            CATEGORY_STYLE[categoryOfKind(n.data?.kind ?? '')].border
          }
        />
      </ReactFlow>
    </div>
  )
}
