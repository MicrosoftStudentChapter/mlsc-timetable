import { useEffect } from 'react'

export function useNavbarPadding() {
  useEffect(() => {
    const apply = () => {
      const overflows = document.documentElement.scrollHeight > window.innerHeight
      document.body.style.paddingBottom = overflows ? '72px' : '0'
    }

    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(document.documentElement)
    return () => ro.disconnect()
  }, [])
}
