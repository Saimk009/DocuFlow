import { Fragment, type ReactNode } from 'react'

/**
 * Minimal, dependency-free markdown renderer supporting a safe subset:
 * **bold**, *italic*, `code`, [links](url), and line breaks. All text is
 * rendered as plain React nodes (no dangerouslySetInnerHTML), so it is safe.
 */
const INLINE = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g

function renderInline(text: string, keyBase: string): ReactNode[] {
  const parts = text.split(INLINE).filter(Boolean)
  return parts.map((part, i) => {
    const key = `${keyBase}-${i}`
    if (part.startsWith('**') && part.endsWith('**'))
      return (
        <strong key={key} className="font-semibold text-surface-50">
          {part.slice(2, -2)}
        </strong>
      )
    if (part.startsWith('*') && part.endsWith('*'))
      return (
        <em key={key} className="italic">
          {part.slice(1, -1)}
        </em>
      )
    if (part.startsWith('`') && part.endsWith('`'))
      return (
        <code
          key={key}
          className="rounded bg-surface-900 px-1 py-0.5 font-mono text-[0.85em] text-ice-300"
        >
          {part.slice(1, -1)}
        </code>
      )
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (link)
      return (
        <a
          key={key}
          href={link[2]}
          target="_blank"
          rel="noreferrer"
          className="text-ice-400 underline"
        >
          {link[1]}
        </a>
      )
    return <Fragment key={key}>{part}</Fragment>
  })
}

export function Markdown({ content }: { content: string }) {
  const lines = content.split('\n')
  return (
    <div className="space-y-1 text-sm leading-relaxed text-surface-100">
      {lines.map((line, i) =>
        line.trim() === '' ? (
          <div key={i} className="h-2" />
        ) : (
          <p key={i}>{renderInline(line, String(i))}</p>
        ),
      )}
    </div>
  )
}
