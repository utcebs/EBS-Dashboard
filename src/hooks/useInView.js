import { useEffect, useRef, useState } from 'react'

// Lightweight IntersectionObserver hook — no deps. Fires once by default
// (so animations don't replay every time the element scrolls back in).
export function useInView({ threshold = 0.15, rootMargin = '0px 0px -40px 0px', triggerOnce = true } = {}) {
  const ref = useRef(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          if (triggerOnce) observer.unobserve(el)
        } else if (!triggerOnce) {
          setInView(false)
        }
      },
      { threshold, rootMargin },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold, rootMargin, triggerOnce])

  return [ref, inView]
}
