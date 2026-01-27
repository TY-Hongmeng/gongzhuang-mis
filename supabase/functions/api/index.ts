import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from "npm:@supabase/supabase-js"
// 延迟加载 bcrypt，避免预检请求初始化失败

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, accept, origin",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Access-Control-Allow-Credentials": "true",
  "Vary": "Origin"
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || ""
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

async function json(req: Request) {
  try {
    const ct = req.headers.get('content-type') || ''
    if (ct.includes('application/json')) {
      return await req.json()
    }
    const txt = await req.text()
    try { return JSON.parse(txt) } catch { return {} }
  } catch { return {} }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    const reqHeaders = req.headers.get('access-control-request-headers') || corsHeaders["Access-Control-Allow-Headers"]
    const reqMethod = req.headers.get('access-control-request-method') || 'POST'
    const origin = req.headers.get('origin') || '*'
    const headers = { 
      ...corsHeaders, 
      "Access-Control-Allow-Headers": reqHeaders,
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Origin": origin
    }
    return new Response(null, { status: 204, headers })
  }
  const url = new URL(req.url)
  const pathname = url.pathname
  const path = pathname
    .replace(/^\/functions\/v1\/api/, '')
    .replace(/^\/api/, '')
    .replace(/^\/?/, '/')
  const origin = req.headers.get('origin') || '*'
  const baseHeaders = { ...corsHeaders, "Access-Control-Allow-Origin": origin }

  if (path === "/auth/login" && req.method === "POST") {
    const body = await json(req)
    const phone = String(body.phone || "")
    const password = String(body.password || "")
    const { default: bcrypt } = await import("npm:bcryptjs")
    const { data: user, error } = await supabase
      .from("users")
      .select(`*, companies(id,name), roles(id,name, role_permissions( permissions(id,name,module,code) ))`)
      .eq("phone", phone)
      .single()
    if (error || !user) return Response.json({ error: "用户不存在" }, { status: 401, headers: baseHeaders })
    const ok = await bcrypt.compare(password, String(user.password_hash || ""))
    if (!ok) return Response.json({ error: "密码错误" }, { status: 401, headers: baseHeaders })
    if (user.status !== "active") return Response.json({ error: "账户未激活或已被禁用" }, { status: 401, headers: baseHeaders })
    const { password_hash, ...safeUser } = user
    return Response.json({ success: true, user: safeUser }, { headers: baseHeaders })
  }

  if (path === "/auth/register" && req.method === "POST") {
    const body = await json(req)
    const phone = String(body.phone || "")
    const realName = String(body.realName || "")
    const idCard = String(body.idCard || "")
    const companyId = body.companyId
    const roleId = body.roleId
    const workshopId = body.workshopId || null
    const teamId = body.teamId || null
    const password = String(body.password || "")
    const { data: existingPhone } = await supabase.from("users").select("id").eq("phone", phone).single()
    if (existingPhone) return Response.json({ error: "手机号已被注册" }, { status: 400, headers: baseHeaders })
    const { data: existingId } = await supabase.from("users").select("id").eq("id_card", idCard).single()
    if (existingId) return Response.json({ error: "身份证号已被注册" }, { status: 400, headers: baseHeaders })
    const passwordHash = await bcrypt.hash(password, 10)
    const { error } = await supabase.from("users").insert({ phone, real_name: realName, id_card: idCard, company_id: companyId, role_id: roleId, workshop_id: workshopId, team_id: teamId, password_hash: passwordHash, status: "pending" })
    if (error) return Response.json({ error: "注册失败" }, { status: 500, headers: baseHeaders })
    return Response.json({ success: true, message: "注册成功，请等待管理员审核" }, { headers: baseHeaders })
  }

  if (path === "/auth/reset-password" && req.method === "POST") {
    const body = await json(req)
    const idCard = String(body.idCard || "")
    const newPassword = String(body.newPassword || "")
    const { data: user } = await supabase.from("users").select("id").eq("id_card", idCard).single()
    if (!user) return Response.json({ error: "用户不存在" }, { status: 404, headers: baseHeaders })
    const passwordHash = await bcrypt.hash(newPassword, 10)
    const { error } = await supabase.from("users").update({ password_hash: passwordHash }).eq("id", user.id)
    if (error) return Response.json({ error: "密码重置失败" }, { status: 500, headers: baseHeaders })
    return Response.json({ success: true, message: "密码重置成功" }, { headers: baseHeaders })
  }

  if (path === "/permissions/sync" && req.method === "POST") {
    const body = await json(req)
    const modules: Record<string, string[]> = body.modules || {}
    const rows: any[] = []
    Object.entries(modules).forEach(([module, actions]) => {
      actions.forEach((name) => {
        rows.push({ module, name, code: `${module}:${name === "访问模块" ? "access" : name}` })
      })
    })
    if (rows.length > 0) {
      const { error } = await supabase.from("permissions").upsert(rows, { onConflict: "module,name" })
      if (error) return Response.json({ error: "同步权限失败" }, { status: 500, headers: baseHeaders })
    }
    return Response.json({ success: true }, { headers: baseHeaders })
  }

  if (path === "/permissions" && req.method === "GET") {
    const { data, error } = await supabase.from("permissions").select("*").order("module", { ascending: true })
    if (error) return Response.json({ success: false, error: "加载权限失败" }, { status: 500, headers: baseHeaders })
    return Response.json({ success: true, items: data || [] }, { headers: baseHeaders })
  }

  // Cutting Orders - list
  if (path === "/cutting-orders" && req.method === "GET") {
    const u = new URL(req.url)
    const page = Number(u.searchParams.get("page") || 1)
    const pageSize = Number(u.searchParams.get("pageSize") || 100)
    const material_source = u.searchParams.get("material_source") || undefined
    const start_date = u.searchParams.get("start_date") || undefined
    const end_date = u.searchParams.get("end_date") || undefined
    const search = u.searchParams.get("search") || undefined

    let q = supabase.from("cutting_orders").select("*", { count: "exact" })
    if (material_source) q = q.eq("material_source", material_source)
    if (start_date && end_date) q = q.gte("created_date", start_date).lte("created_date", end_date)
    if (search) {
      const like = `%${search}%`
      q = q.or(
        `inventory_number.ilike.${like},project_name.ilike.${like},part_drawing_number.ilike.${like},part_name.ilike.${like}`
      )
    }
    q = q.order("created_date", { ascending: false }).range((page - 1) * pageSize, (page - 1) * pageSize + pageSize - 1)
    const t0 = Date.now()
    const { data, count, error } = await q
    if (error) return Response.json({ success: false, error: error.message }, { status: 500, headers: baseHeaders })
    return Response.json({ success: true, items: data || [], total: count || 0, queryTime: Date.now() - t0, page, pageSize }, { headers: baseHeaders })
  }

  // Cutting Orders - create
  if (path === "/cutting-orders" && req.method === "POST") {
    const body = await json(req)
    const rows = Array.isArray(body.orders) ? body.orders : []
    if (rows.length === 0) return Response.json({ success: false, error: "缺少orders" }, { status: 400, headers: corsHeaders })
    const { error } = await supabase.from("cutting_orders").insert(rows)
    if (error) return Response.json({ success: false, error: error.message }, { status: 500, headers: baseHeaders })
    return Response.json({ success: true }, { headers: baseHeaders })
  }

  // Cutting Orders - delete one
  const delCuttingMatch = path.match(/^\/cutting-orders\/(\w+)/)
  if (delCuttingMatch && req.method === "DELETE") {
    const id = delCuttingMatch[1]
    const { error } = await supabase.from("cutting_orders").delete().eq("id", id)
    if (error) return Response.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders })
    return Response.json({ success: true }, { headers: corsHeaders })
  }

  // Cutting Orders - batch delete
  if (path === "/cutting-orders/batch-delete" && req.method === "POST") {
    const body = await json(req)
    const ids: string[] = Array.isArray(body.ids) ? body.ids : []
    if (ids.length === 0) return Response.json({ success: false, error: "缺少ids" }, { status: 400, headers: corsHeaders })
    const { error } = await supabase.from("cutting_orders").delete().in("id", ids)
    if (error) return Response.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders })
    return Response.json({ success: true }, { headers: corsHeaders })
  }

  // Purchase Orders - list
  if (path === "/purchase-orders" && req.method === "GET") {
    const u = new URL(req.url)
    const page = Number(u.searchParams.get("page") || 1)
    const pageSize = Number(u.searchParams.get("pageSize") || 100)
    let q = supabase.from("purchase_orders").select("*", { count: "exact" })
    q = q.order("created_date", { ascending: false }).range((page - 1) * pageSize, (page - 1) * pageSize + pageSize - 1)
    const { data, count, error } = await q
    if (error) return Response.json({ success: false, error: error.message }, { status: 500, headers: baseHeaders })
    return Response.json({ success: true, items: data || [], total: count || 0, page, pageSize }, { headers: baseHeaders })
  }

  // Purchase Orders - create
  if (path === "/purchase-orders" && req.method === "POST") {
    const body = await json(req)
    const rows = Array.isArray(body.orders) ? body.orders : []
    if (rows.length === 0) return Response.json({ success: false, error: "缺少orders" }, { status: 400, headers: corsHeaders })
    const nowIso = new Date().toISOString()
    const normalized = rows.map((raw: any) => ({
      inventory_number: String(raw.inventory_number || '').trim(),
      project_name: String(raw.project_name || '').trim(),
      part_name: String(raw.part_name || '').trim(),
      part_quantity: Number(raw.part_quantity || 0),
      unit: String(raw.unit || '').trim(),
      model: raw.model ?? null,
      supplier: raw.supplier ?? null,
      required_date: raw.required_date || null,
      remark: raw.remark ?? null,
      weight: raw.weight ?? null,
      total_price: raw.total_price ?? null,
      created_date: raw.created_date || nowIso,
      updated_date: nowIso,
      tooling_id: raw.tooling_id || null,
      child_item_id: raw.child_item_id || null,
      part_id: raw.part_id || null,
      status: String(raw.status || 'pending')
    })).filter((p: any) => p.inventory_number && p.project_name && p.part_name && p.part_quantity > 0 && p.unit)
    let inserted = 0, updated = 0, skipped = 0
    for (const po of normalized) {
      let existing: any = null
      if (po.part_id) {
        const { data } = await supabase.from('purchase_orders').select('id,inventory_number,project_name,part_name,part_quantity,unit,model,supplier,required_date,remark,weight,total_price').eq('part_id', po.part_id).limit(1)
        existing = Array.isArray(data) && data[0] ? data[0] : null
      } else if (po.child_item_id) {
        const { data } = await supabase.from('purchase_orders').select('id,inventory_number,project_name,part_name,part_quantity,unit,model,supplier,required_date,remark,weight,total_price').eq('child_item_id', po.child_item_id).limit(1)
        existing = Array.isArray(data) && data[0] ? data[0] : null
      } else if (po.tooling_id && po.part_name) {
        const { data } = await supabase.from('purchase_orders').select('id,inventory_number,project_name,part_name,part_quantity,unit,model,supplier,required_date,remark,weight,total_price').eq('tooling_id', po.tooling_id).eq('part_name', po.part_name).is('part_id', null).limit(1)
        existing = Array.isArray(data) && data[0] ? data[0] : null
      } else if (po.inventory_number) {
        const { data } = await supabase.from('purchase_orders').select('id,inventory_number,project_name,part_name,part_quantity,unit,model,supplier,required_date,remark,weight,total_price').eq('inventory_number', po.inventory_number).limit(1)
        existing = Array.isArray(data) && data[0] ? data[0] : null
      }
      if (existing && existing.id) {
        const hasChanges = (
          String(existing.inventory_number || '') !== String(po.inventory_number || '') ||
          String(existing.project_name || '') !== String(po.project_name || '') ||
          String(existing.part_name || '') !== String(po.part_name || '') ||
          Number(existing.part_quantity || 0) !== Number(po.part_quantity || 0) ||
          String(existing.unit || '') !== String(po.unit || '') ||
          String(existing.model || '') !== String(po.model || '') ||
          String(existing.supplier || '') !== String(po.supplier || '') ||
          String(existing.required_date || '') !== String(po.required_date || '') ||
          String(existing.remark || '') !== String(po.remark || '') ||
          Number(existing.weight ?? 0) !== Number(po.weight ?? 0) ||
          Number(existing.total_price ?? 0) !== Number(po.total_price ?? 0)
        )
        if (hasChanges) {
          const { error } = await supabase.from('purchase_orders').update({
            inventory_number: po.inventory_number,
            project_name: po.project_name,
            part_name: po.part_name,
            part_quantity: po.part_quantity,
            unit: po.unit,
            model: po.model,
            supplier: po.supplier,
            required_date: po.required_date,
            remark: po.remark,
            updated_date: nowIso,
            weight: po.weight,
            total_price: po.total_price
          }).eq('id', existing.id)
          if (error) return Response.json({ success: false, error: error.message }, { status: 500, headers: baseHeaders })
          updated++
        } else {
          skipped++
        }
      } else {
        const { error } = await supabase.from('purchase_orders').insert(po)
        if (error) return Response.json({ success: false, error: error.message }, { status: 500, headers: baseHeaders })
        inserted++
      }
    }
    return Response.json({ success: true, stats: { inserted, updated, skipped } }, { headers: baseHeaders })
  }

  // Purchase Orders - batch delete
  if (path === "/purchase-orders/batch-delete" && req.method === "POST") {
    const body = await json(req)
    const ids: string[] = Array.isArray(body.ids) ? body.ids : []
    if (ids.length === 0) return Response.json({ success: false, error: "缺少ids" }, { status: 400, headers: corsHeaders })
    const { error } = await supabase.from("purchase_orders").delete().in("id", ids)
    if (error) return Response.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders })
    return Response.json({ success: true }, { headers: corsHeaders })
  }

  // Options and meta endpoints
  if (path === "/options/production-units" && req.method === "GET") {
    const { data, error } = await supabase.from("production_units").select("*").order("name")
    if (error) return Response.json({ success: false, error: error.message }, { status: 500, headers: baseHeaders })
    return Response.json({ success: true, items: data || [] }, { headers: baseHeaders })
  }
  if (path === "/options/tooling-categories" && req.method === "GET") {
    const { data, error } = await supabase.from("tooling_categories").select("*").order("name")
    if (error) return Response.json({ success: false, error: error.message }, { status: 500, headers: baseHeaders })
    return Response.json({ success: true, items: data || [] }, { headers: baseHeaders })
  }
  if (path === "/materials" && req.method === "GET") {
    const { data, error } = await supabase.from("materials").select("*").order("name")
    if (error) return Response.json({ success: false, error: error.message }, { status: 500, headers: baseHeaders })
    return Response.json({ success: true, items: data || [] }, { headers: baseHeaders })
  }
  if (path === "/part-types" && req.method === "GET") {
    const { data, error } = await supabase.from("part_types").select("*").order("name")
    if (error) return Response.json({ success: false, error: error.message }, { status: 500, headers: baseHeaders })
    return Response.json({ success: true, items: data || [] }, { headers: baseHeaders })
  }
  if (path === "/options/material-sources" && req.method === "GET") {
    const { data, error } = await supabase.from("material_sources").select("*").order("name")
    if (error) return Response.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders })
    return Response.json({ success: true, items: data || [] }, { headers: corsHeaders })
  }

  if (path === "/tooling/devices" && req.method === "GET") {
    const { data, error } = await supabase.from("devices").select("*").order("created_at", { ascending: true })
    if (error) return Response.json({ success: false, error: error.message }, { status: 500, headers: baseHeaders })
    return Response.json({ success: true, items: data || [] }, { headers: baseHeaders })
  }
  if (path === "/tooling/devices" && req.method === "POST") {
    const body = await json(req)
    const payload = { device_no: String(body.device_no || ""), device_name: String(body.device_name || ""), max_aux_minutes: body.max_aux_minutes ?? null }
    const { data, error } = await supabase.from("devices").insert(payload).select("*").single()
    if (error) return Response.json({ success: false, error: error.message }, { status: 500, headers: baseHeaders })
    return Response.json({ success: true, item: data }, { headers: baseHeaders })
  }
  if (path === "/tooling/devices/update" && req.method === "POST") {
    const body = await json(req)
    const id = String(body.id || "")
    const payload = { device_no: String(body.device_no || ""), device_name: String(body.device_name || ""), max_aux_minutes: body.max_aux_minutes ?? null }
    const { error } = await supabase.from("devices").update(payload).eq("id", id)
    if (error) return Response.json({ success: false, error: error.message }, { status: 500, headers: baseHeaders })
    return Response.json({ success: true }, { headers: baseHeaders })
  }
  if (path === "/tooling/devices/delete" && req.method === "POST") {
    const body = await json(req)
    const id = String(body.id || "")
    const { error } = await supabase.from("devices").delete().eq("id", id)
    if (error) return Response.json({ success: false, error: error.message }, { status: 500, headers: baseHeaders })
    return Response.json({ success: true }, { headers: baseHeaders })
  }
  const devMatch = path.match(/^\/tooling\/devices\/([^\/]+)$/)
  if (devMatch && req.method === "PUT") {
    const id = devMatch[1]
    const body = await json(req)
    const payload = { device_no: String(body.device_no || ""), device_name: String(body.device_name || ""), max_aux_minutes: body.max_aux_minutes ?? null }
    const { error } = await supabase.from("devices").update(payload).eq("id", id)
    if (error) return Response.json({ success: false, error: error.message }, { status: 500, headers: baseHeaders })
    return Response.json({ success: true }, { headers: baseHeaders })
  }
  if (devMatch && req.method === "DELETE") {
    const id = devMatch[1]
    const { error } = await supabase.from("devices").delete().eq("id", id)
    if (error) return Response.json({ success: false, error: error.message }, { status: 500, headers: baseHeaders })
    return Response.json({ success: true }, { headers: baseHeaders })
  }

  if (path === "/tooling/fixed-inventory-options" && req.method === "GET") {
    const { data, error } = await supabase.from("fixed_inventory_options").select("*").order("created_at", { ascending: true })
    if (error) return Response.json({ success: false, error: error.message }, { status: 500, headers: baseHeaders })
    return Response.json({ success: true, items: data || [] }, { headers: baseHeaders })
  }
  if (path === "/tooling/fixed-inventory-options" && req.method === "POST") {
    const body = await json(req)
    const payload = { option_value: String(body.option_value || ""), option_label: String(body.option_label || ""), is_active: Boolean(body.is_active ?? true) }
    const { data, error } = await supabase.from("fixed_inventory_options").insert(payload).select("*").single()
    if (error) return Response.json({ success: false, error: error.message }, { status: 500, headers: baseHeaders })
    return Response.json({ success: true, item: data }, { headers: baseHeaders })
  }
  if (path === "/tooling/fixed-inventory-options/update" && req.method === "POST") {
    const body = await json(req)
    const id = String(body.id || "")
    const payload = { option_value: String(body.option_value || ""), option_label: String(body.option_label || ""), is_active: Boolean(body.is_active ?? true) }
    const { error } = await supabase.from("fixed_inventory_options").update(payload).eq("id", id)
    if (error) return Response.json({ success: false, error: error.message }, { status: 500, headers: baseHeaders })
    return Response.json({ success: true }, { headers: baseHeaders })
  }
  if (path === "/tooling/fixed-inventory-options/delete" && req.method === "POST") {
    const body = await json(req)
    const id = String(body.id || "")
    const { error } = await supabase.from("fixed_inventory_options").delete().eq("id", id)
    if (error) return Response.json({ success: false, error: error.message }, { status: 500, headers: baseHeaders })
    return Response.json({ success: true }, { headers: baseHeaders })
  }
  const fioMatch = path.match(/^\/tooling\/fixed-inventory-options\/([^\/]+)$/)
  if (fioMatch && req.method === "PUT") {
    const id = fioMatch[1]
    const body = await json(req)
    const payload = { option_value: String(body.option_value || ""), option_label: String(body.option_label || ""), is_active: Boolean(body.is_active ?? true) }
    const { error } = await supabase.from("fixed_inventory_options").update(payload).eq("id", id)
    if (error) return Response.json({ success: false, error: error.message }, { status: 500, headers: baseHeaders })
    return Response.json({ success: true }, { headers: baseHeaders })
  }
  if (fioMatch && req.method === "DELETE") {
    const id = fioMatch[1]
    const { error } = await supabase.from("fixed_inventory_options").delete().eq("id", id)
    if (error) return Response.json({ success: false, error: error.message }, { status: 500, headers: baseHeaders })
    return Response.json({ success: true }, { headers: baseHeaders })
  }

  // Tooling batch info (for responsible person mapping)
  if (path.startsWith("/tooling/batch") && req.method === "GET") {
    const u = new URL(req.url)
    const ids = u.searchParams.getAll("ids")
    if (ids.length === 0) return Response.json({ success: true, items: [] }, { headers: corsHeaders })
    const { data, error } = await supabase.from("tooling_info").select("id,responsible_person_id,recorder").in("id", ids)
    if (error) return Response.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders })
    return Response.json({ success: true, items: data || [] }, { headers: corsHeaders })
  }

  return new Response("Not Found", { status: 404, headers: corsHeaders })
})
