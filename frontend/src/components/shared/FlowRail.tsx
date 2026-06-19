import { cn } from '@/lib/utils'

const STAGES = ['Capture', 'OCR', 'Classify', 'Extract', 'Validate', 'Complete']

/**
 * The signature "flow rail": a thin animated gradient bar with pipeline stage
 * markers, shown at the top of document-processing pages.
 */
export function FlowRail({
  activeStage,
  className,
}: {
  activeStage?: string
  className?: string
}) {
  return (
    <div className={cn('w-full', className)}>
      <div className="flow-rail" />
      <div className="mt-1.5 flex items-center justify-between px-0.5">
        {STAGES.map((stage) => {
          const active =
            activeStage && stage.toLowerCase() === activeStage.toLowerCase()
          return (
            <span
              key={stage}
              className={cn(
                'font-mono text-[10px] uppercase tracking-wider transition-colors',
                active ? 'text-ice-400' : 'text-surface-muted',
              )}
            >
              {stage}
            </span>
          )
        })}
      </div>
    </div>
  )
}
