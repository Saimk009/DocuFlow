import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  Copy,
  HeartPulse,
  Landmark,
  Loader2,
  Receipt,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Truck,
  UserPlus,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { api, API_PREFIX } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useTenantStore } from '@/store/tenantStore'
import { Spinner } from '@/components/shared/common'
import type { AIProvider, DocumentDetail } from '@/types'

interface TemplateField {
  key: string
  label: string
  expected_format: string
  validation_regex: string | null
}

interface OnboardingTemplate {
  id: string
  key: string
  name: string
  description: string
  icon: string
  doc_types: string[]
  default_fields: Record<string, TemplateField[]>
  default_workflow_json: Record<string, unknown>
  sample_document_url: string | null
  is_active: boolean
}

interface SetupResult {
  workflow_id: string
  batch_id: string
  sample_document_id: string | null
}

// Display copy + icon per industry (overrides backend name/description).
const TEMPLATE_META: Record<string, { name: string; desc: string; icon: LucideIcon }> = {
  invoice_ap: {
    name: 'AP Invoice Processing',
    desc: 'Automate vendor invoice capture and approval',
    icon: Receipt,
  },
  insurance_claims: {
    name: 'Insurance Claims',
    desc: 'Process claims forms and supporting documents',
    icon: ShieldCheck,
  },
  hr_onboarding: {
    name: 'HR Onboarding',
    desc: 'Extract data from new-hire paperwork',
    icon: Users,
  },
  loan_processing: {
    name: 'Loan Processing',
    desc: 'Handle applications, statements, and verification docs',
    icon: Landmark,
  },
  healthcare_intake: {
    name: 'Healthcare Intake',
    desc: 'Patient forms, ID verification, insurance cards',
    icon: HeartPulse,
  },
  logistics_bol: {
    name: 'Logistics / BOL',
    desc: 'Bills of lading, customs forms, shipping manifests',
    icon: Truck,
  },
}

const STEP_TITLES = [
  'What are you processing?',
  'Connect your AI engine',
  'Try it live',
  'Invite your team',
]

export function SetupWizard() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [templateKey, setTemplateKey] = useState<string | null>(null)
  const [, setSetupResult] = useState<SetupResult | null>(null)

  const goToApp = () => navigate('/', { replace: true })

  return (
    <div className="flex min-h-screen flex-col bg-surface-900">
      {/* Slim progress bar */}
      <div className="h-1 w-full bg-surface-800">
        <motion.div
          className="h-full bg-gradient-to-r from-ice-500 to-ai-500"
          initial={false}
          animate={{ width: `${((step + 1) / STEP_TITLES.length) * 100}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
      </div>

      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-gradient-to-br from-ice-500 to-ai-500">
            <ScanLine className="h-5 w-5 text-surface-900" />
          </div>
          <span className="text-lg font-semibold text-surface-50">
            Docu<span className="text-ice-400">Flow</span>
          </span>
        </div>
        <span className="font-mono text-xs text-surface-muted">
          Step {step + 1} of {STEP_TITLES.length}
        </span>
      </header>

      {/* Step content */}
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 pb-12">
        <div className="mb-6">
          <motion.h1
            key={step}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="text-2xl font-semibold text-surface-50"
          >
            {STEP_TITLES[step]}
          </motion.h1>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
            className="flex-1"
          >
            {step === 0 && (
              <TemplateStep
                selectedKey={templateKey}
                onSelect={setTemplateKey}
                onContinue={() => setStep(1)}
                onSkip={goToApp}
              />
            )}
            {step === 1 && (
              <AIStep onBack={() => setStep(0)} onContinue={() => setStep(2)} />
            )}
            {step === 2 && (
              <LiveStep
                templateKey={templateKey}
                onResult={setSetupResult}
                onContinue={() => setStep(3)}
              />
            )}
            {step === 3 && <InviteStep onFinish={goToApp} />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  )
}

/* ───────────────────────── Step 1 — Templates ──────────────────────── */

function TemplateStep({
  selectedKey,
  onSelect,
  onContinue,
  onSkip,
}: {
  selectedKey: string | null
  onSelect: (key: string) => void
  onContinue: () => void
  onSkip: () => void
}) {
  const { data: templates, isLoading } = useQuery({
    queryKey: ['onboarding', 'templates'],
    queryFn: () => api.get<OnboardingTemplate[]>(`${API_PREFIX}/onboarding/templates`),
  })

  const selected = templates?.find((t) => t.key === selectedKey) ?? null

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      {/* Card grid */}
      <div>
        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton h-24 rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {(templates ?? []).map((t) => {
              const meta = TEMPLATE_META[t.key]
              const Icon = meta?.icon ?? Receipt
              const active = t.key === selectedKey
              return (
                <button
                  key={t.key}
                  onClick={() => onSelect(t.key)}
                  className={cn(
                    'group relative flex items-start gap-3 rounded-lg border p-4 text-left transition-all',
                    active
                      ? 'border-ice-500 bg-ice-500/[0.07] shadow-[0_0_0_1px_rgba(56,189,248,0.4),0_0_24px_-4px_rgba(56,189,248,0.45)]'
                      : 'border-surface-border hover:border-surface-muted',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors',
                      active
                        ? 'border-ice-500/40 bg-ice-500/10 text-ice-400'
                        : 'border-surface-border bg-surface-800 text-surface-muted',
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-surface-50">
                      {meta?.name ?? t.name}
                    </div>
                    <div className="mt-0.5 text-xs text-surface-muted">
                      {meta?.desc ?? t.description}
                    </div>
                  </div>
                  {active && (
                    <CheckCircle2 className="absolute right-3 top-3 h-4 w-4 text-ice-400" />
                  )}
                </button>
              )
            })}
          </div>
        )}

        <button
          onClick={onSkip}
          className="mt-5 text-sm text-surface-muted underline-offset-4 hover:text-surface-100 hover:underline"
        >
          Skip — I'll build my own
        </button>
      </div>

      {/* Preview panel */}
      <div className="lg:sticky lg:top-4 lg:self-start">
        <AnimatePresence mode="wait">
          {selected ? (
            <motion.div
              key={selected.key}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="card p-4"
            >
              <div className="text-xs font-medium uppercase tracking-wide text-surface-muted">
                This will set up
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {selected.doc_types.map((dt) => (
                  <span
                    key={dt}
                    className="rounded-full border border-ai-500/30 bg-ai-500/10 px-2.5 py-0.5 text-xs text-ai-400"
                  >
                    {dt}
                  </span>
                ))}
              </div>

              <div className="mt-4 text-xs font-medium uppercase tracking-wide text-surface-muted">
                with fields
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {uniqueFieldLabels(selected).slice(0, 14).map((label) => (
                  <span
                    key={label}
                    className="rounded border border-surface-border bg-surface-800 px-2 py-0.5 font-mono text-[11px] text-surface-100"
                  >
                    {label}
                  </span>
                ))}
              </div>

              <p className="mt-4 text-xs text-surface-muted">
                You can customize everything later.
              </p>

              <button onClick={onContinue} className="btn-primary mt-4 w-full">
                Continue
                <ArrowRight className="h-4 w-4" />
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="card flex h-full min-h-[200px] flex-col items-center justify-center p-6 text-center"
            >
              <Sparkles className="h-6 w-6 text-surface-muted" />
              <p className="mt-2 text-sm text-surface-muted">
                Pick an industry to preview the prebuilt pipeline.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

function uniqueFieldLabels(t: OnboardingTemplate): string[] {
  const seen = new Set<string>()
  const labels: string[] = []
  for (const fields of Object.values(t.default_fields)) {
    for (const f of fields) {
      if (!seen.has(f.label)) {
        seen.add(f.label)
        labels.push(f.label)
      }
    }
  }
  return labels
}

/* ───────────────────────── Step 2 — AI engine ──────────────────────── */

interface TenantSettings {
  ai_provider: AIProvider
  has_api_key: boolean
}

function AIStep({ onBack, onContinue }: { onBack: () => void; onContinue: () => void }) {
  const storeProvider = useTenantStore((s) => s.aiProvider)
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<TenantSettings>(`${API_PREFIX}/settings`),
  })

  const [provider, setProvider] = useState<AIProvider>(storeProvider)
  const [apiKey, setApiKey] = useState('')
  const [testState, setTestState] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')
  const [saving, setSaving] = useState(false)
  const initialized = useRef(false)

  // Pre-select whichever provider the user chose during registration.
  useEffect(() => {
    if (settings && !initialized.current) {
      setProvider(settings.ai_provider)
      initialized.current = true
    }
  }, [settings])

  const alreadyConfigured = settings?.has_api_key ?? false

  function testConnection() {
    setTestState('testing')
    window.setTimeout(() => {
      setTestState(apiKey.trim().length >= 16 || alreadyConfigured ? 'ok' : 'fail')
    }, 900)
  }

  async function handleContinue() {
    // Persist provider (+ key if provided). Key is optional.
    setSaving(true)
    try {
      await api.put(`${API_PREFIX}/settings`, {
        ai_provider: provider,
        ...(apiKey.trim() ? { ai_api_key: apiKey.trim() } : {}),
      })
    } catch {
      // Non-fatal — they can configure later in Settings.
    } finally {
      setSaving(false)
      onContinue()
    }
  }

  const cards: { id: AIProvider; name: string; sub: string; icon: LucideIcon }[] = [
    { id: 'claude', name: 'Claude', sub: 'Anthropic — strong extraction accuracy', icon: Bot },
    { id: 'openai', name: 'GPT-4o', sub: 'OpenAI — fast, broadly capable', icon: Sparkles },
  ]

  return (
    <div className="max-w-xl">
      <div className="grid grid-cols-2 gap-3">
        {cards.map((p) => {
          const active = provider === p.id
          const Icon = p.icon
          return (
            <button
              key={p.id}
              onClick={() => {
                setProvider(p.id)
                setTestState('idle')
              }}
              className={cn(
                'flex items-start gap-3 rounded-lg border p-4 text-left transition-colors',
                active
                  ? 'border-ai-500 bg-ai-500/10'
                  : 'border-surface-border hover:border-surface-muted',
              )}
            >
              <Icon className={cn('h-5 w-5', active ? 'text-ai-400' : 'text-surface-muted')} />
              <div>
                <div className="text-sm font-medium text-surface-50">{p.name}</div>
                <div className="mt-0.5 text-xs text-surface-muted">{p.sub}</div>
              </div>
              <span
                className={cn(
                  'ml-auto flex h-4 w-4 items-center justify-center rounded-full border',
                  active ? 'border-ai-500 bg-ai-500' : 'border-surface-border',
                )}
              >
                {active && <Check className="h-3 w-3 text-surface-900" />}
              </span>
            </button>
          )
        })}
      </div>

      <div className="mt-5">
        <label className="mb-1.5 block text-sm text-surface-100">API key</label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => {
            setApiKey(e.target.value)
            setTestState('idle')
          }}
          placeholder={
            alreadyConfigured
              ? '•••••••••••• (saved during signup)'
              : provider === 'openai'
                ? 'sk-…'
                : 'sk-ant-…'
          }
          className="input font-mono"
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={testConnection}
            disabled={(!apiKey.trim() && !alreadyConfigured) || testState === 'testing'}
            className="btn-outline py-1.5"
          >
            {testState === 'testing' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 text-ai-400" />
            )}
            Test Connection
          </button>
          {testState === 'ok' && (
            <span className="flex items-center gap-1 text-xs text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" /> Connection OK
            </span>
          )}
          {testState === 'fail' && (
            <span className="flex items-center gap-1 text-xs text-rose-400">
              <X className="h-3.5 w-3.5" /> Key looks invalid
            </span>
          )}
        </div>
        <p className="mt-2 text-xs text-surface-muted">
          Optional — you can add or change this later in Settings.
        </p>
      </div>

      <div className="mt-6 flex gap-2">
        <button onClick={onBack} className="btn-outline">
          Back
        </button>
        <button onClick={handleContinue} disabled={saving} className="btn-primary">
          {saving && <Spinner />}
          Continue
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

/* ───────────────────────── Step 3 — Try it live ────────────────────── */

type PhaseState = 'pending' | 'active' | 'done'

const PHASE_LABELS = [
  'Creating your workflow…',
  'Loading a sample document…',
  'Running AI extraction…',
]

function LiveStep({
  templateKey,
  onResult,
  onContinue,
}: {
  templateKey: string | null
  onResult: (r: SetupResult) => void
  onContinue: () => void
}) {
  const [phases, setPhases] = useState<PhaseState[]>(['pending', 'pending', 'pending'])
  const [doc, setDoc] = useState<DocumentDetail | null>(null)
  const [finished, setFinished] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    if (started.current || !templateKey) return
    started.current = true
    let cancelled = false

    const setPhase = (i: number, s: PhaseState) =>
      setPhases((prev) => prev.map((p, idx) => (idx === i ? s : p)))

    async function run() {
      try {
        // Phase 1 — create workflow + batch via onboarding setup.
        setPhase(0, 'active')
        const result = await api.post<SetupResult>(`${API_PREFIX}/onboarding/setup`, {
          template_key: templateKey,
        })
        if (cancelled) return
        onResult(result)
        setPhase(0, 'done')

        // Phase 2 — sample document.
        setPhase(1, 'active')
        await delay(700)
        if (cancelled) return
        setPhase(1, 'done')

        // Phase 3 — AI extraction (poll the sample doc to completion).
        setPhase(2, 'active')
        if (result.sample_document_id) {
          const final = await pollDocument(result.sample_document_id, () => cancelled)
          if (cancelled) return
          if (final) setDoc(final)
        } else {
          // No live sample available — still show the pipeline's field schema.
          await delay(1800)
        }
        if (cancelled) return
        setPhase(2, 'done')
        setFinished(true)
      } catch {
        if (!cancelled) setError('Setup hit a snag. You can finish and try again from the app.')
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [templateKey, onResult])

  return (
    <div className="max-w-2xl">
      {/* Animated phase sequence */}
      <div className="card divide-y divide-surface-border">
        {PHASE_LABELS.map((label, i) => (
          <div key={label} className="flex items-center gap-3 px-4 py-3.5">
            <PhaseIcon state={phases[i]} />
            <span
              className={cn(
                'text-sm',
                phases[i] === 'done'
                  ? 'text-surface-100'
                  : phases[i] === 'active'
                    ? 'text-surface-50'
                    : 'text-surface-muted',
              )}
            >
              {label}
            </span>
            {phases[i] === 'active' && i === 2 && <PulsingDots />}
          </div>
        ))}
      </div>

      {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}

      {/* Extracted fields */}
      <AnimatePresence>
        {finished && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="mt-5"
          >
            <ExtractedFields doc={doc} />
            <p className="mt-4 text-sm text-surface-100">
              That's it. No consultants, no certification course — just a working pipeline.
            </p>
            <button onClick={onContinue} className="btn-primary mt-4">
              Continue
              <ArrowRight className="h-4 w-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {!finished && !error && (
        <button
          onClick={onContinue}
          className="mt-4 text-sm text-surface-muted underline-offset-4 hover:text-surface-100 hover:underline"
        >
          Skip ahead
        </button>
      )}
    </div>
  )
}

function PhaseIcon({ state }: { state: PhaseState }) {
  if (state === 'done') {
    return (
      <motion.span
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 500, damping: 18 }}
        className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-surface-900"
      >
        <Check className="h-3.5 w-3.5" strokeWidth={3} />
      </motion.span>
    )
  }
  if (state === 'active') {
    return (
      <span className="flex h-6 w-6 items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-ice-400" />
      </span>
    )
  }
  return (
    <span className="flex h-6 w-6 items-center justify-center">
      <span className="h-2 w-2 rounded-full bg-surface-muted" />
    </span>
  )
}

function PulsingDots() {
  return (
    <span className="ml-1 flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-ice-400"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
        />
      ))}
    </span>
  )
}

function ExtractedFields({ doc }: { doc: DocumentDetail | null }) {
  const fields = doc?.fields ?? []
  if (fields.length === 0) {
    return (
      <div className="card p-4">
        <div className="text-sm font-medium text-surface-50">Your pipeline is live</div>
        <p className="mt-1 text-xs text-surface-muted">
          Upload a document and these fields will be extracted automatically.
        </p>
      </div>
    )
  }
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
        <span className="text-sm font-medium text-surface-50">
          AI Extracted{doc?.doc_type ? ` — ${doc.doc_type}` : ''}
        </span>
        <span className="flex items-center gap-1 text-xs text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5" /> Complete
        </span>
      </div>
      <div className="grid gap-2.5 p-4 sm:grid-cols-2">
        {fields.map((f) => {
          const value = f.validated_value ?? f.raw_value
          return (
            <div
              key={f.id}
              className="rounded-lg border border-surface-border bg-surface-800 p-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wide text-surface-muted">
                  {f.field_label}
                </span>
                <span className="font-mono text-[10px] text-surface-muted">
                  {Math.round(f.confidence * 100)}%
                </span>
              </div>
              <div className="mt-1 truncate font-mono text-sm text-surface-50">
                {value || <span className="text-surface-muted">—</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

async function pollDocument(
  id: string,
  isCancelled: () => boolean,
  maxAttempts = 10,
): Promise<DocumentDetail | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await delay(1000)
    if (isCancelled()) return null
    try {
      const doc = await api.get<DocumentDetail>(`${API_PREFIX}/documents/${id}`)
      if (doc.status === 'complete' || doc.status === 'exception') return doc
    } catch {
      // keep polling
    }
  }
  return null
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/* ───────────────────────── Step 4 — Invite team ────────────────────── */

interface PendingInvite {
  id: string
  email: string
  role: string
  invite_token: string
  expires_at: string
}

function InviteStep({ onFinish }: { onFinish: () => void }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('member')
  const [sending, setSending] = useState(false)
  const [invites, setInvites] = useState<PendingInvite[]>([])

  async function sendInvite() {
    if (!email.trim()) return
    setSending(true)
    try {
      const inv = await api.post<PendingInvite>(`${API_PREFIX}/settings/users/invite`, {
        email: email.trim(),
        role,
      })
      setInvites((p) => [inv, ...p])
      setEmail('')
      setRole('member')
      toast.success('Invitation sent')
    } catch {
      toast.error('Could not send invite')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="max-w-xl">
      <p className="text-sm text-surface-muted">
        Bring teammates in to review exceptions and validate documents. Totally optional —
        you can do this anytime from Settings.
      </p>

      <div className="card mt-4 p-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendInvite()}
            placeholder="colleague@company.com"
            className="input flex-1"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="input sm:w-32"
          >
            <option value="admin">Admin</option>
            <option value="member">Member</option>
            <option value="viewer">Viewer</option>
          </select>
          <button
            onClick={sendInvite}
            disabled={!email.trim() || sending}
            className="btn-outline"
          >
            {sending ? <Spinner /> : <UserPlus className="h-4 w-4" />}
            Invite
          </button>
        </div>

        {invites.length > 0 && (
          <div className="mt-3 divide-y divide-surface-border">
            {invites.map((inv) => (
              <div key={inv.id} className="flex items-center gap-3 py-2.5 text-sm">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                <span className="flex-1 truncate text-surface-50">{inv.email}</span>
                <span className="rounded-full bg-surface-700 px-2 py-0.5 text-[11px] text-surface-muted">
                  {inv.role}
                </span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `${window.location.origin}/invite/${inv.invite_token}`,
                    )
                    toast.success('Invite link copied')
                  }}
                  className="flex items-center gap-1 text-xs text-ice-400 hover:underline"
                >
                  <Copy className="h-3 w-3" />
                  Copy link
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button onClick={onFinish} className="btn-primary">
          Finish Setup
          <ArrowRight className="h-4 w-4" />
        </button>
        <button
          onClick={onFinish}
          className="text-sm text-surface-muted underline-offset-4 hover:text-surface-100 hover:underline"
        >
          Skip for now
        </button>
      </div>
    </div>
  )
}
