import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  UserPlus,
  X,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import {
  useNotificationStore,
  type AppNotification,
  type NotificationKind,
} from '@/store/notificationStore'
import { cn } from '@/lib/utils'

const KIND_META: Record<
  NotificationKind,
  { icon: typeof CheckCircle2; tone: string }
> = {
  document_completed: { icon: CheckCircle2, tone: 'text-emerald-400 bg-emerald-500/10' },
  exception: { icon: AlertTriangle, tone: 'text-amber-400 bg-amber-500/10' },
  robot_failed: { icon: Bot, tone: 'text-rose-400 bg-rose-500/10' },
  team_member: { icon: UserPlus, tone: 'text-ice-400 bg-ice-500/10' },
}

export function NotificationsPanel() {
  const navigate = useNavigate()
  const open = useNotificationStore((s) => s.open)
  const setOpen = useNotificationStore((s) => s.setOpen)
  const notifications = useNotificationStore((s) => s.notifications)
  const markAllRead = useNotificationStore((s) => s.markAllRead)
  const markRead = useNotificationStore((s) => s.markRead)

  function handleClick(n: AppNotification) {
    markRead(n.id)
    setOpen(false)
    if (n.link) navigate(n.link)
  }

  const hasUnread = notifications.some((n) => !n.read)

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]"
          />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.25, ease: 'easeOut' }}
            className="fixed right-0 top-0 z-50 flex h-full w-[360px] flex-col border-l border-surface-border bg-surface-800 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-surface-50">
                  Notifications
                </h2>
                {hasUnread && (
                  <span className="rounded-full bg-ice-500/15 px-2 py-0.5 text-[10px] font-medium text-ice-400">
                    {notifications.filter((n) => !n.read).length} new
                  </span>
                )}
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded p-1 text-surface-muted hover:bg-surface-600 hover:text-surface-50"
                aria-label="Close notifications"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center justify-between border-b border-surface-border px-4 py-2">
              <span className="text-xs text-surface-muted">
                {notifications.length} total
              </span>
              <button
                onClick={markAllRead}
                disabled={!hasUnread}
                className="text-xs font-medium text-ice-400 hover:text-ice-300 disabled:opacity-40"
              >
                Mark all read
              </button>
            </div>

            <div className="flex-1 divide-y divide-surface-border overflow-y-auto">
              {notifications.length === 0 && (
                <div className="px-4 py-16 text-center text-sm text-surface-muted">
                  You're all caught up.
                </div>
              )}
              {notifications.map((n) => {
                const meta = KIND_META[n.kind]
                const Icon = meta.icon
                return (
                  <button
                    key={n.id}
                    onClick={() => handleClick(n)}
                    className={cn(
                      'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-600',
                      !n.read && 'bg-surface-700/60',
                    )}
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                        meta.tone,
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium text-surface-50">
                          {n.title}
                        </p>
                        {!n.read && (
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ice-500" />
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-surface-muted">{n.message}</p>
                      <p className="mt-1 text-[11px] text-surface-muted">
                        {formatDistanceToNow(new Date(n.time), { addSuffix: true })}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
