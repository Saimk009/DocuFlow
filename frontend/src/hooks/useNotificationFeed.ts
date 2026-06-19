import { useCallback, useRef } from 'react'
import { useDocumentStream } from './useDocumentStream'
import { useNotificationStore } from '@/store/notificationStore'

/**
 * Turn live document-stream events into in-app notifications. Tracks the last
 * seen status per document so we only notify on real transitions (e.g. a
 * document reaching ``complete`` or flipping to ``exception``).
 */
export function useNotificationFeed(): void {
  const add = useNotificationStore((s) => s.add)
  const lastStatus = useRef<Map<string, string>>(new Map())

  useDocumentStream(
    useCallback(
      (msg) => {
        if (msg.type !== 'document_updated') return
        const docId = String(msg.document_id ?? '')
        const status = String(msg.status ?? '')
        if (!docId || !status) return

        const prev = lastStatus.current.get(docId)
        lastStatus.current.set(docId, status)
        if (prev === status) return

        const shortId = docId.slice(0, 8)
        if (status === 'complete') {
          add({
            kind: 'document_completed',
            title: 'Document completed',
            message: `${shortId} finished processing successfully.`,
            link: `/documents/${docId}`,
          })
        } else if (status === 'exception' || status === 'rejected') {
          add({
            kind: 'exception',
            title: 'Exception needs attention',
            message: `${shortId} needs manual review.`,
            link: `/documents/${docId}`,
          })
        }
      },
      [add],
    ),
  )
}
