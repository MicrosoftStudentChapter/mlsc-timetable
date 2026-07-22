/**
 * useTheme — manages light/dark mode
 *
 * • Reads saved preference from localStorage on mount.
 * • Falls back to the OS colour-scheme preference.
 * • Writes `data-theme="light"|"dark"` onto <html> so CSS rules
 *   can target [data-theme="dark"] without any React context.
 * • Persists changes to localStorage so the preference survives reloads.
 */
import { useEffect, useState } from 'react'

const STORAGE_KEY = 'mlsc-theme'

function getInitialTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'dark' || saved === 'light') return saved
  } catch (_) {
    // localStorage unavailable (e.g. private browsing edge-cases)
  }
  // Fall back to OS preference
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function useTheme() {
  const [theme, setTheme] = useState(getInitialTheme)

  // Sync to <html data-theme="..."> and localStorage whenever theme changes
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch (_) {}
  }, [theme])

  const toggleTheme = (event) => {
    const updateTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
    const startViewTransition = document.startViewTransition

    if (typeof startViewTransition !== 'function' || !event) {
      updateTheme()
      return
    }

    const x = event.clientX
    const y = event.clientY
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    )
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
    const transition = startViewTransition.call(document, updateTheme)

    transition.ready.then(() => {
      document.documentElement.animate(
        {
          clipPath: isDark
            ? [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`]
            : [`circle(${endRadius}px at ${x}px ${y}px)`, `circle(0px at ${x}px ${y}px)`],
        },
        {
          duration: 500,
          easing: 'ease-in-out',
          pseudoElement: isDark ? '::view-transition-new(root)' : '::view-transition-old(root)',
        },
      )
    }).catch(() => {})
  }

  return { theme, toggleTheme }
}
