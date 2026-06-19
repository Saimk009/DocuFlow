import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowRight,
  Check,
  Rocket,
  Sparkles,
  Upload,
  Users,
  Workflow,
  X,
  type LucideIcon,
} from 'lucide-react'
import { api, API_PREFIX } from '@/lib/api'
import { cn } from '@/lib/utils'

interface SetupChecklist {
  workflow_published: boolean
  first_document_processed: boolean
  team_invited: boolean
  ai_provider_configured: boolean
  connector_added: boolean
}

interface SetupStatus {
  onboarding_completed: boolean
  onboarding_template_key: string | null
  checklist: SetupChecklist
}

const DISMISS_KEY = 'docuflow:onboarding_widget_dismissed'

interface ChecklistItem {
  id: keyof SetupChecklist
  label: string
  hint: string
  icon: LucideIcon
  to: string
  cta: string
}

const ITEMS: ChecklistItem[] = [
  {
    id: 'ai_provider_configured',
    label: 'Connect your AI engine',
    hint: 'Add an API key to power classification & extraction.',
    icon: Sparkles,
    to: '/settings',
    cta: 'Configure',
  },
  {
    id: 'workflow_published',
    label: 'Publish a workflow',
    hint: 'Define how documents flow through your pipeline.',
    icon: Workflow,
    to: '/workflows',
    cta: 'Open designer',
  },
  {
    id: 'first_document_processed',
    label: 'Process your first document',
    hint: 'Upload a file and watch the AI extract its fields.',
    icon: Upload,
    to: '/capture',
    cta: 'Upload',
  },
  {
    id: 'team_invited',
    label: 'Invite your team',
    hint: 'Bring teammates in to review and validate.',
    icon: Users,
    to: '/settings',
    cta: 'Invite',
  },
]

export function GettingStartedWidget() {
  const navigate = useNavigate()
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISS_KEY) === 'true',
  )

  const { data } = useQuery({
    queryKey: ['onboarding', 'setup-status'],
    queryFn: () => api.get<SetupStatus>(`${API_PREFIX}/onboarding/setup-status`),
    refetchInterval: 30_000,
  })

  if (dismissed || !data) return null

  const done = ITEMS.filter((item) => data.checklist[item.id]).length
  const total = ITEMS.length

  // Hide once everything is finished.
  if (done >= total) return null

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, 'true')
    setDismissed(true)
    // Best-effort backend persistence (column may not exist yet).
    void api
      .put(`${API_PREFIX}/settings`, { onboarding_widget_dismissed: true })
      .catch(() => {})
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, height: 0 }}
        className="card relative overflow-hidden p-5"
      >
        {/* Glow accent */}
        <div
          className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-ice-500/10 blur-3xl"
          aria-hidden
        />

        <button
          onClick={dismiss}
          className="absolute right-3 top-3 rounded p-1 text-surface-muted transition-colors hover:bg-surface-700 hover:text-surface-100"
          title="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-ice-500/30 bg-ice-500/10 text-ice-400">
            <Rocket className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-surface-50">Getting started</h2>
            <p className="mt-0.5 text-xs text-surface-muted">
              {done} of {total} complete — finish setup to get the most out of DocuFlow.
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-800">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-ice-500 to-ai-500"
            initial={false}
            animate={{ width: `${(done / total) * 100}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>

        {/* Checklist */}
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {ITEMS.map((item) => {
            const complete = data.checklist[item.id]
            const Icon = item.icon
            return (
              <li
                key={item.id}
                className={cn(
                  'flex items-center gap-3 rounded-lg border p-3 transition-colors',
                  complete
                    ? 'border-emerald-500/30 bg-emerald-500/[0.05]'
                    : 'border-surface-border bg-surface-800',
                )}
              >
                <span
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                    complete
                      ? 'bg-emerald-500 text-surface-900'
                      : 'border border-surface-border text-surface-muted',
                  )}
                >
                  {complete ? (
                    <Check className="h-4 w-4" strokeWidth={3} />
                  ) : (
                    <Icon className="h-3.5 w-3.5" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div
                    className={cn(
                      'text-sm font-medium',
                      complete ? 'text-surface-muted line-through' : 'text-surface-50',
                    )}
                  >
                    {item.label}
                  </div>
                  {!complete && (
                    <div className="truncate text-[11px] text-surface-muted">{item.hint}</div>
                  )}
                </div>
                {!complete && (
                  <button
                    onClick={() => navigate(item.to)}
                    className="flex shrink-0 items-center gap-1 text-xs font-medium text-ice-400 hover:text-ice-300"
                  >
                    {item.cta}
                    <ArrowRight className="h-3 w-3" />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      </motion.div>
    </AnimatePresence>
  )
}
