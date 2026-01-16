function isQuotaExceededError(error: unknown): boolean {
  const e = error as any
  const name = String(e?.name || '')
  const message = String(e?.message || '')
  return name === 'QuotaExceededError' || /quota/i.test(message)
}

function tryCleanupStorage() {
  try {
    const keysToRemove = APP_CACHE_KEYS
    for (const k of keysToRemove) {
      try {
        window.localStorage.removeItem(k)
      } catch {}
    }

    const prefixes = ['status_part_', 'status_child_']
    const toRemove: string[] = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i)
      if (!k) continue
      if (prefixes.some((p) => k.startsWith(p))) toRemove.push(k)
      if (toRemove.length >= 500) break
    }
    for (const k of toRemove) {
      try {
        window.localStorage.removeItem(k)
      } catch {}
    }
  } catch {}
}

export const safeLocalStorage: Storage = {
  get length() {
    try {
      return window.localStorage.length
    } catch {
      return 0
    }
  },

  clear() {
    try {
      window.localStorage.clear()
    } catch {}
  },

  getItem(key: string) {
    try {
      return window.localStorage.getItem(key)
    } catch {
      return null
    }
  },

  key(index: number) {
    try {
      return window.localStorage.key(index)
    } catch {
      return null
    }
  },

  removeItem(key: string) {
    try {
      window.localStorage.removeItem(key)
    } catch {}
  },

  setItem(key: string, value: string) {
    try {
      window.localStorage.setItem(key, value)
      return
    } catch (e) {
      if (!isQuotaExceededError(e)) return
    }

    tryCleanupStorage()
    try {
      window.localStorage.setItem(key, value)
    } catch {}
  }
}

export const APP_CACHE_KEYS = [
  'process_routes_map',
  'temporary_plans',
  'temporary_hidden_ids'
] as const

export function clearAppCaches() {
  try {
    for (const k of APP_CACHE_KEYS) {
      try {
        safeLocalStorage.removeItem(k)
      } catch {}
    }
    const prefixes = ['status_part_', 'status_child_']
    const toRemove: string[] = []
    for (let i = 0; i < safeLocalStorage.length; i++) {
      const k = safeLocalStorage.key(i)
      if (!k) continue
      if (prefixes.some((p) => k.startsWith(p))) toRemove.push(k)
      if (toRemove.length >= 2000) break
    }
    for (const k of toRemove) {
      try {
        safeLocalStorage.removeItem(k)
      } catch {}
    }
  } catch {}
}
