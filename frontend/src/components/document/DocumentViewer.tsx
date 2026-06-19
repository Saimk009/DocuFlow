import { useState } from 'react'
import { Bot, Download, FileText, Minus, Plus, Sparkles } from 'lucide-react'
import { useTenantStore } from '@/store/tenantStore'
import { Mono } from '@/components/shared/common'
import type { DocumentDetail } from '@/types'

export function DocumentViewer({ document: doc }: { document: DocumentDetail }) {
  const aiProvider = useTenantStore((s) => s.aiProvider)
  const [zoom, setZoom] = useState(100)

  const isImage = ['png', 'jpg', 'jpeg', 'tif', 'tiff'].includes(
    doc.file_type.toLowerCase(),
  )
  const providerLabel = aiProvider === 'openai' ? 'GPT-4o' : 'Claude'

  return (
    <div className="card flex h-full flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b border-surface-border px-4 py-2.5">
        <div className="flex items-center gap-1.5 text-xs text-surface-muted">
          <FileText className="h-4 w-4 text-ice-400" />
          <Mono>
            {doc.page_count || 1} page{(doc.page_count || 1) > 1 ? 's' : ''}
          </Mono>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setZoom((z) => Math.max(25, z - 25))}
            className="rounded p-1 text-surface-muted hover:bg-surface-600 hover:text-surface-100"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <Mono className="w-12 text-center text-xs text-surface-100">{zoom}%</Mono>
          <button
            onClick={() => setZoom((z) => Math.min(300, z + 25))}
            className="rounded p-1 text-surface-muted hover:bg-surface-600 hover:text-surface-100"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <span className="min-w-0 flex-1 truncate text-sm text-surface-50" title={doc.filename}>
          {doc.filename}
        </span>
        {doc.file_url && (
          <a
            href={doc.file_url}
            download={doc.filename}
            target="_blank"
            rel="noreferrer"
            className="btn-outline py-1"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </a>
        )}
      </div>

      {/* Display area */}
      <div className="flex flex-1 items-start justify-center overflow-auto bg-surface-900 p-4">
        {doc.file_url && isImage ? (
          <img
            src={doc.file_url}
            alt={doc.filename}
            style={{ width: `${zoom}%` }}
            className="rounded border border-surface-border transition-[width]"
          />
        ) : doc.file_url ? (
          <iframe
            src={doc.file_url}
            title={doc.filename}
            className="h-full w-full rounded border border-surface-border"
          />
        ) : doc.ocr_text ? (
          <pre className="h-full w-full overflow-auto whitespace-pre-wrap rounded bg-surface-800 p-4 font-mono text-xs text-surface-100">
            {doc.ocr_text}
          </pre>
        ) : (
          <p className="text-sm text-surface-muted">Preview unavailable</p>
        )}
      </div>

      {/* AI chip */}
      <div className="flex items-center gap-1.5 border-t border-surface-border px-4 py-2">
        <Sparkles className="h-3.5 w-3.5 text-ai-400" />
        <span className="text-xs text-surface-muted">
          Powered by AI —{' '}
          <span className="inline-flex items-center gap-1 text-ai-400">
            <Bot className="h-3 w-3" />
            {providerLabel}
          </span>
        </span>
      </div>
    </div>
  )
}
