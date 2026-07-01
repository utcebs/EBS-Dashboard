// Lightweight markdown for AI output: #/##/### headings, **bold**, bold-only
// lines as gold section labels, `- `/`* ` bullets, and blank-line spacing.
function inline(text) {
  const parts = []
  const re = /\*\*(.+?)\*\*/g
  let last = 0, m, i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    parts.push(<strong key={i++} style={{ color: '#f4ead0', fontWeight: 700 }}>{m[1]}</strong>)
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

// "2026-06-30" -> "30 Jun 2026"
function prettyDate(iso) {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return iso
  const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][parseInt(m[2], 10) - 1]
  return `${parseInt(m[3], 10)} ${mo} ${m[1]}`
}

export default function MarkdownLite({ text }) {
  const lines = (text || '').split('\n')
  const out = []
  lines.forEach((raw, idx) => {
    const t = raw.trim()
    if (!t) { out.push(<div key={idx} style={{ height: 10 }} />); return }

    // # / ## / ### headings. A heading ending in a date = the doc title (big +
    // date chip). Any OTHER heading is treated as a section label (gold eyebrow),
    // so the model writing `## Headline` looks the same as `**Headline**`.
    const h = t.match(/^(#{1,3})\s+(.*)$/)
    if (h) {
      const dm = h[2].match(/^(.*?)\s*[–—-]\s*(\d{4}-\d{2}-\d{2})\s*$/)
      if (dm) {
        out.push(
          <div key={idx} style={{ fontSize: 18, fontWeight: 800, color: '#f4ead0', letterSpacing: 0.2, margin: idx === 0 ? '0 0 6px' : '16px 0 6px' }}>{inline(dm[1].trim())}</div>
        )
        out.push(
          <div key={idx + '-d'} style={{ display: 'inline-block', fontSize: 11.5, fontWeight: 600, color: '#c9b48a', background: 'rgba(230,201,148,0.10)', border: '1px solid rgba(212,184,123,0.25)', borderRadius: 8, padding: '3px 10px', letterSpacing: 0.4, marginBottom: 10 }}>{prettyDate(dm[2])}</div>
        )
      } else {
        out.push(
          <div key={idx} style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: '#e6cf94', margin: '18px 0 7px' }}>{inline(h[2])}</div>
        )
      }
      return
    }

    // A line that is ENTIRELY bold (e.g. **Headline**) → gold section label
    const sec = t.match(/^\*\*(.+?)\*\*:?$/)
    if (sec) {
      out.push(
        <div key={idx} style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: '#e6cf94', margin: '18px 0 7px' }}>
          {sec[1]}
        </div>
      )
      return
    }

    // Bullets
    if (/^[-*]\s+/.test(t)) {
      out.push(
        <div key={idx} style={{ display: 'flex', gap: 10, margin: '6px 0' }}>
          <span style={{ color: '#e6cf94', lineHeight: 1.55, flexShrink: 0 }}>•</span>
          <span style={{ lineHeight: 1.55 }}>{inline(t.replace(/^[-*]\s+/, ''))}</span>
        </div>
      )
      return
    }

    out.push(<div key={idx} style={{ margin: '4px 0', lineHeight: 1.6 }}>{inline(t)}</div>)
  })
  return <div style={{ fontSize: 14, color: '#e9e3d4' }}>{out}</div>
}
