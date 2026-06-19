import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Bell,
  Clock,
  GitBranch,
  Globe,
  GripVertical,
  PenLine,
  Plus,
  ScanText,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { api, API_PREFIX } from '@/lib/api'
import { cn } from '@/lib/utils'

type StepType =
  | 'http_request'
  | 'extract_text'
  | 'fill_field'
  | 'decision'
  | 'notify'
  | 'delay'

const STEP_TYPES: Array<{ type: StepType; label: string; Icon: LucideIcon }> = [
  { type: 'http_request', label: 'HTTP Request', Icon: Globe },
  { type: 'extract_text', label: 'Extract Text', Icon: ScanText },
  { type: 'fill_field', label: 'Fill Field', Icon: PenLine },
  { type: 'decision', label: 'Decision', Icon: GitBranch },
  { type: 'notify', label: 'Notify', Icon: Bell },
  { type: 'delay', label: 'Delay', Icon: Clock },
]

interface Step {
  id: string
  type: StepType
  config: Record<string, string>
}

function defaultStepConfig(type: StepType): Record<string, string> {
  switch (type) {
    case 'http_request':
      return { url: '', method: 'GET', headers: '', body: '' }
    case 'extract_text':
      return { field: '', regex: '' }
    case 'fill_field':
      return { field: '', value: '' }
    case 'decision':
      return { condition: '' }
    case 'notify':
      return { recipient: '', message: '' }
    case 'delay':
      return { seconds: '5' }
  }
}

const EVENT_TYPES = [
  'document.completed',
  'document.exception',
  'batch.created',
  'workflow.published',
]

export function NewRobotWizard({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [step, setStep] = useState(1)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [trigger, setTrigger] = useState<'manual' | 'schedule' | 'event'>('manual')
  const [frequency, setFrequency] = useState<'hourly' | 'daily' | 'weekly'>('daily')
  const [time, setTime] = useState('03:00')
  const [weekday, setWeekday] = useState('1')
  const [eventType, setEventType] = useState(EVENT_TYPES[0])
  const [steps, setSteps] = useState<Step[]>([])
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  function reset() {
    setStep(1)
    setName('')
    setDescription('')
    setTrigger('manual')
    setFrequency('daily')
    setTime('03:00')
    setWeekday('1')
    setEventType(EVENT_TYPES[0])
    setSteps([])
  }

  function buildCron(): string | null {
    if (trigger !== 'schedule') return null
    const [hh, mm] = time.split(':')
    if (frequency === 'hourly') return `0 * * * *`
    if (frequency === 'daily') return `${Number(mm)} ${Number(hh)} * * *`
    return `${Number(mm)} ${Number(hh)} * * ${weekday}`
  }

  const create = useMutation({
    mutationFn: () => {
      const definition: Record<string, unknown> = {
        steps: steps.map((s) => ({ type: s.type, label: stepLabel(s.type), ...s.config })),
      }
      if (trigger === 'event') definition.trigger = { event: eventType }
      return api.post(`${API_PREFIX}/robots`, {
        name: name.trim(),
        description: description.trim() || null,
        trigger_type: trigger,
        schedule_cron: buildCron(),
        definition_json: definition,
      })
    },
    onSuccess: () => {
      toast.success('Robot created')
      queryClient.invalidateQueries({ queryKey: ['robots'] })
      onOpenChange(false)
      reset()
    },
    onError: () => toast.error('Could not create robot'),
  })

  function addStep(type: StepType) {
    setSteps((prev) => [
      ...prev,
      { id: `s_${Date.now()}`, type, config: defaultStepConfig(type) },
    ])
  }
  function removeStep(id: string) {
    setSteps((prev) => prev.filter((s) => s.id !== id))
  }
  function updateStep(id: string, key: string, value: string) {
    setSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, config: { ...s.config, [key]: value } } : s)),
    )
  }
  function onDrop(target: number) {
    if (dragIndex === null || dragIndex === target) return
    setSteps((prev) => {
      const next = [...prev]
      const [moved] = next.splice(dragIndex, 1)
      next.splice(target, 0, moved)
      return next
    })
    setDragIndex(null)
  }

  const canNext1 = name.trim().length > 0
  const canSubmit = steps.length > 0 && canNext1

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) reset()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[560px] max-w-[94vw] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-surface-border bg-surface-700 shadow-xl">
          <div className="flex items-center justify-between border-b border-surface-border px-5 py-3.5">
            <Dialog.Title className="text-sm font-semibold text-surface-50">
              New Robot
            </Dialog.Title>
            <Dialog.Close className="rounded p-1 text-surface-muted hover:bg-surface-600 hover:text-surface-100">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-2 border-b border-surface-border px-5 py-3">
            {['Identity', 'Trigger', 'Steps'].map((label, i) => (
              <div key={label} className="flex items-center gap-2">
                <span
                  className={cn(
                    'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-medium',
                    step === i + 1
                      ? 'bg-ice-500 text-surface-900'
                      : step > i + 1
                        ? 'bg-ice-500/20 text-ice-400'
                        : 'bg-surface-600 text-surface-muted',
                  )}
                >
                  {i + 1}
                </span>
                <span
                  className={cn(
                    'text-xs',
                    step === i + 1 ? 'text-surface-50' : 'text-surface-muted',
                  )}
                >
                  {label}
                </span>
                {i < 2 && <span className="text-surface-border">·</span>}
              </div>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            {step === 1 && (
              <div className="space-y-4">
                <Labeled label="Robot name">
                  <input
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Invoice sync bot"
                    className="input"
                  />
                </Labeled>
                <Labeled label="Description">
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    placeholder="What does this robot do?"
                    className="input resize-none"
                  />
                </Labeled>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  {(['manual', 'schedule', 'event'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTrigger(t)}
                      className={cn(
                        'rounded-lg border px-3 py-2.5 text-sm capitalize transition-colors',
                        trigger === t
                          ? 'border-ice-500 bg-ice-500/10 text-ice-400'
                          : 'border-surface-border text-surface-muted hover:text-surface-100',
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                {trigger === 'schedule' && (
                  <div className="space-y-3 rounded-lg border border-surface-border bg-surface-800 p-4">
                    <Labeled label="Frequency">
                      <select
                        value={frequency}
                        onChange={(e) => setFrequency(e.target.value as typeof frequency)}
                        className="input"
                      >
                        <option value="hourly">Hourly</option>
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                      </select>
                    </Labeled>
                    {frequency === 'weekly' && (
                      <Labeled label="Day of week">
                        <select
                          value={weekday}
                          onChange={(e) => setWeekday(e.target.value)}
                          className="input"
                        >
                          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(
                            (d, i) => (
                              <option key={d} value={i}>
                                {d}
                              </option>
                            ),
                          )}
                        </select>
                      </Labeled>
                    )}
                    {frequency !== 'hourly' && (
                      <Labeled label="Time">
                        <input
                          type="time"
                          value={time}
                          onChange={(e) => setTime(e.target.value)}
                          className="input"
                        />
                      </Labeled>
                    )}
                    <p className="font-mono text-xs text-surface-muted">
                      cron: {buildCron()}
                    </p>
                  </div>
                )}

                {trigger === 'event' && (
                  <Labeled label="Event type">
                    <select
                      value={eventType}
                      onChange={(e) => setEventType(e.target.value)}
                      className="input"
                    >
                      {EVENT_TYPES.map((e) => (
                        <option key={e} value={e}>
                          {e}
                        </option>
                      ))}
                    </select>
                  </Labeled>
                )}

                {trigger === 'manual' && (
                  <p className="rounded-lg border border-surface-border bg-surface-800 p-3 text-xs text-surface-muted">
                    This robot runs only when triggered manually with “Run Now”.
                  </p>
                )}
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-1.5">
                  {STEP_TYPES.map((st) => (
                    <button
                      key={st.type}
                      onClick={() => addStep(st.type)}
                      className="flex items-center gap-1.5 rounded border border-surface-border px-2 py-1 text-xs text-surface-100 hover:border-ice-500/40"
                    >
                      <st.Icon className="h-3.5 w-3.5 text-ice-400" />
                      {st.label}
                    </button>
                  ))}
                </div>

                {steps.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-surface-border px-4 py-8 text-center text-sm text-surface-muted">
                    Add at least one step to build the automation.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {steps.map((s, i) => (
                      <div
                        key={s.id}
                        draggable
                        onDragStart={() => setDragIndex(i)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => onDrop(i)}
                        className="rounded-lg border border-surface-border bg-surface-800 p-3"
                      >
                        <div className="mb-2 flex items-center gap-2">
                          <GripVertical className="h-4 w-4 cursor-grab text-surface-muted" />
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-600 text-[10px] text-surface-100">
                            {i + 1}
                          </span>
                          <span className="text-sm font-medium text-surface-50">
                            {stepLabel(s.type)}
                          </span>
                          <button
                            onClick={() => removeStep(s.id)}
                            className="ml-auto rounded p-1 text-surface-muted hover:text-rose-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <StepFields step={s} update={updateStep} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-surface-border px-5 py-3">
            <button
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              disabled={step === 1}
              className="btn-ghost disabled:opacity-40"
            >
              Back
            </button>
            {step < 3 ? (
              <button
                onClick={() => setStep((s) => s + 1)}
                disabled={step === 1 && !canNext1}
                className="btn-primary"
              >
                Next
              </button>
            ) : (
              <button
                onClick={() => create.mutate()}
                disabled={!canSubmit || create.isPending}
                className="btn-primary"
              >
                <Plus className="h-4 w-4" />
                Create Robot
              </button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function stepLabel(type: StepType): string {
  return STEP_TYPES.find((s) => s.type === type)?.label ?? type
}

function Labeled({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1 block text-[10px] uppercase tracking-wide text-surface-muted">
        {label}
      </label>
      {children}
    </div>
  )
}

function StepFields({
  step,
  update,
}: {
  step: Step
  update: (id: string, key: string, value: string) => void
}) {
  const c = step.config
  const set = (k: string, v: string) => update(step.id, k, v)

  if (step.type === 'http_request')
    return (
      <div className="space-y-2">
        <div className="flex gap-2">
          <select
            value={c.method}
            onChange={(e) => set('method', e.target.value)}
            className="input w-24 text-xs"
          >
            {['GET', 'POST', 'PUT', 'DELETE'].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          <input
            value={c.url}
            onChange={(e) => set('url', e.target.value)}
            placeholder="https://api.example.com/endpoint"
            className="input font-mono text-xs"
          />
        </div>
        <input
          value={c.headers}
          onChange={(e) => set('headers', e.target.value)}
          placeholder='Headers (e.g. {"Authorization": "Bearer …"})'
          className="input font-mono text-xs"
        />
        <textarea
          value={c.body}
          onChange={(e) => set('body', e.target.value)}
          rows={2}
          placeholder="Request body"
          className="input resize-none font-mono text-xs"
        />
      </div>
    )

  if (step.type === 'extract_text')
    return (
      <div className="flex gap-2">
        <input
          value={c.field}
          onChange={(e) => set('field', e.target.value)}
          placeholder="field key"
          className="input font-mono text-xs"
        />
        <input
          value={c.regex}
          onChange={(e) => set('regex', e.target.value)}
          placeholder="regex pattern"
          className="input font-mono text-xs"
        />
      </div>
    )

  if (step.type === 'fill_field')
    return (
      <div className="flex gap-2">
        <input
          value={c.field}
          onChange={(e) => set('field', e.target.value)}
          placeholder="field key"
          className="input font-mono text-xs"
        />
        <input
          value={c.value}
          onChange={(e) => set('value', e.target.value)}
          placeholder="value template {{…}}"
          className="input font-mono text-xs"
        />
      </div>
    )

  if (step.type === 'decision')
    return (
      <input
        value={c.condition}
        onChange={(e) => set('condition', e.target.value)}
        placeholder="e.g. total_amount > 1000"
        className="input font-mono text-xs"
      />
    )

  if (step.type === 'notify')
    return (
      <div className="space-y-2">
        <input
          value={c.recipient}
          onChange={(e) => set('recipient', e.target.value)}
          placeholder="email or #slack-channel"
          className="input text-xs"
        />
        <textarea
          value={c.message}
          onChange={(e) => set('message', e.target.value)}
          rows={2}
          placeholder="Message"
          className="input resize-none text-xs"
        />
      </div>
    )

  return (
    <input
      type="number"
      value={c.seconds}
      onChange={(e) => set('seconds', e.target.value)}
      placeholder="seconds"
      className="input w-28 text-xs"
    />
  )
}
