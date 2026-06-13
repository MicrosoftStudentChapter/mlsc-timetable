import fallback from '../data/batches.json'

const YEAR_LABELS = {
  1: '1st Year',
  2: '2nd Year',
  3: '3rd Year',
  4: '4th Year',
}

const BATCH_RE = /^(\d)([A-Z])\d+$/

// Year 1 sorts Pool A, Pool B first, then the rest alphabetically.
// Years 2+ are always alphabetical by stream code.
function streamSorter(year) {
  if (year === 1) {
    const rank = (c) => (c === 'A' ? 0 : c === 'B' ? 1 : 2)
    return (a, b) => {
      const ra = rank(a.code)
      const rb = rank(b.code)
      return ra !== rb ? ra - rb : a.code.localeCompare(b.code)
    }
  }
  return (a, b) => a.code.localeCompare(b.code)
}

export function groupBatches(list, streamNames = {}) {
  const byYear = new Map()
  for (const code of list) {
    if (typeof code !== 'string') continue
    const m = BATCH_RE.exec(code.trim())
    if (!m) continue
    const year = Number(m[1])
    const alpha = m[2]
    if (!byYear.has(year)) byYear.set(year, new Map())
    const streams = byYear.get(year)
    if (!streams.has(alpha)) streams.set(alpha, [])
    streams.get(alpha).push(code)
  }

  const out = []
  for (const year of [1, 2, 3, 4]) {
    const streamMap = byYear.get(year)
    if (!streamMap) continue
    const nameMap = streamNames[String(year)] ?? streamNames.default ?? {}
    const streams = []
    for (const [alpha, batches] of streamMap) {
      if (!batches.length) continue
      streams.push({
        code: alpha,
        name: nameMap[alpha] ?? alpha,
        batches: [...new Set(batches)].sort(),
      })
    }
    if (!streams.length) continue
    streams.sort(streamSorter(year))
    out.push({ year, label: YEAR_LABELS[year] ?? `Year ${year}`, streams })
  }
  return out
}

export async function loadBatches() {
  const baseUrl = import.meta.env.VITE_BACKEND_URL
  if (baseUrl) {
    try {
      const url = `${baseUrl.replace(/\/$/, '')}/batch`
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        const list = Array.isArray(data) ? data : data?.batches
        if (Array.isArray(list) && list.length) {
          return groupBatches(list, fallback.streamNames)
        }
      }
    } catch {
      // fall through to local fallback
    }
  }
  // Local fallback is already pre-grouped — use it directly.
  return fallback.years ?? []
}
