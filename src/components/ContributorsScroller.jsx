import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import './ContributorsScroller.css'

const SCROLL_SPEED = 0.6
const SCROLL_STEP  = 120

export default function ContributorsScroller({ contributors }) {
  const trackRef  = useRef(null)
  const rafRef    = useRef(null)
  const pausedRef = useRef(false)

  // Whether a single copy of the list overflows the track. Drives doubling +
  // auto-scroll; when false we render once and center it.
  const [overflowing, setOverflowing] = useState(false)
  const [showLeft,    setShowLeft]    = useState(false)
  const [showRight,   setShowRight]   = useState(false)

  const updateArrows = useCallback(() => {
    const el = trackRef.current
    if (!el || !overflowing) {
      setShowLeft(false)
      setShowRight(false)
      return
    }
    setShowLeft(el.scrollLeft > 1)
    setShowRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }, [overflowing])

  // Measure whether a single copy of the list overflows the track. We always
  // measure the first `contributors.length` children — those are the original
  // items regardless of whether the doubled copy is currently rendered.
  useLayoutEffect(() => {
    const el = trackRef.current
    if (!el || contributors.length === 0) {
      setOverflowing(false)
      return
    }

    const measure = () => {
      const n = contributors.length
      const children = el.children
      const max = Math.min(n, children.length)
      if (max === 0) return
      let contentWidth = 0
      for (let i = 0; i < max; i++) {
        contentWidth += children[i].getBoundingClientRect().width
      }
      const cs = window.getComputedStyle(el)
      const gap = parseFloat(cs.columnGap || cs.gap || '0') || 0
      contentWidth += gap * (max - 1)
      contentWidth += parseFloat(cs.paddingLeft || '0') + parseFloat(cs.paddingRight || '0')
      const needs = contentWidth > el.clientWidth + 1
      setOverflowing((prev) => (prev === needs ? prev : needs))
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    if (el.parentElement) ro.observe(el.parentElement)
    return () => ro.disconnect()
  }, [contributors])

  useEffect(() => {
    const el = trackRef.current
    if (!el || !overflowing || contributors.length === 0) return

    const step = () => {
      if (!pausedRef.current) {
        el.scrollLeft += SCROLL_SPEED
        // when we've scrolled past the first copy, silently jump back
        const half = el.scrollWidth / 2
        if (el.scrollLeft >= half) {
          el.scrollLeft -= half
        }
        updateArrows()
      }
      rafRef.current = requestAnimationFrame(step)
    }

    rafRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafRef.current)
  }, [contributors, overflowing, updateArrows])

  const pause  = () => { pausedRef.current = true }
  const resume = () => { pausedRef.current = false }

  const scrollBy = (dir) => {
    const el = trackRef.current
    if (!el || !overflowing) return
    pause()
    el.scrollLeft += dir * SCROLL_STEP
    // wrap within first copy
    const half = el.scrollWidth / 2
    if (el.scrollLeft >= half) el.scrollLeft -= half
    if (el.scrollLeft < 0)    el.scrollLeft += half
    updateArrows()
    setTimeout(resume, 1200)
  }

  if (!contributors.length) return <p className="no-contributors">Github Profiles</p>

  // Only duplicate when we actually need the seamless loop.
  const items = overflowing ? [...contributors, ...contributors] : contributors

  return (
    <div
      className={`scroller-wrapper${overflowing ? '' : ' scroller-wrapper--centered'}`}
      onMouseEnter={pause}
      onMouseLeave={resume}
    >
      {showLeft && (
        <button className="scroll-arrow scroll-arrow--left" onClick={() => scrollBy(-1)} aria-label="Scroll left">
          ‹
        </button>
      )}

      <div
        ref={trackRef}
        className={`scroller-track${overflowing ? '' : ' scroller-track--centered'}`}
        onScroll={updateArrows}
      >
        {items.map(({ id, login, avatar_url, html_url }, i) => (
          <a key={`${id}-${i}`} href={html_url} target="_blank" rel="noreferrer" className="contributor-chip" title={login}>
            <img src={avatar_url} alt={login} />
            <span>{login}</span>
          </a>
        ))}
      </div>

      {showRight && (
        <button className="scroll-arrow scroll-arrow--right" onClick={() => scrollBy(1)} aria-label="Scroll right">
          ›
        </button>
      )}
    </div>
  )
}
