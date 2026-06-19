import { useEffect, useRef } from 'react'
import { DocuFlowWebSocket, type WSMessage } from '@/lib/ws'
import { getToken } from '@/lib/utils'
import { useTenantStore } from '@/store/tenantStore'

/**
 * Open a live document-event WebSocket for the active tenant and invoke
 * ``onMessage`` for every frame. The handler is held in a ref so changing it
 * never tears down and re-establishes the connection.
 */
export function useDocumentStream(onMessage: (message: WSMessage) => void): void {
  const tenantId = useTenantStore((s) => s.tenant?.id ?? null)
  const handlerRef = useRef(onMessage)
  handlerRef.current = onMessage

  useEffect(() => {
    const token = getToken()
    if (!tenantId || !token) return

    const socket = new DocuFlowWebSocket()
    const off = socket.onMessage((msg) => handlerRef.current(msg))
    socket.connect(tenantId, token)

    return () => {
      off()
      socket.disconnect()
    }
  }, [tenantId])
}
