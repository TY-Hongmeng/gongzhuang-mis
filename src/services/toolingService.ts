// 工装信息API服务

import { message } from 'antd'
import { supabase } from '../lib/supabase'

export interface RowItem {
  id: string
  inventory_number?: string
  production_unit?: string
  category?: string
  received_date?: string
  demand_date?: string
  completed_date?: string
  project_name?: string
  production_date?: string
  sets_count?: number
  recorder?: string
}

export interface PartItem {
  id: string;
  tooling_id: string;
  inventory_number?: string; // 父级工装盘存编号
  project_name?: string; // 父级工装项目名称
  part_inventory_number?: string; // 零件自动生成的盘存编号
  part_drawing_number?: string;
  part_name?: string;
  part_quantity?: number | string;
  material_id?: string;
  material_source_id?: string;
  part_category?: string;
  specifications?: Record<string, any>;
  weight?: number;
  unit_price?: number; // 单价(元/kg)
  total_price?: number; // 总价格(元)
  remarks?: string; // 备注（原调质列，现在支持外购材料时输入需求日期）
  material?: any; // 材质信息
}

export interface ChildItem {
  id: string;
  tooling_id: string;
  name: string; // 名称
  model: string; // 型号
  quantity: number | null; // 数量（允许为空）
  unit: string | null; // 单位（允许为空）
  required_date: string; // 需求日期
  remark?: string; // 备注
}

// 获取工装列表
export const fetchToolingList = async (page: number = 1, pageSize: number = 50) => {
  try {
    if (supabase) {
      const { data, error } = await supabase
        .from('tooling_info')
        .select('id,inventory_number,production_unit,category,received_date,demand_date,completed_date,project_name')
        .order('created_at', { ascending: true })
        .range((page - 1) * pageSize, (page - 1) * pageSize + pageSize - 1)
      if (error) throw error
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
      return { success: true, items }
    }
    const response = await fetch(`/api/tooling?page=${page}&pageSize=${pageSize}&sortField=created_at&sortOrder=asc`, { cache: 'no-store' })
    if (!response.ok) throw new Error(String(response.status))
    const result = await response.json().catch(() => ({ items: [] }))
    const rawItems = Array.isArray(result?.items) ? result.items : (Array.isArray(result?.data) ? result.data : [])
    const items = rawItems.map((x: any) => ({
      id: x.id,
      inventory_number: x.inventory_number || '',
      production_unit: x.production_unit || '',
      category: x.category || '',
      received_date: x.received_date || '',
      demand_date: x.demand_date || '',
      completed_date: x.completed_date || '',
      project_name: x.project_name || ''
    }))
    return { success: true, items }
  } catch (error) {
    console.error('获取工装列表失败:', error)
    return { success: false, items: [], error: '获取工装列表失败' }
  }
}

// 创建新工装
export const createTooling = async (data: Partial<RowItem>) => {
  try {
    const response = await fetch('/api/tooling', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    
    if (!response.ok) throw new Error(String(response.status))
    
    const result = await response.json()
    return { success: result.success || false, data: result.data }
  } catch (error) {
    console.error('创建工装失败:', error)
    return { success: false, data: null, error: '创建工装失败' }
  }
}

// 更新工装
export const updateTooling = async (id: string, data: Partial<RowItem>) => {
  try {
    const response = await fetch(`/api/tooling/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    
    if (!response.ok) throw new Error(String(response.status))
    
    return { success: true }
  } catch (error) {
    console.error('更新工装失败:', error)
    return { success: false, error: '更新工装失败' }
  }
}

// 批量删除工装
export const batchDeleteTooling = async (ids: string[]) => {
  try {
    const response = await fetch('/api/tooling/batch-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids })
    })
    
    if (!response.ok) throw new Error(String(response.status))
    
    const result = await response.json().catch(() => null)
    if (result?.success === false) throw new Error(result?.error || '批量删除工装失败')
    
    return { success: true }
  } catch (error) {
    console.error('批量删除工装失败:', error)
    return { success: false, error: '批量删除工装失败' }
  }
}

// 获取工装零件
export const fetchToolingParts = async (toolingId: string) => {
  try {
    const response = await fetch(`/api/tooling/${toolingId}/parts`, { cache: 'no-store' })
    const result = await response.json()
    
    // 兼容 data 和 items 两种格式
    const items = Array.isArray(result?.items) ? result.items : (Array.isArray(result?.data) ? result.data : [])
    
    return { success: true, items }
  } catch (error) {
    console.error('获取工装零件失败:', error)
    return { success: false, items: [], error: '获取工装零件失败' }
  }
}

// 创建工装零件
export const createToolingPart = async (toolingId: string, data: Partial<PartItem>) => {
  try {
    const response = await fetch(`/api/tooling/${toolingId}/parts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    
    if (!response.ok) throw new Error(String(response.status))
    
    const result = await response.json()
    return { success: result.success || false, data: result.data }
  } catch (error) {
    console.error('创建工装零件失败:', error)
    return { success: false, data: null, error: '创建工装零件失败' }
  }
}

// 更新工装零件
export const updateToolingPart = async (id: string, data: Partial<PartItem>) => {
  try {
    const response = await fetch(`/api/tooling/parts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    
    if (!response.ok) throw new Error(String(response.status))
    
    return { success: true }
  } catch (error) {
    console.error('更新工装零件失败:', error)
    return { success: false, error: '更新工装零件失败' }
  }
}

// 批量删除工装零件
export const batchDeleteToolingParts = async (ids: string[]) => {
  try {
    const response = await fetch('/api/tooling/parts/batch-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids })
    })
    
    if (!response.ok) throw new Error(String(response.status))
    
    const result = await response.json().catch(() => null)
    if (result?.success === false) throw new Error(result?.error || '批量删除零件失败')
    
    return { success: true }
  } catch (error) {
    console.error('批量删除零件失败:', error)
    return { success: false, error: '批量删除零件失败' }
  }
}

// 获取工装标准件
export const fetchToolingChildItems = async (toolingId: string) => {
  try {
    const response = await fetch(`/api/tooling/${toolingId}/child-items`)
    
    if (!response.ok) {
      throw new Error(`获取标准件数据失败: ${response.status}`)
    }
    
    const result = await response.json()
    
    if (result.success) {
      // 兼容 data 和 items 两种格式
      const items = Array.isArray(result?.items) ? result.items : (Array.isArray(result?.data) ? result.data : [])
      return { success: true, items }
    }
    
    return { success: false, items: [], error: result.error || '获取标准件数据失败' }
  } catch (error) {
    console.error('获取工装标准件失败:', error)
    return { success: false, items: [], error: '获取工装标准件失败' }
  }
}

// 创建工装标准件
export const createToolingChildItem = async (toolingId: string, data: Partial<ChildItem>) => {
  try {
    const response = await fetch(`/api/tooling/${toolingId}/child-items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    
    if (!response.ok) throw new Error(String(response.status))
    
    const result = await response.json()
    return { success: result.success || false, data: result.data }
  } catch (error) {
    console.error('创建工装标准件失败:', error)
    return { success: false, data: null, error: '创建工装标准件失败' }
  }
}

// 更新工装标准件
export const updateToolingChildItem = async (id: string, data: Partial<ChildItem>) => {
  try {
    const response = await fetch(`/api/tooling/child-items/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    
    if (!response.ok) throw new Error(String(response.status))
    
    return { success: true }
  } catch (error) {
    console.error('更新工装标准件失败:', error)
    return { success: false, error: '更新工装标准件失败' }
  }
}

// 批量删除工装标准件
export const batchDeleteToolingChildItems = async (ids: string[]) => {
  try {
    const response = await fetch('/api/tooling/child-items/batch-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids })
    })
    
    if (!response.ok) throw new Error(String(response.status))
    
    const result = await response.json().catch(() => null)
    if (result?.success === false) throw new Error(result?.error || '批量删除标准件失败')
    
    return { success: true }
  } catch (error) {
    console.error('批量删除标准件失败:', error)
    return { success: false, error: '批量删除标准件失败' }
  }
}

// 生成下料单
export const generateCuttingOrders = async (orders: any[]) => {
  try {
    const normalized = Array.isArray(orders) ? orders.map((raw: any) => {
      const o: any = { ...raw }
      if (typeof o.remarks === 'string' && o.remarks.trim()) {
        o.remarks = String(o.remarks).trim()
      } else if (o.heat_treatment) {
        o.remarks = '需调质'
      }
      if ('heat_treatment' in o) {
        delete o.heat_treatment
      }
      return o
    }) : []

    if (supabase) {
      const { error } = await supabase.from('cutting_orders').insert(normalized)
      if (error) throw error
      return { success: true }
    }
    const response = await fetch('/api/cutting-orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orders: normalized }) })
    if (!response.ok) { const errorText = await response.text(); throw new Error(`服务器错误: ${response.status} - ${errorText}`) }
    const result = await response.json(); return result
  } catch (error) {
    console.error('生成下料单失败:', error)
    throw error
  }
}

// 生成采购单
export const generatePurchaseOrders = async (orders: any[]) => {
  try {
    const response = await fetch('/api/purchase-orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orders }) })
    if (!response.ok) { const errorText = await response.text(); throw new Error(`服务器错误: ${response.status} - ${errorText}`) }
    const result = await response.json(); return result
  } catch (error) {
    console.error('生成采购单失败:', error)
    throw error
  }
}

// 获取基础数据
export const fetchMetaData = async () => {
  try {
    if (supabase) {
      const [units, cats, materialsRaw, partTypesRaw, sources] = await Promise.all([
        supabase.from('production_units').select('*').order('name'),
        supabase.from('tooling_categories').select('*').order('name'),
        supabase.from('materials').select('*').order('name'),
        supabase.from('part_types').select('*').order('name'),
        supabase.from('material_sources').select('*').order('name')
      ])
      const productionUnits = units.data || []
      const toolingCategories = cats.data || []
      const materials = (materialsRaw.data || []).map((x: any) => ({ id: x.id, name: x.name, density: x.density })).filter((x: any) => x.name)
      const partTypes = (partTypesRaw.data || []).map((x: any) => ({ id: x.id, name: x.name, volume_formula: x.volume_formula, input_format: x.input_format })).filter((x: any) => x.name)
      const materialSources = (sources.data || []).map((x: any) => ({ id: x.id, name: x.name })).filter((x: any) => x.name)
      return { success: true, data: { productionUnits, toolingCategories, materials, partTypes, materialSources } }
    }
    const [unitsRes, catsRes, materialsRes, partTypesRes, materialSourcesRes] = await Promise.all([
      fetch('/api/options/production-units').then(r => r.json()),
      fetch('/api/options/tooling-categories').then(r => r.json()),
      fetch('/api/materials', { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/part-types', { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/options/material-sources', { cache: 'no-store' }).then(r => r.json())
    ])
    const getItems = (res: any) => Array.isArray(res?.items) ? res.items : (Array.isArray(res?.data) ? res.data : [])
    const productionUnits = getItems(unitsRes)
    const toolingCategories = getItems(catsRes)
    const materials = getItems(materialsRes).map((x: any) => ({id: x.id, name: x.name, density: x.density})).filter((x: any) => x.name)
    const partTypes = getItems(partTypesRes).map((x: any) => ({id: x.id, name: x.name, volume_formula: x.volume_formula, input_format: x.input_format})).filter((x: any) => x.name)
    const materialSources = getItems(materialSourcesRes).map((x: any) => ({id: x.id, name: x.name})).filter((x: any) => x.name)
    return { success: true, data: { productionUnits, toolingCategories, materials, partTypes, materialSources } }
  } catch (error) {
    console.error('获取基础数据失败:', error)
    return {
      success: false,
      data: {
        productionUnits: [],
        toolingCategories: [],
        materials: [],
        partTypes: [],
        materialSources: []
      },
      error: '获取基础数据失败'
    }
  }
}
