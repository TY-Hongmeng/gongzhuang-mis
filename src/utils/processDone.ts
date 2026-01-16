import { idbGet, idbSet } from './idbKv'
import { safeLocalStorage } from './safeStorage'

export interface ProcessDoneEntry {
  done: string[]
  last?: string
  time?: number
}

const KEY_PREFIX = 'process_done:'

function normalizeKey(key: string): string {
  return String(key || '').trim().toUpperCase()
}

function storageKey(key: string): string {
  return `${KEY_PREFIX}${normalizeKey(key)}`
}

export async function getProcessDone(key: string): Promise<ProcessDoneEntry | null> {
  const k = storageKey(key)
  const v = await idbGet<ProcessDoneEntry>(k)
  if (v && typeof v === 'object') return v
  try {
    const raw = safeLocalStorage.getItem(k)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed
  } catch {}
  return null
}

export async function upsertProcessDone(key: string, processName: string): Promise<void> {
  const kk = normalizeKey(key)
  if (!kk) return
  const pn = String(processName || '').trim()
  if (!pn) return

  const entry = (await getProcessDone(kk)) || { done: [], last: '', time: 0 }
  const set = new Set<string>(Array.isArray(entry.done) ? entry.done : [])
  set.add(pn)
  const next: ProcessDoneEntry = { done: Array.from(set), last: pn, time: Date.now() }

  const k = storageKey(kk)
  const ok = await idbSet(k, next)
  if (ok) return

  try {
    safeLocalStorage.setItem(k, JSON.stringify(next))
  } catch {}
}

