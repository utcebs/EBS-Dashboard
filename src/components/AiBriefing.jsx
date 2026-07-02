import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Sparkles, X, RefreshCw } from 'lucide-react'
import { generateBriefing, getCachedBriefing } from '../aiClient'
import { lockBackground, unlockBackground } from '../overlay'
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
const localToday = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` }

export default function AiBriefing({ isAdmin }) {
  const [open, setOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(true) // initial load / auto date-check
  const [loading, setLoading] = useState(false)      // admin manual regenerate
  const [briefing, setBriefing] = useState(null)     // { content, provider, generated_at }
  const [error, setError] = useState('')

  // On entry: show the cached briefing, and if it isn't today's, refresh it in
  // the background. The server generates today's briefing only once (shared by
  // everyone), so this can't stampede or be abused.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const cached = await getCachedBriefing()
        if (cached && !cancelled) setBriefing(cached)
        const today = localToday()
        const cachedDay = cached?.briefing_date || (cached?.generated_at ? cached.generated_at.slice(0, 10) : null)
        if (!cached || cachedDay !== today) {
          const r = await generateBriefing(today, false) // auto — server de-dupes per day
          if (!cancelled) setBriefing({ content: r.text, provider: r.provider, generated_at: r.generated_at || new Date().toISOString() })
        }
      } catch (e) {
        console.error('Briefing auto-refresh failed:', e)
      } finally {
        if (!cancelled) setRefreshing(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // While the modal is open, freeze the dashboard behind it (no arrow-key slide
  // navigation, no background scroll).
  useEffect(() => {
    if (!open) return
    lockBackground()
    return () => unlockBackground()
  }, [open])

  // Admin-only manual regenerate (server verifies the admin token).
  async function regenerate() {
    setLoading(true); setError('')
    try {
      const r = await generateBriefing(localToday(), true)
      setBriefing({ content: r.text, provider: r.provider, generated_at: r.generated_at || new Date().toISOString() })
    } catch (e) {
      console.error('Regenerate failed:', e)
      setError(AI_DOWN)
    }
    setLoading(false)
  }

  return (
    <>
      <button onClick={() => { setOpen(true); setError('') }}
        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all hover:brightness-105 whitespace-nowrap shadow-sm"
        style={{ background: GOLD, color: '#3a2a08' }}>
        <Sparkles size={16} /> Daily briefing
      </button>

      {open && createPortal(
        <div onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(8,6,12,0.66)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '6vh 16px', overflowY: 'auto', overscrollBehavior: 'contain' }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 640, maxHeight: '85vh', display: 'flex', flexDirection: 'column', background: '#1b1622', border: '1px solid rgba(212,184,123,0.28)', borderRadius: 18, boxShadow: '0 30px 80px -30px rgba(0,0,0,0.9)', color: '#f3efe7' }}>
            {/* header */}
            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, padding: '14px 16px', borderBottom: '1px solid rgba(212,184,123,0.16)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <span style={{ width: 30, height: 30, borderRadius: 9, background: GOLD, display: 'grid', placeContent: 'center', flexShrink: 0 }}><Sparkles size={16} color="#3a2a08" /></span>
                <div style={{ minWidth: 0 }}>
                  <strong style={{ letterSpacing: 0.2 }}>Daily Briefing</strong>
                  {briefing?.generated_at && (
                    <div title={absTime(briefing.generated_at)} style={{ fontSize: 11, color: 'rgba(245,230,194,0.5)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {refreshing ? 'Refreshing…' : `Updated ${relTime(briefing.generated_at)}`}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                {isAdmin && (
                  <button onClick={regenerate} disabled={loading || refreshing} title="Regenerate now (admin)"
                    style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '6px 9px', borderRadius: 9, cursor: (loading || refreshing) ? 'default' : 'pointer', color: '#e6cf94', background: 'rgba(230,201,148,0.1)', border: '1px solid rgba(212,184,123,0.3)', opacity: (loading || refreshing) ? 0.5 : 1, whiteSpace: 'nowrap' }}>
                    <RefreshCw size={13} className={loading ? 'ai-spin' : ''} /> Regenerate
                  </button>
                )}
                <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: '#c9b48a', cursor: 'pointer', padding: 2 }}><X size={20} /></button>
              </div>
            </div>
            {/* body */}
            <div style={{ padding: 18, flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain' }}>
              {loading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#c9b48a', padding: '24px 0', justifyContent: 'center' }}>
                  <span className="ai-spin" style={{ width: 22, height: 22, border: '2.5px solid rgba(230,201,148,0.25)', borderTopColor: '#e6cf94', borderRadius: '50%', display: 'inline-block' }} />
                  Reading the portfolio and writing your briefing…
                </div>
              )}
              {!loading && briefing && (
                <>
                  <MarkdownLite text={briefing.content} />
                  {briefing.provider === 'groq' && (
                    <div style={{ marginTop: 14, fontSize: 12, color: 'rgba(245,230,194,0.5)' }}>⚡ Generated via Groq backup — double-check specifics.</div>
                  )}
                </>
              )}
              {!loading && !briefing && refreshing && <div style={{ color: '#c9b48a', fontSize: 13, padding: '8px 0' }}>Loading latest briefing…</div>}
              {!loading && !briefing && !refreshing && <div style={{ color: '#ff8a7a', fontSize: 14 }}>⚠ {error || 'No briefing available yet.'}</div>}
            </div>
          </div>
        </div>,
        document.body
      )}
      <style>{`@keyframes ai-spin{to{transform:rotate(360deg)}}.ai-spin{animation:ai-spin .8s linear infinite}`}</style>
    </>
  )
}
