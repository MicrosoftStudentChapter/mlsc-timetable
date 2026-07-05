// Client-side timetable export.
//
// Captures a DOM node (the rendered timetable grid wrapper) as PNG or PDF
// using `html-to-image` + `jspdf`. WYSIWYG — whatever the user has on screen
// (theme, card style, day-strip vs full grid) is what they get in the file.
//
// All work happens in the browser; nothing leaves the device.
//
// Both libs are loaded on first use so the main bundle stays lean for users
// who never open the Save menu.

// CSS class temporarily applied to the captured node so we can hide
// interactive-only chrome (add buttons, hover tooltips) for the snapshot.
const EXPORTING_CLASS = 'tt-exporting'

// Resolve the surface colour from CSS so dark-mode exports keep a dark
// background instead of bleeding to transparent. We prefer the grid frame's
// own bg so the area outside the rounded corners (but inside the bitmap's
// bounding box) blends seamlessly with the rest of the frame.
function resolveBackground(node) {
  const frame = node?.querySelector?.('.tt-grid-frame') || node
  const styles = getComputedStyle(frame)
  const bg = styles.backgroundColor
  if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg
  const docBg = getComputedStyle(document.body).backgroundColor
  if (docBg && docBg !== 'rgba(0, 0, 0, 0)' && docBg !== 'transparent') return docBg
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
  return isDark ? '#0b0b0b' : '#ffffff'
}

function sanitize(s) {
  return String(s ?? '').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'timetable'
}

function todayStamp() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
}

function buildFilename(batch, ext) {
  return `timetable-${sanitize(batch)}-${todayStamp()}.${ext}`
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Give the browser a tick to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Convert a data: URL into a Blob without round-tripping through fetch.
function dataUrlToBlob(dataUrl) {
  const [header, b64] = dataUrl.split(',')
  const mime = /data:([^;]+);/.exec(header)?.[1] || 'image/png'
  const bin = atob(b64)
  const len = bin.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

async function captureNode(node, aspect = null, { pixelRatio = 3 } = {}) {
  if (!node) throw new Error('Nothing to export — grid not mounted yet.')
  const { toPng } = await import('html-to-image')
  node.classList.add(EXPORTING_CLASS)
  // Two rAFs to let the forced desktop layout (off-screen) reflow before
  // html-to-image walks the DOM; otherwise the capture races the reflow and
  // dimensions come back as the still-clipped mobile viewport.
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))

  // Re-shape the grid itself to the target aspect (instead of letterboxing
  // afterwards). The grid widens its day columns or stretches row heights
  // until the bounding box matches the requested ratio.
  const frame = node.querySelector?.('.tt-grid-frame')
  const restoreGrid = aspect && frame ? reshapeGridToAspect(frame, aspect) : null
  if (restoreGrid) {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  }

  const backgroundColor = resolveBackground(node)
  try {
    const dataUrl = await toPng(node, {
      pixelRatio,
      cacheBust: true,
      backgroundColor,
      style: { transform: 'none' },
    })
    return { dataUrl, backgroundColor }
  } finally {
    node.classList.remove(EXPORTING_CLASS)
    if (restoreGrid) restoreGrid()
  }
}

// Mutate the grid frame's inline custom properties so its bounding box
// matches `ratio` (width / height). When the grid is currently wider than
// the target we grow row height; when narrower we grow per-day column width.
// Iterates a few times to converge because growing one dimension also
// nudges the other slightly (text re-wraps, header re-layouts).
// Returns a teardown function that restores the previous inline values.
function reshapeGridToAspect(frame, ratio) {
  const prevInline = {
    '--col-width': frame.style.getPropertyValue('--col-width'),
    '--row-height': frame.style.getPropertyValue('--row-height'),
  }
  // Pin an explicit baseline first — otherwise on small viewports the live
  // CSS variables may resolve to mobile values (e.g. --col-width: 84px)
  // before the `.tt-exporting` cascade fully settles, and the iterative
  // loop ends up massively widening the columns to compensate.
  //
  // Baseline scales down on narrow devices so phone exports are naturally
  // phone-shaped (narrower columns, taller body) rather than a rigid
  // desktop-width grid stretched vertically to fake an aspect ratio.
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280
  const isNarrow = vw < 700
  const BASE_COL = isNarrow ? 140 : 200
  const BASE_ROW = isNarrow ? 50 : 56
  frame.style.setProperty('--col-width', `${BASE_COL}px`)
  frame.style.setProperty('--row-height', `${BASE_ROW}px`)
  // Force a synchronous layout flush so subsequent scrollWidth reads reflect
  // the pinned baseline rather than the previous mobile sizes.
  // eslint-disable-next-line no-unused-expressions
  frame.offsetWidth

  let colW = BASE_COL
  let rowH = BASE_ROW
  // Ceilings/floors. On narrow devices column max stays modest so we never
  // re-bloat the width when chasing landscape targets — height does the work.
  const COL_MAX = isNarrow ? 220 : 600
  const ROW_MAX = 1600
  const COL_MIN = isNarrow ? 100 : 120
  const ROW_MIN = 40

  for (let i = 0; i < 6; i++) {
    const W = frame.scrollWidth
    const H = frame.scrollHeight
    if (!W || !H) break
    const current = W / H
    if (Math.abs(current - ratio) / ratio < 0.005) break
    if (ratio > current) {
      // Need it wider — pump up day column width.
      colW = Math.min(COL_MAX, Math.max(COL_MIN, colW * (ratio / current)))
      frame.style.setProperty('--col-width', `${colW}px`)
    } else {
      // Need it taller — pump up row height.
      rowH = Math.min(ROW_MAX, Math.max(ROW_MIN, rowH * (current / ratio)))
      frame.style.setProperty('--row-height', `${rowH}px`)
    }
    // Force a layout flush so the next iteration reads the post-mutation dims.
    // eslint-disable-next-line no-unused-expressions
    frame.offsetWidth
  }

  return () => {
    for (const [prop, val] of Object.entries(prevInline)) {
      if (val) frame.style.setProperty(prop, val)
      else frame.style.removeProperty(prop)
    }
  }
}

// Preset aspect ratios offered in the Save menu. `ratio` is null for the
// natural "fit content" mode (no letterboxing). For everything else, ratio is
// width / height — the captured bitmap is centred onto a canvas of that
// aspect, padded with the resolved background colour.
export const ASPECT_PRESETS = [
  { id: 'fit',          label: 'Fit content',           ratio: null },
  { id: '16-9',         label: 'Landscape 16:9',        ratio: 16 / 9 },
  { id: '4-3',          label: 'Landscape 4:3',         ratio: 4 / 3 },
  { id: '1-1',          label: 'Square 1:1',            ratio: 1 },
  { id: '4-5',          label: 'Portrait 4:5',          ratio: 4 / 5 },
  { id: '3-4',          label: 'Portrait 3:4',          ratio: 3 / 4 },
  { id: '9-16',         label: 'Phone 9:16',            ratio: 9 / 16 },
  { id: 'a4-l',         label: 'A4 Landscape',          ratio: Math.SQRT2 },
  { id: 'a4-p',         label: 'A4 Portrait',           ratio: 1 / Math.SQRT2 },
  { id: 'letter-l',     label: 'US Letter Landscape',   ratio: 11 / 8.5 },
  { id: 'letter-p',     label: 'US Letter Portrait',    ratio: 8.5 / 11 },
]

// After `reshapeGridToAspect` the captured image is already very close to
// the target ratio — within a few pixels. This pass enforces the exact
// aspect by sizing the canvas to the next-larger ratio match and centring
// the bitmap, painting any residual sliver with the resolved background
// colour so it blends with the grid frame.
async function fitToAspect(dataUrl, backgroundColor, ratio) {
  const img = await new Promise((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = reject
    el.src = dataUrl
  })
  const W = img.naturalWidth
  const H = img.naturalHeight
  if (!ratio || !isFinite(ratio) || ratio <= 0) {
    return { dataUrl, width: W, height: H }
  }
  // Smallest canvas containing the bitmap at full size at the target ratio.
  let cw, ch
  if (W / H >= ratio) {
    cw = W
    ch = Math.round(W / ratio)
  } else {
    ch = H
    cw = Math.round(H * ratio)
  }
  // If the bitmap is already essentially at the target ratio, skip the
  // canvas round-trip entirely.
  if (cw === W && ch === H) {
    return { dataUrl, width: W, height: H }
  }
  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = backgroundColor || '#ffffff'
  ctx.fillRect(0, 0, cw, ch)
  const dx = Math.round((cw - W) / 2)
  const dy = Math.round((ch - H) / 2)
  ctx.drawImage(img, dx, dy)
  return { dataUrl: canvas.toDataURL('image/png'), width: cw, height: ch }
}

export async function exportGridAsPng({ node, batch, aspect = null }) {
  const captured = await captureNode(node, aspect)
  const { dataUrl } = await fitToAspect(captured.dataUrl, captured.backgroundColor, aspect)
  triggerDownload(dataUrlToBlob(dataUrl), buildFilename(batch, 'png'))
}

// "rgb(r, g, b)" / "rgba(r, g, b, a)" / "#rgb" / "#rrggbb" → [r, g, b]
function parseColor(input) {
  if (!input) return [255, 255, 255]
  const s = String(input).trim()
  if (s.startsWith('#')) {
    const hex = s.length === 4
      ? s.slice(1).split('').map((c) => c + c).join('')
      : s.slice(1)
    const n = parseInt(hex, 16)
    return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
  }
  const m = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
  if (m) return [+m[1], +m[2], +m[3]]
  return [255, 255, 255]
}

export async function exportGridAsPdf({ node, batch, aspect = null }) {
  // PDF export uses the same 3x pixel density as PNG and re-encodes the
  // captured bitmap as a maximum-quality JPEG (q=1.0). JPEG alone shrinks
  // the embedded image vs a lossless PNG while staying visually
  // indistinguishable on text and flat card backgrounds.
  const captured = await captureNode(node, aspect, { pixelRatio: 3 })
  const { dataUrl, width: w, height: h } = await fitToAspect(
    captured.dataUrl,
    captured.backgroundColor,
    aspect,
  )
  const jpegDataUrl = await reencodeAsJpeg(dataUrl, captured.backgroundColor, 1.0)
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({
    orientation: w >= h ? 'landscape' : 'portrait',
    unit: 'px',
    format: [w, h],
    hotfixes: ['px_scaling'],
  })
  const [r, g, b] = parseColor(captured.backgroundColor)
  pdf.setFillColor(r, g, b)
  pdf.rect(0, 0, w, h, 'F')
  pdf.addImage(jpegDataUrl, 'JPEG', 0, 0, w, h, undefined, 'SLOW')
  const blob = pdf.output('blob')
  triggerDownload(blob, buildFilename(batch, 'pdf'))
}

// Round-trip a PNG data URL through a <canvas> to produce a JPEG data URL.
// JPEG has no alpha channel, so we paint the resolved background first to
// avoid black bleed-through wherever the source was transparent.
async function reencodeAsJpeg(pngDataUrl, backgroundColor, quality = 0.92) {
  const img = await new Promise((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = reject
    el.src = pngDataUrl
  })
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = backgroundColor || '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0)
  return canvas.toDataURL('image/jpeg', quality)
}
