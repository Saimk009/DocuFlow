import { useMemo } from 'react'
import { cn } from '@/lib/utils'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Lightweight JSON syntax highlighter — no external dependency.
 * Tokenizes keys/strings/numbers/booleans/null and {{placeholders}} via regex and
 * wraps each in a colored span.
 */
function highlightJson(code: string): string {
  let html = escapeHtml(code)

  html = html.replace(
    /("(?:\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(?:true|false)\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let color = '#FBBF24' // number — amber
      if (/^"/.test(match)) {
        color = /:\s*$/.test(match) ? '#67E8F9' : '#34D399' // key ice / string emerald
      } else if (/^(true|false)$/.test(match)) {
        color = '#A78BFA' // boolean — violet
      } else if (match === 'null') {
        color = '#A78BFA'
      }
      return `<span style="color:${color}">${match}</span>`
    },
  )

  // Highlight {{field_key}} interpolation tokens in ice, even inside strings.
  html = html.replace(
    /(\{\{[^}]+\}\})/g,
    '<span style="color:#38BDF8;font-weight:600">$1</span>',
  )

  return html
}

export function CodeBlock({
  code,
  className,
  maxHeight = '420px',
}: {
  code: string | unknown
  className?: string
  maxHeight?: string
}) {
  const text = useMemo(() => {
    if (typeof code === 'string') return code
    try {
      return JSON.stringify(code, null, 2)
    } catch {
      return String(code)
    }
  }, [code])

  const html = useMemo(() => highlightJson(text), [text])

  return (
    <pre
      className={cn(
        'overflow-auto rounded-lg border border-surface-border bg-surface-900 p-4 font-mono text-xs leading-relaxed text-surface-100',
        className,
      )}
      style={{ maxHeight }}
    >
      <code dangerouslySetInnerHTML={{ __html: html }} />
    </pre>
  )
}
