// Per-batch local override list.
//
// We track each user mutation as its own record (one cell edit = one entry),
// not a full snapshot of the schedule. This matches the backend `overrides`
// collection shape, so the local store and the server store hold the same
// kind of objects — local just isn't admin-moderated and isn't synced.
//
// On render the grid takes the canonical `classes` array and folds the
// overrides on top to produce what the user sees. localStorage is purely a
// cache for speed and for anonymous users; once a user submits a change for
// their batch/class, the backend has its own copy in the `overrides`
// collection.

const PREFIX = 'mlsc.tt.overrides.'
const VERSION = 2
// Overrides go stale this many days after the last write. Long enough to
// span a typical semester break, short enough that a returning user with no
// recent activity sees the canonical timetable rather than long-forgotten
// edits. Reset whenever the user saves another change.
const TTL_DAYS = 90
const TTL_MS = TTL_DAYS * 24 * 60 * 60 * 1000

function keyFor(batch) {
  return `${PREFIX}${String(batch).toUpperCase()}`
}

function safeStorage() {
  try {
    if (typeof window === 'undefined') return null
    return window.localStorage
  } catch {
    return null
  }
}

function isExpired(updatedAt) {
  if (!updatedAt) return true
  const t = Date.parse(updatedAt)
  if (Number.isNaN(t)) return true
  return Date.now() - t > TTL_MS
}

/** Read the override list for a batch. Returns [] on miss / corruption / expiry. */
export function loadOverrides(batch) {
  if (!batch) return []
  const ls = safeStorage()
  if (!ls) return []
  try {
    const raw = ls.getItem(keyFor(batch))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!parsed || parsed.version !== VERSION || !Array.isArray(parsed.overrides)) return []
    if (isExpired(parsed.updatedAt)) {
      ls.removeItem(keyFor(batch))
      return []
    }
    return parsed.overrides
  } catch {
    return []
  }
}

/** Replace the entire override list for a batch. */
export function saveOverrides(batch, overrides) {
  if (!batch) return
  const ls = safeStorage()
  if (!ls) return
  try {
    ls.setItem(
      keyFor(batch),
      JSON.stringify({
        version: VERSION,
        updatedAt: new Date().toISOString(),
        overrides,
      }),
    )
  } catch {
    /* quota / privacy mode — fail silent */
  }
}

export function clearOverrides(batch) {
  if (!batch) return
  const ls = safeStorage()
  if (!ls) return
  try {
    ls.removeItem(keyFor(batch))
  } catch {
    /* no-op */
  }
}

/**
 * Fold a list of overrides on top of the canonical classes array.
 * Overrides apply in order so the latest edit/delete on the same id wins.
 *
 *   override shape: { kind, targetId?, day, startTime, entry?, addId? }
 *   - add: appends `entry` (entry.id should already be set, e.g. addId)
 *   - edit: replaces the entry whose id matches targetId (or falls back to day+startTime)
 *   - delete: removes the entry whose id matches targetId (or day+startTime)
 */
export function applyOverrides(classes, overrides) {
  if (!overrides || overrides.length === 0) return classes
  let result = Array.isArray(classes) ? [...classes] : []
  for (const ov of overrides) {
    if (!ov || !ov.kind) continue
    if (ov.kind === 'add') {
      if (ov.entry) result.push(ov.entry)
      continue
    }
    // Match strategy:
    //   1. By targetId when present and still found in the data (fast path
    //      within a single session — ids are stable while the page lives).
    //   2. By the recorded baseEntry signature (day+startTime+subject+code).
    //      This is the resilient path: the timetable.js loader assigns ids
    //      from an in-memory counter, so they're NOT stable across reloads.
    //      baseEntry survives because we serialize it with the override.
    //   3. Legacy overrides without baseEntry fall back to slot key only.
    const matches = (e) => {
      if (ov.targetId != null && e.id === ov.targetId) return true
      if (ov.baseEntry &&
          e.day === ov.baseEntry.day &&
          e.startTime === ov.baseEntry.startTime &&
          (e.subject ?? '') === (ov.baseEntry.subject ?? '') &&
          (e.code ?? '') === (ov.baseEntry.code ?? '')) return true
      if (ov.targetId == null && !ov.baseEntry) {
        return e.day === ov.day && e.startTime === ov.startTime
      }
      return false
    }
    if (ov.kind === 'edit' || ov.kind === 'elective_pick') {
      // Edit only the first matching entry. Without this guard, a baseEntry
      // fallback could match multiple rows (e.g. after a previous override
      // moved another entry into the same slot with similar fields) and the
      // single override would smear across all of them, producing duplicates.
      // Preserve the canonical entry's current id so a stale id baked into
      // ov.entry can't collide with a different canonical entry that now
      // happens to hold that id.
      let editApplied = false
      result = result.map(e => {
        if (editApplied) return e
        if (matches(e)) {
          editApplied = true
          return { ...e, ...ov.entry, id: e.id }
        }
        return e
      })
    } else if (ov.kind === 'delete') {
      // Delete only the first matching entry, same rationale as edit.
      let deleteApplied = false
      result = result.filter(e => {
        if (deleteApplied) return true
        if (matches(e)) {
          deleteApplied = true
          return false
        }
        return true
      })
    }
  }
  return result
}

/**
 * Stable fingerprint of a class entry's visible fields. Used to detect when
 * the canonical timetable has been changed underneath a user's override
 * (e.g. an approved batch-wide change request). Ids are intentionally
 * excluded — they may be re-minted on a refetch.
 */
function fingerprintEntry(e) {
  if (!e) return ''
  return JSON.stringify({
    subject: e.subject ?? '',
    code:    e.code    ?? '',
    teacher: e.teacher ?? '',
    type:    e.type    ?? '',
    room:    e.room    ?? '',
    endTime: e.endTime ?? e.end_time ?? '',
    alternateWeekStart: e.alternateWeekStart ?? e.alternate_week_start ?? null,
    electiveChoice: e.electiveChoice ?? e.elective_choice ?? null,
    electiveDismissed: e.electiveDismissed === true || e.elective_dismissed === true,
    options: Array.isArray(e.options) ? e.options : [],
  })
}

/**
 * Drop overrides that no longer make sense against the current canonical
 * timetable. Called whenever fresh `classes` arrive (mount, batch switch,
 * any refetch). This is how an admin-approved change actually reaches a
 * user who had locally overridden the same slot.
 *
 *   - edit / delete: keep only if some canonical entry at that slot still
 *     matches the recorded `baseEntry` fingerprint. If the slot's canonical
 *     content has changed, the admin's update wins.
 *   - add: keep unless that same stable personal id is already present in the
 *     backend view. Different classes may legitimately share a slot.
 *   - overrides without a `baseEntry` (legacy / migrated) are kept; we
 *     can't decide for them.
 *
 * Returns the filtered list — same reference if nothing was dropped.
 */
export function reconcileOverrides(classes, overrides) {
  if (!overrides || overrides.length === 0) return overrides ?? []
  const bySlot = new Map()
  for (const e of classes ?? []) {
    const k = `${e.day}|${e.startTime}`
    if (!bySlot.has(k)) bySlot.set(k, [])
    bySlot.get(k).push(e)
  }
  let changed = false
  const kept = []
  for (const ov of overrides) {
    if (!ov || !ov.kind) {
      changed = true
      continue
    }
    if (ov.kind === 'add') {
      const personalId = ov.addId ?? ov.entry?.id
      if (personalId && (classes ?? []).some(entry => entry.id === personalId)) {
        changed = true
        continue
      }
      kept.push(ov)
      continue
    }
    if (ov.kind === 'edit' || ov.kind === 'elective_pick' || ov.kind === 'delete') {
      const currentTarget = (classes ?? []).find(entry => entry.id === ov.targetId)
      if (!ov.baseEntry) {
        if (currentTarget) {
          kept.push(ov)
          continue
        }
        const slotMatches = bySlot.get(`${ov.day}|${ov.startTime}`) ?? []
        if (slotMatches.length !== 1) {
          changed = true
          continue
        }
        const targetId = slotMatches[0].id
        kept.push({
          ...ov,
          targetId,
          entry: ov.entry ? { ...ov.entry, id: targetId } : ov.entry,
        })
        changed = true
        continue
      }
      const baseFp = fingerprintEntry(ov.baseEntry)
      // For drag-moved edits, ov.day/startTime is the NEW slot but the base
      // entry still lives at its original slot in the canonical data — look
      // it up by baseEntry.day/startTime, not by the override's slot.
      const baseKey = `${ov.baseEntry.day}|${ov.baseEntry.startTime}`
      const baseSlotEntries = bySlot.get(baseKey) ?? []
      const matched = baseSlotEntries.find(e => fingerprintEntry(e) === baseFp)
      if (!matched) {
        changed = true
        continue
      }
      if (matched.id !== ov.targetId) {
        kept.push({
          ...ov,
          targetId: matched.id,
          entry: ov.entry ? { ...ov.entry, id: matched.id } : ov.entry,
        })
        changed = true
      } else {
        kept.push(ov)
      }
      continue
    }
    kept.push(ov)
  }
  return changed ? kept : overrides
}

/**
 * Merge a new override into an existing list with simple collapsing rules:
 *  - second edit on the same targetId merges with the first
 *  - delete on an entry we previously added cancels both (no surviving record)
 *  - delete on an entry we previously edited drops the edit and keeps the delete
 *  - everything else appends
 *
 * Add overrides carry their slot id under `addId` so future ops can find them.
 */
export function mergeOverride(existing, incoming) {
  const list = Array.isArray(existing) ? [...existing] : []
  if (!incoming || !incoming.kind) return list

  if ((incoming.kind === 'edit' || incoming.kind === 'elective_pick') && incoming.targetId != null) {
    const idx = list.findIndex(o =>
      (o.kind === 'edit' || o.kind === 'elective_pick') && o.targetId === incoming.targetId,
    )
    if (idx >= 0) {
      // Keep the ORIGINAL baseEntry so it always points at the canonical
      // source row. If we let `...incoming` overwrite it, baseEntry would
      // drift to reflect the current (already-overridden) view, breaking
      // the reload-resilience fallback in applyOverrides.
      const preservedBase = list[idx].baseEntry || incoming.baseEntry
      list[idx] = {
        ...list[idx],
        ...incoming,
        baseEntry: preservedBase,
        entry: { ...list[idx].entry, ...incoming.entry },
      }
      return list
    }
    // editing a freshly-added entry → fold into the add
    const addIdx = list.findIndex(o => o.kind === 'add' && o.addId === incoming.targetId)
    if (addIdx >= 0) {
      list[addIdx] = {
        ...list[addIdx],
        entry: { ...list[addIdx].entry, ...incoming.entry },
      }
      return list
    }
  }

  if (incoming.kind === 'delete' && incoming.targetId != null) {
    const addIdx = list.findIndex(o => o.kind === 'add' && o.addId === incoming.targetId)
    if (addIdx >= 0) {
      list.splice(addIdx, 1)
      return list
    }
    const pruned = list.filter(o =>
      !((o.kind === 'edit' || o.kind === 'elective_pick') && o.targetId === incoming.targetId),
    )
    pruned.push(incoming)
    return pruned
  }

  list.push(incoming)
  return list
}
