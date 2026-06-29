import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Sparkles, X, Send } from 'lucide-react'
import { fetchPortfolio, chatAnswer } from '../aiClient'
import MarkdownLite from './MarkdownLite'

const GOLD = 'linear-gradient(135deg, #f3e2b8 0%, #e3c87f 46%, #c79a4e 100%)'

export default function AiChatbot() {
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState([{ role: 'assistant', text: 'Hi — ask me anything about your **projects, milestones or risks**. e.g. "which projects are delayed?"' }])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const dataRef = useRef(null)
  const scrollRef = useRef(null)

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight }, [msgs, busy, open])

  async function send(e) {
    e?.preventDefault()
    const q = input.trim()
    if (!q || busy) return
    setInput('')
    const history = msgs.slice(-6)
    setMsgs((m) => [...m, { role: 'user', text: q }])
    setBusy(true)
    try {
      if (!dataRef.current) dataRef.current = await fetchPortfolio()
      const r = await chatAnswer(dataRef.current, q, history)
      setMsgs((m) => [...m, { role: 'assistant', text: r.text, provider: r.provider }])
    } catch (err) {
      setMsgs((m) => [...m, { role: 'assistant', text: '⚠ ' + (err?.message || 'Something went wrong.') }])
    }
    setBusy(false)
  }

  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)} aria-label="Open assistant"
          style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 150, width: 56, height: 56, borderRadius: '50%', border: 'none', cursor: 'pointer', background: GOLD, boxShadow: '0 12px 30px -8px rgba(199,154,78,0.6)', display: 'grid', placeContent: 'center' }}>
          <Sparkles size={24} color="#3a2a08" />
        </button>
      )}

      {open && createPortal(
        <div style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 150, width: 380, maxWidth: '92vw', height: 560, maxHeight: '80vh', display: 'flex', flexDirection: 'column', background: '#171320', border: '1px solid rgba(212,184,123,0.28)', borderRadius: 18, overflow: 'hidden', boxShadow: '0 30px 80px -28px rgba(0,0,0,0.9)', color: '#f3efe7' }}>
          {/* header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid rgba(212,184,123,0.16)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ width: 28, height: 28, borderRadius: 8, background: GOLD, display: 'grid', placeContent: 'center' }}><Sparkles size={15} color="#3a2a08" /></span>
              <strong style={{ fontSize: 14 }}>Project Assistant</strong>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: '#c9b48a', cursor: 'pointer' }}><X size={18} /></button>
          </div>

          {/* messages */}
          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {msgs.map((m, i) => (
              <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                <div style={{
                  padding: '9px 12px', borderRadius: 12, fontSize: 14, lineHeight: 1.55,
                  ...(m.role === 'user'
                    ? { background: 'rgba(230,201,148,0.16)', border: '1px solid rgba(230,201,148,0.3)' }
                    : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }),
                }}>
                  {m.role === 'user' ? m.text : <MarkdownLite text={m.text} />}
                </div>
              </div>
            ))}
            {busy && (
              <div style={{ alignSelf: 'flex-start', color: '#c9b48a', fontSize: 13, display: 'flex', gap: 6, alignItems: 'center', padding: '4px 6px' }}>
                <span className="ai-dot" /><span className="ai-dot" style={{ animationDelay: '.15s' }} /><span className="ai-dot" style={{ animationDelay: '.3s' }} />
              </div>
            )}
          </div>

          {/* input */}
          <form onSubmit={send} style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid rgba(212,184,123,0.16)' }}>
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about your projects…"
              style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '9px 12px', color: '#f3efe7', fontSize: 14, outline: 'none' }} />
            <button type="submit" disabled={busy || !input.trim()}
              style={{ width: 40, borderRadius: 10, border: 'none', cursor: 'pointer', background: GOLD, display: 'grid', placeContent: 'center', opacity: busy || !input.trim() ? 0.5 : 1 }}>
              <Send size={16} color="#3a2a08" />
            </button>
          </form>
          <style>{`@keyframes ai-bounce{0%,80%,100%{transform:translateY(0);opacity:.4}40%{transform:translateY(-5px);opacity:1}}.ai-dot{width:7px;height:7px;border-radius:50%;background:#e6cf94;display:inline-block;animation:ai-bounce 1.1s infinite}`}</style>
        </div>,
        document.body
      )}
    </>
  )
}
