export async function fetchWithFallback(url: string, init?: RequestInit): Promise<Response> {
  const DEFAULT_FUNCTION_BASE = 'https://oltsiocyesbgezlrcxze.functions.supabase.co'
  const isGhPages = typeof window !== 'undefined' && /github\.io/i.test(String(window.location?.host || ''))
  const base = (import.meta as any)?.env?.VITE_API_URL || (isGhPages ? DEFAULT_FUNCTION_BASE : '')
  const abs = (() => {
    if (url.startsWith('/')) {
      return (base ? base.replace(/\/$/, '') : window.location.origin) + url
    }
    return url
  })()
  try {
    const res = await fetch(abs, init)
    if (!res.ok && res.status >= 500) {
      const u = new URL(abs, window.location.origin)
      const fallback = `http://localhost:3003${u.pathname}${u.search}`
      return await fetch(fallback, init)
    }
    return res
  } catch {
    try {
      const u = new URL(abs, window.location.origin)
      const fallback = `http://localhost:3003${u.pathname}${u.search}`
      return await fetch(fallback, init)
    } catch (e) {
      throw e
    }
  }
}
