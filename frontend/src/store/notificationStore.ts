import { create } from 'zustand'

export type NotificationKind =
  | 'document_completed'
  | 'exception'
  | 'robot_failed'
  | 'team_member'

export interface AppNotification {
  id: string
  kind: NotificationKind
  title: string
  message: string
  /** ISO timestamp. */
  time: string
  /** In-app route to navigate to when clicked. */
  link?: string
  read: boolean
}

interface NotificationState {
  open: boolean
  notifications: AppNotification[]
  togglePanel: () => void
  setOpen: (open: boolean) => void
  add: (n: Omit<AppNotification, 'id' | 'time' | 'read'>) => void
  markAllRead: () => void
  markRead: (id: string) => void
  unreadCount: () => number
}

const seed: AppNotification[] = [
  {
    id: 'seed-1',
    kind: 'exception',
    title: 'Exception needs attention',
    message: 'An invoice failed validation and is waiting for review.',
    time: new Date(Date.now() - 4 * 60_000).toISOString(),
    link: '/queue?status=exception',
    read: false,
  },
  {
    id: 'seed-2',
    kind: 'document_completed',
    title: 'Document completed',
    message: 'Batch "March Invoices" finished processing.',
    time: new Date(Date.now() - 32 * 60_000).toISOString(),
    link: '/queue',
    read: false,
  },
  {
    id: 'seed-3',
    kind: 'team_member',
    title: 'New team member',
    message: 'Priya Sharma joined your workspace.',
    time: new Date(Date.now() - 3 * 3_600_000).toISOString(),
    link: '/settings',
    read: true,
  },
]

let counter = 0

export const useNotificationStore = create<NotificationState>((set, get) => ({
  open: false,
  notifications: seed,
  togglePanel: () => set((s) => ({ open: !s.open })),
  setOpen: (open) => set({ open }),
  add: (n) =>
    set((s) => {
      counter += 1
      const next: AppNotification = {
        ...n,
        id: `n-${Date.now()}-${counter}`,
        time: new Date().toISOString(),
        read: false,
      }
      // Cap the list so it never grows unbounded.
      return { notifications: [next, ...s.notifications].slice(0, 50) }
    }),
  markAllRead: () =>
    set((s) => ({
      notifications: s.notifications.map((n) => ({ ...n, read: true })),
    })),
  markRead: (id) =>
    set((s) => ({
      notifications: s.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n,
      ),
    })),
  unreadCount: () => get().notifications.filter((n) => !n.read).length,
}))
