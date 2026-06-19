import { NavLink } from 'react-router-dom'
import {
  AlertTriangle,
  BarChart3,
  Bot,
  Briefcase,
  ChevronLeft,
  FileStack,
  GitBranch,
  LayoutDashboard,
  ListOrdered,
  Plug2,
  ScanLine,
  Shield,
  SlidersHorizontal,
  Upload,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SUPER_ADMIN_EMAIL } from '@/lib/config'
import { useUIStore } from '@/store/uiStore'
import { useAuthStore } from '@/store/authStore'
import { useTenantStore } from '@/store/tenantStore'
import { useOpenExceptionCount } from '@/hooks/useExceptions'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
  ai?: boolean
  superAdminOnly?: boolean
  /** Key for a live numeric badge (e.g. open exception count). */
  badge?: 'exceptions'
}

interface NavGroup {
  label: string
  items: NavItem[]
}

const GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true }],
  },
  {
    label: 'Processing',
    items: [
      { to: '/capture', label: 'Capture', icon: Upload },
      { to: '/queue', label: 'Queue', icon: ListOrdered },
      {
        to: '/exceptions',
        label: 'Exceptions',
        icon: AlertTriangle,
        badge: 'exceptions',
      },
      { to: '/documents', label: 'Documents', icon: FileStack },
    ],
  },
  {
    label: 'Automation',
    items: [
      { to: '/workflows', label: 'Workflows', icon: GitBranch, ai: true },
      { to: '/robots', label: 'Robots', icon: Bot, ai: true },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { to: '/analytics', label: 'Analytics', icon: BarChart3 },
      { to: '/cases', label: 'Cases', icon: Briefcase },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/connectors', label: 'Connectors', icon: Plug2 },
      { to: '/settings', label: 'Settings', icon: SlidersHorizontal },
    ],
  },
  {
    label: 'Admin',
    items: [{ to: '/admin', label: 'Super Admin', icon: Shield, superAdminOnly: true }],
  },
]

const ROLE_TONE: Record<string, string> = {
  owner: 'text-ai-400',
  admin: 'text-ice-400',
  member: 'text-surface-100',
  viewer: 'text-surface-muted',
}

const PLAN_TONE: Record<string, string> = {
  free: 'border-surface-border bg-surface-700 text-surface-muted',
  pro: 'border-ice-500/30 bg-ice-500/15 text-ice-400',
  enterprise: 'border-ai-500/30 bg-ai-500/15 text-ai-400',
}

export function Sidebar() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)
  const user = useAuthStore((s) => s.user)
  const tenant = useTenantStore((s) => s.tenant)
  const { data: exceptionCount = 0 } = useOpenExceptionCount()
  const isSuperAdmin =
    !!user &&
    (user.email.toLowerCase() === SUPER_ADMIN_EMAIL ||
      (user.role as string) === 'super_admin')

  const initials = (user?.full_name ?? '?')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r border-surface-border bg-surface-800 transition-all duration-200',
        collapsed ? 'w-[60px]' : 'w-[220px]',
      )}
    >
      {/* Logo area */}
      <div
        className={cn(
          'flex h-[52px] shrink-0 items-center border-b border-surface-border',
          collapsed ? 'justify-center px-0' : 'gap-2.5 px-4',
        )}
      >
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-gradient-to-br from-ice-500 to-ai-500">
          <ScanLine className="h-4 w-4 text-surface-900" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="font-semibold leading-tight tracking-tight text-surface-50">
              Docu<span className="text-ice-400">Flow</span>
            </div>
            <div className="text-[10px] uppercase tracking-wider text-surface-muted">
              IDP Platform
            </div>
          </div>
        )}
      </div>

      {!collapsed && tenant && (
        <div className="px-3 pt-3">
          <div className="truncate rounded border border-surface-border bg-surface-900 px-2.5 py-1.5 text-xs text-surface-100">
            {tenant.name}
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {GROUPS.map((group) => {
          const items = group.items.filter((i) => !i.superAdminOnly || isSuperAdmin)
          if (!items.length) return null
          return (
            <div key={group.label} className="mb-3 last:mb-0">
              {!collapsed && (
                <div className="px-3 pb-1.5 text-[10px] font-medium uppercase tracking-wider text-surface-muted">
                  {group.label}
                </div>
              )}
              <div className="space-y-0.5">
                {items.map((item) => {
                  const badgeValue =
                    item.badge === 'exceptions' ? exceptionCount : 0
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      title={collapsed ? item.label : undefined}
                      className={({ isActive }) =>
                        cn(
                          'group relative flex items-center gap-3 rounded py-2 text-sm transition-colors',
                          collapsed ? 'justify-center px-0' : 'px-3',
                          isActive
                            ? 'bg-surface-600 text-surface-50'
                            : 'text-surface-100 hover:bg-surface-600',
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && (
                            <span className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-ice-500" />
                          )}
                          <span className="relative shrink-0">
                            <item.icon
                              className={cn(
                                'h-4 w-4',
                                isActive
                                  ? 'text-ice-400'
                                  : item.ai
                                    ? 'text-ai-400'
                                    : 'text-surface-muted',
                              )}
                            />
                            {collapsed && badgeValue > 0 && (
                              <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-surface-800" />
                            )}
                          </span>
                          {!collapsed && <span>{item.label}</span>}
                          {!collapsed && badgeValue > 0 && (
                            <span className="ml-auto min-w-[18px] rounded-full bg-rose-500/90 px-1.5 text-center text-[11px] font-semibold text-white">
                              {badgeValue}
                            </span>
                          )}
                        </>
                      )}
                    </NavLink>
                  )
                })}
              </div>
            </div>
          )
        })}
      </nav>

      {/* Tenant footer */}
      {!collapsed && tenant && (
        <div className="flex items-center justify-between gap-2 border-t border-surface-border px-3 py-2">
          <span className="truncate font-mono text-[11px] text-surface-muted">
            {tenant.slug}.docuflow.com
          </span>
          <span
            className={cn(
              'shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
              PLAN_TONE[tenant.plan] ?? PLAN_TONE.free,
            )}
          >
            {tenant.plan}
          </span>
        </div>
      )}

      {/* User footer */}
      {!collapsed && user && (
        <div className="flex items-center gap-2.5 border-t border-surface-border px-3 py-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-600 text-xs font-medium text-surface-50">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm text-surface-50">
              {user.full_name}
            </div>
            <div
              className={cn(
                'text-[10px] uppercase tracking-wide',
                ROLE_TONE[user.role] ?? 'text-surface-muted',
              )}
            >
              {user.role}
            </div>
          </div>
        </div>
      )}

      {/* Collapse toggle */}
      <button
        onClick={toggleSidebar}
        className={cn(
          'flex h-10 shrink-0 items-center border-t border-surface-border text-surface-muted transition-colors hover:bg-surface-600 hover:text-surface-50',
          collapsed ? 'justify-center' : 'gap-2 px-4',
        )}
        aria-label="Toggle sidebar"
      >
        <ChevronLeft
          className={cn('h-4 w-4 transition-transform', collapsed && 'rotate-180')}
        />
        {!collapsed && <span className="text-xs">Collapse</span>}
      </button>
    </aside>
  )
}
