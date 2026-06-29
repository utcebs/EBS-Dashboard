import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring } from 'motion/react'
import { X, MapPin, Mail, Phone, Copy, Check, Building2, User, Globe } from 'lucide-react'

// Luxe business card modal — gold/champagne port of the cursor-tilt card.
// Backdrop fade + scale-in entrance, 3D mouse-tracking tilt, cursor-following
// gold sheen, soft aurora glows, hairline grid overlay, copy-chip on each row.
// Theme-aware: light mode is handled by the parent .landing-light wrapper.

function CopyChip({ value, label }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.stopPropagation()
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 1400)
        } catch (_) { /* clipboard unavailable */ }
      }}
      className="luxe-card-copy-chip inline-flex items-center gap-1.5"
      aria-label={`Copy ${label}`}
    >
      {copied ? <Check size={11} strokeWidth={2.2} /> : <Copy size={11} strokeWidth={2.2} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function Row({ icon: Icon, label, value, href, external, copyValue }) {
  return (
    <div className="luxe-card-row">
      <div className="flex items-center gap-3 min-w-0">
        <span className="luxe-card-row-icon">
          <Icon size={14} strokeWidth={1.7} />
        </span>
        <div className="min-w-0">
          <div className="luxe-card-row-label">{label}</div>
          {href ? (
            <a
              href={href}
              target={external ? '_blank' : undefined}
              rel={external ? 'noreferrer noopener' : undefined}
              className="luxe-card-row-value-link"
            >
              {value}
            </a>
          ) : (
            <div className="luxe-card-row-value">{value}</div>
          )}
        </div>
      </div>
      {copyValue && <CopyChip value={copyValue} label={label} />}
    </div>
  )
}

export default function BusinessCard({ open, onClose, lead }) {
  const cardRef = useRef(null)
  const rotX = useMotionValue(0)
  const rotY = useMotionValue(0)
  const mouseX = useMotionValue(0.5)
  const mouseY = useMotionValue(0.5)

  const sRotX = useSpring(rotX, { stiffness: 220, damping: 22, mass: 0.4 })
  const sRotY = useSpring(rotY, { stiffness: 220, damping: 22, mass: 0.4 })

  const sheenX = useTransform(mouseX, (v) => `${v * 100}%`)
  const sheenY = useTransform(mouseY, (v) => `${v * 100}%`)
  const sheenBg = useTransform(
    [sheenX, sheenY],
    ([x, y]) => `radial-gradient(circle at ${x} ${y}, rgba(245,230,194,0.55), transparent 45%)`
  )

  function onMove(e) {
    const el = cardRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    mouseX.set(x)
    mouseY.set(y)
    rotY.set((x - 0.5) * 14)
    rotX.set((0.5 - y) * 12)
  }
  function onLeave() { rotX.set(0); rotY.set(0) }

  // ESC closes, body scroll locked while open
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  // Lead name split — falls back to placeholders so the modal still looks
  // complete before Supabase data arrives or if no lead is flagged.
  const fullName = lead?.full_name || 'Lead Name'
  const nameParts = fullName.trim().split(/\s+/)
  const firstName = nameParts.slice(0, -1).join(' ') || nameParts[0] || ''
  const lastName  = nameParts.length > 1 ? nameParts[nameParts.length - 1] : ''
  const role = lead?.job_title || 'Department Lead'
  const avatarUrl = lead?.avatar_url

  // Placeholders — user will provide real values later.
  const EMAIL    = 'ebs@utc.com.kw'
  const PHONE    = '+965 94074024'
  const COMPANY  = 'Union Trading Co.'
  const LOCATION = 'Kuwait'

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          onClick={onClose}
          className="fixed inset-0 z-[100] grid place-items-center px-5"
          aria-modal="true"
          role="dialog"
        >
          {/* Backdrop — warm-black tint for dark, cream tint for light (CSS handles light) */}
          <div className="luxe-card-backdrop absolute inset-0" />

          {/* Card wrapper — handles perspective + scale entrance */}
          <motion.div
            initial={{ opacity: 0, scale: 0.85, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 12 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            style={{ perspective: 1200 }}
            className="relative w-full max-w-md"
          >
            <motion.div
              ref={cardRef}
              onMouseMove={onMove}
              onMouseLeave={onLeave}
              style={{ rotateX: sRotX, rotateY: sRotY, transformStyle: 'preserve-3d' }}
              className="luxe-card-modal relative rounded-3xl overflow-hidden will-change-transform"
            >
              <div className="luxe-card-surface relative p-7 sm:p-8">
                {/* Cursor-tracking gold sheen */}
                <motion.div
                  className="luxe-card-sheen pointer-events-none absolute inset-0"
                  style={{ background: sheenBg }}
                />
                {/* Aurora glows — gold pools */}
                <div className="luxe-card-aurora-1 pointer-events-none absolute -top-24 -right-16 h-48 w-48 rounded-full blur-3xl" />
                <div className="luxe-card-aurora-2 pointer-events-none absolute -bottom-24 -left-10 h-48 w-48 rounded-full blur-3xl" />
                {/* Gold frame — outer rim + inner hairline (double border, per reference) */}
                <div className="luxe-card-border pointer-events-none absolute inset-0 rounded-3xl" />
                <div className="luxe-card-frame pointer-events-none absolute inset-[9px] rounded-[18px]" />

                <div className="relative">
                  {/* Top row: avatar + close */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="luxe-card-avatar grid place-items-center h-10 w-10 rounded-full overflow-hidden">
                        {avatarUrl ? (
                          <img src={avatarUrl} alt={fullName} className="h-full w-full object-cover" />
                        ) : (
                          <User size={18} />
                        )}
                      </span>
                      <div className="flex flex-col leading-tight">
                        <span className="luxe-card-eyebrow">Business card</span>
                        <span className="luxe-card-eyebrow opacity-80">EBS · 2026</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={onClose}
                      aria-label="Close card"
                      className="luxe-card-close grid place-items-center h-9 w-9 rounded-full"
                    >
                      <X size={15} />
                    </button>
                  </div>

                  {/* Name + role */}
                  <div className="mt-9">
                    <div className="luxe-card-location-eyebrow">{LOCATION}</div>
                    <h3 className="luxe-card-name mt-2">
                      {firstName}{lastName && ' '}
                      {lastName && <span className="luxe-card-name-accent">{lastName}.</span>}
                    </h3>
                    <p className="luxe-card-role mt-2">{role}</p>
                  </div>

                  {/* Contact rows */}
                  <div className="mt-7">
                    <Row icon={Mail}      label="Email"    value={EMAIL}    href={`mailto:${EMAIL}`} copyValue={EMAIL} />
                    <Row icon={Phone}     label="Phone"    value={PHONE}    href={`tel:${PHONE.replace(/\s/g, '')}`} copyValue={PHONE} />
                    <Row icon={Building2} label="Company"  value={COMPANY} />
                    <Row icon={MapPin}    label="Location" value={LOCATION} />
                  </div>

                  {/* Footer pill — open-for-inquiries pulse + timezone */}
                  <div className="mt-7 flex items-center justify-between">
                    <div className="luxe-card-available inline-flex items-center gap-2.5 rounded-full px-5 py-2.5">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="luxe-card-pulse absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping" />
                        <span className="luxe-card-pulse-dot relative inline-flex h-1.5 w-1.5 rounded-full" />
                      </span>
                      Open to Inquiries
                    </div>
                    <div className="luxe-card-zone inline-flex items-center gap-1.5">
                      <Globe size={12} strokeWidth={1.7} />
                      KW · UTC+3
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Hint */}
            <div className="luxe-card-hint mt-4 text-center">
              Move your cursor over the card · press <span className="luxe-card-hint-key">esc</span> to close
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
