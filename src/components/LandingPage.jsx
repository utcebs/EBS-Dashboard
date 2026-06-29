import React, { Fragment, useEffect, useState, useCallback, useRef, useLayoutEffect, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronDown, ChevronUp, ArrowRight, Users, User, Menu, X,
  Sparkles, Target, Mail, Rocket, Sun, Moon,
  Cloud, Database, Shield, BarChart3, Cog,
  TrendingUp, DollarSign, ShoppingCart,
} from 'lucide-react'
import { supabase, supabasePublic } from '../supabaseClient'
import { EditableText, EditableImage } from './Editable'
import { useInView } from '../hooks/useInView'

const BusinessCard    = React.lazy(() => import('./BusinessCard'))

// Hero nav items (shared by the desktop inline nav and the mobile dropdown).
const NAV_ITEMS = [
  { id: 'about',    label: 'About Us' },
  { id: 'moonshot', label: 'Moonshot Projects' },
  { id: 'vision',   label: 'Our Vision' },
  { id: 'team',     label: 'Our Team' },
  { id: 'contact',  label: 'Contact', isContact: true },
]

// Scroll-reveal wrapper — fades + slides up when scrolled into view.
// Stagger lists by passing increasing `delay` (ms).
function Reveal({ delay = 0, as: Tag = 'div', className = '', children, ...rest }) {
  const [ref, inView] = useInView()
  return (
    <Tag
      ref={ref}
      className={`transition-all duration-[700ms] ease-out will-change-transform ${
        inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
      } ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
      {...rest}
    >
      {children}
    </Tag>
  )
}

// Scroll progress 0→1 as the target element travels through the viewport.
// By default progress hits 1 when the element's CENTER reaches the viewport
// CENTER — so animations finish exactly when the block looks "settled" in
// the middle of the screen, not before. Pass { completeAtCenter: false } +
// endVhFraction to lock the completion line to a fixed viewport offset
// instead. Returns [refCallback, progress] — pass refCallback to the JSX
// element's ref prop. Using a callback ref (not a useRef object) is
// critical: the effect re-runs when the element actually attaches, which
// can happen AFTER the first render if the host component returns early
// during data loading.
function useScrollProgress(options = {}) {
  const {
    startVhFraction = 0.95,
    endVhFraction = 0.2,
    completeAtCenter = true,
  } = options
  const [el, setEl] = useState(null)
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    if (!el) return
    let rafId = null
    const compute = () => {
      rafId = null
      const rect = el.getBoundingClientRect()
      const vh = window.innerHeight
      // Progress 0 marker — element top crossing this viewport y starts the animation.
      const start = vh * startVhFraction
      // Progress 1 marker — where the element top must be for the element to be
      // vertically centered in the viewport. Falls back to a fixed offset when
      // completeAtCenter is disabled.
      const end = completeAtCenter
        ? (vh / 2) - (rect.height / 2)
        : vh * endVhFraction
      const range = Math.max(1, start - end)
      const traveled = start - rect.top
      const p = Math.max(0, Math.min(1, traveled / range))
      setProgress(p)
    }
    const onScroll = () => {
      if (rafId) return
      rafId = requestAnimationFrame(compute)
    }
    compute()
    // App's actual scroll container is #main-scroll; fall back to window otherwise.
    const scroller = document.getElementById('main-scroll') || window
    scroller.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      scroller.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [el, startVhFraction, endVhFraction, completeAtCenter])
  return [setEl, progress]
}

// Vertical adaptation of the "limelight" navigation pattern. A gold bar
// slides vertically along the dock's left edge, with a trapezoid glow
// projecting leftward toward the active section. Active index is driven
// by the parent (typically from an IntersectionObserver elsewhere).
function VerticalLimelightNav({ items, activeIndex, onChange, className = '' }) {
  const itemRefs = useRef([])
  const limelightRef = useRef(null)
  const [isReady, setIsReady] = useState(false)

  useLayoutEffect(() => {
    if (items.length === 0) return
    const limelight = limelightRef.current
    const activeItem = itemRefs.current[activeIndex]
    if (limelight && activeItem) {
      const newTop = activeItem.offsetTop + activeItem.offsetHeight / 2 - limelight.offsetHeight / 2
      limelight.style.top = `${newTop}px`
      if (!isReady) setTimeout(() => setIsReady(true), 50)
    }
  }, [activeIndex, isReady, items])

  if (items.length === 0) return null

  return (
    <nav className={`relative inline-flex flex-col items-stretch py-1 ${className}`}>
      {items.map((item, index) => {
        const { id, icon, label, onClick } = item
        const isActive = activeIndex === index
        return (
          <a
            key={id}
            ref={el => (itemRefs.current[index] = el)}
            className="relative z-20 flex flex-col items-center justify-center cursor-pointer px-4 py-3"
            onClick={() => { onChange?.(index, item); onClick?.() }}
            aria-label={label}
          >
            {React.cloneElement(icon, {
              size: 18,
              className: `luxe-nav-icon transition-opacity duration-200 ${isActive ? 'is-active opacity-100' : 'opacity-50'}`,
            })}
            {label && (
              <span
                className={`luxe-nav-label mt-1 text-[9px] tracking-[0.18em] uppercase transition-opacity duration-200 ${
                  isActive ? 'is-active opacity-100' : 'opacity-55'
                }`}
              >
                {label}
              </span>
            )}
          </a>
        )
      })}

      {/* Limelight bar — vertical, on the LEFT edge of the dock so its
          cone glow projects RIGHT, lighting the active item from left→right
          through the dock interior. */}
      <div
        ref={limelightRef}
        className={`absolute left-0 z-10 w-[5px] h-11 rounded-full ${
          isReady ? 'transition-[top] duration-400 ease-in-out' : ''
        }`}
        style={{
          top: '-999px',
          background: 'linear-gradient(180deg, #f5e6c2, #e6cf94, #caa15a)',
          boxShadow: '18px 0 36px 6px rgba(229,207,148,0.45)',
        }}
      >
        {/* Cone glow projecting RIGHT into the dock interior */}
        <div
          className="absolute left-[5px] top-[-30%] w-14 h-[160%] pointer-events-none"
          style={{
            clipPath: 'polygon(0% 25%, 0% 75%, 100% 95%, 100% 5%)',
            background: 'linear-gradient(to right, rgba(229,207,148,0.40), transparent)',
          }}
        />
      </div>
    </nav>
  )
}

// Floating right-edge dock — uses VerticalLimelightNav for the 3 in-page
// anchors and a separate theme-toggle button below a gold divider. Hidden
// until the hero is scrolled past.
function FloatingSideDock({ isDark, onToggleTheme, scrollToSection, onOpenContact }) {
  const [visible, setVisible] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  // Prevents the IntersectionObserver from bouncing the limelight through
  // intermediate sections while a click-triggered smooth-scroll is in flight.
  const scrollLockRef = useRef(false)
  const scrollLockTimer = useRef(null)
  const [toggleSpin, setToggleSpin] = useState(0)

  // Show after hero is mostly scrolled out of view
  useEffect(() => {
    const scroller = document.getElementById('main-scroll') || window
    let rafId = null
    const compute = () => {
      rafId = null
      const heroEl = document.querySelector('section[data-hero]') || document.querySelector('section')
      if (!heroEl) return
      const rect = heroEl.getBoundingClientRect()
      setVisible(rect.bottom < window.innerHeight * 0.3)
    }
    const onScroll = () => { if (!rafId) rafId = requestAnimationFrame(compute) }
    compute()
    scroller.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      scroller.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [])

  // Auto-update active index based on scroll position. We pick the
  // section whose TOP has most recently crossed above the viewport's
  // vertical center — i.e. the section the user has "entered" past its
  // header. This can't oscillate the way an IntersectionObserver-based
  // check does (where two adjacent sections both above the threshold
  // would let the active highlight flicker between them).
  //
  // Guarded by scrollLockRef so a click-triggered smooth-scroll doesn't
  // briefly snap the limelight to every section it passes through.
  useEffect(() => {
    const sectionIds = ['about', 'moonshot', 'vision', 'team']
    const scroller = document.getElementById('main-scroll') || window
    let rafId = null
    const compute = () => {
      rafId = null
      if (scrollLockRef.current) return
      const scrollerEl = document.getElementById('main-scroll')
      const sRect = scrollerEl ? scrollerEl.getBoundingClientRect() : { top: 0, height: window.innerHeight }
      const halfH = sRect.height / 2
      let idx = -1
      for (let i = 0; i < sectionIds.length; i++) {
        const el = document.getElementById(sectionIds[i])
        if (!el) continue
        const rect = el.getBoundingClientRect()
        // Has this section's top crossed above the viewport's center?
        if ((rect.top - sRect.top) < halfH) idx = i
      }
      if (idx >= 0) setActiveIndex(idx)
    }
    const onScroll = () => {
      if (!rafId) rafId = requestAnimationFrame(compute)
    }
    compute()
    scroller.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      scroller.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [])

  // Click-to-scroll with lock: instantly set active, lock for ~1100ms while
  // the smooth-scroll lands so the limelight doesn't pinball through other
  // sections during transit. Uses the shared `scrollToSection` helper which
  // centers the target section in the viewport — the same position where
  // the section's scroll-linked animations reach completion.
  const handleNavClick = (id, index) => {
    setActiveIndex(index)
    scrollLockRef.current = true
    if (scrollLockTimer.current) clearTimeout(scrollLockTimer.current)
    scrollLockTimer.current = setTimeout(() => { scrollLockRef.current = false }, 1100)
    scrollToSection?.(id)
  }

  const handleToggleTheme = () => {
    setToggleSpin(n => n + 1)
    onToggleTheme()
  }

  const navItems = [
    { id: 'about',    label: 'About',    icon: <Sparkles />, onClick: () => handleNavClick('about',    0) },
    { id: 'moonshot', label: 'Moonshot', icon: <Rocket />,   onClick: () => handleNavClick('moonshot', 1) },
    { id: 'vision',   label: 'Vision',   icon: <Target />,   onClick: () => handleNavClick('vision',   2) },
    { id: 'team',     label: 'Team',     icon: <Users />,    onClick: () => handleNavClick('team',     3) },
  ]

  return (
    <div
      aria-hidden={!visible}
      className={`hidden md:flex fixed right-4 top-1/2 -translate-y-1/2 z-40 transition-all duration-500 ease-out ${
        visible
          ? 'opacity-100 translate-x-0 pointer-events-auto'
          : 'opacity-0 translate-x-6 pointer-events-none'
      }`}
    >
      <div className="luxe-dock">
        <VerticalLimelightNav
          items={navItems}
          activeIndex={activeIndex}
          onChange={(i) => setActiveIndex(i)}
        />
        <div className="luxe-dock-divider" />
        {/* Contact entry — opens the business card modal */}
        <button
          type="button"
          onClick={onOpenContact}
          className="luxe-dock-item"
          aria-label="Open contact card"
        >
          <Mail size={16} className="luxe-dock-mail-icon" />
          <span className="luxe-dock-label">Contact</span>
        </button>
        <div className="luxe-dock-divider" />
        <button
          type="button"
          onClick={handleToggleTheme}
          className="luxe-dock-item"
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {/* key forces React to remount the wrapper each click → CSS animation re-plays */}
          <span key={toggleSpin} className="luxe-toggle-icon-spin">
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
          </span>
          <span className="luxe-dock-label">{isDark ? 'Light' : 'Dark'}</span>
        </button>
      </div>
    </div>
  )
}

// Scroll-LINKED word reveal — the words are tied to scroll position.
// Stop scrolling → animation pauses. Scroll back up → words disappear
// in reverse (last word goes first). `overlap` controls how many words'
// reveal windows overlap (higher = smoother, more words fading at once).
function WordScrollReveal({ text, className = '', as: Tag = 'p', overlap = 3 }) {
  const [setRef, progress] = useScrollProgress()
  const tokens = (text || '').split(/(\s+)/)
  const totalWords = tokens.reduce((n, t) => n + (/^\s+$/.test(t) ? 0 : 1), 0)
  // Scale word windows so the LAST word's window ends exactly at progress=1.
  // Range = totalWords + overlap - 1; word i is fully revealed when progress
  // reaches (i + overlap) / range. Without this scaling, the last `overlap-1`
  // words never reach 100% opacity since their windows extend past 1.
  const range = Math.max(1, totalWords + overlap - 1)
  const fadeWidth = overlap / range
  let wordIdx = 0
  return (
    <Tag ref={setRef} className={className} data-scroll-anchor>
      {tokens.map((tok, i) => {
        if (/^\s+$/.test(tok)) return <Fragment key={i}>{tok}</Fragment>
        const wordStart = wordIdx / range
        const local = Math.max(0, Math.min(1, (progress - wordStart) / fadeWidth))
        wordIdx += 1
        return (
          <span
            key={i}
            className="inline-block transition-[opacity,transform] duration-150 ease-out will-change-transform"
            style={{
              opacity: local,
              transform: `translateY(${(1 - local) * 8}px)`,
            }}
          >
            {tok}
          </span>
        )
      })}
    </Tag>
  )
}

// ---- Data loaders ----------------------------------------------------------
async function fetchLandingContent() {
  const { data, error } = await supabasePublic
    .from('landing_page_content')
    .select('*')
    .eq('id', 1)
    .maybeSingle()
  if (error) throw error
  return data
}

async function fetchTeamMembers() {
  const { data, error } = await supabasePublic
    .from('profiles')
    .select('id, full_name, job_title, bio, avatar_url, display_order, is_team_lead, employee_roles')
    .eq('show_on_landing', true)
    .order('display_order', { ascending: true, nullsFirst: false })
  if (error) throw error
  return data || []
}

// ---- Achievements tile -----------------------------------------------------
function AchievementTile({ item, index, isAdmin, onSave, sectionProgress = null, slot = null }) {
  const update = async (field, newValue) => {
    // Parent tracks the full achievements array; we update via lift-up.
    await onSave({ ...item, [field]: newValue }, index)
  }

  // Scroll-linked fade + blur for visitor view. Admin always sees the fully-rendered tile.
  const animate = !isAdmin && sectionProgress !== null && slot !== null
  let opacity = 1, blurPx = 0
  if (animate) {
    const tileProg = Math.max(0, Math.min(1, (sectionProgress - slot.start) / (slot.end - slot.start)))
    // Fade in (0 – 0.25) then blur clears (0.15 – 0.75). Overlap for a smooth single-motion feel.
    opacity = Math.max(0, Math.min(1, tileProg / 0.25))
    const focusProg = Math.max(0, Math.min(1, (tileProg - 0.15) / 0.6))
    blurPx = (1 - focusProg) * 14
  }

  return (
    <div
      className="luxe-card luxe-card-hover p-6 text-center"
      style={animate ? {
        opacity,
        filter: `blur(${blurPx}px)`,
        transition: 'opacity 200ms ease-out, filter 200ms ease-out',
      } : undefined}
    >
      <div className="text-4xl mb-2">{item.icon || '⭐'}</div>
      <EditableText
        value={item.value}
        isAdmin={isAdmin}
        onSave={v => update('value', v)}
        className="text-3xl font-bold luxe-heading"
        as="div"
      />
      <EditableText
        value={item.label}
        isAdmin={isAdmin}
        onSave={v => update('label', v)}
        className="text-sm luxe-muted mt-1"
        as="div"
      />
    </div>
  )
}

// Moonshot tile row — owns a single scroll progress (0..1 across the grid's
// passage through the viewport) and slices it into 3 overlapping slots, one
// per tile. Each tile uses its slot to drive its fade → unblur → typewriter.
function MoonshotGrid({ achievements, isAdmin, onSave }) {
  const [setGridRef, sectionProgress] = useScrollProgress({ startVhFraction: 0.95, endVhFraction: 0.2 })
  const ICON_BY_INDEX = ['', '🛒', '🛡️']
  const SLOTS = [
    { start: 0.00, end: 0.55 },
    { start: 0.22, end: 0.78 },
    { start: 0.45, end: 1.00 },
  ]
  return (
    <div ref={setGridRef} data-scroll-anchor className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {achievements.map((a, i) => {
        const item = ICON_BY_INDEX[i] ? { ...a, icon: ICON_BY_INDEX[i] } : a
        return (
          <AchievementTile
            key={i}
            item={item}
            index={i}
            isAdmin={isAdmin}
            onSave={onSave}
            sectionProgress={sectionProgress}
            slot={SLOTS[i] || { start: 0, end: 1 }}
          />
        )
      })}
    </div>
  )
}

// ---- Team card -------------------------------------------------------------
function TeamCard({ member, lead = false, isAdmin, onMemberChange, mode = null, sectionProgress = null, slot = null }) {
  // Compact sizes — lead still ~40% larger than members but the whole tree
  // is shrunk so the avatars' image resolution doesn't read as soft.
  const sizeClasses = lead
    ? 'w-32 h-32 sm:w-40 sm:h-40'   // 128 / 160
    : 'w-24 h-24 sm:w-28 sm:h-28'   // 96 / 112

  const saveField = async (field, value) => {
    const { error } = await supabase.from('profiles').update({ [field]: value }).eq('id', member.id)
    if (error) throw error
    onMemberChange({ ...member, [field]: value })
  }

  // Per-card scroll progress for either mode.
  const animate = !isAdmin && mode && sectionProgress !== null && slot !== null
  const cardProg = animate ? Math.max(0, Math.min(1, (sectionProgress - slot.start) / (slot.end - slot.start))) : 1

  let containerStyle, avatarStyle, nameStyle, titleStyle

  if (animate && mode === 'tree') {
    // Whole card fades + slides up as a unit (org-chart branch tip).
    containerStyle = {
      opacity: cardProg,
      transform: `translateY(${(1 - cardProg) * 18}px)`,
      transition: 'opacity 200ms ease-out, transform 200ms ease-out',
    }
  } else if (animate && mode === 'inflate') {
    // Per-piece sequential phases tied to scroll.
    // Phase 1 (0–0.4): avatar scales 0 → 1 + fades in
    // Phase 2 (0.3–0.6): name slides up + fades
    // Phase 3 (0.5–0.8): title fades in
    const avatarProg = Math.max(0, Math.min(1, cardProg / 0.4))
    const nameProg   = Math.max(0, Math.min(1, (cardProg - 0.3) / 0.3))
    const titleProg  = Math.max(0, Math.min(1, (cardProg - 0.5) / 0.3))
    avatarStyle = {
      transform: `scale(${avatarProg})`,
      opacity: avatarProg,
      transition: 'transform 200ms cubic-bezier(.34,1.56,.64,1), opacity 200ms ease-out',
      transformOrigin: 'center',
    }
    nameStyle = {
      opacity: nameProg,
      transform: `translateY(${(1 - nameProg) * 8}px)`,
      transition: 'opacity 200ms ease-out, transform 200ms ease-out',
    }
    titleStyle = {
      opacity: titleProg,
      transition: 'opacity 200ms ease-out',
    }
  }

  // Shared face styling — front and back of the flip card use IDENTICAL outer
  // box (same dimensions, ring, shadow, gradient bg) so the flip is just a
  // content swap, not a size change.
  // Card face — refactored from inline Tailwind arbitrary classes into a
  // CSS class so light mode can override the background gradient cleanly.
  const faceClass = `team-card-face absolute inset-0 rounded-2xl overflow-hidden`
  const frontAvatarClass = `${faceClass} flex items-center justify-center`

  return (
    <div className="relative flex flex-col items-center text-center group" style={containerStyle}>
      {isAdmin ? (
        /* Admin: simple avatar with pencil-edit affordance + inline bio below */
        <div style={avatarStyle}>
          <EditableImage
            src={member.avatar_url}
            alt={member.full_name}
            isAdmin={isAdmin}
            supabase={supabase}
            bucket="team-photos"
            pathPrefix={`${member.id}/`}
            onSave={url => saveField('avatar_url', url)}
            className={`${sizeClasses} rounded-2xl overflow-hidden bg-gradient-to-br from-[#3a2e1a] to-[#1a1208] ring-2 ring-[rgba(212,184,123,0.25)] shadow-[0_8px_32px_-8px_rgba(212,184,123,0.4)] flex items-center justify-center`}
            imgClassName="w-full h-full object-cover"
            fallback={<User className="text-[#caa15a]" size={lead ? 56 : 40} />}
          />
        </div>
      ) : (
        /* Visitor: 3D flip card. Front = avatar, Back = glass bio block. */
        <div style={{ ...avatarStyle, perspective: '1200px' }}>
          <div
            className={`${sizeClasses} relative transition-transform duration-700 ease-out group-hover:[transform:rotateY(180deg)]`}
            style={{ transformStyle: 'preserve-3d' }}
          >
            {/* Front face — avatar photo */}
            <div className={frontAvatarClass} style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}>
              {member.avatar_url ? (
                <img src={member.avatar_url} alt={member.full_name} className="w-full h-full object-cover" />
              ) : (
                <User className="text-[#caa15a]" size={lead ? 56 : 40} />
              )}
            </div>
            {/* Back face — same outer box as the front, content inside */}
            <div
              className={faceClass}
              style={{
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden',
                transform: 'rotateY(180deg)',
              }}
            >
              <div className="absolute inset-0 p-3 text-center flex flex-col justify-center items-center overflow-hidden">
                {Array.isArray(member.employee_roles) && member.employee_roles.length > 0 && (
                  <div className="flex flex-wrap justify-center gap-1 mb-2">
                    {member.employee_roles.map((r, i) => (
                      <span
                        key={i}
                        className="team-card-role-pill inline-block px-1.5 py-[1px] rounded-full text-[8px] font-semibold tracking-wide"
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                )}
                {/* line-clamp keeps every card the same shape; bios longer
                    than the card can hold get a clean "…" truncation
                    instead of overflowing or pushing the layout around. */}
                <p
                  className={`luxe-body leading-snug ${lead ? 'text-[11px]' : 'text-[9px]'}`}
                  style={{
                    display: '-webkit-box',
                    WebkitBoxOrient: 'vertical',
                    WebkitLineClamp: lead ? 7 : 5,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {member.bio || ''}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mt-3 max-w-[160px]">
        <div style={nameStyle}>
          <EditableText
            value={member.full_name}
            isAdmin={isAdmin}
            onSave={v => saveField('full_name', v)}
            className={lead ? 'text-lg font-display luxe-heading' : 'text-sm font-semibold text-[#fff8e7]'}
            as="div"
            placeholder="Name"
          />
        </div>
        <div style={titleStyle}>
          <EditableText
            value={member.job_title}
            isAdmin={isAdmin}
            onSave={v => saveField('job_title', v)}
            className={lead ? 'text-sm luxe-accent font-medium mt-1' : 'text-xs luxe-accent mt-0.5'}
            as="div"
            placeholder="Job title"
          />
        </div>
      </div>

      {/* Admin: inline bio editor below the card */}
      {isAdmin && (
        <div className="mt-3 max-w-xs w-full">
          <div className="luxe-card p-4 text-left">
            {Array.isArray(member.employee_roles) && member.employee_roles.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2.5">
                {member.employee_roles.map((r, i) => (
                  <span
                    key={i}
                    className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide"
                    style={{
                      background: 'rgba(212,184,123,0.08)',
                      color: '#e6cf94',
                      border: '1px solid rgba(212,184,123,0.25)',
                    }}
                  >
                    {r}
                  </span>
                ))}
              </div>
            )}
            <EditableText
              value={member.bio}
              isAdmin={isAdmin}
              multiline
              onSave={v => saveField('bio', v)}
              className="text-xs luxe-body leading-relaxed"
              as="p"
              placeholder="No bio yet — admin can add one."
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ---- Main component --------------------------------------------------------
export default function LandingPage({ isAdmin, theme, setTheme }) {
  const navigate = useNavigate()
  const [content, setContent] = useState(null)
  const [team, setTeam] = useState([])
  const [loading, setLoading] = useState(true)
  // Range = 0.95 viewport heights. Tight enough that the user can physically
  // scroll far enough to reach progress=1 (the Team section is followed only
  // by a small footer, so max-scroll only allows about one viewport of travel
  // past the section entering view).
  const [setTeamGridRef, teamProgress] = useScrollProgress({ startVhFraction: 1.0, endVhFraction: 0.05 })
  // Theme is now lifted to <Layout> so the user's choice persists across route
  // changes (clicking "Explore Projects" used to drop the user back into the
  // default app-dark dashboard). If parent provides theme + setTheme we mirror
  // them; otherwise fall back to a local state (e.g. for stand-alone testing).
  const [localLight, setLocalLight] = useState(false)
  const lightMode    = setTheme ? (theme === 'light') : localLight
  const setLightMode = setTheme
    ? (next) => setTheme(typeof next === 'function'
        ? (next(lightMode) ? 'light' : 'dark')
        : (next ? 'light' : 'dark'))
    : setLocalLight
  // Business card modal open state. Triggered from the floating dock entry
  // and the top hero nav strip; card content is pulled from the team lead.
  const [cardOpen, setCardOpen] = useState(false)

  // Hero video FOCUS PULL on hover. Hovering ANY chip or disc applies a
  // gentle scale(1.05) + blur(2px) to the background video — like a film
  // camera pulling focus to the foreground. We never touch playback, so
  // the video just keeps looping smoothly underneath the effect. The
  // change is CSS-only (transform + filter) so it's GPU-accelerated and
  // never stutters. hoverCountRef lets the user slide the cursor between
  // adjacent chips without the video snapping back in between.
  const videoRef      = useRef(null)
  const hoverCountRef = useRef(0)
  const [videoFocused, setVideoFocused] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  // Keep the hero background video reliably playing on mobile. iOS/Brave block
  // autoplay and aggressively evict the (large) dark clip when it scrolls out of
  // view, so it comes back "unloaded". We force-mute, (re)play whenever the clip
  // is ready or the hero is on screen, pause it off screen, and resume on the
  // first interaction / tab refocus.
  useEffect(() => {
    const vids = Array.from(document.querySelectorAll('.hero-video-dark, .hero-video-light'))
    vids.forEach(v => { v.muted = true; v.defaultMuted = true })
    const tryPlay = (v) => { try { const p = v.play(); if (p && p.catch) p.catch(() => {}) } catch {} }
    const playAll = () => vids.forEach(tryPlay)
    vids.forEach(v => v.addEventListener('canplay', () => tryPlay(v)))
    playAll()
    const t = setTimeout(playAll, 700)
    // Replay when the hero re-enters the viewport (scroll back up); pause when it leaves.
    const hero = document.querySelector('[data-hero]')
    let io
    if (hero && 'IntersectionObserver' in window) {
      io = new IntersectionObserver(([e]) => {
        if (e.isIntersecting) playAll()
        else vids.forEach(v => { try { v.pause() } catch {} })
      }, { threshold: 0.01 })
      io.observe(hero)
    }
    const once = () => playAll()
    const evs = ['pointerdown', 'touchstart', 'click']
    evs.forEach(ev => window.addEventListener(ev, once, { once: true, passive: true }))
    const onVis = () => { if (!document.hidden) playAll() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearTimeout(t); if (io) io.disconnect()
      evs.forEach(ev => window.removeEventListener(ev, once))
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])
  const onCardHover = useCallback(() => {
    hoverCountRef.current += 1
    setVideoFocused(true)
  }, [])
  const onCardLeave = useCallback(() => {
    hoverCountRef.current = Math.max(0, hoverCountRef.current - 1)
    if (hoverCountRef.current === 0) setVideoFocused(false)
  }, [])

  // Hero clock rail — the 5 capability chips are arranged around the
  // big EBS logo as if at clock-hour positions 7..11. We need the logo's
  // ACTUAL on-screen center (it shifts with viewport width and image-
  // aspect quirks) to anchor the arc, so we measure it after mount and
  // on every resize / image-load.
  const logoImgRef = useRef(null)
  const [logoCenter, setLogoCenter] = useState(null)
  useEffect(() => {
    const compute = () => {
      const img = logoImgRef.current
      if (!img) return
      const section = img.closest('section[data-hero]')
      if (!section) return
      const sRect = section.getBoundingClientRect()
      const iRect = img.getBoundingClientRect()
      setLogoCenter({
        x: iRect.left - sRect.left + iRect.width / 2,
        y: iRect.top - sRect.top + iRect.height / 2,
      })
    }
    let raf = null
    const schedule = () => { if (raf == null) raf = requestAnimationFrame(() => { raf = null; compute() }) }
    compute()
    const img = logoImgRef.current
    if (img && !img.complete) img.addEventListener('load', compute, { once: true })
    const ro = new ResizeObserver(schedule)
    if (img) ro.observe(img)
    const section = img?.closest('section[data-hero]')
    if (section) ro.observe(section)
    window.addEventListener('resize', schedule)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', schedule)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [content, loading])

  // Click-navigation (floating dock + limelight nav): scroll so the target's
  // vertical CENTER lands at the viewport's vertical CENTER. Crucially we
  // center the SECTION'S INNER ANIMATED BLOCK (marked with [data-scroll-anchor])
  // when one exists — not the whole section. The scroll-linked animations are
  // tied to the inner block, so centering anything else leaves the animation
  // at partial progress.
  //
  // CLAMP: never scroll so far that the section's TOP (its heading) goes
  // above the viewport top. For tall sections (e.g. Team — grid + heading is
  // taller than viewport), centering the grid alone would push the heading
  // off-screen, so we clamp the scroll target so the section header stays
  // visible just below the viewport top. Animation progress still reaches 1
  // in this case because the inner block has already crossed its completion
  // line by the time the section header is at the top.
  const SECTION_TOP_MARGIN = 24  // px the section top sits below viewport top when clamped
  // Per-section additional downward scroll offset (px). Positive = scroll
  // FURTHER down (less of the upper edge visible) on click-nav. ~76 px ≈ 2 cm
  // at 96 dpi. Used to fine-tune which row of a tall section lands in view.
  const SECTION_EXTRA_DOWN = { team: 76 }
  const scrollToSectionWithCompletion = useCallback((id) => {
    const section = document.getElementById(id)
    if (!section) return
    const target = section.querySelector('[data-scroll-anchor]') || section
    const extra = SECTION_EXTRA_DOWN[id] || 0
    const scroller = document.getElementById('main-scroll')
    if (scroller) {
      const scrollerRect = scroller.getBoundingClientRect()
      const tRect = target.getBoundingClientRect()
      const sRect = section.getBoundingClientRect()
      const tTopInContent = tRect.top - scrollerRect.top + scroller.scrollTop
      const sTopInContent = sRect.top - scrollerRect.top + scroller.scrollTop
      const centeredScroll = tTopInContent + tRect.height / 2 - scroller.clientHeight / 2
      const top = Math.min(centeredScroll, sTopInContent - SECTION_TOP_MARGIN) + extra
      scroller.scrollTo({ top, behavior: 'smooth' })
    } else {
      const tRect = target.getBoundingClientRect()
      const sRect = section.getBoundingClientRect()
      const tTopInDoc = tRect.top + window.scrollY
      const sTopInDoc = sRect.top + window.scrollY
      const centeredScroll = tTopInDoc + tRect.height / 2 - window.innerHeight / 2
      const top = Math.min(centeredScroll, sTopInDoc - SECTION_TOP_MARGIN) + extra
      window.scrollTo({ top, behavior: 'smooth' })
    }
  }, [])
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setError(null)
    // Smart minimum-loading-time UX:
    //   • Hard refresh (Ctrl+Shift+R, first visit) bypasses the browser HTTP
    //     cache → Supabase round-trips take 200–800 ms → we enforce a 1.2 s
    //     minimum so the spinner + tagline are clearly visible.
    //   • Normal refresh hits the browser cache → Supabase responses come
    //     back in ~30–80 ms → we DON'T pad, so the user gets the page
    //     basically instantly.
    // JavaScript can't directly tell the two refreshes apart, but elapsed
    // fetch time is a clean proxy: anything under FAST_THRESHOLD_MS was
    // almost certainly served from cache, so skip the hold.
    const MIN_LOAD_MS = 1200
    const FAST_THRESHOLD_MS = 150
    const startedAt = performance.now()
    try {
      const [c, t] = await Promise.all([fetchLandingContent(), fetchTeamMembers()])
      const elapsed = performance.now() - startedAt
      if (elapsed > FAST_THRESHOLD_MS) {
        const remaining = MIN_LOAD_MS - elapsed
        if (remaining > 0) await new Promise(r => setTimeout(r, remaining))
      }
      setContent(c)
      setTeam(t)
    } catch (e) {
      console.error('Landing fetch error:', e)
      setError(e.message || 'Failed to load landing content')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Save a single landing_page_content field
  const saveContent = async (field, value) => {
    const { error: uErr } = await supabase
      .from('landing_page_content')
      .update({ [field]: value, updated_at: new Date().toISOString() })
      .eq('id', 1)
    if (uErr) throw uErr
    setContent(c => ({ ...c, [field]: value }))
  }

  // Save one achievement in the JSONB array
  const saveAchievement = async (updated, index) => {
    const next = [...(content.achievements || [])]
    next[index] = updated
    await saveContent('achievements', next)
  }

  if (loading) {
    return (
      <div className={`hero-loading-min ${lightMode ? 'is-light' : ''}`}>
        <div className="hero-loading-min-spinner" />
        <span className="hero-loading-min-caption">EBS Department</span>
      </div>
    )
  }

  if (error || !content) {
    return (
      <div className="max-w-xl mx-auto mt-20 text-center">
        <p className="text-red-600 mb-4">Failed to load landing content.</p>
        <p className="text-sm text-surface-500 mb-4">{error}</p>
        <button onClick={load} className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium">
          Retry
        </button>
      </div>
    )
  }

  const lead = team.find(m => m.is_team_lead)
  const members = team.filter(m => !m.is_team_lead)

  return (
    <div className={`overflow-x-clip ${lightMode ? 'landing-light' : ''}`}>
    <FloatingSideDock
      isDark={!lightMode}
      onToggleTheme={() => setLightMode(v => !v)}
      scrollToSection={scrollToSectionWithCompletion}
      onOpenContact={() => setCardOpen(true)}
    />
    <Suspense fallback={null}>
      <BusinessCard
        open={cardOpen}
        onClose={() => setCardOpen(false)}
        lead={team.find(m => m.is_team_lead)}
      />
    </Suspense>
    <div className="-m-4 sm:-m-6 lg:-m-8">
      {/* ─── Hero ────────────────────────────────────────────── */}
      <section
        data-hero
        className="relative overflow-hidden text-white"
        style={{ background: '#08070a' }}
      >
        {/* Looping background video — bottom layer. All other absolutely-
            positioned hero overlays (pools, grid, particles, content) come
            after in the DOM, so they paint on top without explicit z-index.
            autoPlay+muted+playsInline is required for autoplay in modern
            browsers; preload="auto" buffers the file so the seam at the
            loop point doesn't stutter on first wrap. */}
        {/* Two looping videos in the same slot — one for dark mode, one
            for light. CSS swaps which one is visible based on the
            .landing-light class on the page root, so the user toggling
            the theme also switches the background footage. */}
        <video
          ref={videoRef}
          src="./real21.mp4"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          disablePictureInPicture
          aria-hidden="true"
          tabIndex={-1}
          className="hero-video-dark absolute inset-0 w-full h-full object-cover pointer-events-none select-none z-0"
          style={{
            transform: videoFocused ? 'scale(1.05)' : 'scale(1)',
            filter: videoFocused ? 'blur(2px)' : 'blur(0px)',
            transition: 'transform 0.45s cubic-bezier(.4,0,.2,1), filter 0.45s ease-out',
            willChange: 'transform, filter',
          }}
        />
        <video
          src="./mp410.mp4"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          disablePictureInPicture
          aria-hidden="true"
          tabIndex={-1}
          className="hero-video-light absolute inset-0 w-full h-full object-cover pointer-events-none select-none z-0"
          style={{
            transform: videoFocused ? 'scale(1.05)' : 'scale(1)',
            filter: videoFocused ? 'blur(2px)' : 'blur(0px)',
            transition: 'transform 0.45s cubic-bezier(.4,0,.2,1), filter 0.45s ease-out',
            willChange: 'transform, filter',
          }}
        />
        {/* Subtle dark vignette over the video so the gold overlays + white
            text below remain legible regardless of which frame is showing. */}
        <div
          className="hero-vignette absolute inset-0 pointer-events-none z-0"
          style={{
            background:
              'radial-gradient(ellipse 80% 60% at 50% 30%, rgba(0,0,0,0.30), transparent 65%), linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.55) 100%)',
          }}
        />
        {/* Top nav — three in-page anchors. Pinned at z-50 with a soft
            gradient backdrop so it always reads above the particle
            animation and ambient light pools below. Offset down from the
            hero's top edge so the wrapper's negative margins + any
            iOS safe-area inset don't push it off-screen. */}
        {/* Nav links sit at the same y as before (≈ 56 px from the top
            of the hero); the backdrop gradient starts from the page top
            (no longer leaving a strip of video visible above it). We do
            that by anchoring the nav at top: 0 and using pt-14 to push
            the text down to its prior visual position. */}
        <nav
          className="absolute left-0 right-0 z-50 pt-14 pb-4 px-4 sm:px-6 pointer-events-none"
          style={{
            top: 0,
            background:
              'linear-gradient(180deg, rgba(12,10,8,0.78) 0%, rgba(12,10,8,0.35) 60%, rgba(12,10,8,0) 100%)',
            borderRadius: '0 0 18px 18px',
          }}
        >
          {/* Etched gold thread along the bottom edge — matches the section rim threads */}
          <div className="luxe-rim-bottom" />

          {/* Desktop / tablet — inline links + theme toggle */}
          <div className="hidden sm:flex items-center justify-center gap-10">
            {NAV_ITEMS.map((item, i) => (
              <Fragment key={item.id}>
                {i > 0 && <span className="luxe-nav-dot pointer-events-none" aria-hidden="true" />}
                <button
                  type="button"
                  onClick={() => item.isContact ? setCardOpen(true) : scrollToSectionWithCompletion(item.id)}
                  className="pointer-events-auto text-xs luxe-nav-item"
                >
                  {item.label}
                </button>
              </Fragment>
            ))}
            <span className="luxe-nav-dot pointer-events-none" aria-hidden="true" />
            <button
              type="button"
              onClick={() => setLightMode(v => !v)}
              className="hero-nav-theme-toggle pointer-events-auto"
              aria-label={lightMode ? 'Switch to dark mode' : 'Switch to light mode'}
              title={lightMode ? 'Switch to dark mode' : 'Switch to light mode'}
            >
              {lightMode ? <Moon size={14} strokeWidth={1.8} /> : <Sun size={14} strokeWidth={1.8} />}
            </button>
          </div>

          {/* Mobile — theme toggle + hamburger */}
          <div className="hero-nav-mobile-bar sm:hidden flex items-center justify-end gap-3 pr-1 pointer-events-auto">
            <button
              type="button"
              onClick={() => setLightMode(v => !v)}
              className="hero-nav-theme-toggle"
              aria-label={lightMode ? 'Switch to dark mode' : 'Switch to light mode'}
              title={lightMode ? 'Switch to dark mode' : 'Switch to light mode'}
            >
              {lightMode ? <Moon size={14} strokeWidth={1.8} /> : <Sun size={14} strokeWidth={1.8} />}
            </button>
            <button
              type="button"
              onClick={() => setNavOpen(o => !o)}
              className="hero-nav-theme-toggle"
              aria-label={navOpen ? 'Close menu' : 'Open menu'}
            >
              {navOpen ? <X size={15} strokeWidth={1.8} /> : <Menu size={15} strokeWidth={1.8} />}
            </button>
          </div>

          {/* Mobile — dropdown menu */}
          {navOpen && (
            <div className="sm:hidden mt-3 mx-auto w-full max-w-xs flex flex-col gap-1 pointer-events-auto luxe-mobile-nav">
              {NAV_ITEMS.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => { item.isContact ? setCardOpen(true) : scrollToSectionWithCompletion(item.id); setNavOpen(false) }}
                  className="luxe-mobile-nav-item"
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </nav>

        {/* Ambient light pools — stronger gold glows for a richer luxe feel */}
        <div className="absolute inset-0 pointer-events-none">
          <div
            className="absolute -top-24 -left-24 w-[640px] h-[640px] rounded-full blur-3xl"
            style={{ background: 'radial-gradient(circle, rgba(229,207,148,0.32), transparent 65%)' }}
          />
          <div
            className="absolute top-1/3 -right-32 w-[680px] h-[680px] rounded-full blur-3xl"
            style={{ background: 'radial-gradient(circle, rgba(212,184,123,0.34), transparent 65%)' }}
          />
          <div
            className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[820px] h-[420px] rounded-full blur-3xl"
            style={{ background: 'radial-gradient(circle, rgba(202,161,90,0.22), transparent 65%)' }}
          />
        </div>

        {/* Glassmorphism capability rail — 5 chips arranged at clock-hour
            positions 11, 10, 9, 8, 7 around the big EBS logo. The anchor
            point (logoCenter) is measured from the actual logo <img> at
            mount + on every resize, so the arc stays centred on the logo
            regardless of viewport width or padding. Each chip is 302×94 px
            (8×2.5 cm at 96 dpi). Hidden below lg so the centred content
            stays clean on tablets/phones. */}
        {logoCenter && (() => {
          // Capability chips form a SHALLOW PARABOLIC ARC that bulges
          // LEFT (away from the logo) at the middle. We anchor the
          // wrapper 1 cm (~38 px) from the section's LEFT EDGE so the
          // arc sits flush against the viewport edge regardless of how
          // wide the screen is. Logo center in wrapper-local coords is
          // computed from the measured logoCenter.
          const SECTION_LEFT_GAP = 72   // ~1.9 cm from the hero's left edge
          const X_CURVE   = -45         // middle chip's bulge (negative = LEFT, away from logo)
          const Y_SPACING = 130         // vertical distance between consecutive chip centers
          const Y_OFFSET  = 67          // shift the whole rail ~1.75 cm down so the TOP chip clears the viewport edge
          const CHIP_HALF_W = 130       // 260 / 2
          const CHIP_HALF_H = 39        // 78 / 2
          const EDGE_MARGIN = 6         // small gap between chip edge and line start
          const LINE_END_T   = 0.97     // line runs nearly all the way to the logo center
          // The wrapper sits at (left=SECTION_LEFT_GAP, top=logoCenter.y).
          // Logo center in wrapper-local coordinates:
          const TARGET_X = logoCenter.x - SECTION_LEFT_GAP
          const TARGET_Y = 0
          // X_BASE chosen so the LEFTMOST chip's left edge sits exactly at
          // wrapper origin (= 1 cm from the section's left edge).
          const X_BASE = CHIP_HALF_W + Math.abs(X_CURVE)
          const chips = [
            { id: 'cloud',     line1: 'CLOUD',   line2: 'SOLUTIONS',  sub: 'Scalable. Secure. Reliable.',     Icon: Cloud },
            { id: 'erp',       line1: 'ERP',     line2: 'SYSTEMS',    sub: 'Streamline. Integrate. Grow.',    Icon: Database },
            { id: 'security',  line1: 'CYBER',   line2: 'SECURITY',   sub: 'Protect. Detect. Respond.',       Icon: Shield },
            { id: 'analytics', line1: 'DATA',    line2: 'ANALYTICS',  sub: 'Transform Data into Insight.',    Icon: BarChart3 },
            { id: 'process',   line1: 'PROCESS', line2: 'AUTOMATION', sub: 'Automate. Optimize. Accelerate.', Icon: Cog },
          ].map((chip, i) => {
            // Parametrise i ∈ [0,4] as a normalised index n ∈ [-1, +1].
            // bulge factor (1 − n²) peaks at n=0 (middle), zero at ends.
            // With X_CURVE < 0 the middle chip moves LEFT from X_BASE
            // while top + bottom chips stay at X_BASE.
            const n = (i - 2) / 2
            const cx = X_BASE + X_CURVE * (1 - n * n)
            const cy = (i - 2) * Y_SPACING + Y_OFFSET
            const DX = TARGET_X - cx
            const DY = TARGET_Y - cy
            // Compute t at which the chip→target ray exits the chip's
            // bounding rectangle. The smallest positive intersection is
            // the actual exit point on the edge facing the logo.
            const tCandidates = []
            if (DX > 0) tCandidates.push( CHIP_HALF_W / DX)
            if (DX < 0) tCandidates.push(-CHIP_HALF_W / DX)
            if (DY > 0) tCandidates.push( CHIP_HALF_H / DY)
            if (DY < 0) tCandidates.push(-CHIP_HALF_H / DY)
            const tExit = Math.min(...tCandidates.filter(t => t > 0))
            // Move slightly outside the chip so the line is fully visible.
            const dist = Math.sqrt(DX * DX + DY * DY)
            const tStart = tExit + EDGE_MARGIN / dist
            return {
              ...chip, cx, cy,
              sx: cx + tStart      * DX, sy: cy + tStart      * DY,
              ex: cx + LINE_END_T  * DX, ey: cy + LINE_END_T  * DY,
            }
          })
          return (
            <div
              className="hidden lg:block absolute z-30 pointer-events-none"
              style={{
                left: `${SECTION_LEFT_GAP}px`,
                top:  `${logoCenter.y}px`,
              }}
            >
              {/* (Connector lines removed per user — chips render alone.) */}
              {chips.map(({ id, cx, cy, line1, line2, sub, Icon }) => (
                <div
                  key={id}
                  className="hero-cap-chip absolute flex items-center pointer-events-auto"
                  style={{
                    left: `${cx}px`,
                    top: `${cy}px`,
                  }}
                  onMouseEnter={onCardHover}
                  onMouseLeave={onCardLeave}
                >
                  <div className="hero-cap-icon grid place-items-center shrink-0">
                    <Icon size={22} strokeWidth={1.8} />
                  </div>
                  <div className="flex flex-col leading-none min-w-0 text-left">
                    <span className="hero-cap-line1">{line1}</span>
                    <span className="hero-cap-line2">{line2}</span>
                    <span className="hero-cap-sub">{sub}</span>
                  </div>
                </div>
              ))}
            </div>
          )
        })()}

        {logoCenter && (() => {
          // RIGHT ORBIT — 5 glass circles (1 cm radius / 76 px diameter)
          // arranged in a ZIGZAG pattern on the right of the EBS logo.
          // The OUTER column is anchored 1 cm from the viewport's right
          // edge; the INNER column sits X_ZIG px further left. Odd-indexed
          // discs (Sales, Procurement) live on the outer column; even-
          // indexed ones (Operations, Finance, HR) live on the inner column.
          const CIRCLE_R   = 38       // 1 cm radius (76 px diameter)
          const RIGHT_GAP  = 38       // 1 cm from viewport right edge
          const X_ZIG      = 150      // horizontal separation between the two zigzag columns (stretched)
          const Y_SPACING  = 130      // vertical between consecutive disc centers
          const Y_OFFSET   = 67       // shift the whole orbit ~1.75 cm down so the TOP disc clears the viewport edge
          // Outer-column x in section coords:
          //   circle_right_edge = viewport_w - RIGHT_GAP
          //   circle_center_x   = viewport_w - RIGHT_GAP - CIRCLE_R
          // In wrapper-local coords (wrapper anchored at logoCenter):
          //   cx_outer = (viewport_w - RIGHT_GAP - CIRCLE_R) - logoCenter.x
          const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1280
          const cxOuter = viewportW - RIGHT_GAP - CIRCLE_R - logoCenter.x
          const cxInner = cxOuter - X_ZIG
          const orbits = [
            { id: 'operations',  label: 'OPERATIONS',       Icon: Users },
            { id: 'sales',       label: 'SALES',             Icon: TrendingUp },
            { id: 'finance',     label: 'FINANCE',           Icon: DollarSign },
            { id: 'procurement', label: 'PROCUREMENT',       Icon: ShoppingCart },
            { id: 'hr',          label: 'HUMAN RESOURCES',   Icon: User },
          ].map((o, i) => {
            const cx = (i % 2 === 0) ? cxInner : cxOuter
            const cy = (i - 2) * Y_SPACING + Y_OFFSET
            return { ...o, cx, cy }
          })
          return (
            <div
              className="hidden lg:block absolute z-30 pointer-events-none"
              style={{
                left: `${logoCenter.x}px`,
                top:  `${logoCenter.y}px`,
              }}
            >
              {/* (Connector lines removed per user — discs render alone.) */}
              {orbits.map(({ id, cx, cy, label, Icon }) => (
                <div
                  key={id}
                  className="hero-orbit-unit absolute pointer-events-auto"
                  style={{ left: `${cx}px`, top: `${cy}px` }}
                  onMouseEnter={onCardHover}
                  onMouseLeave={onCardLeave}
                >
                  <div className="hero-orbit-circle">
                    <Icon size={32} strokeWidth={1.8} />
                  </div>
                  <span className="hero-orbit-label">{label}</span>
                </div>
              ))}
            </div>
          )
        })()}

        <div className="relative max-w-6xl mx-auto px-6 lg:px-8 pt-[138px] lg:pt-[168px] pb-6 lg:pb-8 min-h-screen flex flex-col items-center justify-center text-center">
          {/* Eyebrow rule + label — champagne gold to match the luxe theme */}
          <div className="hero-eyebrow flex items-center gap-3 mb-5">
            <span className="hero-eyebrow-rule h-px w-10" />
            <span className="text-[11px] tracking-[0.35em] uppercase font-semibold">EBS Department</span>
            <span className="hero-eyebrow-rule h-px w-10" />
          </div>

          {/* EBS hero wordmark — sits at its natural top position (the
              prior mt-[38px] push-down was removed so the logo + everything
              below it is raised ~1 cm). */}
          <div className="relative mx-auto flex items-center justify-center mb-6 w-full max-w-4xl">
            <div
              className="absolute inset-0 rounded-full pointer-events-none"
              style={{
                background:
                  'radial-gradient(closest-side, rgba(255,255,255,0.14), rgba(255,255,255,0) 70%)',
              }}
            />
            <img
              ref={logoImgRef}
              src="./ebs-hero-logo.png"
              alt="EBS · Enterprise Business Solutions · Driving Digital Excellence"
              className="relative block mx-auto w-full max-w-[700px] h-auto object-contain drop-shadow-[0_8px_60px_rgba(255,255,255,0.2)]"
            />
          </div>

          {/* Title */}
          <EditableText
            value={content.hero_title}
            isAdmin={isAdmin}
            onSave={v => saveContent('hero_title', v)}
            className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold font-display leading-[1.05] tracking-tight max-w-4xl"
            as="h1"
          />

          {/* Hero CTA — primary luxe pill (champagne fill, dark arrow capsule, signature sweep + lift animation) */}
          <button
            onClick={() => navigate('/dashboard')}
            className="mt-6 luxe-button-pill"
          >
            Explore Projects
            <span className="luxe-button-pill-arrow">
              <ArrowRight size={15} />
            </span>
          </button>

          {/* Subtitle */}
          <EditableText
            value={content.hero_subtitle}
            isAdmin={isAdmin}
            onSave={v => saveContent('hero_subtitle', v)}
            className="text-base sm:text-lg text-white/65 mt-5 max-w-2xl"
            as="p"
          />

          {/* Secondary — small caption for additional weight */}
          <div className="mt-5 flex items-center gap-6 text-[11px] uppercase tracking-[0.25em] text-white/35">
            <span>Enterprise Systems</span>
            <span className="w-1 h-1 rounded-full bg-white/40" />
            <span>Integrations</span>
            <span className="w-1 h-1 rounded-full bg-white/40" />
            <span>Analytics</span>
          </div>
        </div>

        {/* Bottom-right corner branding mark — subtle watermark */}
        <img
          src="./hero-corner-logo.png"
          alt=""
          aria-hidden="true"
          className="absolute right-4 bottom-4 sm:right-6 sm:bottom-6 w-32 sm:w-40 lg:w-48 h-auto pointer-events-none"
        />
      </section>


      {/* ─── Description ─────────────────────────────────────── */}
      <section id="about" className="luxe-section luxe-section-about overflow-hidden scroll-mt-4">
        <div className="luxe-rim-top" />
        <div className="relative max-w-5xl mx-auto px-6 lg:px-8 py-20 text-center">
          <Reveal>
            <div className="luxe-pill mb-6">
              <Sparkles size={12} /> About Us
            </div>
          </Reveal>
          {/* Card is always visible; words inside tie directly to scroll progress. */}
          <div className="luxe-card mx-auto max-w-3xl p-8 lg:p-10">
            {isAdmin ? (
              <EditableText
                value={content.description}
                isAdmin={isAdmin}
                multiline
                onSave={v => saveContent('description', v)}
                className="text-lg lg:text-xl luxe-body leading-relaxed"
                as="p"
              />
            ) : (
              <WordScrollReveal
                text={content.description}
                className="text-lg lg:text-xl luxe-body leading-relaxed"
                overlap={3}
              />
            )}
          </div>
        </div>
      </section>

      {/* ─── Achievements ────────────────────────────────────── */}
      <section id="moonshot" className="luxe-section luxe-section-moonshot overflow-hidden scroll-mt-4">
        <div className="luxe-rim-top" />
        <div className="relative max-w-5xl mx-auto px-6 lg:px-8 py-20">
          <Reveal className="text-center mb-12">
            <div className="luxe-pill">
              <Rocket size={12} /> Moonshot Projects
            </div>
          </Reveal>
          {/* Tiles use scroll-linked fade + blur-clear (per-tile slot) */}
          <MoonshotGrid
            achievements={content.achievements || []}
            isAdmin={isAdmin}
            onSave={saveAchievement}
          />
          <Reveal delay={300} className="text-center mt-12">
            <button onClick={() => navigate('/projects')} className="luxe-button">
              View our Projects
              <ArrowRight size={16} />
            </button>
          </Reveal>
        </div>
      </section>

      {/* ─── Vision ──────────────────────────────────────────── */}
      <section id="vision" className="luxe-section luxe-section-vision overflow-hidden scroll-mt-4">
        <div className="luxe-rim-top" />
        <div className="luxe-rim-bottom" />
        <div className="relative max-w-4xl mx-auto px-6 lg:px-8 py-20 text-center">
          <Reveal>
            <div className="luxe-pill mb-6">
              <Target size={12} /> Our Vision
            </div>
          </Reveal>
          {/* Card always visible; words tied to scroll progress like the About paragraph. */}
          <div className="luxe-card mx-auto p-8 lg:p-10">
            {isAdmin ? (
              <EditableText
                value={content.vision}
                isAdmin={isAdmin}
                multiline
                onSave={v => saveContent('vision', v)}
                className="text-lg lg:text-xl luxe-body leading-relaxed"
                as="blockquote"
              />
            ) : (
              <WordScrollReveal
                text={content.vision}
                className="text-lg lg:text-xl luxe-body leading-relaxed"
                as="blockquote"
                overlap={3}
              />
            )}
          </div>
        </div>
      </section>

      {/* ─── Team Tree ───────────────────────────────────────── */}
      <section id="team" className="luxe-section luxe-section-team overflow-hidden scroll-mt-4">
        <div className="luxe-rim-top" />
        <div className="relative max-w-5xl mx-auto px-6 lg:px-8 py-20">
          <Reveal className="text-center mb-14">
            <div className="luxe-pill mb-5">
              <Users size={12} /> Our Team
            </div>
            <h2
              className="text-base sm:text-lg lg:text-xl luxe-heading mt-2"
              style={{ fontWeight: 400, letterSpacing: '0' }}
            >
              The minds that power the platform
            </h2>
          </Reveal>

          {/* Wrapper is always rendered so useScrollProgress can attach its ref on first mount,
              before team data finishes loading. */}
          <div ref={setTeamGridRef} data-scroll-anchor className="flex flex-col items-center">
          {team.length === 0 ? (
            <div className="text-center text-surface-500 py-10">
              <p>No team members to show yet.</p>
              {isAdmin && (
                <p className="text-xs mt-2">Mark profiles with <code className="bg-surface-100 px-1 rounded">show_on_landing = true</code> and set <code className="bg-surface-100 px-1 rounded">is_team_lead</code> + <code className="bg-surface-100 px-1 rounded">display_order</code>.</p>
              )}
            </div>
          ) : (() => {
            // Cascading scroll-linked sequence — starts a bit later so the
            // user has scrolled meaningfully into the section before lead
            // inflate kicks in. Member spacing tightened slightly so the
            // last member still completes within reachable scroll.
            //   ① lead inflate  ② drop line  ③ trunk wipe + each member
            //     drop + card inflate, sequentially L→R
            const leadSlot     = { start: 0.13, end: 0.38 }
            const droplineSlot = { start: 0.38, end: 0.45 }
            const trunkSlot    = { start: 0.45, end: 0.75 }
            const memberSlots = members.map((_, i) => {
              const baseStart = 0.50 + i * 0.13  // M0 0.50, M1 0.63, M2 0.76
              return {
                drop: { start: baseStart,        end: baseStart + 0.05 },
                card: { start: baseStart + 0.04, end: baseStart + 0.17 },
              }
            })

            const clampProg = (start, end) => {
              const w = end - start
              return Math.max(0, Math.min(1, (teamProgress - start) / (w || 1)))
            }
            const droplineProg = clampProg(droplineSlot.start, droplineSlot.end)
            const trunkProg    = clampProg(trunkSlot.start,    trunkSlot.end)
            const animateConnectors = !isAdmin

            return (
              <>
                {/* Lead */}
                {lead && (
                  <div className="relative">
                    {/* Gold diamond ornament below lead */}
                    <div
                      aria-hidden="true"
                      className="hidden sm:block absolute left-1/2 -bottom-3 w-2 h-2 -translate-x-1/2 rotate-45"
                      style={{
                        background: 'linear-gradient(135deg, #f5e6c2, #caa15a)',
                        boxShadow: '0 0 10px rgba(229,207,148,0.5)',
                      }}
                    />
                    <TeamCard
                      member={lead}
                      lead
                      isAdmin={isAdmin}
                      onMemberChange={m =>
                        setTeam(t => t.map(x => (x.id === m.id ? m : x)))
                      }
                      mode="inflate"
                      sectionProgress={teamProgress}
                      slot={leadSlot}
                    />
                  </div>
                )}

                {/* Vertical drop from lead to the horizontal trunk */}
                {lead && members.length > 0 && (
                  <div
                    className="hidden sm:block w-px h-8 luxe-divider"
                    style={animateConnectors ? {
                      transform: `scaleY(${droplineProg})`,
                      transformOrigin: 'top',
                      transition: 'transform 200ms ease-out',
                    } : undefined}
                  />
                )}

                {/* Members row */}
                {members.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 sm:gap-10 mt-8 relative w-full">
                    {members.length > 1 && (
                      <>
                        {/* Mobile trunk: 2 cols, gap-6 = 24px → inset (100% − 24px)/4 */}
                        <div
                          className="block sm:hidden absolute -top-8 h-px luxe-divider"
                          style={{
                            left: 'calc((100% - 24px) / 4)',
                            right: 'calc((100% - 24px) / 4)',
                            ...(animateConnectors ? {
                              transform: `scaleX(${trunkProg})`,
                              transformOrigin: 'left',
                              transition: 'transform 200ms ease-out',
                            } : {}),
                          }}
                        />
                        {/* Desktop trunk: 3 cols, gap-10 = 40px → inset (100% − 80px)/6 */}
                        <div
                          className="hidden sm:block absolute -top-8 h-px luxe-divider"
                          style={{
                            ...(members.length === 2
                              ? { left: 'calc((100% - 80px) / 6)', right: '50%' }
                              : { left: 'calc((100% - 80px) / 6)', right: 'calc((100% - 80px) / 6)' }
                            ),
                            ...(animateConnectors ? {
                              transform: `scaleX(${trunkProg})`,
                              transformOrigin: 'left',
                              transition: 'transform 200ms ease-out',
                            } : {}),
                          }}
                        />
                      </>
                    )}

                    {members.map((m, i) => {
                      const mSlot = memberSlots[i]
                      const memberDropProg = animateConnectors
                        ? clampProg(mSlot.drop.start, mSlot.drop.end)
                        : 1
                      return (
                        <div key={m.id} className="relative">
                          {i < 3 && (
                            <div
                              className="hidden sm:block absolute left-1/2 -top-8 w-px h-8 luxe-divider"
                              style={animateConnectors ? {
                                transform: `translateX(-50%) scaleY(${memberDropProg})`,
                                transformOrigin: 'top',
                                transition: 'transform 200ms ease-out',
                              } : {
                                transform: 'translateX(-50%)',
                              }}
                            />
                          )}
                          <TeamCard
                            member={m}
                            isAdmin={isAdmin}
                            onMemberChange={mm =>
                              setTeam(t => t.map(x => (x.id === mm.id ? mm : x)))
                            }
                            mode="inflate"
                            sectionProgress={teamProgress}
                            slot={mSlot.card}
                          />
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )
          })()}
          </div>
        </div>
      </section>

      {/* ─── Footer ──────────────────────────────────────────── */}
      <footer id="contact" className="landing-footer-luxe scroll-mt-4">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-10 pb-28 lg:pb-10">
          <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr_auto] items-center gap-8 sm:gap-12">
            {/* Union Trading Co. logo — full opacity, no drop-shadow */}
            <div className="flex items-center justify-center sm:justify-start">
              <img
                src="./union-trading-logo.png"
                alt="Union Trading Co."
                className="h-16 sm:h-20 w-auto object-contain landing-footer-logo"
              />
            </div>

            {/* Contact block — centered */}
            <div className="flex flex-col items-center text-center">
              <div className="landing-footer-eyebrow">Contact Us</div>
              <a
                href="mailto:ebs@utc.com.kw"
                className="landing-footer-email"
              >
                <Mail size={14} className="landing-footer-mail-icon" />
                ebs@utc.com.kw
              </a>
            </div>

            {/* Editable footer caption */}
            <EditableText
              value={content.footer_text}
              isAdmin={isAdmin}
              onSave={v => saveContent('footer_text', v)}
              className="landing-footer-caption text-center sm:text-right"
              as="p"
            />
          </div>
          <div className="landing-footer-baseline">
            Built with care · Kuwait · {new Date().getFullYear()}
          </div>
        </div>
      </footer>
    </div>
    </div>
  )
}
