import { useState, useCallback } from 'react'
import { fetchWithFallback } from '../utils/api'
import { message } from 'antd'

// 工装信息数据管理Hook
export const useToolingData = () => {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([])
  const [partsMap, setPartsMap] = useState<Record<string, any[]>>({})
  const [childItemsMap, setChildItemsMap] = useState<Record<string, any[]>>({})
  const [expandedRowKeys, setExpandedRowKeys] = useState<string[]>([])
  const [expandedChildKeys, setExpandedChildKeys] = useState<string[]>([])

  // 获取工装数据
  const fetchToolingData = useCallback(async (opts?: {
    page?: number
    pageSize?: number
    search?: string
    production_unit?: string
    category?: string
    start_date?: string
    end_date?: string
    sortField?: string
    sortOrder?: 'asc' | 'desc'
  }) => {
    setLoading(true)
    try {
      const p = new URLSearchParams()
      p.set('page', String(opts?.page ?? 1))
      p.set('pageSize', String(opts?.pageSize ?? 50))
      p.set('sortField', String(opts?.sortField ?? 'created_at'))
      p.set('sortOrder', String(opts?.sortOrder ?? 'asc'))
      if (opts?.search) p.set('search', String(opts.search))
      if (opts?.production_unit) p.set('production_unit', String(opts.production_unit))
      if (opts?.category) p.set('category', String(opts.category))
      if (opts?.start_date) p.set('start_date', String(opts.start_date))
      if (opts?.end_date) p.set('end_date', String(opts.end_date))
      const response = await fetchWithFallback(`/api/tooling?${p.toString()}`, { 
        cache: 'no-store' 
      })
      if (!response.ok) throw new Error(String(response.status))
      
      const result = await response.json().catch(() => ({ items: [] }))
      // 兼容 data 和 items 两种格式
      const rawItems = Array.isArray(result?.items) ? result.items : (Array.isArray(result?.data) ? result.data : [])
      
      // 关键修复：处理数据，将所有对象转换为基本类型，避免循环引用
      const items = rawItems.map(item => ({
        ...item,
        // 将所有属性转换为基本类型
        id: String(item.id || ''),
        inventory_number: String(item.inventory_number || ''),
        production_unit: String(item.production_unit || ''),
        category: String(item.category || ''),
        received_date: String(item.received_date || ''),
        demand_date: String(item.demand_date || ''),
        completed_date: String(item.completed_date || ''),
        project_name: String(item.project_name || ''),
        production_date: String(item.production_date || ''),
        sets_count: item.sets_count ? Number(item.sets_count) : 1,
        recorder: String(item.recorder || '')
      }))
      
      setData(items)
      return items
    } catch (error) {
      message.error('数据加载失败')
      setData([])
      return []
    } finally {
      setLoading(false)
    }
  }, [])

  // 获取零件数据
  const fetchPartsData = useCallback(async (toolingId: string) => {
    try {
      const response = await fetchWithFallback(`/api/tooling/${toolingId}/parts`, { cache: 'no-store' })
      const result = await response.json()
      
      // 兼容 data 和 items 两种格式
      const rawItems = Array.isArray(result?.items) ? result.items : (Array.isArray(result?.data) ? result.data : [])
      // 关键修复：处理数据，将所有对象转换为基本类型，避免循环引用
      const items = rawItems.map(item => {
        // 创建安全的规格对象，避免循环引用
        const safeSpecifications = item.specifications ? Object.fromEntries(
          Object.entries(item.specifications)
            .filter(([_, value]) => typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
            .map(([key, value]) => [key, value === null || value === undefined ? '' : value])
        ) : {};
        
        return {
          ...item,
          // 将所有属性转换为基本类型
          id: String(item.id || ''),
          tooling_id: String(item.tooling_id || ''),
          part_inventory_number: String(item.part_inventory_number || ''),
          part_drawing_number: String(item.part_drawing_number || ''),
          part_name: String(item.part_name || ''),
          part_quantity: item.part_quantity ? Number(item.part_quantity) : null,
          material_id: String(item.material_id || ''),
          material_source_id: String(item.material_source_id || ''),
          part_category: String(item.part_category || ''),
          specifications: safeSpecifications,
          weight: item.weight ? Number(item.weight) : 0,
          unit_price: item.unit_price ? Number(item.unit_price) : 0,
          total_price: item.total_price ? Number(item.total_price) : 0,
          remarks: String(item.remarks || ''),
          process_route: String(item.process_route || ''),
          // 移除可能导致循环引用的嵌套对象
          material: undefined
        };
      });
      
      setPartsMap(prev => ({ ...prev, [toolingId]: items }))
      return items
    } catch (error) {
      console.error('获取零件数据失败:', error)
      return []
    }
  }, [])

  // 获取标准件数据
  const fetchChildItemsData = useCallback(async (toolingId: string) => {
    try {
      const response = await fetchWithFallback(`/api/tooling/${toolingId}/child-items`)
      const result = await response.json()
      
      if (result.success) {
        // 兼容 data 和 items 两种格式
        const rawItems = Array.isArray(result?.items) ? result.items : (Array.isArray(result?.data) ? result.data : [])
        // 关键修复：处理数据，将所有对象转换为基本类型，避免循环引用
        const items = rawItems.map(item => ({
          ...item,
          // 将所有属性转换为基本类型
          id: String(item.id || ''),
          tooling_id: String(item.tooling_id || ''),
          name: String(item.name || ''),
          model: String(item.model || ''),
          quantity: item.quantity ? Number(item.quantity) : null,
          unit: String(item.unit || ''),
          required_date: String(item.required_date || ''),
          remark: String(item.remark || ''),
          type: String(item.type || '')
        }))
        setChildItemsMap(prev => ({ ...prev, [toolingId]: items }))
        return items
      }
      return []
    } catch (error) {
      console.error('获取标准件数据失败:', error)
      return []
    }
  }, [])

  // 保存工装数据
  const saveToolingData = useCallback(async (id: string, data: any) => {
    try {
      const response = await fetchWithFallback(`/api/tooling/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      
      if (!response.ok) throw new Error('保存失败')
      message.success('保存成功')
      return true
    } catch (error) {
      message.error('保存失败')
      return false
    }
  }, [])

  // 保存零件数据
  const savePartData = useCallback(async (partId: string, data: any) => {
    try {
      const response = await fetchWithFallback(`/api/tooling/parts/${partId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      
      if (!response.ok) {
        const text = await response.text().catch(() => '')
        const msg = text || '保存零件数据失败'
        message.error(msg)
        return false
      }
      const result = await response.json().catch(() => ({}))
      if (result?.success === false) {
        const msg = String(result?.error || '保存零件数据失败')
        message.error(msg)
        return false
      }
      // 显示成功消息
      message.success('保存成功')
      return true
    } catch (error) {
      message.error('保存零件数据失败')
      return false
    }
  }, [])

  // 创建新工装
  const createTooling = useCallback(async (data: any) => {
    try {
      const response = await fetchWithFallback('/api/tooling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => '')
        const msg = `创建失败，状态码：${response.status}，错误信息：${errorText || '网络错误'}`
        message.error('创建工装失败：' + msg)
        return { success: false, data: null, error: msg }
      }

      const result = await response.json().catch(() => ({}))
      if (result?.success === false) {
        const msg = String(result?.error || result?.message || '未知错误')
        message.error('创建工装失败：' + msg)
        return { success: false, data: null, error: msg }
      }

      return { success: true, data: result?.data }
    } catch (error) {
      const msg = (error instanceof Error ? error.message : String(error))
      console.error('创建工装失败详细信息:', error, '请求数据:', data)
      message.error('创建工装失败：' + msg)
      return { success: false, data: null, error: msg }
    }
  }, [])

  // 创建新零件
  const createPart = useCallback(async (toolingId: string, data: any) => {
    try {
      const response = await fetchWithFallback(`/api/tooling/${toolingId}/parts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`创建零件失败，状态码：${response.status}，错误信息：${errorText}`)
      }
      const result = await response.json()
      
      // 检查API返回的success字段
      if (result?.success === false) {
        throw new Error(`创建零件失败，错误信息：${result?.message || '未知错误'}`)
      }
      
      return result.data
    } catch (error) {
      console.error('创建零件失败详细信息:', error, '工装ID:', toolingId, '请求数据:', data)
      message.error('创建零件失败：' + (error instanceof Error ? error.message : String(error)))
      return null
    }
  }, [])

  // 创建新标准件
  const createChildItem = useCallback(async (toolingId: string, data: any) => {
    try {
      const response = await fetchWithFallback(`/api/tooling/${toolingId}/child-items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`创建标准件失败，状态码：${response.status}，错误信息：${errorText}`)
      }
      const result = await response.json()
      
      // 检查API返回的success字段
      if (result?.success === false) {
        throw new Error(`创建标准件失败，错误信息：${result?.message || '未知错误'}`)
      }
      
      return result.data
    } catch (error) {
      console.error('创建标准件失败详细信息:', error, '工装ID:', toolingId, '请求数据:', data)
      message.error('创建标准件失败：' + (error instanceof Error ? error.message : String(error)))
      return null
    }
  }, [])

  // 批量删除
  const batchDelete = useCallback(async (toolingIds: string[], partIds: string[], childItemIds: string[]) => {
    try {
      const promises = []
      
      if (toolingIds.length > 0) {
        promises.push(
          fetchWithFallback('/api/tooling/batch-delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: toolingIds })
          })
        )
      }
      
      if (partIds.length > 0) {
        promises.push(
          fetchWithFallback('/api/tooling/parts/batch-delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: partIds })
          })
        )
      }
      
      if (childItemIds.length > 0) {
        promises.push(
          fetchWithFallback('/api/tooling/child-items/batch-delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: childItemIds })
          })
        )
      }
      
      await Promise.all(promises)
      message.success(`已删除 ${toolingIds.length + partIds.length + childItemIds.length} 条记录`)
      return true
    } catch (error) {
      message.error('批量删除失败')
      return false
    }
  }, [])

  return {
    data,
    loading,
    selectedRowKeys,
    partsMap,
    childItemsMap,
    expandedRowKeys,
    expandedChildKeys,
    setData,
    setLoading,
    setSelectedRowKeys,
    setPartsMap,
    setChildItemsMap,
    setExpandedRowKeys,
    setExpandedChildKeys,
    fetchToolingData,
    fetchPartsData,
    fetchChildItemsData,
    saveToolingData,
    savePartData,
    createTooling,
    createPart,
    createChildItem,
    batchDelete
  }
}
