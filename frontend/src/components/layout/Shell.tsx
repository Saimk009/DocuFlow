import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { CommandPalette } from './CommandPalette'
import { NotificationsPanel } from './NotificationsPanel'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { useUIStore } from '@/store/uiStore'
import { useNotificationFeed } from '@/hooks/useNotificationFeed'

export function Shell() {
  const openCommand = useUIStore((s) => s.openCommand)
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)
  const location = useLocation()
  useNotificationFeed()

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      if (e.key.toLowerCase() === 'k') {
        e.preventDefault()
        openCommand()
      } else if (e.key === '/') {
        e.preventDefault()
        toggleSidebar()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openCommand, toggleSidebar])

  return (
    <div className="flex h-screen overflow-hidden bg-surface-900">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="mx-auto max-w-7xl px-6 py-6"
          >
            <ErrorBoundary resetKey={location.pathname}>
              <Outlet />
            </ErrorBoundary>
          </motion.div>
        </main>
      </div>
      <CommandPalette />
      <NotificationsPanel />
    </div>
  )
}
