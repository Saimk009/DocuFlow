import type { NodeProps } from 'reactflow'
import { BaseNode, type WorkflowNodeData } from './BaseNode'

export function ProcessNode(props: NodeProps<WorkflowNodeData>) {
  return <BaseNode {...props} />
}
