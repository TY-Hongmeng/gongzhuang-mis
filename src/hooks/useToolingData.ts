import { useState, useCallback, useRef, useEffect } from 'react'
import { fetchWithFallback } from '../utils/api'
import { message } from 'antd'

// 工装信息数据管理Hook
export const useToolingData = () => {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([])
  const [partsMap, setPartsMap] = useState<Record<string, any[]>>({})
  const [childItemsMap, setChildItemsMap] = useState<Record<string, any[]>>({})
  const [partsLoadingMap, setPartsLoadingMap] = useState<Record<string, boolean>>({})
  const [childLoadingMap, setChildLoadingMap] = useState<Record<string, boolean>>({})
  const [expandedRowKeys, setExpandedRowKeys] = useState<string[]>([])
  const [expandedChildKeys, setExpandedChildKeys] = useState<string[]>([])
  const dataRef = useRef(data)
  useEffect(() => {
    dataRef.current = data
  }, [data])
  const partsMapRef = useRef(partsMap)
  useEffect(() => {
    partsMapRef.current = partsMap
  }, [partsMap])
  const partsCacheRef = useRef<Map<string, { items: any[]; ts: number }>>(new Map())
  const childCacheRef = useRef<Map<string, { items: any[]; ts: number }>>(new Map())
  const inflightPartsRef = useRef<Map<string, Promise<any[]>>>(new Map())
  const inflightChildRef = useRef<Map<string, Promise<any[]>>>(new Map())
  const TTL = 30 * 1000

  // 获取工装数据
  const fetchToolingData = useCallback(async (opts?: {
    page?: number
    pageSize?: number
    search?: string
    production_unit?: string
    category?: string
    priority_level?: number | string
    start_date?: string
    end_date?: string
    sortField?: string
    sortOrder?: 'asc' | 'desc'
    silent?: boolean
  }) => {
    const silent = !!opts?.silent
    if (!silent) setLoading(true)
    try {
      const p = new URLSearchParams()
      p.set('page', String(opts?.page ?? 1))
      p.set('pageSize', String(opts?.pageSize ?? 0))
      p.set('sortField', String(opts?.sortField ?? 'created_at'))
      p.set('sortOrder', String(opts?.sortOrder ?? 'asc'))
      if (opts?.search) p.set('search', String(opts.search))
      if (opts?.production_unit) p.set('production_unit', String(opts.production_unit))
      if (opts?.category) p.set('category', String(opts.category))
      if (opts?.priority_level) p.set('priority_level', String(opts.priority_level))
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
        priority_level: typeof item.priority_level === 'number' ? item.priority_level : Number(item.priority_level || 0),
        received_date: String(item.received_date || ''),
        demand_date: String(item.demand_date || ''),
        completed_date: String(item.completed_date || ''),
        project_name: String(item.project_name || ''),
        production_date: String(item.production_date || ''),
        sets_count: item.sets_count ? Number(item.sets_count) : 1,
        recorder: String(item.recorder || ''),
        material_total: item.material_total === null || typeof item.material_total === 'undefined' || item.material_total === ''
          ? null
          : Number(item.material_total),
        process_total: item.process_total === null || typeof item.process_total === 'undefined' || item.process_total === ''
          ? null
          : Number(item.process_total),
      }))
      const mergedItems = silent
        ? (() => {
            const localRows = dataRef.current || []
            const prevMap = new Map<string, any>(localRows.map(row => [String(row.id || ''), row]))
            const serverMerged = items.map(row => {
              const prevRow = prevMap.get(String(row.id || ''))
              if (!prevRow) return row
              const serverInv = String(row.inventory_number || '').trim()
              const localInv = String(prevRow.inventory_number || '').trim()
              if (!serverInv && localInv) {
                return { ...row, inventory_number: String(prevRow.inventory_number || '') }
              }
              return row
            })
            // 静默刷新时，若后端短时间内还查不到刚创建/刚更新的行，保留本地行，避免“先消失后出现”
            const serverIdSet = new Set(serverMerged.map(row => String(row.id || '')))
            const hasDraftContent = (row: any) => {
              const textKeys = ['inventory_number', 'project_name', 'production_unit', 'category', 'received_date', 'demand_date', 'completed_date', 'production_date', 'recorder']
              if (textKeys.some(k => String(row?.[k] ?? '').trim() !== '')) return true
              return Number(row?.priority_level || 0) > 0
            }
            const keepLocalRows = localRows.filter(row => {
              const rowId = String(row.id || '')
              if (!rowId) return false
              if (serverIdSet.has(rowId)) return false
              if (rowId.startsWith('blank-')) return hasDraftContent(row)
              return !serverIdSet.has(rowId)
            })
            return [...serverMerged, ...keepLocalRows]
          })()
        : items

      setData(mergedItems)
      return mergedItems
    } catch (error) {
      message.error('数据加载失败')
      setData([])
      return []
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  // 获取零件数据
  const fetchPartsData = useCallback(async (toolingId: string, force = false) => {
    const now = Date.now()
    const localItems = partsMapRef.current[toolingId] || []
    const cached = partsCacheRef.current.get(toolingId)
    if (force) {
      partsCacheRef.current.delete(toolingId)
    }
    if (!force && cached && now - cached.ts < TTL) {
      setPartsLoadingMap(prev => ({ ...prev, [toolingId]: false }))
      if (localItems.length > 0) {
        const cachedIds = new Set(cached.items.map(item => String(item.id)))
        const localHasBlank = localItems.some(item => String(item.id || '').startsWith('blank-'))
        const localDiff = localItems.length !== cached.items.length || localItems.some(item => !cachedIds.has(String(item.id)))
        if (localHasBlank || localDiff) {
          partsCacheRef.current.set(toolingId, { items: localItems, ts: now })
          setPartsMap(prev => ({ ...prev, [toolingId]: localItems }))
          return localItems
        }
      }
      setPartsMap(prev => ({ ...prev, [toolingId]: cached.items }))
      return cached.items
    }
    const inflight = inflightPartsRef.current.get(toolingId)
    if (inflight) {
      setPartsLoadingMap(prev => ({ ...prev, [toolingId]: true }))
      return inflight
    }
    const promise = (async () => {
      setPartsLoadingMap(prev => ({ ...prev, [toolingId]: true }))
      try {
        const timestamp = Date.now()
        const response = await fetchWithFallback(`/api/tooling/${toolingId}/parts?t=${timestamp}`, { cache: 'no-store' })
        const result = await response.json()
        const rawItems = Array.isArray(result?.items) ? result.items : (Array.isArray(result?.data) ? result.data : [])
        let items = rawItems.map(item => {
          const safeSpecifications = item.specifications ? Object.fromEntries(
            Object.entries(item.specifications)
              .filter(([_, value]) => typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
              .map(([key, value]) => [key, value === null || value === undefined ? '' : value])
          ) : {};
          return {
            ...item,
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
            process_amount: item.process_amount === null || typeof item.process_amount === 'undefined' || item.process_amount === ''
              ? null
              : Number(item.process_amount),
            amounts_updated_at: String(item.amounts_updated_at || ''),
            remarks: String(item.remarks || ''),
            purchase_status: String(item.purchase_status || ''),
            process_route: String(item.process_route || ''),
            completed_steps: Array.isArray(item.completed_steps) ? item.completed_steps : [],
            material: undefined
          };
        });
        
        // 按盘存编号自然排序（支持 LJ260101-01 和 T00101 两种格式）
        items.sort((a: any, b: any) => {
          const numA = String(a.part_inventory_number || '')
          const numB = String(b.part_inventory_number || '')
          // 提取前缀和数字后缀（支持带或不带分隔符的格式）
          const matchA = numA.match(/^(.*?)(\d+)$/)
          const matchB = numB.match(/^(.*?)(\d+)$/)
          if (matchA && matchB) {
            const prefixA = matchA[1]
            const prefixB = matchB[1]
            // 先比较前缀
            if (prefixA !== prefixB) {
              return prefixA.localeCompare(prefixB)
            }
            // 前缀相同，按数字后缀排序
            const suffixA = parseInt(matchA[2], 10)
            const suffixB = parseInt(matchB[2], 10)
            return suffixA - suffixB
          }
          // 不符合格式，按字符串排序
          return numA.localeCompare(numB)
        });
        
        partsCacheRef.current.set(toolingId, { items, ts: Date.now() })
        setPartsMap(prev => ({ ...prev, [toolingId]: items }))
        return items
      } catch (error) {
        console.error('获取零件数据失败:', error)
        return []
      } finally {
        inflightPartsRef.current.delete(toolingId)
        setPartsLoadingMap(prev => ({ ...prev, [toolingId]: false }))
      }
    })()
    inflightPartsRef.current.set(toolingId, promise)
    return promise
  }, [])

  // 获取标准件数据
    const fetchChildItemsData = useCallback(async (toolingId: string, force = false) => {
    const now = Date.now()
    const cached = childCacheRef.current.get(toolingId)
    if (force) {
      childCacheRef.current.delete(toolingId)
    }
    if (!force && cached && now - cached.ts < TTL) {
      setChildLoadingMap(prev => ({ ...prev, [toolingId]: false }))
      setChildItemsMap(prev => ({ ...prev, [toolingId]: cached.items }))
      return cached.items
    }
    const inflight = inflightChildRef.current.get(toolingId)
    if (inflight) {
      setChildLoadingMap(prev => ({ ...prev, [toolingId]: true }))
      return inflight
    }
    const promise = (async () => {
      setChildLoadingMap(prev => ({ ...prev, [toolingId]: true }))
      try {
        const timestamp = Date.now()
        const response = await fetchWithFallback(`/api/tooling/${toolingId}/child-items?t=${timestamp}`, { cache: 'no-store' })
        const result = await response.json()
        if (result.success) {
          const rawItems = Array.isArray(result?.items) ? result.items : (Array.isArray(result?.data) ? result.data : [])
          const items = rawItems.map(item => ({
            ...item,
            id: String(item.id || ''),
            tooling_id: String(item.tooling_id || ''),
            name: String(item.name || ''),
            model: String(item.model || ''),
            quantity: item.quantity ? Number(item.quantity) : null,
            unit: String(item.unit || ''),
            required_date: String(item.required_date || ''),
            remark: String(item.remark || ''),
            purchase_status: String(item.purchase_status || ''),
            type: String(item.type || '')
          }))
          childCacheRef.current.set(toolingId, { items, ts: Date.now() })
          setChildItemsMap(prev => ({ ...prev, [toolingId]: items }))
          return items
        }
        return []
      } catch (error) {
        console.error('获取标准件数据失败:', error)
        return []
      } finally {
        inflightChildRef.current.delete(toolingId)
        setChildLoadingMap(prev => ({ ...prev, [toolingId]: false }))
      }
    })()
    inflightChildRef.current.set(toolingId, promise)
    return promise
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
      return true
    } catch (error) {
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
      // 移除成功消息，避免频繁提示
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

      // 更新本地状态
      if (toolingIds.length > 0) {
        setData(prev => prev.filter(item => !toolingIds.includes(item.id)))
      }

      if (partIds.length > 0) {
        setPartsMap(prev => {
          const next = { ...prev }
          Object.keys(next).forEach(tid => {
            if (next[tid]) {
              next[tid] = next[tid].filter(p => !partIds.includes(p.id))
            }
          })
          return next
        })
      }

      if (childItemIds.length > 0) {
        setChildItemsMap(prev => {
          const next = { ...prev }
          Object.keys(next).forEach(tid => {
            if (next[tid]) {
              next[tid] = next[tid].filter(c => !childItemIds.includes(c.id))
            }
          })
          return next
        })
      }

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
    partsLoadingMap,
    childLoadingMap,
    expandedRowKeys,
    expandedChildKeys,
    setData,
    setLoading,
    setSelectedRowKeys,
    setPartsMap,
    setChildItemsMap,
    setPartsLoadingMap,
    setChildLoadingMap,
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
