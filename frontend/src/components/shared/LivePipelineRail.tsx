import { Fragment } from 'react'
import type { StageCounts } from '@/hooks/usePipelineCounts'

const STAGES: Array<{ key: string; label: string }> = [
  { key: 'captured', label: 'Captured' },
  { key: 'ocr', label: 'OCR' },
  { key: 'classifying', label: 'Classifying' },
  { key: 'extracting', label: 'Extracting' },
  { key: 'validating', label: 'Validating' },
  { key: 'complete', label: 'Complete' },
]

export function LivePipelineRail({ counts }: { counts: StageCounts }) {
  return (
    <div className="card p-5">
      <h2 className="mb-5 text-sm font-medium text-surface-100">Pipeline</h2>
      <div className="flex items-center">
        {STAGES.map((stage, i) => (
          <Fragment key={stage.key}>
            <div className="flex flex-col items-center gap-1.5">
              <div className="flex h-14 w-14 flex-col items-center justify-center rounded-lg border border-surface-border bg-surface-900">
                <span className="font-mono text-lg font-medium text-ice-400">
                  {counts[stage.key] ?? 0}
                </span>
              </div>
              <span className="text-[10px] uppercase tracking-wide text-surface-muted">
                {stage.label}
              </span>
            </div>
            {i < STAGES.length - 1 && (
              <div className="mx-1 mb-5 h-0.5 flex-1 overflow-hidden rounded-full">
                <div
                  className="h-full w-full"
                  style={{
                    backgroundImage:
                      'linear-gradient(90deg, #1F3050 0%, #38BDF8 50%, #1F3050 100%)',
                    backgroundSize: '200% 100%',
                    animation: 'flow-rail 3s linear infinite',
                  }}
                />
              </div>
            )}
          </Fragment>
        ))}
      </div>
    </div>
  )
}
