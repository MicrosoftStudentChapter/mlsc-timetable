import fallback from '../data/batches.json'
import { getBackendUrl } from './backend_url'

const YEAR_LABELS = {
  1: '1st Year',
  2: '2nd Year',
  3: '3rd Year',
  4: '4th Year',
}

const BATCH_RE = /^(\d)([A-Z])[A-Z0-9]+$/

export const SPECIAL_BATCHES = {
  '2UOQ': { name: 'Computer Engineering (2+2)', schemeBranch: 'C', partner: 'University of Queensland' },
  '2UNSW': { name: 'Computer Engineering (2+2)', schemeBranch: 'C', partner: 'University of New South Wales' },
  '2TCD': { name: 'Computer Engineering (2+2)', schemeBranch: 'C', partner: 'Trinity College Dublin' },
}

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

export function groupBatches(list, streamNames = {}, specialBatches = SPECIAL_BATCHES) {
  const byYear = new Map()
  for (const code of list) {
    if (typeof code !== 'string') continue
    const normalized = code.trim().toUpperCase()
    const special = specialBatches[normalized]
    const m = BATCH_RE.exec(normalized)
    if (special) {
      const year = Number(normalized[0])
      if (!byYear.has(year)) byYear.set(year, new Map())
      const streams = byYear.get(year)
      const key = 'CE-2+2'
      if (!streams.has(key)) streams.set(key, [])
      streams.get(key).push(normalized)
      continue
    }
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
    streams.sort((a, b) => {
      if (a.code === 'CE-2+2') return 1
      if (b.code === 'CE-2+2') return -1
      return streamSorter(year)(a, b)
    })
    out.push({ year, label: YEAR_LABELS[year] ?? `Year ${year}`, streams })
  }
  return out
}

async function fetchBatchList(url) {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    const list = Array.isArray(data) ? data : data?.batches
    return Array.isArray(list) && list.length ? list : null
  } catch {
    return null
  }
}

export async function loadBatches() {
  const baseUrl = getBackendUrl()
  if (baseUrl) {
    const list = await fetchBatchList(`${baseUrl.replace(/\/$/, '')}/batch`)
    if (list) return groupBatches(list, fallback.streamNames, fallback.specialBatches)
  }
  // Bundled snapshot mirrors the backend's GET /batch response shape.
  const snapshotUrl = `${import.meta.env.BASE_URL || '/'}fallback/batch.json`
  const list = await fetchBatchList(snapshotUrl)
  if (list) return groupBatches(list, fallback.streamNames, fallback.specialBatches)
  // Last-ditch: the pre-grouped JSON committed to src/data/.
  return fallback.years ?? []
}
