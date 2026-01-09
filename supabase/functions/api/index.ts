import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from "npm:@supabase/supabase-js"
import bcrypt from "npm:bcryptjs"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, accept, origin",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Max-Age": "86400",
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || ""
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

async function json(req: Request) {
  try { return await req.json() } catch { return {} }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders })
  const url = new URL(req.url)
  const path = url.pathname.replace(/^\/api\//, "/")

  if (path === "/auth/login" && req.method === "POST") {
    const body = await json(req)
    const phone = String(body.phone || "")
    const password = String(body.password || "")
    const { data: user, error } = await supabase
      .from("users")
      .select(`*, companies(id,name), roles(id,name, role_permissions( permissions(id,name,module,code) ))`)
      .eq("phone", phone)
      .single()
    if (error || !user) return Response.json({ error: "用户不存在" }, { status: 401, headers: corsHeaders })
    const ok = await bcrypt.compare(password, String(user.password_hash || ""))
    if (!ok) return Response.json({ error: "密码错误" }, { status: 401, headers: corsHeaders })
    if (user.status !== "active") return Response.json({ error: "账户未激活或已被禁用" }, { status: 401, headers: corsHeaders })
    const { password_hash, ...safeUser } = user
    return Response.json({ success: true, user: safeUser }, { headers: corsHeaders })
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
    if (existingPhone) return Response.json({ error: "手机号已被注册" }, { status: 400, headers: corsHeaders })
    const { data: existingId } = await supabase.from("users").select("id").eq("id_card", idCard).single()
    if (existingId) return Response.json({ error: "身份证号已被注册" }, { status: 400, headers: corsHeaders })
    const passwordHash = await bcrypt.hash(password, 10)
    const { error } = await supabase.from("users").insert({ phone, real_name: realName, id_card: idCard, company_id: companyId, role_id: roleId, workshop_id: workshopId, team_id: teamId, password_hash: passwordHash, status: "pending" })
    if (error) return Response.json({ error: "注册失败" }, { status: 500, headers: corsHeaders })
    return Response.json({ success: true, message: "注册成功，请等待管理员审核" }, { headers: corsHeaders })
  }

  if (path === "/auth/reset-password" && req.method === "POST") {
    const body = await json(req)
    const idCard = String(body.idCard || "")
    const newPassword = String(body.newPassword || "")
    const { data: user } = await supabase.from("users").select("id").eq("id_card", idCard).single()
    if (!user) return Response.json({ error: "用户不存在" }, { status: 404, headers: corsHeaders })
    const passwordHash = await bcrypt.hash(newPassword, 10)
    const { error } = await supabase.from("users").update({ password_hash: passwordHash }).eq("id", user.id)
    if (error) return Response.json({ error: "密码重置失败" }, { status: 500, headers: corsHeaders })
    return Response.json({ success: true, message: "密码重置成功" }, { headers: corsHeaders })
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
      if (error) return Response.json({ error: "同步权限失败" }, { status: 500, headers: corsHeaders })
    }
    return Response.json({ success: true }, { headers: corsHeaders })
  }

  if (path === "/permissions" && req.method === "GET") {
    const { data, error } = await supabase.from("permissions").select("*").order("module", { ascending: true })
    if (error) return Response.json({ success: false, error: "加载权限失败" }, { status: 500, headers: corsHeaders })
    return Response.json({ success: true, items: data || [] }, { headers: corsHeaders })
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
    if (error) return Response.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders })
    return Response.json({ success: true, items: data || [], total: count || 0, queryTime: Date.now() - t0, page, pageSize }, { headers: corsHeaders })
  }

  // Cutting Orders - create
  if (path === "/cutting-orders" && req.method === "POST") {
    const body = await json(req)
    const rows = Array.isArray(body.orders) ? body.orders : []
    if (rows.length === 0) return Response.json({ success: false, error: "缺少orders" }, { status: 400, headers: corsHeaders })
    const { error } = await supabase.from("cutting_orders").insert(rows)
    if (error) return Response.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders })
    return Response.json({ success: true }, { headers: corsHeaders })
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
    if (error) return Response.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders })
    return Response.json({ success: true, items: data || [], total: count || 0, page, pageSize }, { headers: corsHeaders })
  }

  // Purchase Orders - create
  if (path === "/purchase-orders" && req.method === "POST") {
    const body = await json(req)
    const rows = Array.isArray(body.orders) ? body.orders : []
    if (rows.length === 0) return Response.json({ success: false, error: "缺少orders" }, { status: 400, headers: corsHeaders })
    const { error } = await supabase.from("purchase_orders").insert(rows)
    if (error) return Response.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders })
    return Response.json({ success: true }, { headers: corsHeaders })
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
    if (error) return Response.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders })
    return Response.json({ success: true, items: data || [] }, { headers: corsHeaders })
  }
  if (path === "/options/tooling-categories" && req.method === "GET") {
    const { data, error } = await supabase.from("tooling_categories").select("*").order("name")
    if (error) return Response.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders })
    return Response.json({ success: true, items: data || [] }, { headers: corsHeaders })
  }
  if (path === "/materials" && req.method === "GET") {
    const { data, error } = await supabase.from("materials").select("*").order("name")
    if (error) return Response.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders })
    return Response.json({ success: true, items: data || [] }, { headers: corsHeaders })
  }
  if (path === "/part-types" && req.method === "GET") {
    const { data, error } = await supabase.from("part_types").select("*").order("name")
    if (error) return Response.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders })
    return Response.json({ success: true, items: data || [] }, { headers: corsHeaders })
  }
  if (path === "/options/material-sources" && req.method === "GET") {
    const { data, error } = await supabase.from("material_sources").select("*").order("name")
    if (error) return Response.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders })
    return Response.json({ success: true, items: data || [] }, { headers: corsHeaders })
  }

  // Tooling batch info (for responsible person mapping)
  if (path.startsWith("/tooling/batch") && req.method === "GET") {
    const u = new URL(req.url)
    const ids = u.searchParams.getAll("ids")
    if (ids.length === 0) return Response.json({ success: true, items: [] }, { headers: corsHeaders })
    const { data, error } = await supabase.from("tooling").select("id,responsible_person_id,recorder").in("id", ids)
    if (error) return Response.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders })
    return Response.json({ success: true, items: data || [] }, { headers: corsHeaders })
  }

  return new Response("Not Found", { status: 404, headers: corsHeaders })
})
