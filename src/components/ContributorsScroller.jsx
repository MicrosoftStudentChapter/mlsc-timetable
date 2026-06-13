import { useEffect, useRef, useState, useCallback } from 'react'
import './ContributorsScroller.css'

const SCROLL_SPEED = 0.6
const SCROLL_STEP  = 120

export default function ContributorsScroller({ contributors }) {
  const trackRef  = useRef(null)
  const rafRef    = useRef(null)
  const pausedRef = useRef(false)

  const [showLeft,  setShowLeft]  = useState(false)
  const [showRight, setShowRight] = useState(true)

  const updateArrows = useCallback(() => {
    const el = trackRef.current
    if (!el) return
    // in infinite mode always show both once scrollable, except true edges
    setShowLeft(el.scrollLeft > 1)
    setShowRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }, [])

  useEffect(() => {
    const el = trackRef.current
    if (!el || contributors.length === 0) return

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
  }, [contributors, updateArrows])

  const pause  = () => { pausedRef.current = true }
  const resume = () => { pausedRef.current = false }

  const scrollBy = (dir) => {
    const el = trackRef.current
    if (!el) return
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

  // render items twice for seamless loop
  const items = [...contributors, ...contributors]

  return (
    <div className="scroller-wrapper" onMouseEnter={pause} onMouseLeave={resume}>
      {showLeft && (
        <button className="scroll-arrow scroll-arrow--left" onClick={() => scrollBy(-1)} aria-label="Scroll left">
          ‹
        </button>
      )}

      <div ref={trackRef} className="scroller-track" onScroll={updateArrows}>
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
