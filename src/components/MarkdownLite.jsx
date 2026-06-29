import { Fragment } from 'react'

// Minimal markdown for AI output: **bold**, `- `/`* ` bullets, blank-line gaps.
function inline(text) {
  const parts = []
  const re = /\*\*(.+?)\*\*/g
  let last = 0, m, i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    parts.push(<strong key={i++} style={{ color: '#f0e6cf' }}>{m[1]}</strong>)
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

export default function MarkdownLite({ text }) {
  const lines = (text || '').split('\n')
  return (
    <div style={{ fontSize: 14, lineHeight: 1.6 }}>
      {lines.map((ln, i) => {
        const t = ln.trim()
        if (!t) return <div key={i} style={{ height: 8 }} />
        if (/^[-*]\s+/.test(t)) {
          return (
            <div key={i} style={{ display: 'flex', gap: 8, margin: '2px 0' }}>
              <span style={{ color: '#e6cf94' }}>•</span>
              <span>{inline(t.replace(/^[-*]\s+/, ''))}</span>
            </div>
          )
        }
        return <div key={i} style={{ margin: '2px 0' }}>{inline(t)}</div>
      })}
    </div>
  )
}
