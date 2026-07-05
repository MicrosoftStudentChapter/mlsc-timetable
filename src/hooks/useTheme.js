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

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))

  return { theme, toggleTheme }
}
