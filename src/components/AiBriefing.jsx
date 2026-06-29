import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Sparkles, X } from 'lucide-react'
import { fetchPortfolio, dailyBriefing } from '../aiClient'
import MarkdownLite from './MarkdownLite'

const GOLD = 'linear-gradient(135deg, #f3e2b8 0%, #e3c87f 46%, #c79a4e 100%)'

export default function AiBriefing() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  async function run() {
    setOpen(true); setLoading(true); setError(''); setResult(null)
    try {
      const data = await fetchPortfolio()
      const today = new Date().toISOString().slice(0, 10)
      setResult(await dailyBriefing(data, today))
    } catch (e) {
      setError(e?.message || 'Failed to generate briefing')
    }
    setLoading(false)
  }

  return (
    <>
      <button onClick={run}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm transition-all hover:brightness-105"
        style={{ background: GOLD, color: '#3a2a08', boxShadow: '0 10px 24px -10px rgba(199,154,78,0.5)' }}>
        <Sparkles size={16} /> Daily briefing
      </button>

      {open && createPortal(
        <div onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(8,6,12,0.66)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '6vh 16px', overflowY: 'auto' }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 640, background: '#1b1622', border: '1px solid rgba(212,184,123,0.28)', borderRadius: 18, boxShadow: '0 30px 80px -30px rgba(0,0,0,0.9)', color: '#f3efe7' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px', borderBottom: '1px solid rgba(212,184,123,0.16)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 30, height: 30, borderRadius: 9, background: GOLD, display: 'grid', placeContent: 'center' }}><Sparkles size={16} color="#3a2a08" /></span>
                <strong style={{ letterSpacing: 0.2 }}>Daily Briefing</strong>
              </div>
              <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: '#c9b48a', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <div style={{ padding: '18px' }}>
              {loading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#c9b48a', padding: '24px 0', justifyContent: 'center' }}>
                  <span className="ai-spin" style={{ width: 22, height: 22, border: '2.5px solid rgba(230,201,148,0.25)', borderTopColor: '#e6cf94', borderRadius: '50%', display: 'inline-block' }} />
                  Reading the portfolio and writing your briefing…
                </div>
              )}
              {error && <div style={{ color: '#ff8a7a', fontSize: 14 }}>⚠ {error}</div>}
              {result && (
                <>
                  <MarkdownLite text={result.text} />
                  {result.provider === 'groq' && (
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
