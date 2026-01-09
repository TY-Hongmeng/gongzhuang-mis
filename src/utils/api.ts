export async function fetchWithFallback(url: string, init?: RequestInit): Promise<Response> {
  const DEFAULT_FUNCTION_BASE = 'https://oltsiocyesbgezlrcxze.functions.supabase.co'
  const isGhPages = typeof window !== 'undefined' && /github\.io/i.test(String(window.location?.host || ''))
  const rawBase = (import.meta as any)?.env?.VITE_API_URL || (isGhPages ? DEFAULT_FUNCTION_BASE : '')
  const normalizeBase = (b: string): string => {
    if (!b) return ''
    let out = b.replace(/\/$/, '')
    if (/functions\.supabase\.co$/.test(out)) {
      out += '/functions/v1'
    } else if (/functions\.supabase\.co\/functions\/v1(\/)?$/.test(out)) {
      out = out.replace(/\/$/, '')
    }
    return out
  }
  const base = normalizeBase(rawBase)
  const abs = (() => {
    if (url.startsWith('/')) {
      return (base ? base.replace(/\/$/, '') : window.location.origin) + url
    }
    return url
  })()

  // Prefer client-side handling first on GitHub Pages to avoid 404 noise
  if (isGhPages && url.startsWith('/')) {
    const handled = await handleClientSideApi(abs, init)
    if (handled) return handled
  }
  try {
    const res = await fetch(abs, init)
    if (!res.ok && res.status >= 500) {
      if (isGhPages) return res
      const u = new URL(abs, window.location.origin)
      const fallback = `http://localhost:3003${u.pathname}${u.search}`
      return await fetch(fallback, init)
    }
    if (isGhPages && res.status === 404) {
      const handled = await handleClientSideApi(abs, init)
      if (handled) return handled
    }
    return res
  } catch {
    // 在 GitHub Pages 环境不再回退到 localhost，直接抛错
    if (isGhPages) throw new Error('Network error')
    const u = new URL(abs, window.location.origin)
    const fallback = `http://localhost:3003${u.pathname}${u.search}`
    return await fetch(fallback, init)
  }
}

export function installApiInterceptor() {
  if (typeof window === 'undefined') return
  const originalFetch = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const u = typeof input === 'string' ? input : String((input as any)?.url || '')
      if (u.startsWith('/api')) {
        return await fetchWithFallback(u, init)
      }
      // Also intercept absolute calls to GitHub Pages domain
      if (/github\.io\/.+\/api\//.test(u)) {
        const m = u.match(/github\.io\/.+?(\/api\/.*)$/)
        const path = m ? m[1] : ''
        if (path) return await fetchWithFallback(path, init)
      }
      // Inject anon key for Supabase REST (avoid 400 No API key)
      if (/\.supabase\.co\/rest\/v1\//.test(u)) {
        const anon = (import.meta as any)?.env?.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9sdHNpb2N5ZXNiZ2V6bHJjeHplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1Nzg4NjAsImV4cCI6MjA3NjE1NDg2MH0.bFDHm24x5SDN4MPwG3lZWVoa78oKpA5_qWxKwl9ebJM'
        const headers = new Headers(init?.headers || {})
        if (!headers.has('apikey')) headers.set('apikey', anon)
        if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${anon}`)
        const patchedInit: RequestInit = { ...(init || {}), headers }
        // rewrite resource names if needed
        let urlStr = u
        urlStr = urlStr.replace('/rest/v1/tooling?', '/rest/v1/tooling_info?')
        urlStr = urlStr.replace('/rest/v1/parts?', '/rest/v1/parts_info?')
        // handle devices and fixed_inventory_options via supabase-js to avoid REST 400
        if (supabase) {
          if (/\/rest\/v1\/devices\?/.test(urlStr)) {
            const { data, error } = await supabase.from('devices').select('*').order('name')
            if (error) return jsonResponse({ success: false, error: error.message }, 500)
            return jsonResponse(data || [])
          }
          if (/\/rest\/v1\/fixed_inventory_options\?/.test(urlStr)) {
            const { data, error } = await supabase.from('fixed_inventory_options').select('*').order('name')
            if (error) return jsonResponse({ success: false, error: error.message }, 500)
            return jsonResponse(data || [])
          }
        }
        return await originalFetch(urlStr as any, patchedInit)
      }
      return await originalFetch(input as any, init)
    } catch (e) {
      return await originalFetch(input as any, init)
    }
  }
}

// ---------- Client-side API fallback (Supabase direct) ----------
import { supabase } from '../lib/supabase'

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
}

function getQuery(url: string): URLSearchParams {
  const u = new URL(url, window.location.origin)
  return u.searchParams
}

async function handleClientSideApi(url: string, init?: RequestInit): Promise<Response | null> {
  if (!supabase) return null
  const u = new URL(url, window.location.origin)
  const path = u.pathname.replace(/^(\/functions\/v1)?/, '') // tolerate functions prefix
  const method = (init?.method || 'GET').toUpperCase()

  try {
    // Options & meta
    if (method === 'GET' && path.startsWith('/api/options/production-units')) {
      const { data, error } = await supabase.from('production_units').select('*').order('name')
      if (error) return jsonResponse({ success: false, error: error.message }, 500)
      return jsonResponse({ data: data || [] })
    }
    if (method === 'GET' && path.startsWith('/api/options/tooling-categories')) {
      const { data, error } = await supabase.from('tooling_categories').select('*').order('name')
      if (error) return jsonResponse({ success: false, error: error.message }, 500)
      return jsonResponse({ data: data || [] })
    }
    if (method === 'GET' && path.startsWith('/api/options/material-sources')) {
      const { data, error } = await supabase.from('material_sources').select('*').order('name')
      if (error) return jsonResponse({ success: false, error: error.message }, 500)
      return jsonResponse({ data: data || [] })
    }
    if (method === 'GET' && path.startsWith('/api/materials')) {
      const { data, error } = await supabase.from('materials').select('*').order('name')
      if (error) return jsonResponse({ success: false, error: error.message }, 500)
      return jsonResponse({ data: data || [] })
    }
    if (method === 'GET' && path.startsWith('/api/part-types')) {
      const { data, error } = await supabase.from('part_types').select('*').order('name')
      if (error) return jsonResponse({ success: false, error: error.message }, 500)
      return jsonResponse({ data: data || [] })
    }

    // Tooling list
    if (method === 'GET' && path === '/api/tooling') {
      const qs = getQuery(url)
      const page = Number(qs.get('page') || 1)
      const pageSize = Number(qs.get('pageSize') || 50)
      const { data, error } = await supabase
        .from('tooling_info')
        .select('id,inventory_number,production_unit,category,received_date,demand_date,completed_date,project_name')
        .order('created_at', { ascending: true })
        .range((page - 1) * pageSize, (page - 1) * pageSize + pageSize - 1)
      if (error) return jsonResponse({ success: false, error: error.message }, 500)
      const items = (data || []).map((x: any) => ({
        id: x.id,
        inventory_number: x.inventory_number || '',
        production_unit: x.production_unit || '',
        category: x.category || '',
        received_date: x.received_date || '',
        demand_date: x.demand_date || '',
        completed_date: x.completed_date || '',
        project_name: x.project_name || ''
      }))
      return jsonResponse({ success: true, items })
    }

    // Tooling batch info
    if (method === 'GET' && path.startsWith('/api/tooling/batch')) {
      const qs = getQuery(url)
      const ids = qs.getAll('ids')
      if (ids.length === 0) return jsonResponse({ success: true, items: [] })
      const { data, error } = await supabase
        .from('tooling_info')
        .select('id,recorder')
        .in('id', ids)
      if (error) return jsonResponse({ success: false, error: error.message }, 500)
      // 兼容字段名
      const items = (data || []).map((x: any) => ({ id: x.id, recorder: x.recorder }))
      return jsonResponse({ success: true, items })
    }

    // Tooling users basic
    if (method === 'GET' && path.startsWith('/api/tooling/users/basic')) {
      const { data, error } = await supabase.from('users').select('id,real_name,phone').order('real_name')
      if (error) return jsonResponse({ success: false, error: error.message }, 500)
      return jsonResponse({ success: true, items: data || [] })
    }

    // Tooling parts by toolingId
    const partsMatch = path.match(/^\/api\/tooling\/([^\/]+)\/parts$/)
    if (method === 'GET' && partsMatch) {
      const toolingId = partsMatch[1]
      const { data, error } = await supabase
        .from('parts_info')
        .select('*')
        .eq('tooling_id', toolingId)
        .order('created_at', { ascending: true })
      if (error) return jsonResponse({ success: false, error: error.message }, 500)
      return jsonResponse({ success: true, items: data || [] })
    }

    // Child items by toolingId
    const childMatch = path.match(/^\/api\/tooling\/([^\/]+)\/child-items$/)
    if (method === 'GET' && childMatch) {
      const toolingId = childMatch[1]
      const { data, error } = await supabase
        .from('child_items')
        .select('*')
        .eq('tooling_id', toolingId)
        .order('created_at', { ascending: true })
      if (error) return jsonResponse({ success: false, error: error.message }, 500)
      return jsonResponse({ success: true, items: data || [] })
    }

    // Work hours
    if (method === 'GET' && path === '/api/tooling/work-hours') {
      const qs = getQuery(url)
      const page = Number(qs.get('page') || 1)
      const pageSize = Number(qs.get('pageSize') || 200)
      const order = qs.get('order') || 'work_date'
      const orderDir = (qs.get('order_dir') || 'desc').toLowerCase() === 'asc'
      const { data, error } = await supabase.from('work_hours').select('*')
        .order(order, { ascending: orderDir })
        .range((page - 1) * pageSize, (page - 1) * pageSize + pageSize - 1)
      if (error) return jsonResponse({ success: false, error: error.message }, 500)
      return jsonResponse({ success: true, items: data || [] })
    }

    // Cutting orders list
    if (method === 'GET' && path === '/api/cutting-orders') {
      const qs = getQuery(url)
      const page = Number(qs.get('page') || 1)
      const pageSize = Number(qs.get('pageSize') || 1000)
      let q = supabase.from('cutting_orders').select('*')
      q = q.order('created_date', { ascending: false }).range((page - 1) * pageSize, (page - 1) * pageSize + pageSize - 1)
      const { data, error } = await q
      if (error) return jsonResponse({ success: false, error: error.message }, 500)
      return jsonResponse({ success: true, items: data || [] })
    }

    // Purchase orders list
    if (method === 'GET' && path === '/api/purchase-orders') {
      const qs = getQuery(url)
      const page = Number(qs.get('page') || 1)
      const pageSize = Number(qs.get('pageSize') || 1000)
      let q = supabase.from('purchase_orders').select('*')
      q = q.order('created_date', { ascending: false }).range((page - 1) * pageSize, (page - 1) * pageSize + pageSize - 1)
      const { data, error } = await q
      if (error) return jsonResponse({ success: false, error: error.message }, 500)
      return jsonResponse({ success: true, items: data || [] })
    }

    // Devices / fixed inventory options
    if (method === 'GET' && path === '/api/tooling/devices') {
      const { data, error } = await supabase.from('devices').select('*').order('name')
      if (error) return jsonResponse({ success: false, error: error.message }, 500)
      return jsonResponse({ success: true, items: data || [] })
    }
    if (method === 'GET' && path === '/api/tooling/fixed-inventory-options') {
      const { data, error } = await supabase.from('fixed_inventory_options').select('*').order('name')
      if (error) return jsonResponse({ success: false, error: error.message }, 500)
      return jsonResponse({ success: true, items: data || [] })
    }

    // Workshops & teams (organization data)
    if (method === 'GET' && path === '/api/tooling/org/workshops') {
      const { data, error } = await supabase.from('workshops').select('*').order('name')
      if (error) return jsonResponse({ success: false, error: error.message }, 500)
      return jsonResponse({ success: true, items: data || [] })
    }
    if (method === 'GET' && path === '/api/tooling/org/teams') {
      const { data, error } = await supabase.from('teams').select('*').order('name')
      if (error) return jsonResponse({ success: false, error: error.message }, 500)
      return jsonResponse({ success: true, items: data || [] })
    }

    // Parts inventory list
    if (method === 'GET' && path === '/api/tooling/parts/inventory-list') {
      const qs = getQuery(url)
      const page = Number(qs.get('page') || 1)
      const pageSize = Number(qs.get('pageSize') || 500)
      const { data, error } = await supabase
        .from('parts_info')
        .select('*')
        .order('created_at', { ascending: true })
        .range((page - 1) * pageSize, (page - 1) * pageSize + pageSize - 1)
      if (error) return jsonResponse({ success: false, error: error.message }, 500)
      return jsonResponse({ success: true, items: data || [] })
    }

  } catch (e: any) {
    return jsonResponse({ success: false, error: e?.message || 'Client-side API error' }, 500)
  }
  return null
}
