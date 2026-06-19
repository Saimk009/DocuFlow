import { ScanLine } from 'lucide-react'

/**
 * Left-side branding panel with a pure-CSS/SVG animated "document flow"
 * illustration: documents stream along a rail through pipeline nodes.
 */
export function BrandPanel() {
  return (
    <div className="relative hidden overflow-hidden bg-surface-800 lg:flex lg:w-3/5 lg:flex-col lg:justify-between lg:p-12">
      {/* ambient gradient */}
      <div className="pointer-events-none absolute inset-0 opacity-40">
        <div className="absolute -left-20 top-1/4 h-80 w-80 rounded-full bg-ice-500/20 blur-3xl" />
        <div className="absolute -right-10 bottom-1/4 h-80 w-80 rounded-full bg-ai-500/20 blur-3xl" />
      </div>

      <div className="relative flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded bg-gradient-to-br from-ice-500 to-ai-500">
          <ScanLine className="h-5 w-5 text-surface-900" />
        </div>
        <span className="text-lg font-semibold tracking-tight text-surface-50">
          Docu<span className="text-ice-400">Flow</span>
        </span>
      </div>

      <div className="relative">
        <h1 className="max-w-md text-4xl font-semibold leading-tight tracking-tight text-surface-50">
          Intelligence from every document.
        </h1>
        <p className="mt-4 max-w-md text-surface-100/70">
          Capture, classify, extract, and route — a surgical pipeline for
          enterprise document operations.
        </p>

        <FlowIllustration />
      </div>

      <div className="relative flex gap-8">
        <Stat value="5B+" label="docs processed" />
        <Stat value="99.2%" label="uptime" />
        <Stat value="<2s" label="avg extraction" />
      </div>
    </div>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="font-mono text-2xl font-medium text-ice-400">{value}</div>
      <div className="text-xs uppercase tracking-wide text-surface-muted">
        {label}
      </div>
    </div>
  )
}

const NODES = ['Capture', 'Classify', 'Extract', 'Validate']

function FlowIllustration() {
  return (
    <div className="mt-12 max-w-lg">
      <div className="relative">
        {/* the rail */}
        <div className="flow-rail" />
        {/* traveling document chips */}
        <div className="pointer-events-none absolute -top-2 left-0 right-0 h-6">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="absolute top-0 h-4 w-3 rounded-sm border border-ice-500/50 bg-surface-700"
              style={{
                animation: `doc-travel 4s linear infinite`,
                animationDelay: `${i * 1.3}s`,
              }}
            />
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        {NODES.map((node, i) => (
          <div key={node} className="flex flex-col items-center gap-2">
            <div
              className="h-2.5 w-2.5 rounded-full bg-ice-500"
              style={{
                animation: 'pulse-soft 2s ease-in-out infinite',
                animationDelay: `${i * 0.4}s`,
              }}
            />
            <span className="font-mono text-[10px] uppercase tracking-wider text-surface-muted">
              {node}
            </span>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes doc-travel {
          0% { left: 0%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { left: 100%; opacity: 0; }
        }
      `}</style>
    </div>
  )
}
