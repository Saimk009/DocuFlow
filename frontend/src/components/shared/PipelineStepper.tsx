import { cn } from '@/lib/utils'

const STEPS = [
  { key: 'captured', label: 'Captured' },
  { key: 'ocr', label: 'OCR' },
  { key: 'classifying', label: 'Classifying' },
  { key: 'extracting', label: 'Extracting' },
  { key: 'validating', label: 'Validating' },
  { key: 'complete', label: 'Complete' },
]

function stepFromStatus(status: string): number {
  const i = STEPS.findIndex((s) => s.key === status)
  if (i >= 0) return i + 1
  // exception / rejected: keep at the validating stage
  return 5
}

/**
 * Six dots connected by gradient lines representing the processing pipeline.
 * `currentStep` is 1-indexed (1-6). Falls back to deriving from `status`.
 */
export function PipelineStepper({
  currentStep,
  status = 'captured',
  size = 'sm',
}: {
  currentStep?: number
  status?: string
  size?: 'sm' | 'md'
}) {
  const current = currentStep ?? stepFromStatus(status)
  const isException = status === 'exception' || status === 'rejected'
  const dot = size === 'md' ? 'h-3 w-3' : 'h-2.5 w-2.5'
  const line = size === 'md' ? 'h-0.5' : 'h-px'

  return (
    <div className="flex items-center">
      {STEPS.map((step, i) => {
        const stepNum = i + 1
        const completed = stepNum < current
        const isCurrent = stepNum === current
        const currentException = isCurrent && isException

        return (
          <div key={step.key} className="flex items-center">
            <div className="group relative flex items-center">
              <span
                className={cn(
                  'rounded-full border transition-colors',
                  dot,
                  completed && 'border-ice-500 bg-ice-500',
                  isCurrent &&
                    !currentException &&
                    'border-ice-500 bg-ice-500 shadow-[0_0_0_3px_rgba(56,189,248,0.25)] animate-pulse-soft',
                  currentException &&
                    'border-amber-500 bg-amber-500 shadow-[0_0_0_3px_rgba(245,158,11,0.25)] animate-pulse-soft',
                  !completed && !isCurrent && 'border-surface-muted bg-transparent',
                )}
              />
              <span
                className="pointer-events-none absolute -top-7 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded border border-surface-border bg-surface-800 px-1.5 py-0.5 text-[10px] text-surface-100 opacity-0 transition-opacity group-hover:opacity-100"
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <span
                className={cn('w-5 rounded-full', line)}
                style={{
                  background: completed
                    ? '#38BDF8'
                    : stepNum === current && !isException
                      ? 'linear-gradient(90deg, #38BDF8 0%, #2A3F5F 100%)'
                      : '#2A3F5F',
                }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
