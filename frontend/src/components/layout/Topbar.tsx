import { useLocation, useNavigate } from 'react-router-dom'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  Bell,
  Bot,
  ChevronRight,
  LogOut,
  Search,
  Settings as SettingsIcon,
  Sparkles,
  User as UserIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/store/uiStore'
import { useAuthStore } from '@/store/authStore'
import { useTenantStore } from '@/store/tenantStore'
import { useNotificationStore } from '@/store/notificationStore'

const SEGMENT_LABELS: Record<string, string> = {
  '': 'Dashboard',
  capture: 'Capture',
  queue: 'Queue',
  documents: 'Documents',
  workflows: 'Workflows',
  robots: 'Robots',
  analytics: 'Analytics',
  cases: 'Cases',
  connectors: 'Connectors',
  settings: 'Settings',
  admin: 'Super Admin',
}

function useBreadcrumb(): string[] {
  const { pathname } = useLocation()
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length === 0) return ['Dashboard']
  return parts.map((p) => SEGMENT_LABELS[p] ?? p)
}

export function Topbar() {
  const openCommand = useUIStore((s) => s.openCommand)
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const tenant = useTenantStore((s) => s.tenant)
  const aiProvider = useTenantStore((s) => s.aiProvider)
  const toggleNotifications = useNotificationStore((s) => s.togglePanel)
  const unreadCount = useNotificationStore((s) =>
    s.notifications.reduce((acc, n) => acc + (n.read ? 0 : 1), 0),
  )
  const navigate = useNavigate()
  const crumbs = useBreadcrumb()

  const initials = (user?.full_name ?? '?')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const providerLabel = aiProvider === 'openai' ? 'GPT-4o' : 'Claude'

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-surface-border bg-surface-800/70 px-4 backdrop-blur">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm">
        {crumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-surface-muted" />}
            <span
              className={cn(
                i === crumbs.length - 1 ? 'text-surface-50' : 'text-surface-muted',
              )}
            >
              {crumb}
            </span>
          </span>
        ))}
      </nav>

      {/* Center: command palette trigger */}
      <button
        onClick={openCommand}
        className="mx-auto flex w-80 items-center gap-2 rounded border border-surface-border bg-surface-900 px-3 py-1.5 text-sm text-surface-muted transition-colors hover:border-surface-muted"
      >
        <Search className="h-3.5 w-3.5" />
        <span>Search documents, actions…</span>
        <kbd className="ml-auto rounded bg-surface-700 px-1.5 py-0.5 font-mono text-[10px]">
          ⌘K
        </kbd>
      </button>

      {/* Right cluster */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate('/settings')}
          className="flex items-center gap-1.5 rounded border border-ai-500/30 bg-ai-500/10 px-2.5 py-1 text-xs text-ai-400 transition-colors hover:bg-ai-500/20"
          title="AI provider — click to configure"
        >
          {aiProvider === 'openai' ? (
            <Sparkles className="h-3.5 w-3.5" />
          ) : (
            <Bot className="h-3.5 w-3.5" />
          )}
          <span>{providerLabel}</span>
        </button>

        <button
          onClick={toggleNotifications}
          className="relative rounded p-1.5 text-surface-muted hover:bg-surface-600 hover:text-surface-50"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute right-0.5 top-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-ice-500 px-1 text-[8px] font-bold text-surface-900">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-600 text-xs font-medium text-surface-50 outline-none focus-visible:ring-2 focus-visible:ring-ice-500/50"
              aria-label="Account menu"
            >
              {initials}
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={8}
              className="z-50 min-w-52 animate-fade-in rounded-lg border border-surface-border bg-surface-700 p-1.5 shadow-xl"
            >
              <div className="px-2.5 py-2">
                <div className="truncate text-sm text-surface-50">
                  {user?.full_name}
                </div>
                <div className="truncate font-mono text-xs text-surface-muted">
                  {user?.email}
                </div>
              </div>
              <DropdownMenu.Separator className="my-1 h-px bg-surface-border" />
              <DropdownMenu.Item
                onSelect={() => navigate('/settings')}
                className="flex cursor-pointer items-center gap-2 rounded px-2.5 py-1.5 text-sm text-surface-100 outline-none data-[highlighted]:bg-surface-600"
              >
                <UserIcon className="h-4 w-4 text-surface-muted" />
                Profile
              </DropdownMenu.Item>
              <DropdownMenu.Item
                onSelect={() => navigate('/settings')}
                className="flex cursor-pointer items-center gap-2 rounded px-2.5 py-1.5 text-sm text-surface-100 outline-none data-[highlighted]:bg-surface-600"
              >
                <SettingsIcon className="h-4 w-4 text-surface-muted" />
                Settings
              </DropdownMenu.Item>
              <DropdownMenu.Item
                onSelect={() => {
                  window.location.href = 'https://docuflow.com'
                }}
                className="flex cursor-pointer items-center gap-2 rounded px-2.5 py-1.5 text-sm text-surface-100 outline-none data-[highlighted]:bg-surface-600"
              >
                <ChevronRight className="h-4 w-4 text-surface-muted" />
                Switch Org
              </DropdownMenu.Item>
              {tenant && (
                <div className="px-2.5 py-1">
                  <span className="font-mono text-[10px] text-surface-muted">
                    {tenant.slug}.docuflow.com
                  </span>
                </div>
              )}
              <DropdownMenu.Separator className="my-1 h-px bg-surface-border" />
              <DropdownMenu.Item
                onSelect={handleLogout}
                className="flex cursor-pointer items-center gap-2 rounded px-2.5 py-1.5 text-sm text-rose-400 outline-none data-[highlighted]:bg-rose-500/10"
              >
                <LogOut className="h-4 w-4" />
                Logout
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </header>
  )
}
