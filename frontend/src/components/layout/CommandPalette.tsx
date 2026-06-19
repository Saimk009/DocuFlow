import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as Dialog from '@radix-ui/react-dialog'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowRight,
  BarChart3,
  Bot,
  Briefcase,
  FileStack,
  FolderPlus,
  GitBranch,
  LayoutDashboard,
  ListOrdered,
  Plug2,
  Plus,
  Search,
  SlidersHorizontal,
  Upload,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/store/uiStore'
import { useDocuments } from '@/hooks/useDocuments'

interface Command {
  id: string
  label: string
  hint?: string
  icon: LucideIcon
  section: string
  run: () => void
}

export function CommandPalette() {
  const open = useUIStore((s) => s.commandOpen)
  const closeCommand = useUIStore((s) => s.closeCommand)
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const { data: recentDocs } = useDocuments({ page_size: 5 })

  useEffect(() => {
    if (!open) {
      setQuery('')
      setActive(0)
    }
  }, [open])

  const commands = useMemo<Command[]>(() => {
    const go = (to: string) => () => {
      navigate(to)
      closeCommand()
    }

    const recent: Command[] = (recentDocs?.items ?? []).map((doc) => ({
      id: `doc-${doc.id}`,
      label: doc.filename,
      hint: doc.doc_type ?? doc.status,
      icon: FileStack,
      section: 'Recent Documents',
      run: go(`/documents/${doc.id}`),
    }))

    const quickActions: Command[] = [
      {
        id: 'new-batch',
        label: 'New Batch',
        icon: FolderPlus,
        section: 'Quick Actions',
        run: go('/documents'),
      },
      {
        id: 'new-case',
        label: 'New Case',
        icon: Plus,
        section: 'Quick Actions',
        run: go('/cases'),
      },
      {
        id: 'new-robot',
        label: 'New Robot',
        icon: Bot,
        section: 'Quick Actions',
        run: go('/robots'),
      },
    ]

    const navigateTo: Command[] = [
      { id: 'nav-dash', label: 'Dashboard', icon: LayoutDashboard, section: 'Navigate To', run: go('/') },
      { id: 'nav-capture', label: 'Capture', icon: Upload, section: 'Navigate To', run: go('/capture') },
      { id: 'nav-queue', label: 'Queue', icon: ListOrdered, section: 'Navigate To', run: go('/queue') },
      { id: 'nav-docs', label: 'Documents', icon: FileStack, section: 'Navigate To', run: go('/documents') },
      { id: 'nav-wf', label: 'Workflows', icon: GitBranch, section: 'Navigate To', run: go('/workflows') },
      { id: 'nav-robots', label: 'Robots', icon: Bot, section: 'Navigate To', run: go('/robots') },
      { id: 'nav-analytics', label: 'Analytics', icon: BarChart3, section: 'Navigate To', run: go('/analytics') },
      { id: 'nav-cases', label: 'Cases', icon: Briefcase, section: 'Navigate To', run: go('/cases') },
      { id: 'nav-connectors', label: 'Connectors', icon: Plug2, section: 'Navigate To', run: go('/connectors') },
      { id: 'nav-settings', label: 'Settings', icon: SlidersHorizontal, section: 'Navigate To', run: go('/settings') },
    ]

    return [...recent, ...quickActions, ...navigateTo]
  }, [recentDocs, navigate, closeCommand])

  const filtered = useMemo(() => {
    if (!query.trim()) return commands
    const q = query.toLowerCase()
    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.section.toLowerCase().includes(q),
    )
  }, [commands, query])

  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(0, filtered.length - 1)))
  }, [filtered.length])

  const sections = useMemo(() => {
    const map = new Map<string, Command[]>()
    filtered.forEach((c) => {
      const list = map.get(c.section) ?? []
      list.push(c)
      map.set(c.section, list)
    })
    return Array.from(map.entries())
  }, [filtered])

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      filtered[active]?.run()
    }
  }

  // flat index for highlight
  let flatIndex = -1

  return (
    <Dialog.Root open={open} onOpenChange={(o) => (o ? null : closeCommand())}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                className="fixed inset-0 z-50 bg-surface-900/70 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild aria-describedby={undefined}>
              <motion.div
                className="fixed left-1/2 top-[15%] z-50 w-full max-w-xl -translate-x-1/2 overflow-hidden rounded-lg border border-surface-border bg-surface-700 shadow-2xl"
                initial={{ opacity: 0, scale: 0.97, y: -8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97, y: -8 }}
                transition={{ duration: 0.15 }}
                onKeyDown={onKeyDown}
              >
                <Dialog.Title className="sr-only">Command palette</Dialog.Title>
                <div className="flex items-center gap-2.5 border-b border-surface-border px-4">
                  <Search className="h-4 w-4 text-surface-muted" />
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Type a command or search…"
                    className="w-full bg-transparent py-3.5 text-sm text-surface-50 placeholder:text-surface-muted focus:outline-none"
                  />
                  <kbd className="rounded bg-surface-900 px-1.5 py-0.5 font-mono text-[10px] text-surface-muted">
                    ESC
                  </kbd>
                </div>

                <div ref={listRef} className="max-h-80 overflow-y-auto p-2">
                  {filtered.length === 0 && (
                    <div className="px-3 py-8 text-center text-sm text-surface-muted">
                      No results for “{query}”
                    </div>
                  )}
                  {sections.map(([section, items]) => (
                    <div key={section} className="mb-2 last:mb-0">
                      <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-surface-muted">
                        {section}
                      </div>
                      {items.map((cmd) => {
                        flatIndex += 1
                        const isActive = flatIndex === active
                        const myIndex = flatIndex
                        return (
                          <button
                            key={cmd.id}
                            onMouseEnter={() => setActive(myIndex)}
                            onClick={() => cmd.run()}
                            className={cn(
                              'flex w-full items-center gap-3 rounded px-2.5 py-2 text-left text-sm transition-colors',
                              isActive
                                ? 'bg-surface-600 text-surface-50'
                                : 'text-surface-100',
                            )}
                          >
                            <cmd.icon className="h-4 w-4 shrink-0 text-surface-muted" />
                            <span className="flex-1 truncate">{cmd.label}</span>
                            {cmd.hint && (
                              <span className="font-mono text-[10px] text-surface-muted">
                                {cmd.hint}
                              </span>
                            )}
                            {isActive && (
                              <ArrowRight className="h-3.5 w-3.5 text-ice-400" />
                            )}
                          </button>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}
