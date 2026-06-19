import { getActiveTenantSlug } from './tenant'

const DEV = import.meta.env.DEV

export interface WSMessage {
  type: string
  [key: string]: unknown
}

export interface DocumentUpdatedMessage extends WSMessage {
  type: 'document_updated'
  document_id: string
  status: string
  doc_type: string | null
  confidence: number | null
}

export interface InitialStateMessage extends WSMessage {
  type: 'initial_state'
  counts: Record<string, number>
}

type MessageHandler = (message: WSMessage) => void

/** Resolve the WebSocket origin (mirrors the REST base URL). */
function resolveWsBase(): string {
  if (DEV) return 'ws://localhost:8000'
  const slug = getActiveTenantSlug()
  const host = slug ? `api.${slug}.docuflow.com` : 'api.docuflow.com'
  return `wss://${host}`
}

/**
 * Resilient WebSocket client for live document events. Handles auth via the
 * ``?token`` query param, automatic reconnection with backoff, and a heartbeat
 * to keep intermediaries from dropping idle connections.
 */
export class DocuFlowWebSocket {
  private ws: WebSocket | null = null
  private handlers = new Set<MessageHandler>()
  private tenantId: string | null = null
  private token: string | null = null
  private shouldReconnect = true
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null

  connect(tenantId: string, token: string): void {
    this.tenantId = tenantId
    this.token = token
    this.shouldReconnect = true
    this.open()
  }

  private open(): void {
    if (!this.tenantId || !this.token) return
    const url = `${resolveWsBase()}/ws/${this.tenantId}?token=${encodeURIComponent(
      this.token,
    )}`

    let socket: WebSocket
    try {
      socket = new WebSocket(url)
    } catch {
      this.scheduleReconnect()
      return
    }
    this.ws = socket

    socket.onopen = () => {
      this.reconnectAttempts = 0
      this.startHeartbeat()
    }

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as WSMessage
        if (data.type === 'pong') return
        this.handlers.forEach((h) => h(data))
      } catch {
        /* ignore malformed frames */
      }
    }

    socket.onclose = () => {
      this.stopHeartbeat()
      if (this.shouldReconnect) this.scheduleReconnect()
    }

    socket.onerror = () => {
      // onclose will follow and trigger the reconnect path.
      socket.close()
    }
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect) return
    this.reconnectAttempts += 1
    const delay = Math.min(1000 * 2 ** (this.reconnectAttempts - 1), 15_000)
    this.reconnectTimer = setTimeout(() => this.open(), delay)
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send('ping')
    }, 25_000)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  /** Register a handler; returns an unsubscribe function. */
  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  disconnect(): void {
    this.shouldReconnect = false
    this.stopHeartbeat()
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.handlers.clear()
    if (this.ws) {
      this.ws.onclose = null
      this.ws.close()
      this.ws = null
    }
  }
}
