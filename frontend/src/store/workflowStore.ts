import { create } from 'zustand'
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from 'reactflow'
import {
  categoryOfKind,
  defaultConfigFor,
  NODE_KINDS,
} from '@/components/workflow/catalog'
import type { WorkflowDefinition } from '@/types'
import type { WorkflowNodeData } from '@/components/workflow/nodes/BaseNode'

type WfNode = Node<WorkflowNodeData>

interface Snapshot {
  nodes: WfNode[]
  edges: Edge[]
}

interface WorkflowState {
  nodes: WfNode[]
  edges: Edge[]
  selectedId: string | null
  past: Snapshot[]
  future: Snapshot[]

  load: (definition: WorkflowDefinition | undefined) => void
  loadDefaults: () => void
  onNodesChange: (changes: NodeChange[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (connection: Connection) => void
  addNode: (kind: string, position: { x: number; y: number }) => void
  updateNodeData: (id: string, patch: Partial<WorkflowNodeData>) => void
  deleteNode: (id: string) => void
  setSelected: (id: string | null) => void
  commit: () => void
  undo: () => void
  redo: () => void
  serialize: () => WorkflowDefinition
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

const DEFAULT_PIPELINE = [
  'file_upload',
  'ocr',
  'classify',
  'extract',
  'validate',
  'integrate',
]

function buildNode(
  kind: string,
  position: { x: number; y: number },
  id?: string,
): WfNode {
  const meta = NODE_KINDS[kind]
  return {
    id: id ?? `n_${Math.random().toString(36).slice(2, 9)}`,
    type: categoryOfKind(kind),
    position,
    data: {
      kind,
      label: meta?.label ?? kind,
      config: defaultConfigFor(kind),
    },
  }
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedId: null,
  past: [],
  future: [],

  load: (definition) => {
    const defNodes = definition?.nodes ?? []
    const nodes: WfNode[] = defNodes.map((n, i) =>
      buildNodeFromDefinition(n, i),
    )
    const edges: Edge[] = (definition?.edges ?? []).map((e, i) => ({
      id: `e_${i}_${e.source}_${e.target}`,
      source: e.source,
      target: e.target,
      animated: true,
    }))
    set({ nodes, edges, selectedId: null, past: [], future: [] })
  },

  loadDefaults: () => {
    const nodes = DEFAULT_PIPELINE.map((kind, i) =>
      buildNode(kind, { x: 60 + i * 210, y: 160 }),
    )
    const edges: Edge[] = nodes.slice(0, -1).map((n, i) => ({
      id: `e_${i}`,
      source: n.id,
      target: nodes[i + 1].id,
      animated: true,
    }))
    set({ nodes, edges, selectedId: null, past: [], future: [] })
  },

  onNodesChange: (changes) =>
    set((s) => ({ nodes: applyNodeChanges(changes, s.nodes) as WfNode[] })),

  onEdgesChange: (changes) =>
    set((s) => ({ edges: applyEdgeChanges(changes, s.edges) })),

  onConnect: (connection) => {
    get().commit()
    set((s) => ({
      edges: addEdge({ ...connection, animated: true }, s.edges),
    }))
  },

  addNode: (kind, position) => {
    get().commit()
    const node = buildNode(kind, position)
    set((s) => ({ nodes: [...s.nodes, node], selectedId: node.id }))
  },

  updateNodeData: (id, patch) => {
    get().commit()
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...patch } } : n,
      ),
    }))
  },

  deleteNode: (id) => {
    get().commit()
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== id),
      edges: s.edges.filter((e) => e.source !== id && e.target !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    }))
  },

  setSelected: (id) => set({ selectedId: id }),

  commit: () =>
    set((s) => ({
      past: [...s.past, { nodes: clone(s.nodes), edges: clone(s.edges) }],
      future: [],
    })),

  undo: () =>
    set((s) => {
      if (!s.past.length) return s
      const previous = s.past[s.past.length - 1]
      return {
        nodes: previous.nodes,
        edges: previous.edges,
        past: s.past.slice(0, -1),
        future: [{ nodes: clone(s.nodes), edges: clone(s.edges) }, ...s.future],
        selectedId: null,
      }
    }),

  redo: () =>
    set((s) => {
      if (!s.future.length) return s
      const next = s.future[0]
      return {
        nodes: next.nodes,
        edges: next.edges,
        past: [...s.past, { nodes: clone(s.nodes), edges: clone(s.edges) }],
        future: s.future.slice(1),
        selectedId: null,
      }
    }),

  serialize: () => {
    const { nodes, edges } = get()
    return {
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.data.kind,
        label: n.data.label,
        config: n.data.config ?? {},
        position: n.position,
      })),
      edges: edges.map((e) => ({ source: e.source, target: e.target })),
    }
  },
}))

function buildNodeFromDefinition(
  n: WorkflowDefinition['nodes'][number],
  i: number,
): WfNode {
  return {
    id: n.id,
    type: categoryOfKind(n.type),
    position: n.position ?? { x: 60 + i * 210, y: 160 },
    data: {
      kind: n.type,
      label: n.label,
      config: (n.config as Record<string, unknown>) ?? defaultConfigFor(n.type),
    },
  }
}
