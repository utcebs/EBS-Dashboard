import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Sparkles, X, RefreshCw } from 'lucide-react'
import { generateBriefing, getCachedBriefing } from '../aiClient'
import MarkdownLite from './MarkdownLite'

const GOLD = 'linear-gradient(135deg, #f3e2b8 0%, #e3c87f 46%, #c79a4e 100%)'
const AI_DOWN = 'Sorry, AI features are currently down. Please try again shortly.'

function relTime(iso) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  if (mins < 1440) return `${Math.round(mins / 60)} h ago`
  return `${Math.round(mins / 1440)} d ago`
}
const absTime = (iso) => new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })

export default function AiBriefing() {
  const [open, setOpen] = useState(false)
  const [opening, setOpening] = useState(false)   // fetching the cache (fast)
  const [loading, setLoading] = useState(false)   // generating via AI (slow)
  const [briefing, setBriefing] = useState(null)  // { content, provider, generated_at }
  const [error, setError] = useState('')

  // Generate a fresh briefing and store it (used for first-ever gen + Regenerate).
  async function generate() {
    setLoading(true); setError('')
    try {
      const today = new Date().toISOString().slice(0, 10)
      // Server generates AND caches it (works for guests too).
      const r = await generateBriefing(today)
      setBriefing({ content: r.text, provider: r.provider, generated_at: r.generated_at || new Date().toISOString() })
    } catch (e) {
      console.error('Daily briefing failed:', e)
      setError(AI_DOWN)
    }
    setLoading(false)
  }

  // Open: show the cached briefing if one exists; only generate if there is none.
  async function openIt() {
    setOpen(true); setError(''); setOpening(true)
    try {
      const cached = await getCachedBriefing()
      if (cached) { setBriefing(cached); setOpening(false) }
      else { setOpening(false); await generate() }
    } catch (e) {
      console.error('Briefing load failed:', e)
      setError(AI_DOWN); setOpening(false)
    }
  }

  const busy = opening || loading

  return (
    <>
      <button onClick={openIt}
        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all hover:brightness-105 whitespace-nowrap shadow-sm"
        style={{ background: GOLD, color: '#3a2a08' }}>
        <Sparkles size={16} /> Daily briefing
      </button>

      {open && createPortal(
        <div onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(8,6,12,0.66)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '6vh 16px', overflowY: 'auto' }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 640, background: '#1b1622', border: '1px solid rgba(212,184,123,0.28)', borderRadius: 18, boxShadow: '0 30px 80px -30px rgba(0,0,0,0.9)', color: '#f3efe7' }}>
            {/* header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, padding: '14px 16px', borderBottom: '1px solid rgba(212,184,123,0.16)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <span style={{ width: 30, height: 30, borderRadius: 9, background: GOLD, display: 'grid', placeContent: 'center', flexShrink: 0 }}><Sparkles size={16} color="#3a2a08" /></span>
                <div style={{ minWidth: 0 }}>
                  <strong style={{ letterSpacing: 0.2 }}>Daily Briefing</strong>
                  {briefing?.generated_at && (
                    <div title={absTime(briefing.generated_at)} style={{ fontSize: 11, color: 'rgba(245,230,194,0.5)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Updated {relTime(briefing.generated_at)}</div>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                <button onClick={generate} disabled={busy} title="Regenerate now"
                  style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '6px 9px', borderRadius: 9, cursor: busy ? 'default' : 'pointer', color: '#e6cf94', background: 'rgba(230,201,148,0.1)', border: '1px solid rgba(212,184,123,0.3)', opacity: busy ? 0.5 : 1, whiteSpace: 'nowrap' }}>
                  <RefreshCw size={13} className={loading ? 'ai-spin' : ''} /> Regenerate
                </button>
                <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: '#c9b48a', cursor: 'pointer', padding: 2 }}><X size={20} /></button>
              </div>
            </div>
            {/* body */}
            <div style={{ padding: 18 }}>
              {opening && <div style={{ color: '#c9b48a', fontSize: 13, padding: '8px 0' }}>Loading latest briefing…</div>}
              {loading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#c9b48a', padding: '24px 0', justifyContent: 'center' }}>
                  <span className="ai-spin" style={{ width: 22, height: 22, border: '2.5px solid rgba(230,201,148,0.25)', borderTopColor: '#e6cf94', borderRadius: '50%', display: 'inline-block' }} />
                  Reading the portfolio and writing your briefing…
                </div>
              )}
              {error && <div style={{ color: '#ff8a7a', fontSize: 14 }}>⚠ {error}</div>}
              {!busy && briefing && (
                <>
                  <MarkdownLite text={briefing.content} />
                  {briefing.provider === 'groq' && (
                    <div style={{ marginTop: 14, fontSize: 12, color: 'rgba(245,230,194,0.5)' }}>⚡ Generated via Groq backup — double-check specifics.</div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
      <style>{`@keyframes ai-spin{to{transform:rotate(360deg)}}.ai-spin{animation:ai-spin .8s linear infinite}`}</style>
    </>
  )
}
