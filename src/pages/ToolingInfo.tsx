import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { Card, Typography, Button, Space, Table, message, Modal, Input, Select, DatePicker, AutoComplete } from 'antd'
import { LeftOutlined, ToolOutlined, ReloadOutlined, DeleteOutlined, UploadOutlined, DownloadOutlined } from '@ant-design/icons'
import { fetchWithFallback } from '../utils/api'
import { safeLocalStorage } from '../utils/safeStorage'
import { getProcessDone } from '../utils/processDone'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { CATEGORY_CODE_MAP } from '../types/tooling'
import { formatSpecificationsForProduction } from '../utils/productionFormat'
import { getApplicableMaterialPrice, calculateTotalPrice } from '../utils/priceCalculator'
import { generateInventoryNumber, canGenerateInventoryNumber } from '../utils/toolingCalculations'
import { useToolingData } from '../hooks/useToolingData'
import { useToolingMeta } from '../hooks/useToolingMeta'
import { useToolingOperations } from '../hooks/useToolingOperations'
import EditableCell from '../components/EditableCell'
import SpecificationsInput from '../components/SpecificationsInput'
import type { Material } from '../types/tooling'

const { Title } = Typography

interface RowItem {
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

interface PartItem {
  id: string
  tooling_id: string
  inventory_number?: string
  project_name?: string
  part_inventory_number?: string
  part_drawing_number?: string
  part_name?: string
  part_quantity?: number | string
  material_id?: string
  material_source_id?: string
  part_category?: string
  specifications?: Record<string, any>
  weight?: number
  unit_price?: number
  total_price?: number
  remarks?: string
  material?: any
  specifications_text?: string
  process_route?: string
}

interface ChildItem {
  id: string
  tooling_id: string
  name: string
  model: string
  quantity: number | null
  unit: string | null
  required_date: string
  remark?: string
  type?: string
}

// 判断是否应该自动填入责任人
const shouldAutoFillRecorder = (row: RowItem): boolean => {
  const fieldsToCheck = [
    row.inventory_number,
    row.project_name,
    row.production_unit,
    row.category,
    row.received_date,
    row.demand_date,
    row.completed_date,
    row.production_date
  ]
  return fieldsToCheck.some(field => field && field.toString().trim() !== '')
}

// 确保空白零件行
const ensureBlankParts = (toolingId: string, list: PartItem[]) => {
  const arr = [...list]
  const blankId = `blank-${toolingId}-0`
  const hasBlank = arr.some(x => String(x.id) === blankId)
  if (!hasBlank) {
    arr.push({
      id: blankId,
      tooling_id: toolingId,
      part_drawing_number: '',
      part_name: '',
      part_quantity: '',
      material_id: '',
      material_source_id: '',
      part_category: '',
      specifications: {},
      weight: 0,
      remarks: ''
    })
  }
  return arr
}

// 确保空白标准件行
const ensureBlankChildItems = (items: ChildItem[], toolingId: string) => {
  const arr = [...items]
  const blankId = `blank-${toolingId}-0`
  const hasBlank = arr.some(x => String(x.id) === blankId)
  if (!hasBlank) {
    arr.push({
      id: blankId,
      tooling_id: toolingId,
      name: '',
      model: '',
      quantity: null,
      unit: '',
      required_date: '',
      remark: ''
    })
  }
  return arr
}

const ToolingInfoPage: React.FC = () => {
  const navigate = useNavigate()
  const {
    productionUnits,
    toolingCategories,
    materials,
    partTypes,
    materialSources,
    fetchAllMeta
  } = useToolingMeta()

  const { user } = useAuthStore()
  const [extraRows, setExtraRows] = useState(2)
  const tableWrapRef = useRef<HTMLDivElement>(null)
  const savedScrollTopRef = useRef<number>(0)
  const [statusTick, setStatusTick] = useState(0)
  const [processRoutes, setProcessRoutes] = useState<Record<string, string>>(() => {
    try {
      // 关键修复：安全解析localStorage数据，确保没有循环引用
      const stored = safeLocalStorage.getItem('process_routes_map') || '{}'
      if (stored.length > 900_000) {
        safeLocalStorage.removeItem('process_routes_map')
        return {}
      }
      const parsed = JSON.parse(stored)
      // 确保只保留字符串值
      return Object.fromEntries(
        Object.entries(parsed)
          .filter(([_, value]) => typeof value === 'string')
          .map(([key, value]) => [key, String(value)])
      )
    } catch { return {} }
  })
  const [processDoneMap, setProcessDoneMap] = useState<Record<string, { done: string[]; last?: string; time?: number }>>(() => ({}))
  const fileInputRef = useRef<HTMLInputElement>(null)
  const processDoneFetchRef = useRef<{ timer: NodeJS.Timeout | null; lastFetchTime: number }>({ timer: null, lastFetchTime: 0 })
  
  // 导入相关状态
  const [importModalVisible, setImportModalVisible] = useState(false)
  const [importPreviewVisible, setImportPreviewVisible] = useState(false)
  const [importPreviewData, setImportPreviewData] = useState<any[]>([])
  const [importFile, setImportFile] = useState<File | null>(null)

  // 使用自定义Hooks
  const {
    data,
    loading,
    selectedRowKeys,
    partsMap,
    childItemsMap,
    expandedRowKeys,
    expandedChildKeys,
    setData,
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
  } = useToolingData()

  useEffect(() => {
    const keys = new Set<string>()
    try {
      Object.values(partsMap).forEach((list: any) => {
        ;(list || []).forEach((p: any) => {
          const k = String(p.part_inventory_number || p.inventory_number || '').trim().toUpperCase()
          if (k) keys.add(k)
        })
      })
    } catch {}

    const batch = Array.from(keys).slice(0, 2000)
    if (batch.length === 0) return

    let cancelled = false
    
    const fetchProcessDone = async () => {
      const now = Date.now()
      const timeSinceLastFetch = now - processDoneFetchRef.current.lastFetchTime
      
      if (timeSinceLastFetch < 1000) {
        return
      }
      
      processDoneFetchRef.current.lastFetchTime = now
      
      const pairs: Array<[string, any]> = []
      for (const k of batch) {
        if (cancelled) break
        const v = await getProcessDone(k)
        if (v) pairs.push([k, v])
      }
      if (cancelled) return
      if (pairs.length === 0) return
      setProcessDoneMap((prev) => {
        const next = { ...prev }
        for (const [k, v] of pairs) next[k] = v
        return next
      })
    }

    if (processDoneFetchRef.current.timer) {
      clearTimeout(processDoneFetchRef.current.timer)
    }
    
    processDoneFetchRef.current.timer = setTimeout(() => {
      fetchProcessDone()
    }, 500) as any

    return () => {
      cancelled = true
      if (processDoneFetchRef.current.timer) {
        clearTimeout(processDoneFetchRef.current.timer)
      }
    }
  }, [partsMap])
  const [userTeamsMap, setUserTeamsMap] = useState<Record<string, string>>({})
  const [teamsLoaded, setTeamsLoaded] = useState(false)
  const isTechnician = String(user?.roles?.name || '').includes('技术员')
  const myTeamName = useMemo(() => {
    const rn = String(user?.real_name || '')
    return userTeamsMap[rn] || ''
  }, [user, userTeamsMap])
  useEffect(() => {
    (async () => {
      try {
        const resp = await fetchWithFallback('/api/tooling/users/basic')
        const js = await resp.json()
        const map: Record<string, string> = {}
        ;(js.items || []).forEach((u: any) => {
          map[String(u.real_name || '')] = String(u.team || '')
        })
        setUserTeamsMap(map)
        setTeamsLoaded(true)
      } catch {}
    })()
  }, [])

  const visibleData = useMemo(() => {
    if (isTechnician && !teamsLoaded) return []
    if (!isTechnician || !myTeamName) return data
    return (data || []).filter((row: any) => {
      const rec = String(row.recorder || '')
      const team = userTeamsMap[rec] || ''
      return team && team === myTeamName
    })
  }, [data, isTechnician, myTeamName, userTeamsMap, teamsLoaded])
  const [filterSearch, setFilterSearch] = useState('')
  const [filterUnit, setFilterUnit] = useState<string | undefined>(undefined)
  const [filterCategory, setFilterCategory] = useState<string | undefined>(undefined)
  const applyFilters = useCallback(() => {
    const opts: any = {
      page: 1,
      pageSize: 50,
      sortField: 'created_at',
      sortOrder: 'asc'
    }
    if (filterSearch.trim()) opts.search = filterSearch.trim()
    if (filterUnit) opts.production_unit = filterUnit
    if (filterCategory) opts.category = filterCategory
    fetchToolingData(opts)
  }, [filterSearch, filterUnit, filterCategory, fetchToolingData])
  
  // 添加筛选状态变化自动触发筛选的逻辑，300ms防抖
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      applyFilters()
    }, 300)
    
    return () => clearTimeout(timeoutId)
  }, [filterSearch, filterUnit, filterCategory, applyFilters])

  const unitOptions = useMemo(() => {
    const set = new Set<string>()
    data.forEach(d => { const v = String(d.production_unit || '').trim(); if (v) set.add(v) })
    return Array.from(set).map(v => ({ value: v, label: v }))
  }, [data])
  const categoryOptions = useMemo(() => {
    const set = new Set<string>()
    data.forEach(d => { const v = String(d.category || '').trim(); if (v) set.add(v) })
    return Array.from(set).map(v => ({ value: v, label: v }))
  }, [data])
  
  // 工时数据状态，存储所有已录入的工时记录
  const [workHoursData, setWorkHoursData] = useState<Record<string, string[]>>({})
  
  // 获取工时数据，用于判断工艺路线是否已录入工时
  const fetchWorkHoursData = useCallback(async () => {
    try {
      // 使用正确的API路径和合理的pageSize
      const response = await fetch('/api/tooling/work-hours?page=1&pageSize=200', { cache: 'no-store' })
      if (!response.ok) {
        console.error('获取工时数据失败，HTTP状态:', response.status)
        throw new Error('获取工时数据失败')
      }
      
      const result = await response.json()
      
      // 检查API响应格式
      if (!result || typeof result !== 'object') {
        console.error('获取工时数据失败，响应格式错误:', result)
        throw new Error('获取工时数据失败，响应格式错误')
      }
      
      // 检查响应是否成功
      if (result.success !== true) {
        console.error('获取工时数据失败，API返回错误:', result.error)
        // 即使API返回错误，也不抛出异常，避免影响页面其他功能
        setWorkHoursData({})
        return
      }
      
      // 提取工时数据
      const rawItems = Array.isArray(result?.items) ? result.items : (Array.isArray(result?.data) ? result.data : [])
      
      // 处理工时数据，按零件盘存编号分组，记录已完成的工序
      const hoursByInventoryNo: Record<string, string[]> = {}
      rawItems.forEach(item => {
        const inventoryNo = String(item.part_inventory_number || '').trim().toUpperCase()
        const processName = String(item.process_name || '').trim()
        if (inventoryNo && processName) {
          if (!hoursByInventoryNo[inventoryNo]) {
            hoursByInventoryNo[inventoryNo] = []
          }
          // 确保工序名称唯一，避免重复
          const normalizedProcessName = processName.trim().toLowerCase()
          if (!hoursByInventoryNo[inventoryNo].some(p => p.toLowerCase() === normalizedProcessName)) {
            hoursByInventoryNo[inventoryNo].push(processName)
          }
        }
      })
      
      setWorkHoursData(hoursByInventoryNo)
      console.log('成功获取工时数据:', hoursByInventoryNo)
    } catch (error) {
      console.error('获取工时数据失败:', error)
      // 即使发生异常，也不影响页面其他功能
      setWorkHoursData({})
    }
  }, [])
  
  // 初始加载和刷新时获取工时数据
  useEffect(() => {
    fetchWorkHoursData()
  }, [fetchWorkHoursData])
  
  // 导入文件输入框ref
  const importFileInputRef = useRef<HTMLInputElement>(null)

  const materialSourceOptions = useMemo(() => {
    return materialSources.length > 0 ? materialSources.map(ms => ms.name) : ['']
  }, [materialSources])

  const materialSourceNameMap = useMemo(() => {
    return materialSources.reduce((acc, ms) => {
      acc[String(ms.id)] = ms.name
      return acc
    }, {} as Record<string, string>)
  }, [materialSources])

  const partTypeOptions = useMemo(() => {
    return partTypes.length > 0 ? partTypes.map(pt => pt.name) : ['']
  }, [partTypes])

  const materialOptions = useMemo(() => {
    const list = materials.length > 0 ? materials.map(m => m.name) : ['']
    return Array.from(new Set(list))
  }, [materials])

  const {
    generateCuttingOrders,
    generatePurchaseOrders,
    calculatePartWeight
  } = useToolingOperations()

  // 空白行数据
  const ensureBlankToolings = (list: RowItem[]) => {
    const seenIds = new Set<string>()
    const existedInv = new Set<string>()
    const base = list.filter((r) => {
      const id = String(r.id || '')
      if (seenIds.has(id)) return false
      seenIds.add(id)
      const inv = String(r.inventory_number || '').trim()
      if (!id.startsWith('blank-') && inv) existedInv.add(inv)
      return true
    })
    const arr = base.filter((r) => {
      const id = String(r.id || '')
      if (!id.startsWith('blank-')) return true
      const inv = String(r.inventory_number || '').trim()
      if (inv && existedInv.has(inv)) return false
      return true
    })
    const blanks = arr.filter(x => String(x.id || '').startsWith('blank-')).length
    for (let i = blanks; i < 2; i++) {
      arr.push({
        id: `blank-${Date.now()}-${i}`,
        inventory_number: '',
        production_unit: '',
        category: '',
        received_date: '',
        demand_date: '',
        completed_date: '',
        project_name: '',
        production_date: '',
        sets_count: 1,
        recorder: ''
      })
    }
    return arr
  }

  // 处理外部操作（保存滚动位置）
  const handleExternalAction = async (action: () => void | Promise<void>) => {
    savedScrollTopRef.current = window.scrollY || 0
    await action()
    setTimeout(() => {
      window.scrollTo(0, savedScrollTopRef.current)
    }, 100)
  }
  const runWithPreservedScroll = async (action: () => Promise<void>) => {
    await handleExternalAction(action)
  }

  // 为指定行生成盘存编号
  const generateInventoryNumberForRow = async (rowId: string) => {
    const rowData = data.find(r => r.id === rowId)
    if (!rowData) return
    
    if (!canGenerateInventoryNumber(rowData)) {
      message.warning('请确保已填写类别、接收日期和项目名称')
      return
    }
    
    const newInventoryNumber = generateInventoryNumber(rowData, data)
    if (newInventoryNumber) {
      // 更新本地数据
      setData(prev => prev.map(r => 
        r.id === rowId ? { ...r, inventory_number: newInventoryNumber } : r
      ))
      
      // 如果是已存在的记录，更新后端
      if (!rowId.startsWith('blank-')) {
        const success = await saveToolingData(rowId, { inventory_number: newInventoryNumber })
        if (success) {
          
        }
      }
    }
  }

  // 更新所有零件的盘存编号（仅保留函数结构，取消自动编号功能）
  const updateAllPartsInventoryNumbers = (toolingId: string, parentInventoryNumber: string) => {
    // 取消自动生成零件盘存编号的功能
  }

  // 保存工装数据
  const handleSave = async (id: string, key: keyof RowItem, value: string) => {
    try {
      // 重复盘存编号即时校验与提示
      if (key === 'inventory_number') {
        const newInv = String(value || '').trim().toUpperCase()
        value = newInv
        if (newInv) {
          const dup = data.find(r => !String(r.id).startsWith('blank-') && String(r.inventory_number || '').trim().toUpperCase() === newInv)
          if (dup && dup.id !== id) {
            message.error(`盘存编号“${newInv}”已存在，不能重复`)
            return
          }
        }
      }
      // 如果更新的是盘存编号，需要更新所有子零件的盘存编号
      if (key === 'inventory_number' && value && value.trim() !== '') {
        updateAllPartsInventoryNumbers(id, value.trim())
      }
      
      // 如果是空白行，需要创建新记录
      if (id.startsWith('blank-')) {
        let updatedRowData: RowItem | null = null
        
        setData(prev => {
          const currentRow = prev.find(r => r.id === id) || { 
            id, 
            inventory_number: '', 
            production_unit: '', 
            category: '', 
            project_name: '', 
            received_date: '', 
            demand_date: '', 
            completed_date: '',
            production_date: '',
            sets_count: 1,
            recorder: ''
          }
          const updatedRow = { ...currentRow, [key]: value }
          updatedRowData = updatedRow
          
          // 检查是否应该自动填入责任人
          if (!updatedRow.recorder && shouldAutoFillRecorder(updatedRow)) {
            updatedRow.recorder = user?.real_name || '系统用户'
          }
          
          return prev.map(r => r.id === id ? updatedRow : r)
        })
        
        if (!updatedRowData) return
        
        // 只要有任意内容就创建草稿记录
        const hasAnyContent = !!(
          String(updatedRowData.inventory_number || '').trim() ||
          String(updatedRowData.project_name || '').trim() ||
          String(updatedRowData.production_unit || '').trim() ||
          String(updatedRowData.category || '').trim() ||
          String(updatedRowData.received_date || '').trim() ||
          String(updatedRowData.demand_date || '').trim() ||
          String(updatedRowData.completed_date || '').trim()
        )
        if (!hasAnyContent) {
          return
        }
        
        // 构建最小化payload：仅包含已填写的字段，避免空字符串写入数据库
        const payload: any = {}
        if (updatedRowData.inventory_number && updatedRowData.inventory_number.trim() !== '') {
          payload.inventory_number = updatedRowData.inventory_number.trim()
        }
        if (updatedRowData.project_name && updatedRowData.project_name.trim() !== '') {
          payload.project_name = updatedRowData.project_name.trim()
        }
        if (updatedRowData.production_unit && updatedRowData.production_unit.trim() !== '') {
          payload.production_unit = updatedRowData.production_unit.trim()
        }
        if (updatedRowData.category && updatedRowData.category.trim() !== '') {
          payload.category = updatedRowData.category.trim()
        }
        if (updatedRowData.received_date && updatedRowData.received_date.trim() !== '') {
          payload.received_date = updatedRowData.received_date.trim()
        }
        if (updatedRowData.demand_date && updatedRowData.demand_date.trim() !== '') {
          payload.demand_date = updatedRowData.demand_date.trim()
        }
        if (updatedRowData.completed_date && updatedRowData.completed_date.trim() !== '') {
          payload.completed_date = updatedRowData.completed_date.trim()
        }
        if (updatedRowData.recorder && String(updatedRowData.recorder).trim() !== '') {
          payload.recorder = String(updatedRowData.recorder).trim()
        }
        payload.sets_count = 1
        
        const created = await createTooling(payload)
        if (created && created.success && created.data) {
          // 使用后端返回的完整数据替换本地数据，并避免与已存在记录重复
          setData(prev => {
            const existedIdx = prev.findIndex(r => r.id === created.data.id)
            let newData: RowItem[]
            if (existedIdx >= 0) {
              // 已存在该记录：更新已存在记录，删除当前空白行
              newData = prev
                .map(r => (r.id === created.data.id ? { ...r, ...created.data } : r))
                .filter(r => r.id !== id)
            } else {
              // 不存在：用创建结果替换空白行
              newData = prev.map(r => r.id === id ? { ...r, ...created.data, id: created.data.id } : r)
            }

            // 确保始终有至少2个空白行供用户连续输入
            const remainingBlanks = newData.filter(r => r.id.startsWith('blank-'))
            const targetBlankCount = 2
            for (let i = remainingBlanks.length; i < targetBlankCount; i++) {
              const nextBlankId = `blank-${Date.now()}-${i}`
              newData.push({
                id: nextBlankId,
                inventory_number: '',
                production_unit: '',
                category: '',
                received_date: '',
                demand_date: '',
                completed_date: '',
                project_name: '',
                production_date: '',
                sets_count: 1,
                recorder: ''
              })
            }

            // 最终按 id 去重，保留第一条
            const seen = new Set<string>()
            const dedup: RowItem[] = []
            for (const r of newData) {
              if (!seen.has(r.id)) { seen.add(r.id); dedup.push(r) }
            }
            return dedup
          })
          await runWithPreservedScroll(async () => {
            await fetchToolingData()
          })
        } else {
          message.error('创建工装失败：' + (created?.error || '未知错误'))
        }
      } else {
        // 更新现有记录
        let autoRecorder: string | undefined
        setData(prev => prev.map(r => {
          if (r.id === id) {
            const updatedRow = { ...r, [key]: value }
            // 检查是否应该自动填入责任人
            if (!updatedRow.recorder && shouldAutoFillRecorder(updatedRow)) {
              updatedRow.recorder = user?.real_name || '系统用户'
              autoRecorder = updatedRow.recorder
            }
            return updatedRow
          }
          return r
        }))
        
        const payload: any = { [key]: value }
        if (autoRecorder) payload.recorder = autoRecorder
        const success = await saveToolingData(id, payload)
        if (!success) {
          // 如果API调用失败，重新获取数据以回滚到服务器状态
          await runWithPreservedScroll(async () => {
            await fetchToolingData()
          })
        } else {
          // 成功后轻量重新拉取，确保派生数据一致
          await runWithPreservedScroll(async () => {
            await fetchToolingData()
          })
        }
      }
    } catch (error) {
      console.warn('保存失败:', error)
      message.error('保存失败，请重试')
      await runWithPreservedScroll(async () => {
        await fetchToolingData()
      })
    }
  }

  // 保存零件数据
  const handlePartSave = useCallback(async (toolingId: string, id: string, key: keyof PartItem, value: any) => {
    try {
      // 零件盘存编号重复即时校验
      if (key === 'part_inventory_number') {
        const newInv = String(value || '').trim().toUpperCase()
        if (newInv) {
          // 前缀必须与父表盘存编号一致
          const parent = data.find(d => d.id === toolingId)
          const parentInv = String(parent?.inventory_number || '').trim().toUpperCase()
          if (parentInv && !newInv.startsWith(parentInv)) {
            message.error(`零件盘存编号必须以父表盘存编号“${parentInv}”作为前缀`)
            return
          }
          // 本地已加载数据去重
          const localDup = Object.values(partsMap).some((list: any) =>
            (list || []).some((p: any) => String(p.part_inventory_number || '').trim().toUpperCase() === newInv && p.id !== id)
          )
          if (localDup) {
            message.error(`零件盘存编号“${newInv}”已存在，不能重复`)
            return
          }
          // 远端数据去重（快速检索）
          try {
            const resp = await fetch(`/api/tooling/parts/inventory-list?page=1&pageSize=1&search=${encodeURIComponent(newInv)}`, { cache: 'no-store' })
            const result = await resp.json().catch(() => ({ items: [] }))
            const items = Array.isArray(result?.items) ? result.items : []
            const hit = items.find((it: any) => String(it.part_inventory_number || '').trim().toUpperCase() === newInv)
            if (hit && String(hit.id) !== String(id)) {
              message.error(`零件盘存编号“${newInv}”已存在，不能重复`)
              return
            }
          } catch {}
          value = newInv
        }
      }
      let updatedPartData: PartItem | null = null
      
      setPartsMap(prev => {
        const list = prev[toolingId] || []
        let updated = list.map(r => {
          if (r.id !== id) return r
          const nextVal = key === 'part_quantity' ? (String(value).trim() === '' ? '' : Number(value)) : value
          const updatedRow = { ...r, [key]: nextVal }
          if (r.id === id) {
            updatedPartData = updatedRow
          }
          return updatedRow
        })
        
        // 如果更新的是规格、材质或料型，重新计算重量
        if (key === 'specifications' || key === 'material_id' || key === 'part_category') {
          updated = updated.map(r => {
            if (r.id === id) {
              const weight = calculatePartWeight(r.specifications, r.material_id, r.part_category, partTypes, materials)
              return { ...r, weight }
            }
            return r
          })
        }
        
        return { ...prev, [toolingId]: ensureBlankParts(toolingId, updated) }
      })
      
      // 如果有更新的零件数据，保存到后端
      if (!id.startsWith('blank-')) {
        let payload: any = {}
        if (updatedPartData) {
          payload = {
            part_inventory_number: updatedPartData.part_inventory_number,
            part_drawing_number: updatedPartData.part_drawing_number,
            part_name: updatedPartData.part_name,
            part_quantity: (updatedPartData.part_quantity === '' || updatedPartData.part_quantity === null || typeof updatedPartData.part_quantity === 'undefined')
              ? null
              : Number(updatedPartData.part_quantity),
            material_id: updatedPartData.material_id,
            material_source_id: updatedPartData.material_source_id,
            part_category: updatedPartData.part_category,
            specifications: updatedPartData.specifications,
            remarks: updatedPartData.remarks,
            weight: updatedPartData.weight
          }
        } else {
          // 最小保存载荷：保存本次变更的字段，并在需要时联动重量
          payload = { [key]: key === 'part_quantity' ? (Number(value) || null) : value }
          if (key === 'specifications' || key === 'material_id' || key === 'part_category') {
            const list = partsMap[toolingId] || []
            const current = list.find(r => r.id === id) as any
            const nextRow = { ...(current || {}), [key]: value }
            const newWeight = calculatePartWeight(nextRow.specifications, nextRow.material_id, nextRow.part_category, partTypes, materials)
            payload.weight = newWeight
          }
        }

        const success = await savePartData(id, payload)
        if (success) {
          // 成功后依赖本地乐观状态，避免立即刷新导致计算抖动
        } else {
          // 保存失败，回滚为服务端数据
          // 移除 fetchPartsData 调用，避免重复请求导致卡死
          return
        }
      }
      
      // 如果是空白行，创建新记录
      if (id.startsWith('blank-')) {
        const list = partsMap[toolingId] || []
        const existing = list.find(x => x.id === id) || { 
          id, 
          tooling_id: toolingId, 
          part_drawing_number: '', 
          part_name: '', 
          part_quantity: '', 
          material_id: '', 
          material_source_id: '', 
          part_category: '', 
          specifications: {}, 
          weight: 0, 
          remarks: '' 
        }
        const nextRow = { ...existing, [key]: value }
        const qtyHas = (() => {
          const q = nextRow.part_quantity
          if (q === null || typeof q === 'undefined') return false
          const n = Number(q)
          return !isNaN(n) && n > 0
        })()
        const hasAny = (nextRow.part_drawing_number || '').trim() !== '' || (nextRow.part_name || '').trim() !== '' || qtyHas
        if (!hasAny) return
        
        const weight = calculatePartWeight(nextRow.specifications, nextRow.material_id, nextRow.part_category, partTypes, materials)
        
        const postData: any = { 
          part_drawing_number: nextRow.part_drawing_number || '', 
          part_name: nextRow.part_name || '',
          source: '自备',
          specifications: nextRow.specifications || {},
          weight: weight,
          remarks: nextRow.remarks || '',
          part_inventory_number: nextRow.part_inventory_number || ''
        }
        
        if (nextRow.material_id && nextRow.material_id.trim() !== '') {
          postData.material_id = nextRow.material_id
        }
        if (nextRow.part_category && nextRow.part_category.trim() !== '') {
          postData.part_category = nextRow.part_category
        }
        if (nextRow.part_quantity && String(nextRow.part_quantity).trim() !== '') {
          postData.part_quantity = nextRow.part_quantity
        }
        if (nextRow.material_source_id && nextRow.material_source_id.toString().trim() !== '') {
          postData.material_source_id = nextRow.material_source_id
        }
        
        const created = await createPart(toolingId, postData)
        if (created) {
          setPartsMap(prev => {
            const l = prev[toolingId] || []
            const nl = l.map(r => r.id === id ? { 
              ...r, 
              ...created, 
              id: created.id,
              part_drawing_number: created.part_drawing_number ?? r.part_drawing_number ?? '',
              part_name: created.part_name ?? r.part_name ?? '',
              part_quantity: created.part_quantity ?? r.part_quantity ?? '',
              material_id: created.material_id ?? r.material_id ?? '',
              material_source_id: created.material_source_id ?? r.material_source_id ?? '',
              part_category: created.part_category ?? r.part_category ?? '',
              specifications: created.specifications ?? r.specifications ?? {},
              weight: created.weight ?? r.weight ?? 0,
              remarks: created.remarks ?? r.remarks ?? '',
              part_inventory_number: created.part_inventory_number ?? r.part_inventory_number ?? ''
            } : r)
            return { ...prev, [toolingId]: ensureBlankParts(toolingId, nl) }
          })
          // 移除不必要的 fetchPartsData 调用，避免重复查询导致卡死
        }
      }
    } catch (error) {
      console.error('保存零件数据错误:', error)
      message.error('保存零件数据失败')
      // 移除 fetchPartsData 调用，避免重复请求导致卡死
    }
  }, [data, partsMap, partTypes, materials, savePartData, createPart])

  const handlePartBatchSave = useCallback(async (toolingId: string, id: string, updates: Partial<PartItem>) => {
    try {
      let updatedPartData: PartItem | null = null
      
      setPartsMap(prev => {
        const list = prev[toolingId] || []
        let updated = list.map(r => {
          if (r.id !== id) return r
          const updatedRow = { ...r, ...updates }
          if (r.id === id) {
            updatedPartData = updatedRow
          }
          return updatedRow
        })
        
        // 如果更新包含规格等字段，重新计算重量（只更新当前修改的零件，避免遍历所有零件）
        if ('specifications' in updates || 'material_id' in updates || 'part_category' in updates) {
          updated = updated.map(r => {
            if (r.id === id) {
              const weight = calculatePartWeight(r.specifications, r.material_id, r.part_category, partTypes, materials)
              return { ...r, weight }
            }
            return r
          })
        }
        
        return { ...prev, [toolingId]: ensureBlankParts(toolingId, updated) }
      })
      
      if (!id.startsWith('blank-') && updatedPartData) {
        // 构建完整 payload 以确保数据完整性
        const payload = {
            part_inventory_number: updatedPartData.part_inventory_number,
            part_drawing_number: updatedPartData.part_drawing_number,
            part_name: updatedPartData.part_name,
            part_quantity: (updatedPartData.part_quantity === '' || updatedPartData.part_quantity === null || typeof updatedPartData.part_quantity === 'undefined')
              ? null
              : Number(updatedPartData.part_quantity),
            material_id: updatedPartData.material_id,
            material_source_id: updatedPartData.material_source_id,
            part_category: updatedPartData.part_category,
            specifications: updatedPartData.specifications,
            remarks: updatedPartData.remarks,
            weight: updatedPartData.weight
        }
        
        const success = await savePartData(id, payload)
        if (!success) {
          // 移除 fetchPartsData 调用，避免重复请求导致卡死
        }
      }
    } catch (error) {
      console.error('批量保存失败:', error)
      message.error('保存失败')
      // 移除 fetchPartsData 调用，避免重复请求导致卡死
    }
  }, [partsMap, partTypes, materials, savePartData])

  // 保存标准件数据
  const handleChildItemSave = useCallback(async (toolingId: string, id: string, key: keyof ChildItem, value: any) => {
    try {
      let nextItem: ChildItem | null = null
      setChildItemsMap(prev => {
        const list = prev[toolingId] || []
        let updated = list.map(item => {
          if (item.id !== id) return item
          const v = key === 'quantity' ? (String(value).trim() === '' ? null : Number(value)) : value
          const row = { ...item, [key]: v }
          nextItem = row
          return row
        })
        // 空白行在输入后补充新的空白行
        if (id.startsWith('blank-')) {
          updated = ensureBlankChildItems(updated, toolingId)
        }
        return { ...prev, [toolingId]: updated }
      })

      if (!nextItem) return
      const qtyHas = (() => {
        const q = nextItem!.quantity
        if (q === null || typeof q === 'undefined') return false
        const n = Number(q)
        return !isNaN(n) && n > 0
      })()
      const hasAny = !!(String(nextItem.name || '').trim() || String(nextItem.model || '').trim() || qtyHas || String(nextItem.unit || '').trim() || String(nextItem.required_date || '').trim())
      if (!hasAny) return

      if (id.startsWith('blank-')) {
        const postData: any = { tooling_id: toolingId }
        if (nextItem.name && String(nextItem.name).trim() !== '') postData.name = String(nextItem.name).trim()
        if (nextItem.model && String(nextItem.model).trim() !== '') postData.model = String(nextItem.model).trim()
        if (typeof nextItem.quantity === 'number' && nextItem.quantity > 0) postData.quantity = nextItem.quantity
        if (nextItem.unit && String(nextItem.unit).trim() !== '') postData.unit = String(nextItem.unit).trim()
        if (nextItem.required_date && String(nextItem.required_date).trim() !== '') postData.required_date = String(nextItem.required_date).trim()

        const created = await createChildItem(toolingId, postData)
        if (created) {
          setChildItemsMap(prev => {
            const list = prev[toolingId] || []
            const updated = list.map(item => item.id === id ? { ...item, ...created, id: created.id } : item)
            return { ...prev, [toolingId]: ensureBlankChildItems(updated, toolingId) }
          })
        } else {
          message.error('创建标准件失败')
        }
      } else {
        const updateData: any = {}
        const v = key === 'quantity' ? (typeof value === 'number' ? value : Number(value)) : value
        if (key === 'quantity') {
          if (v && Number(v) > 0) updateData.quantity = Number(v)
        } else if (key === 'name' || key === 'model' || key === 'unit' || key === 'required_date') {
          if (String(v || '').trim() !== '') updateData[key] = String(v).trim()
          else updateData[key] = ''
        }

        const response = await fetch(`/api/tooling/child-items/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateData)
        })
        if (!response.ok) {
          message.error('保存标准件数据失败')
        }
      }
    } catch (error) {
      console.error('处理标准件数据错误:', error)
      message.error('处理标准件数据失败')
    }
  }, [createChildItem])

  // 初始化数据
  useEffect(() => {
    fetchAllMeta()
    fetchToolingData()
    const handler = () => setStatusTick(v => v + 1)
    window.addEventListener('temporary_plans_updated', handler)
    window.addEventListener('status_updated', handler)
    return () => {
      window.removeEventListener('temporary_plans_updated', handler)
      window.removeEventListener('status_updated', handler)
    }
  }, [])

  const importProcessRoutes = async (file: File) => {
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    const sheetName = wb.SheetNames[0]
    const ws = wb.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][]
    if (!rows || rows.length === 0) return
    const cellStr = (v: any) => String(v ?? '').trim()
    const findCell = (cands: string[]) => {
      for (let ri = 0; ri < rows.length; ri++) {
        const row = rows[ri] || []
        for (let ci = 0; ci < row.length; ci++) {
          const s = cellStr(row[ci])
          if (s && cands.some(c => s.includes(c))) return { ri, ci, s }
        }
      }
      return null
    }
    const invCell = findCell(['盘存编号', '库存编号', 'inventory', '盘存'])
    const opCell = findCell(['工序', '工步', '工艺', '流程', '路线', '工艺路线', '工艺卡片'])
    if (!invCell || !opCell) {
      message.error('Excel中未找到“盘存编号”和“工序”列')
      return
    }
    // 提取盘存编号值：在标签所在行下方或右侧相邻单元格中寻找
    const isLabelText = (s: string) => ['盘存编号','库存编号','inventory','盘存','编号'].some(c => s.includes(c))
    const isInvPattern = (s: string) => /^[A-Za-z]{1,}[A-Za-z0-9-]{3,}$/.test(s)
    let invValue = ''
    for (let dr = 1; dr <= 6 && !invValue; dr++) {
      const s = cellStr(rows[invCell.ri + dr]?.[invCell.ci])
      if (s && !isLabelText(s) && (isInvPattern(s) || s)) invValue = s
    }
    if (!invValue) {
      for (let dc = 1; dc <= 6 && !invValue; dc++) {
        const s = cellStr(rows[invCell.ri]?.[invCell.ci + dc])
        if (s && !isLabelText(s) && (isInvPattern(s) || s)) invValue = s
      }
    }
    if (!invValue) {
      for (let dr = 1; dr <= 6 && !invValue; dr++) {
        for (let dc = 1; dc <= 6 && !invValue; dc++) {
          const s = cellStr(rows[invCell.ri + dr]?.[invCell.ci + dc])
          if (s && !isLabelText(s) && (isInvPattern(s) || s)) invValue = s
        }
      }
    }
    if (!invValue) {
      message.error('未能读取到盘存编号的值')
      return
    }
    invValue = invValue.trim().toUpperCase()
    // 提取工序步骤：基于“序号/工序”列配对，优先读取工序列（不拼接工序内容）
    // 更稳健：在同一行同时存在“序号”和“工序”作为工艺表头，之后的行读取该两列
    const noiseHeaders = ['项目名称','盘存编号','图号','零件名称','数量','材质','规格','总重量','批次号','外购','工序内容','要求尺寸','自检','操作者','检验员','辅助工时','编程工时','编程']
    const findProcessHeaders = (): Array<{ headerRow: number; seqIdx: number; opIdx: number }> => {
      const headers: Array<{ headerRow: number; seqIdx: number; opIdx: number }> = []
      for (let r = 0; r < rows.length; r++) {
        const row = rows[r] || []
        let seqIdx = -1
        let opIdx = -1
        for (let c = 0; c < row.length; c++) {
          const s = cellStr(row[c])
          if (s.includes('序号')) seqIdx = c
          if (s.includes('工序')) opIdx = c
        }
        if (seqIdx >= 0 && opIdx >= 0) headers.push({ headerRow: r, seqIdx, opIdx })
      }
      return headers
    }

    // 基于标题分段：每个“零件加工工艺卡片”为一个独立卡片段
    const findCardSegments = (): Array<{ startRow: number; endRow: number }> => {
      const starts: number[] = []
      for (let r = 0; r < rows.length; r++) {
        const row = rows[r] || []
        if (row.some(cell => cellStr(cell).includes('零件加工工艺卡片'))) starts.push(r)
      }
      if (starts.length === 0) return []
      const segs: Array<{ startRow: number; endRow: number }> = []
      for (let i = 0; i < starts.length; i++) {
        const start = starts[i]
        const end = (i + 1 < starts.length) ? (starts[i + 1] - 1) : (rows.length - 1)
        segs.push({ startRow: start, endRow: end })
      }
      return segs
    }

    const getInvBetween = (startRow: number, endRow: number): string => {
      const isLabelText = (s: string) => ['盘存编号','盒存编号','盒仔编号','库存编号','inventory','盘存','指定模具'].some(c => s.includes(c))
      const isInvPattern = (s: string) => /^(JY|jy)[0-9]{4,}$/.test(s)
      for (let r = startRow; r <= Math.min(rows.length - 1, startRow + 12) && r <= endRow; r++) {
        const row = rows[r] || []
        for (let c = 0; c < row.length; c++) {
          const s = cellStr(row[c])
          if (isLabelText(s)) {
            const right = cellStr(rows[r]?.[c + 1])
            if (right && isInvPattern(right)) return right
            const downRight = cellStr(rows[r + 1]?.[c + 1])
            if (downRight && isInvPattern(downRight)) return downRight
            for (let dr = 0; dr <= 4; dr++) {
              for (let dc = 1; dc <= 8; dc++) {
                const v = cellStr(rows[r + dr]?.[c + dc])
                if (v && !isLabelText(v) && isInvPattern(v)) return v
              }
            }
          }
        }
      }
      return ''
    }

    const headers = findProcessHeaders()
    const segments = findCardSegments()
    const cardRoutes: Record<string, string> = {}
    const cardRoutesByDrawing: Record<string, string> = {}

    const buildRouteForRange = (rangeStart: number, rangeEnd: number) => {
      // 1) 简单规则：找到“盘存编号”标签所在单元格，编号取其正下方；“工序”同理，取表头行下一行开始的本列内容
      const labelIncludes = (s: string, labels: string[]) => labels.some(l => (s || '').includes(l))
      const findLabelPos = (labels: string[]): { row: number; col: number } | null => {
        for (let r = rangeStart; r <= rangeEnd; r++) {
          const row = rows[r] || []
          for (let c = 0; c < row.length; c++) {
            if (labelIncludes(cellStr(row[c]), labels)) return { row: r, col: c }
          }
        }
        return null
      }

      const invLabel = findLabelPos(['盘存编号','盒存编号','盒仔编号','指定模具'])
      const drawingLabel = findLabelPos(['图号','图纸编号','Drawing'])
      const processLabel = findLabelPos(['工序'])
      const seqLabel = findLabelPos(['序号'])

      const inv = invLabel ? cellStr(rows[invLabel.row + 1]?.[invLabel.col]).trim().toUpperCase() : ''
      const drawing = drawingLabel ? cellStr(rows[drawingLabel.row + 1]?.[drawingLabel.col]).trim() : ''

      const steps: string[] = []
      if (processLabel) {
        const startRow = processLabel.row + 1
        for (let ri = startRow; ri <= rangeEnd; ri++) {
          const opName = cellStr(rows[ri]?.[processLabel.col])
          if (!opName) continue
          if (noiseHeaders.some(ht => (opName || '').includes(ht))) continue
          if (/^(编制|审核|日期|数模编号|线切编号)/.test(opName || '')) break
          const seqVal = seqLabel ? cellStr(rows[ri]?.[seqLabel.col]) : ''
          const item = (/^\d+$/.test(seqVal || '')) ? `${seqVal} ${opName}` : opName
          steps.push(item.trim())
        }
      }
      const normalized = steps.map(s => s.replace(/\s+/g, ' ').trim()).filter(s => s.length > 0 && !/^\d+$/.test(s))
      for (let i = normalized.length - 1; i > 0; i--) {
        if (normalized[i] === normalized[i - 1]) normalized.splice(i, 1)
      }
      const routeJoined = normalized.join(' → ')
      if (routeJoined.length > 0) {
        if (inv) cardRoutes[inv] = routeJoined
        if (!inv && drawing) cardRoutesByDrawing[drawing] = routeJoined
      }
    }

    if (segments.length > 0) {
      segments.forEach(seg => buildRouteForRange(seg.startRow, seg.endRow))
    } else if (headers.length > 0) {
      headers.forEach((h, idx) => {
        const nextHeaderRow = headers[idx + 1]?.headerRow ?? rows.length
        buildRouteForRange(h.headerRow, nextHeaderRow)
      })
    }
    console.log('[ProcessImport] segments:', segments.length, 'routes(inv):', Object.keys(cardRoutes), 'routes(drawing):', Object.keys(cardRoutesByDrawing))

    // 为每个卡片的 inv 生成映射与匹配
    const allChildKeysOnPage: string[] = []
    Object.values(partsMap).forEach(list => (list || []).forEach((p: any) => {
      const k = String(p.part_inventory_number || '').trim().toUpperCase()
      if (k) allChildKeysOnPage.push(k)
    }))

    const mapUpdates: Record<string, string> = {}
    for (const [invK, routeText] of Object.entries(cardRoutes)) {
      let matchedKeys = allChildKeysOnPage.filter(k => k === invK || k.startsWith(invK))
      if (matchedKeys.length === 0) {
        const candidates = (data || []).filter(d => String(d.inventory_number || '').trim().toUpperCase() && invK.startsWith(String(d.inventory_number || '').trim().toUpperCase())).map(d => d.id)
        for (const tid of candidates) {
          if (!partsMap[tid] || partsMap[tid].length === 0) await fetchPartsData(tid)
        }
        const reScan: string[] = []
        Object.values(partsMap).forEach(list => (list || []).forEach((p: any) => {
          const k = String(p.part_inventory_number || '').trim().toUpperCase()
          if (k && (k === invK || k.startsWith(invK))) reScan.push(k)
        }))
        matchedKeys = [...new Set(reScan)]
      }
      if (matchedKeys.length === 0) {
        mapUpdates[invK] = routeText
      } else {
        matchedKeys.forEach(k => { mapUpdates[k] = routeText })
      }
    }
    // 按图号匹配（当盘存编号缺失时）
    for (const [drawingK, routeText] of Object.entries(cardRoutesByDrawing)) {
      // 直接映射到后端：通过图号更新
      mapUpdates[`DRAWING:${drawingK}`] = routeText
    }
    // 后端持久化
    const mappings = Object.entries(mapUpdates).map(([k,v]) => (
      k.startsWith('DRAWING:')
        ? { part_drawing_number: k.slice(8), process_route: v }
        : { part_inventory_number: k, process_route: v }
    ))
    try {
      const resp = await fetchWithFallback('/api/tooling/parts/process-routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings })
      })
      if (!resp.ok) {
        throw new Error(`API请求失败: ${resp.status} ${resp.statusText}`)
      }
      const result = await resp.json()
      if (result?.success) {
        // 关键修复：创建安全的合并对象，确保没有循环引用
        // 1. 确保mapUpdates只包含字符串值
        const safeMapUpdates = Object.fromEntries(
          Object.entries(mapUpdates)
            .filter(([_, value]) => typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
            .map(([key, value]) => [key, String(value)])
        )
        // 2. 合并并创建最终安全对象
        const merged = { ...processRoutes, ...safeMapUpdates }
        // 3. 再次确保合并后的对象只包含安全值
        const finalSafe = Object.fromEntries(
          Object.entries(merged)
            .filter(([_, value]) => typeof value === 'string')
        )

        const MAX_CACHE_CHARS = 900_000
        let persistValue = finalSafe
        let persistJson = ''
        try {
          persistJson = JSON.stringify(finalSafe)
          if (persistJson.length > MAX_CACHE_CHARS) {
            persistValue = safeMapUpdates
            persistJson = JSON.stringify(safeMapUpdates)
            message.warning('工艺路线缓存过大，已只缓存本次导入映射（避免浏览器卡死）')
          }
        } catch {
          persistValue = safeMapUpdates
          try { persistJson = JSON.stringify(safeMapUpdates) } catch { persistJson = '{}' }
        }

        try {
          safeLocalStorage.setItem('process_routes_map', persistJson)
        } catch {
          message.warning('本地缓存写入失败，已跳过（可能空间不足/浏览器禁用存储）')
        }

        setProcessRoutes(persistValue)
        // 本地更新已加载的零件数据，立即显示路线
        const mapKeys = Object.keys(safeMapUpdates)
        setPartsMap(prev => {
          const next: Record<string, any[]> = {}
          Object.entries(prev).forEach(([tid, list]) => {
            next[tid] = (list || []).map(p => {
              const k = String(p.part_inventory_number || '').trim().toUpperCase()
              if (k && mapKeys.includes(k)) {
                return { ...p, process_route: mapUpdates[k] }
              }
              return p
            })
          })
          return next
        })
        const msg = `生成并保存工艺路线：共${Object.keys(mapUpdates).length}条映射`
        console.table({ 映射条数: Object.keys(mapUpdates).length, 页面子编号数: allChildKeysOnPage.length })
        message.success(msg)
        // 刷新当前工装零件信息以展示后端值
        fetchToolingData()
      } else {
        message.error('保存工艺路线失败：' + (result?.error || '未知错误'))
      }
    } catch (e: any) {
      message.error('保存工艺路线失败：' + (e?.message || '网络错误'))
    }
  }

  const triggerImport = () => {
    fileInputRef.current?.click()
  }
  const handleImportChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) await importProcessRoutes(f)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // 确保数据加载后添加空白行（即使当前没有任何记录也添加）
  

  const HeaderCell = ({ children, ...rest }: any) => (
    <th {...rest} style={{ ...rest.style, padding: '8px', fontWeight: 500 }}>
      {children}
    </th>
  )

  const columns = [
    {
      title: '序号',
      dataIndex: '__seq',
      width: 80,
      render: (_text: any, record: RowItem, index: number) => {
        const isBlank = String(record.id).startsWith('blank-')
        if (isBlank) {
          return (
            <span style={{ display: 'inline-block', width: '100%', textAlign: 'center', color: '#888' }}>{index + 1}</span>
          )
        }
        return (
          <span style={{ display: 'inline-flex', width: '100%', alignItems: 'center', justifyContent: 'center', gap: 4, color: '#888' }}>
            <span
              onClick={(e) => {
                e.stopPropagation()
                const id = record.id
                
                // 控制零件信息展开
                const isExpanded = expandedRowKeys.includes(id)
                const partsNext = isExpanded ? expandedRowKeys.filter(k => k !== id) : [...expandedRowKeys, id]
                setExpandedRowKeys(partsNext)
                if (!isExpanded && !partsMap[id]) fetchPartsData(id)
                
                // 同时控制标准件信息展开
                const isChildExpanded = expandedChildKeys.includes(id)
                const childNext = isChildExpanded ? expandedChildKeys.filter(k => k !== id) : [...expandedChildKeys, id]
                setExpandedChildKeys(childNext)
                if (!isChildExpanded && !childItemsMap[id]) {
                  fetchChildItemsData(id)
                }
              }}
              style={{ cursor: 'pointer', color: '#1890ff', fontWeight: 600, fontSize: '14px' }}
              aria-label={expandedRowKeys.includes(record.id) || expandedChildKeys.includes(record.id) ? 'collapse' : 'expand'}
            >
              {(expandedRowKeys.includes(record.id) || expandedChildKeys.includes(record.id)) ? '▾' : '▸'}
            </span>
            <span>{index + 1}</span>
          </span>
        )
      }
    },
    {
      title: '盘存编号',
      dataIndex: 'inventory_number',
      width: 160,
      onCell: () => ({ onMouseDown: (e: any) => e.stopPropagation(), onClick: (e: any) => e.stopPropagation() }),
      render: (text: string, record: RowItem) => (
        <EditableCell
          value={text}
          record={record}
          dataIndex="inventory_number"
          onSave={handleSave}
        />
      )
    },
    {
      title: '项目名称',
      dataIndex: 'project_name',
      width: 220,
      onCell: () => ({ onMouseDown: (e: any) => e.stopPropagation(), onClick: (e: any) => e.stopPropagation() }),
      render: (text: string, record: RowItem) => (
        <EditableCell
          value={text}
          record={record}
          dataIndex="project_name"
          onSave={handleSave}
        />
      )
    },
    {
      title: '投产单位',
      dataIndex: 'production_unit',
      width: 160,
      onCell: () => ({ onMouseDown: (e: any) => e.stopPropagation(), onClick: (e: any) => e.stopPropagation() }),
      render: (text: string, record: RowItem) => (
        <EditableCell
          value={text}
          record={record}
          dataIndex="production_unit"
          options={productionUnits}
          onSave={handleSave}
        />
      )
    },
    {
      title: '工装类别',
      dataIndex: 'category',
      width: 160,
      onCell: () => ({ onMouseDown: (e: any) => e.stopPropagation(), onClick: (e: any) => e.stopPropagation() }),
      render: (text: string, record: RowItem) => (
        <EditableCell
          value={text}
          record={record}
          dataIndex="category"
          options={toolingCategories}
          onSave={handleSave}
        />
      )
    },
    {
      title: '接收日期',
      dataIndex: 'received_date',
      width: 140,
      onCell: () => ({ onMouseDown: (e: any) => e.stopPropagation(), onClick: (e: any) => e.stopPropagation() }),
      render: (text: string, record: RowItem) => (
        <EditableCell
          value={text}
          record={record}
          dataIndex="received_date"
          onSave={handleSave}
        />
      )
    },
    {
      title: '需求日期',
      dataIndex: 'demand_date',
      width: 140,
      onCell: () => ({ onMouseDown: (e: any) => e.stopPropagation(), onClick: (e: any) => e.stopPropagation() }),
      render: (text: string, record: RowItem) => (
        <EditableCell
          value={text}
          record={record}
          dataIndex="demand_date"
          onSave={handleSave}
        />
      )
    },
    {
      title: '完成日期',
      dataIndex: 'completed_date',
      width: 140,
      onCell: () => ({ onMouseDown: (e: any) => e.stopPropagation(), onClick: (e: any) => e.stopPropagation() }),
      render: (text: string, record: RowItem) => (
        <EditableCell
          value={text}
          record={record}
          dataIndex="completed_date"
          onSave={handleSave}
        />
      )
    },
    {
      title: '责任人',
      dataIndex: 'recorder',
      width: 120,
      render: (text: string, record: RowItem) => (
        <span className="text-gray-600">{text || '-'}</span>
      )
    }
  ]

  // 导出工装信息为Excel
  const handleExport = async () => {
    try {
      // 确保元数据与子表均已加载
      if (materialSources.length === 0 || materials.length === 0 || partTypes.length === 0) {
        await fetchAllMeta()
      }
      const parentIds = data.filter(item => !String(item.id || '').startsWith('blank-')).map(i => String(i.id))
      const needPartsFetch = parentIds.filter(id => !partsMap[id] || partsMap[id].length === 0)
      const needChildFetch = parentIds.filter(id => !childItemsMap[id] || childItemsMap[id].length === 0)
      await Promise.all([
        ...needPartsFetch.map(id => fetchPartsData(id)),
        ...needChildFetch.map(id => fetchChildItemsData(id))
      ])

      // 创建工作簿
      const wb = XLSX.utils.book_new()
      
      // 1. 导出工装信息（父表）
      const toolingExportData = data.filter(item => !String(item.id || '').startsWith('blank-')).map(item => ({
        '盘存编号': item.inventory_number || '',
        '项目名称': item.project_name || '',
        '投产单位': item.production_unit || '',
        '工装类别': item.category || '',
        '接收日期': item.received_date || '',
        '需求日期': item.demand_date || '',
        '完成日期': item.completed_date || '',
        '责任人': item.recorder || ''
      }))
      const toolingWs = XLSX.utils.json_to_sheet(toolingExportData)
      XLSX.utils.book_append_sheet(wb, toolingWs, '工装信息')
      
      // 2. 导出零件信息（子表）
      const partsExportData: any[] = []
      data.filter(item => !String(item.id || '').startsWith('blank-')).forEach(item => {
        const parts = partsMap[item.id] || []
        parts.filter(part => !String(part.id || '').startsWith('blank-')).forEach((part: any) => {
          // 查找材质名称
          const material = materials.find(m => String(m.id) === String(part.material_id))?.name || ''
          // 查找材料来源名称
          const materialSource = materialSources.find(ms => String(ms.id) === String(part.material_source_id))?.name || ''
          
          partsExportData.push({
            '父表盘存编号': item.inventory_number || '',
            '盘存编号': part.part_inventory_number || '',
            '图号': part.part_drawing_number || '',
            '零件名称': part.part_name || '',
            '数量': part.part_quantity || '',
            '材质': material,
            '材料来源': materialSource,
            '料型': part.part_category || '',
            '规格': formatSpecificationsForProduction(part.specifications, part.part_category),
            '备注': part.remarks || ''
          })
        })
      })
      const partsWs = XLSX.utils.json_to_sheet(partsExportData)
      XLSX.utils.book_append_sheet(wb, partsWs, '零件信息')
      
      // 3. 导出标准件信息（子表）
      const childItemsExportData: any[] = []
      data.filter(item => !String(item.id || '').startsWith('blank-')).forEach(item => {
        const childItems = childItemsMap[item.id] || []
        childItems.filter(childItem => !String(childItem.id || '').startsWith('blank-')).forEach((childItem: any) => {
          childItemsExportData.push({
            '父表盘存编号': item.inventory_number || '',
            '名称': childItem.name || '',
            '型号': childItem.model || '',
            '数量': childItem.quantity || '',
            '单位': childItem.unit || '',
            '需求日期': childItem.required_date || ''
          })
        })
      })
      const childItemsWs = XLSX.utils.json_to_sheet(childItemsExportData)
      XLSX.utils.book_append_sheet(wb, childItemsWs, '标准件信息')
      const findHeaderCol = (ws: any, headerName: string) => {
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
        for (let c = range.s.c; c <= range.e.c; c++) {
          const addr = XLSX.utils.encode_cell({ c, r: range.s.r })
          const cell = ws[addr]
          if (cell && String(cell.v) === headerName) return c
        }
        return 0
      }
      const toolingColInv = findHeaderCol(toolingWs as any, '盘存编号')
      const partsColParentInv = findHeaderCol(partsWs as any, '父表盘存编号')
      const childColParentInv = findHeaderCol(childItemsWs as any, '父表盘存编号')
      const parentRowIndexMap: Record<string, number> = {}
      toolingExportData.forEach((it, idx) => { parentRowIndexMap[String((it as any)['盘存编号'] || '')] = idx + 2 })
      const partsFirstIndexMap: Record<string, number> = {}
      partsExportData.forEach((it, idx) => {
        const k = String((it as any)['父表盘存编号'] || '')
        if (!partsFirstIndexMap[k]) partsFirstIndexMap[k] = idx + 2
      })
      const childFirstIndexMap: Record<string, number> = {}
      childItemsExportData.forEach((it, idx) => {
        const k = String((it as any)['父表盘存编号'] || '')
        if (!childFirstIndexMap[k]) childFirstIndexMap[k] = idx + 2
      })
      toolingExportData.forEach((it: any, idx) => {
        const inv = String(it['盘存编号'] || '')
        const targetRow = partsFirstIndexMap[inv] || childFirstIndexMap[inv]
        if (targetRow) {
          const srcAddr = XLSX.utils.encode_cell({ c: toolingColInv, r: idx + 1 })
          const targetAddr = XLSX.utils.encode_cell({ c: partsColParentInv, r: targetRow - 1 })
          const cell = (toolingWs as any)[srcAddr] || { t: 's', v: inv }
          ;(cell as any).l = { Target: "#'零件信息'!" + targetAddr }
          ;(toolingWs as any)[srcAddr] = cell
        }
      })
      partsExportData.forEach((it: any, idx) => {
        const inv = String(it['父表盘存编号'] || '')
        const parentRow = parentRowIndexMap[inv]
        if (parentRow) {
          const srcAddr = XLSX.utils.encode_cell({ c: partsColParentInv, r: idx + 1 })
          const targetAddr = XLSX.utils.encode_cell({ c: toolingColInv, r: parentRow - 1 })
          const cell = (partsWs as any)[srcAddr] || { t: 's', v: inv }
          ;(cell as any).l = { Target: "#'工装信息'!" + targetAddr }
          ;(partsWs as any)[srcAddr] = cell
        }
      })
      childItemsExportData.forEach((it: any, idx) => {
        const inv = String(it['父表盘存编号'] || '')
        const parentRow = parentRowIndexMap[inv]
        if (parentRow) {
          const srcAddr = XLSX.utils.encode_cell({ c: childColParentInv, r: idx + 1 })
          const targetAddr = XLSX.utils.encode_cell({ c: toolingColInv, r: parentRow - 1 })
          const cell = (childItemsWs as any)[srcAddr] || { t: 's', v: inv }
          ;(cell as any).l = { Target: "#'工装信息'!" + targetAddr }
          ;(childItemsWs as any)[srcAddr] = cell
        }
      })
      
      // 导出文件
      XLSX.writeFile(wb, `工装信息_${new Date().toISOString().slice(0, 10)}.xlsx`)
      message.success('导出成功')
    } catch (error) {
      console.error('导出失败:', error)
      message.error('导出失败，请重试')
    }
  }

  // 下载导入模板
  const downloadImportTemplate = () => {
    try {
      // 创建工作簿
      const wb = XLSX.utils.book_new()
      
      // 1. 父表：工装信息模板
      const toolingTemplateData = [
        {
          '盘存编号': 'LD260101',
          '项目名称': '示例项目',
          '投产单位': '生产一部',
          '工装类别': '夹具',
          '接收日期': '2024-01-01',
          '需求日期': '2024-02-01',
          '完成日期': '2024-01-15',
          '责任人': '张三'
        },
        {
          '盘存编号': 'LD260102',
          '项目名称': '示例项目2',
          '投产单位': '生产二部',
          '工装类别': '模具',
          '接收日期': '2024-01-02',
          '需求日期': '',
          '完成日期': '',
          '责任人': '李四'
        }
      ]
      
      const toolingWs = XLSX.utils.json_to_sheet(toolingTemplateData)
      XLSX.utils.book_append_sheet(wb, toolingWs, '工装信息')
      
      // 2. 子表1：零件信息模板
      const partsTemplateData = [
        {
          '父表盘存编号': 'LD260101',
          '盘存编号': 'LD26010101',
          '图号': 'DWG-001',
          '零件名称': '示例零件1',
          '数量': 2,
          '材质': '45#钢',
          '材料来源': '自备',
          '料型': '圆钢',
          '规格': 'Φ50×200',
          '备注': '需调质'
        },
        {
          '父表盘存编号': 'LD260101',
          '盘存编号': 'LD26010102',
          '图号': 'DWG-002',
          '零件名称': '示例零件2',
          '数量': 1,
          '材质': '铝合金',
          '材料来源': '外购',
          '料型': '板材',
          '规格': '100×100×10',
          '备注': '2024-01-10'
        }
      ]
      
      const partsWs = XLSX.utils.json_to_sheet(partsTemplateData)
      XLSX.utils.book_append_sheet(wb, partsWs, '零件信息')
      
      // 3. 子表2：标准件信息模板
      const childItemsTemplateData = [
        {
          '父表盘存编号': 'LD260101',
          '名称': '螺栓',
          '型号': 'M12×50',
          '数量': 4,
          '单位': '个',
          '需求日期': '2024-01-05'
        },
        {
          '父表盘存编号': 'LD260101',
          '名称': '螺母',
          '型号': 'M12',
          '数量': 4,
          '单位': '个',
          '需求日期': '2024-01-05'
        }
      ]
      
      const childItemsWs = XLSX.utils.json_to_sheet(childItemsTemplateData)
      XLSX.utils.book_append_sheet(wb, childItemsWs, '标准件信息')
      
      // 4. 添加说明工作表
      const instructionsData = [
        ['工装信息导入模板说明'],
        [''],
        ['1. 模板包含三个工作表：'],
        ['   - 工装信息：填写工装的基本信息'],
        ['   - 零件信息：填写工装的零件信息，通过"父表盘存编号"关联到工装'],
        ['   - 标准件信息：填写工装的标准件信息，通过"父表盘存编号"关联到工装'],
        [''],
        ['2. 填写规则：'],
        ['   - 所有必填字段不可为空，请参考模板中的示例数据'],
        ['   - 日期格式为YYYY-MM-DD'],
        ['   - 零件盘存编号格式：父表盘存编号+两位序号（如：LD26010101）'],
        ['   - "父表盘存编号"必须与工装信息表中的"盘存编号"完全一致'],
        ['   - 请严格按照模板格式填写数据，不要修改列名'],
        [''],
        ['3. 导入步骤：'],
        ['   - 下载模板并按照要求填写数据'],
        ['   - 保存填写好的Excel文件'],
        ['   - 进入系统，点击"导入工装信息"按钮'],
        ['   - 在导入弹窗中点击"选择文件"按钮上传文件'],
        ['   - 在预览页面检查数据，确认无误后点击"确认导入"'],
        [''],
        ['4. 注意事项：'],
        ['   - 批量导入前请先备份现有数据'],
        ['   - 零件信息和标准件信息可以为空，不影响工装信息的导入'],
        ['   - 导入时会自动创建关联关系'],
        ['   - 无效记录（如缺少必填字段）会被跳过，不会影响其他记录的导入']
      ]
      
      const instructionsWs = XLSX.utils.aoa_to_sheet(instructionsData)
      XLSX.utils.book_append_sheet(wb, instructionsWs, '导入说明')
      
      // 导出模板文件
      XLSX.writeFile(wb, '工装信息导入模板.xlsx')
      message.success('模板下载成功')
    } catch (error) {
      console.error('模板下载失败:', error)
      message.error('模板下载失败，请重试')
    }
  }

  // 解析导入文件，显示预览
  const parseImportFile = async (file: File) => {
    try {
      // 检查文件大小，避免空文件
      if (file.size === 0) {
        message.error('文件为空，请选择有效文件')
        return
      }
      
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      
      // 按工作表类型分离数据
      const toolingData: any[] = []
      const partsData: any[] = []
      const childItemsData: any[] = []
      
      // 遍历所有工作表
      for (const sheetName of wb.SheetNames) {
        const ws = wb.Sheets[sheetName]
        if (!ws) continue // 跳过无效工作表
        
        const rows = XLSX.utils.sheet_to_json(ws)
        if (!Array.isArray(rows)) continue // 确保rows是数组
        
        // 根据工作表类型分类数据
        if (sheetName === '工装信息') {
          toolingData.push(...rows)
        } else if (sheetName === '零件信息') {
          partsData.push(...rows)
        } else if (sheetName === '标准件信息') {
          childItemsData.push(...rows)
        }
      }
      
      // 日期格式化函数：将Excel日期数字转换为YYYY-MM-DD格式
      const formatExcelDate = (dateValue: any): string => {
        if (!dateValue) return ''
        if (typeof dateValue === 'string') {
          // 如果已经是字符串，尝试转换为YYYY-MM-DD格式
          const date = new Date(dateValue)
          if (!isNaN(date.getTime())) {
            return date.toISOString().split('T')[0]
          }
          return dateValue
        }
        if (typeof dateValue === 'number') {
          // Excel日期数字转换为JS日期
          const date = new Date((dateValue - 25569) * 86400 * 1000)
          if (!isNaN(date.getTime())) {
            return date.toISOString().split('T')[0]
          }
        }
        return String(dateValue || '')
      }
      
      // 预先获取系统中已存在的盘存编号，用于重复校验
      let existingInvSet = new Set<string>()
      try {
        const resp = await fetch('/api/tooling?page=1&pageSize=1000&sortField=created_at&sortOrder=asc', { cache: 'no-store' })
        const result = await resp.json().catch(() => ({ items: [] }))
        const items = Array.isArray(result?.items) ? result.items : (Array.isArray(result?.data) ? result.data : [])
        items.forEach((it: any) => { const inv = String(it.inventory_number || '').trim(); if (inv) existingInvSet.add(inv) })
      } catch {}

      // 文件内重复盘存编号统计
      const fileInvCounts: Record<string, number> = {}
      toolingData.forEach((t: any) => { const inv = String(t['盘存编号'] || '').trim(); if (inv) fileInvCounts[inv] = (fileInvCounts[inv] || 0) + 1 })

      // 预先获取系统中已存在的子表盘存编号（零件盘存编号）
      let existingPartInvSet = new Set<string>()
      try {
        const resp = await fetch('/api/tooling/parts/inventory-list?page=1&pageSize=5000', { cache: 'no-store' })
        const result = await resp.json().catch(() => ({ items: [] }))
        const items = Array.isArray(result?.items) ? result.items : (Array.isArray(result?.data) ? result.data : [])
        items.forEach((it: any) => { const pinv = String(it.part_inventory_number || '').trim(); if (pinv) existingPartInvSet.add(pinv) })
      } catch {}

      // 文件内重复子表盘存编号统计
      const filePartInvCounts: Record<string, number> = {}
      partsData.forEach((p: any) => { const pinv = String(p['盘存编号'] || '').trim(); if (pinv) filePartInvCounts[pinv] = (filePartInvCounts[pinv] || 0) + 1 })

      // 验证并组织预览数据，按照父表子表结构组织
      const previewData = toolingData.map((tooling, index) => {
        // 格式化工装信息中的日期字段
        const formattedTooling = {
          ...tooling,
          '接收日期': formatExcelDate(tooling['接收日期']),
          '需求日期': formatExcelDate(tooling['需求日期']),
          '完成日期': formatExcelDate(tooling['完成日期'])
        }
        
        // 验证工装信息
        const toolingErrors: string[] = []
        const toolingRequiredFields = ['盘存编号', '项目名称', '投产单位', '工装类别', '接收日期']
        for (const field of toolingRequiredFields) {
          if (!formattedTooling[field] || String(formattedTooling[field]).trim() === '') {
            toolingErrors.push(`缺少必填字段${field}`)
          }
        }

        // 盘存编号重复校验（系统内、文件内）
        const inv = String(formattedTooling['盘存编号'] || '').trim()
        if (inv) {
          if (existingInvSet.has(inv)) toolingErrors.push(`盘存编号“${inv}”已存在于系统中`)
          if ((fileInvCounts[inv] || 0) > 1) toolingErrors.push(`盘存编号“${inv}”在导入文件中重复出现`)
        }
        
        // 查找关联的零件信息
        const associatedParts = partsData.filter(part => part['父表盘存编号'] === formattedTooling['盘存编号'])
        // 查找关联的标准件信息
        const associatedChildItems = childItemsData.filter(child => child['父表盘存编号'] === formattedTooling['盘存编号'])
        
        // 验证零件信息
        const validatedParts = associatedParts.map(part => {
          const errors: string[] = []
          // 料型字段是数据库必填字段，必须包含在必填字段列表中
          const requiredFields = ['父表盘存编号', '零件名称', '数量', '料型']
          for (const field of requiredFields) {
            if (!part[field] || String(part[field]).trim() === '') {
              errors.push(`缺少必填字段${field}`)
            }
          }
          
          // 验证材质是否存在
          const materialName = String(part['材质'] || '').trim()
          if (materialName) {
            const materialExists = materials.some(m => m.name === materialName)
            if (!materialExists) {
              errors.push(`材质“${materialName}”不存在`)
            }
          }
          
          // 验证材料来源是否存在
          const sourceName = String(part['材料来源'] || '').trim()
          if (sourceName) {
            const sourceExists = materialSources.some(ms => ms.name === sourceName)
            if (!sourceExists) {
              errors.push(`材料来源“${sourceName}”不存在`)
            }
          }
          
          // 验证料型是否存在
          const partCategory = String(part['料型'] || '').trim()
          if (partCategory) {
            const partTypeExists = partTypes.some(pt => pt.name === partCategory)
            if (!partTypeExists) {
              errors.push(`料型“${partCategory}”不存在`)
            }
          }
          
          // 验证规格中的乘号格式
          const specText = String(part['规格'] || '').trim()
          if (specText) {
            // 检查是否使用了×作为乘号，应该使用*号
            if (specText.includes('×') || specText.includes('x')) {
              errors.push(`规格中使用了乘号(×或x)作为乘号，请使用星号(*)格式`)
            }
          }
          
          // 验证零件盘存编号格式是否符合父级盘存编号+两位数字
          const parentInventoryNumber = part['父表盘存编号'] || ''
          const partInventoryNumber = String(part['盘存编号'] || '').trim()
          if (parentInventoryNumber && partInventoryNumber) {
            // 放宽验证规则，允许零件盘存编号为父级盘存编号+任意数字，不要求必须两位
            const expectedFormat = new RegExp(`^${parentInventoryNumber}[0-9]+$`)
            if (!expectedFormat.test(partInventoryNumber)) {
              errors.push(`零件盘存编号“${partInventoryNumber}”不符合格式要求，应为父级盘存编号+数字（如：${parentInventoryNumber}01）`)
            }
          }

          // 子表盘存编号重复校验（系统内、文件内）
          if (partInventoryNumber) {
            if (existingPartInvSet.has(partInventoryNumber)) errors.push(`零件盘存编号“${partInventoryNumber}”已存在于系统中`)
            if ((filePartInvCounts[partInventoryNumber] || 0) > 1) errors.push(`零件盘存编号“${partInventoryNumber}”在导入文件中重复出现`)
          }
          
          // 格式化工件信息，将Excel日期数字转换为正确的日期格式
          const formattedPart = {
            ...part,
            '备注': formatExcelDate(part['备注'])
          }
          
          return {
            ...formattedPart,
            _errors: errors,
            _valid: errors.length === 0
          }
        })
        
        // 验证标准件信息
        const validatedChildItems = associatedChildItems.map(child => {
          // 格式化标准件信息中的日期字段
          const formattedChild = {
            ...child,
            '需求日期': formatExcelDate(child['需求日期'])
          }
          
          const errors: string[] = []
          const requiredFields = ['父表盘存编号', '名称', '型号', '数量', '单位', '需求日期']
          for (const field of requiredFields) {
            if (!formattedChild[field] || String(formattedChild[field]).trim() === '') {
              errors.push(`缺少必填字段${field}`)
            }
          }
          return {
            ...formattedChild,
            _errors: errors,
            _valid: errors.length === 0
          }
        })
        
        return {
          ...formattedTooling,
          _sheet: '工装信息',
          _index: index + 1,
          _errors: toolingErrors,
          _valid: toolingErrors.length === 0,
          _parts: validatedParts,
          _childItems: validatedChildItems
        }
      })
      
      setImportPreviewData(previewData)
      setImportFile(file)
      setImportPreviewVisible(true)
    } catch (error) {
      console.error('解析文件失败:', error)
      message.error('解析文件失败，请检查文件格式是否正确')
    }
  }

  // 确认导入
  const confirmImport = async () => {
    if (!importFile) return
    
    try {
      if (materialSources.length === 0 || materials.length === 0 || partTypes.length === 0) {
        await fetchAllMeta()
      }
      console.log('开始导入文件:', importFile.name, '大小:', importFile.size)
      const buf = await importFile.arrayBuffer()
      console.log('文件读取完成，开始解析')
      const wb = XLSX.read(buf, { type: 'array' })
      
      // 1. 解析工装信息工作表
      const toolingWs = wb.Sheets['工装信息']
      if (!toolingWs) {
        message.error('未找到"工装信息"工作表')
        return
      }
      
      const toolingRows = XLSX.utils.sheet_to_json(toolingWs)
      
      // 定义导入数据类型
      interface ToolingImportRow {
        '盘存编号': string
        '项目名称': string
        '投产单位': string
        '工装类别': string
        '接收日期': string
        '需求日期'?: string
        '完成日期'?: string
        '责任人'?: string
      }
      
      // 日期格式化函数：将Excel日期数字转换为YYYY-MM-DD格式
      const formatExcelDate = (dateValue: any): string => {
        if (!dateValue) return ''
        if (typeof dateValue === 'string') {
          // 如果已经是字符串，尝试转换为YYYY-MM-DD格式
          const date = new Date(dateValue)
          if (!isNaN(date.getTime())) {
            return date.toISOString().split('T')[0]
          }
          return dateValue
        }
        if (typeof dateValue === 'number') {
          // Excel日期数字转换为JS日期
          const date = new Date((dateValue - 25569) * 86400 * 1000)
          if (!isNaN(date.getTime())) {
            return date.toISOString().split('T')[0]
          }
        }
        return String(dateValue || '')
      }
      
      // 只导入有效数据
      const validToolingRows = (toolingRows as ToolingImportRow[]).filter(row => {
        const requiredFields = ['盘存编号', '项目名称', '投产单位', '工装类别', '接收日期']
        const isValid = requiredFields.every(field => row[field] && String(row[field]).trim() !== '')
        return isValid
      })
      
      console.log('工装数据解析完成，有效行:', validToolingRows.length)
      
      // 导入工装数据
      let successCount = 0
      let toolingSuccessCount = 0 // 单独跟踪工装成功数量
      const inventoryNumberMap: Record<string, string> = {} // 盘存编号映射：父表盘存编号 -> 实际ID
      
      // 收集工装导入错误信息
      const toolingImportErrors: string[] = []
      
      for (const row of validToolingRows) {
        // 格式化工装数据中的日期字段
        const formattedReceivedDate = formatExcelDate(row['接收日期'])
        const formattedDemandDate = row['需求日期'] ? formatExcelDate(row['需求日期']) : undefined
        const formattedCompletedDate = row['完成日期'] ? formatExcelDate(row['完成日期']) : undefined
        
        const payload = {
          inventory_number: String(row['盘存编号']).trim(),
          project_name: String(row['项目名称']).trim(),
          production_unit: String(row['投产单位']).trim(),
          category: String(row['工装类别']).trim(),
          received_date: formattedReceivedDate,
          demand_date: formattedDemandDate ? formattedDemandDate : undefined,
          completed_date: formattedCompletedDate ? formattedCompletedDate : undefined,
          recorder: row['责任人'] ? String(row['责任人']).trim() : undefined,
          sets_count: 1
        }
        
        console.log('创建工装payload:', payload)
        try {
          const created = await createTooling(payload)
          if (created && created.success && created.data) {
            successCount++
            toolingSuccessCount++
            // 建立盘存编号映射：使用父表盘存编号作为键
            inventoryNumberMap[payload.inventory_number] = created.data.id
            console.log('工装创建成功:', created.data)
            console.log('工装映射关系:', payload.inventory_number, '->', created.data.id)
          } else {
            const errorMsg = `工装“${row['盘存编号']}”（${row['项目名称']}）：创建失败，错误：${created?.error || '服务器返回空数据'}`
            toolingImportErrors.push(errorMsg)
            console.error(errorMsg)
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          const fullErrorMsg = `工装“${row['盘存编号']}”（${row['项目名称']}）：创建失败，错误信息：${errorMsg}`
          toolingImportErrors.push(fullErrorMsg)
          console.error('创建工装失败，盘存编号:', row['盘存编号'], '错误:', error)
        }
      }
      
      // 打印映射关系
      console.log('工装映射关系表:', inventoryNumberMap)
      
      // 如果有工装导入错误，显示给用户
      if (toolingImportErrors.length > 0) {
        message.warning(`工装信息导入完成，成功${toolingSuccessCount}条，失败${toolingImportErrors.length}条。失败原因：${toolingImportErrors.join('； ')}`)
      }
      
      // 2. 解析零件信息工作表（如果存在）
      const partsWs = wb.Sheets['零件信息']
      if (partsWs) {
        const partsRows = XLSX.utils.sheet_to_json(partsWs)
        
        interface PartImportRow {
          '父表盘存编号': string
          '零件ID': string
          '盘存编号': string
          '图号': string
          '零件名称': string
          '数量': number
          '材质': string
          '材料来源': string
          '料型': string
          '规格': string
          '备注': string
          '自备'?: string | number | boolean
        }
        
        const validPartsRows = (partsRows as PartImportRow[]).filter(row => {
          // 料型字段是数据库必填字段，必须包含在必填字段列表中
          const requiredFields = ['父表盘存编号', '零件名称', '数量', '料型']
          return requiredFields.every(field => row[field] && String(row[field]).trim() !== '')
        })
        
        // 收集零件导入错误信息
        const partImportErrors: string[] = []
        let partSuccessCount = 0 // 单独跟踪零件成功数量
        
        for (const row of validPartsRows) {
          const parentInventoryNumber = row['父表盘存编号']
          console.log('查找零件关联工装:', parentInventoryNumber)
          const toolingId = inventoryNumberMap[parentInventoryNumber]
          if (!toolingId) {
            partImportErrors.push(`零件“${row['零件名称']}”（${row['盘存编号']}）：未找到关联的工装（父表盘存编号：${parentInventoryNumber}）`)
            console.error('未找到关联工装，父表盘存编号:', parentInventoryNumber, '当前映射表:', inventoryNumberMap)
            continue // 跳过没有关联工装的零件
          }
          console.log('找到零件关联工装:', parentInventoryNumber, '->', toolingId)
          
          // 验证零件盘存编号格式是否符合父级盘存编号+数字
          const partInventoryNumber = String(row['盘存编号'] || '').trim()
          if (parentInventoryNumber && partInventoryNumber) {
            // 放宽验证规则，允许零件盘存编号为父级盘存编号+任意数字，不要求必须两位
            const expectedFormat = new RegExp(`^${parentInventoryNumber}[0-9]+$`)
            if (!expectedFormat.test(partInventoryNumber)) {
              partImportErrors.push(`零件“${row['零件名称']}”（${row['盘存编号']}）：盘存编号格式不符合要求，应为父级盘存编号+数字（如：${parentInventoryNumber}01）`)
              continue
            }
          }
          
          // 查找材质ID，允许材质为空
          const materialName = String(row['材质'] || '').trim()
          let selectedMaterial = materials.find(m => m.name === materialName) || materials.find(m => m.name.toLowerCase() === materialName.toLowerCase())
          // 如果未找到材质且材质字段有值，跳过该零件
          if (materialName && !selectedMaterial) {
            partImportErrors.push(`零件“${row['零件名称']}”（${row['盘存编号']}）：未找到材质“${materialName}”`)
            continue
          }
          
          // 查找材料来源ID，允许材料来源为空；支持同义词
          const rawSource = String(row['材料来源'] || '').trim()
          const normalizeSource = (s: string) => {
            const normalized = s.replace(/\s+/g, '').toLowerCase()
            if (!normalized) return ''
            if (['自备','钢料自备','含料自备'].some(source => s.includes(source))) return '自备'
            // 保留“含料”为独立来源名称，不强制归并到自备
            if (['含料','hanliao'].some(source => normalized.includes(source))) return '含料'
            if (['waigou','采购','外购'].some(source => normalized.includes(source))) return '外购'
            if (['火切','huoqie','切割'].some(source => normalized.includes(source))) return '火切'
            if (['锯切','jvqie','锯床割方','割方'].some(source => normalized.includes(source))) return '锯切'
            return s
          }
          const normSource = normalizeSource(rawSource)
          let selectedSource = materialSources.find(ms => ms.name === normSource) || materialSources.find(ms => ms.name === rawSource) || materialSources.find(ms => ms.name.toLowerCase() === normSource.toLowerCase())
          if (!selectedSource && normSource) {
            try {
              const resp = await fetch('/api/options/material-sources', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: normSource, description: '', is_active: true }) })
              const j = await resp.json().catch(()=>({}))
              if (j?.success && j?.data?.id) {
                selectedSource = { id: j.data.id, name: normSource } as any
              }
            } catch {}
          }
          // 如果未找到材料来源且材料来源字段有值，跳过该零件
          if (rawSource && !selectedSource) {
            // 若Excel提供“自备”列，则尝试按该列回填
            const zibeiFlag = row['自备']
            const zibeiTruth = typeof zibeiFlag === 'boolean' ? zibeiFlag : /^(是|yes|y|1)$/i.test(String(zibeiFlag || '').trim())
            if (zibeiTruth) {
              selectedSource = materialSources.find(ms => ms.name === '自备') || null as any
            }
            if (!selectedSource) {
              partImportErrors.push(`零件“${row['零件名称']}”（${row['盘存编号']}）：未找到材料来源“${row['材料来源']}”`)
              continue
            }
          }
          
          // 验证料型是否在允许的列表中
          const partCategory = String(row['料型']).trim()
          const isValidPartCategory = partTypes.some(pt => pt.name === partCategory)
          if (!isValidPartCategory) {
            partImportErrors.push(`零件“${row['零件名称']}”（${row['盘存编号']}）：未找到料型“${partCategory}”`)
            continue
          }
          
          // 处理规格中的乘号，将×或x转换为*号
          const specText = String(row['规格'] || '').trim()
          const normalizedSpecText = specText.replace(/[×x]/g, '*')
          
          // 根据料型解析规格文本为正确的规格对象
          const parseSpecifications = (spec: string, partCategory: string) => {
            // 提取规格中的数字
            const numbers = spec.match(/[0-9]+\.?[0-9]*/g)?.map(Number) || []
            
            // 根据料型设置不同的规格字段
            switch (partCategory) {
              case '板料':
              case '锯床割方':
                // 格式: A*B*C 或 长*宽*高
                return {
                  长: numbers[0] || 0,
                  宽: numbers[1] || 0,
                  高: numbers[2] || 0,
                  A: numbers[0] || 0,
                  B: numbers[1] || 0,
                  C: numbers[2] || 0
                }
              case '圆料':
                // 格式: Φ50×200 或 φ50*200
                return {
                  直径: numbers[0] || 0,
                  高: numbers[1] || 0,
                  φA: numbers[0] || 0,
                  B: numbers[1] || 0
                }
              case '圆环':
                // 格式: Φ100-50×20 或 φ100-50*20
                return {
                  外径: numbers[0] || 0,
                  内径: numbers[1] || 0,
                  高: numbers[2] || 0,
                  φA: numbers[0] || 0,
                  φB: numbers[1] || 0,
                  C: numbers[2] || 0
                }
              case '板料割圆':
                // 格式: Φ50×10 或 φ50*10
                return {
                  直径: numbers[0] || 0,
                  厚: numbers[1] || 0,
                  φA: numbers[0] || 0,
                  B: numbers[1] || 0
                }
              case '圆管':
              default:
                // 默认格式，直接返回原始规格文本作为单个字段
                return {
                  规格: spec
                }
            }
          }
          
          // 构建零件payload，料型字段是数据库必填字段
          const payload: any = {
            part_inventory_number: partInventoryNumber,
            part_drawing_number: String(row['图号'] || '').trim(),
            part_name: String(row['零件名称']).trim(),
            part_quantity: Number(row['数量']),
            part_category: String(row['料型']).trim(), // 料型是必填字段，直接赋值
            specifications: parseSpecifications(normalizedSpecText, String(row['料型']).trim()), // 根据料型解析规格
            remarks: String(row['备注'] || '').trim(),
            source: '自备' // 添加工厂要求的source字段
          }
          
          // 只在有值时添加可选字段
          if (selectedMaterial) {
            payload.material_id = selectedMaterial.id
          }
          if (selectedSource) {
            payload.material_source_id = selectedSource.id
          } else {
            const defaultSource = materialSources.find(ms => ms.name === '自备')
            if (defaultSource) payload.material_source_id = defaultSource.id
          }

          // 备注规范化：外购填日期(YYYY-MM-DD)，其他情况保留原始备注或设置为“需调质/空”
          const srcName = selectedSource?.name || (materialSources.find(ms => ms.id === payload.material_source_id)?.name) || ''
          // 先将Excel日期数字转换为正确的日期格式
          const formattedRemark = formatExcelDate(row['备注'])
          const rawRemark = String(formattedRemark || '').trim()
          const normalizeDateHyphen = (v: string) => {
            const m = v.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/)
            if (m) {
              const y = m[1]
              const mm = String(Number(m[2])).padStart(2, '0')
              const dd = String(Number(m[3])).padStart(2, '0')
              return `${y}-${mm}-${dd}`
            }
            return v
          }
          if (srcName === '外购') {
            let rr = rawRemark
            if (/^\d{4}[\/-]\d{1,2}[\/-]\d{1,2}$/.test(rr)) {
              rr = normalizeDateHyphen(rr)
            }
            payload.remarks = rr
          } else {
            // 非外购情况下，如果原始备注不是需调质相关，保留原始备注
            if (/需调质|^是$|^1$|^yes$/i.test(rawRemark)) {
              payload.remarks = '需调质'
            } else if (rawRemark) {
              payload.remarks = rawRemark
            } else {
              payload.remarks = ''
            }
          }
          
          try {
            const created = await createPart(toolingId, payload)
            if (created) {
              successCount++
              partSuccessCount++
            } else {
              partImportErrors.push(`零件“${row['零件名称']}”（${row['盘存编号']}）：创建失败，服务器返回空数据`)
            }
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error)
            partImportErrors.push(`零件“${row['零件名称']}”（${row['盘存编号']}）：创建失败，错误信息：${errorMsg}`)
            console.error('创建零件失败：', error)
          }
        }
        
        // 如果有零件导入错误，显示给用户
        if (partImportErrors.length > 0) {
          message.warning(`零件信息导入完成，成功${partSuccessCount}条，失败${partImportErrors.length}条。失败原因：${partImportErrors.join('； ')}`)
        }
      }
      
      // 3. 解析标准件信息工作表（如果存在）
      const childItemsWs = wb.Sheets['标准件信息']
      if (childItemsWs) {
        const childItemsRows = XLSX.utils.sheet_to_json(childItemsWs)
        
        interface ChildItemImportRow {
          '父表盘存编号': string
          '名称': string
          '型号': string
          '数量': number
          '单位': string
          '需求日期': string
        }
        
        const validChildItemsRows = (childItemsRows as ChildItemImportRow[]).filter(row => {
          const requiredFields = ['父表盘存编号', '名称', '型号', '数量', '单位', '需求日期']
          return requiredFields.every(field => row[field] && String(row[field]).trim() !== '')
        })
        
        // 收集标准件导入错误信息
        const childImportErrors: string[] = []
        let childSuccessCount = 0 // 单独跟踪标准件成功数量
        
        for (const row of validChildItemsRows) {
          const parentInventoryNumber = row['父表盘存编号']
          console.log('查找标准件关联工装:', parentInventoryNumber)
          const toolingId = inventoryNumberMap[parentInventoryNumber]
          if (!toolingId) {
            childImportErrors.push(`标准件“${row['名称']}”（${row['型号']}）：未找到关联的工装（父表盘存编号：${parentInventoryNumber}）`)
            console.error('未找到关联工装，父表盘存编号:', parentInventoryNumber, '当前映射表:', inventoryNumberMap)
            continue // 跳过没有关联工装的标准件
          }
          console.log('找到标准件关联工装:', parentInventoryNumber, '->', toolingId)
          
          // 格式化标准件数据中的日期字段
          const formattedRequiredDate = formatExcelDate(row['需求日期'])
          
          const payload = {
            name: String(row['名称']).trim(),
            model: String(row['型号']).trim(),
            quantity: Number(row['数量']),
            unit: String(row['单位']).trim(),
            required_date: formattedRequiredDate
          }
          
          try {
            const created = await createChildItem(toolingId, payload)
            if (created) {
              successCount++
              childSuccessCount++
            } else {
              childImportErrors.push(`标准件“${row['名称']}”（${row['型号']}）：创建失败，服务器返回空数据`)
            }
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error)
            childImportErrors.push(`标准件“${row['名称']}”（${row['型号']}）：创建失败，错误信息：${errorMsg}`)
            console.error('创建标准件失败：', error)
          }
        }
        
        // 如果有标准件导入错误，显示给用户
        if (childImportErrors.length > 0) {
          message.warning(`标准件信息导入完成，成功${childSuccessCount}条，失败${childImportErrors.length}条。失败原因：${childImportErrors.join('； ')}`)
        }
      }
      
      console.log('导入完成，成功条数:', successCount)
      
      // 刷新数据：只刷新工装列表，不刷新零件数据
      // 因为导入时已经在本地状态中更新了数据，不需要再次刷新
      await fetchToolingData()
      
      // 移除对每个工装都调用 fetchPartsData 和 fetchChildItemsData 的逻辑
      // 这样可以避免大量请求导致页面卡死
      // 如果用户需要查看导入的数据，可以手动展开工装行
      
      // 根据成功条数显示不同的消息
      if (successCount > 0) {
        message.success(`成功导入${successCount}条记录`)
      } else {
        message.warning('未成功导入任何记录，请检查导入数据和格式')
      }
      
      // 关闭预览
      setImportPreviewVisible(false)
      setImportPreviewData([])
      setImportFile(null)
    } catch (error) {
      console.error('导入失败:', error)
      message.error('导入失败，请重试')
      // 打印完整的错误信息，包括堆栈跟踪
      console.error('导入失败详细信息:', error instanceof Error ? error.stack : String(error))
    }
  }

  // 取消导入
  const cancelImport = () => {
    setImportPreviewVisible(false)
    setImportPreviewData([])
    setImportFile(null)
  }

  // 导出工装信息
  const exportToolingInfo = async () => {
    try {
      message.loading('正在准备导出数据...', 0)
      
      // 确保元数据与子表均已加载
      if (materialSources.length === 0 || materials.length === 0 || partTypes.length === 0) {
        await fetchAllMeta()
      }
      const parentIds2 = data.filter(t => !String(t.id || '').startsWith('blank-')).map(t => String(t.id))
      const localPartsMap: Record<string, any[]> = {}
      const localChildMap: Record<string, any[]> = {}
      for (const tid of parentIds2) {
        const existP = partsMap[tid]
        const existC = childItemsMap[tid]
        const parts = (existP && existP.length > 0) ? existP : (await fetchPartsData(tid)) || []
        const childs = (existC && existC.length > 0) ? existC : (await fetchChildItemsData(tid)) || []
        localPartsMap[tid] = parts
        localChildMap[tid] = childs
      }

      // 1. 创建工作簿
      const wb = XLSX.utils.book_new()
      
      // 2. 导出工装信息主表
      const toolingExportData = data.map(tooling => ({
        '盘存编号': tooling.inventory_number,
        '项目名称': tooling.project_name,
        '投产单位': tooling.production_unit,
        '工装类别': tooling.category,
        '接收日期': tooling.received_date,
        '需求日期': tooling.demand_date,
        '完成日期': tooling.completed_date,
        '责任人': tooling.recorder,
        '备注': (tooling as any).remarks || ''
      }))
      
      const toolingWs = XLSX.utils.json_to_sheet(toolingExportData)
      XLSX.utils.book_append_sheet(wb, toolingWs, '工装信息')
      
      // 3. 导出零件信息表
      const partsExportData = []
      Object.entries(localPartsMap).forEach(([toolingId, parts]) => {
        const tooling = data.find(t => t.id === toolingId)
        if (tooling && parts.length > 0) {
          parts.forEach(part => {
            // 获取材质和材料来源名称
            const material = materials.find(m => String(m.id) === String(part.material_id))
            const materialSource = materialSources.find(ms => String(ms.id) === String(part.material_source_id))
            
            partsExportData.push({
              '父表盘存编号': tooling.inventory_number,
              '盘存编号': part.part_inventory_number,
              '图号': part.part_drawing_number,
              '零件名称': part.part_name,
              '数量': part.part_quantity,
              '材质': material?.name || '',
              '材料来源': materialSource?.name || '',
              '料型': part.part_category,
            '规格': formatSpecificationsForProduction(part.specifications, part.part_category),
            '工艺路线': part.process_route || '',
            '备注': part.remarks
          })
        })
      }
      })
      
      
      
      // 创建零件信息表
      const partsWs = XLSX.utils.json_to_sheet(partsExportData)
      XLSX.utils.book_append_sheet(wb, partsWs, '零件信息')
      
      // 4. 导出标准件信息表
      const childItemsExportData = []
      Object.entries(localChildMap).forEach(([toolingId, childItems]) => {
        const tooling = data.find(t => t.id === toolingId)
        if (tooling && childItems.length > 0) {
          childItems.forEach(childItem => {
            childItemsExportData.push({
              '父表盘存编号': tooling.inventory_number,
              '名称': childItem.name,
              '型号': childItem.model,
              '数量': childItem.quantity,
              '单位': childItem.unit,
              '需求日期': childItem.required_date
            })
          })
        }
      })
      
      // 创建标准件信息表
      const childItemsWs = XLSX.utils.json_to_sheet(childItemsExportData)
      XLSX.utils.book_append_sheet(wb, childItemsWs, '标准件信息')
      
      // 添加双向超链接
      const findHeaderCol = (ws: any, headerName: string) => {
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
        for (let c = range.s.c; c <= range.e.c; c++) {
          const addr = XLSX.utils.encode_cell({ c, r: range.s.r })
          const cell = ws[addr]
          if (cell && String(cell.v) === headerName) return c
        }
        return 0
      }

      const toolingColInv = findHeaderCol(toolingWs as any, '盘存编号')
      const partsColParentInv = findHeaderCol(partsWs as any, '父表盘存编号')
      const childColParentInv = findHeaderCol(childItemsWs as any, '父表盘存编号')

      const parentRowIndexMap: Record<string, number> = {}
      toolingExportData.forEach((it, idx) => { parentRowIndexMap[String((it as any)['盘存编号'] || '')] = idx + 2 })
      const partsFirstIndexMap: Record<string, number> = {}
      partsExportData.forEach((it, idx) => {
        const key = String((it as any)['父表盘存编号'] || '')
        if (!partsFirstIndexMap[key]) partsFirstIndexMap[key] = idx + 2
      })
      const childFirstIndexMap: Record<string, number> = {}
      childItemsExportData.forEach((it, idx) => {
        const key = String((it as any)['父表盘存编号'] || '')
        if (!childFirstIndexMap[key]) childFirstIndexMap[key] = idx + 2
      })

      const encode = (c: number, r: number) => XLSX.utils.encode_cell({ c, r })

      // 父表 → 子表（优先零件，否则标准件）
      toolingExportData.forEach((it: any, idx) => {
        const inv = String(it['盘存编号'] || '')
        const partsRow = partsFirstIndexMap[inv]
        const childRow = childFirstIndexMap[inv]
        const targetSheet = partsRow ? '零件信息' : (childRow ? '标准件信息' : '')
        const targetCol = targetSheet === '零件信息' ? partsColParentInv : childColParentInv
        const targetRow = partsRow || childRow
        if (targetSheet && targetRow) {
          const srcAddr = encode(toolingColInv, idx + 1)
          const targetAddr = encode(targetCol, (targetRow - 1))
          const cell = (toolingWs as any)[srcAddr] || { t: 's', v: inv }
          ;(cell as any).l = { Target: `#'${targetSheet}'!` + targetAddr }
          ;(toolingWs as any)[srcAddr] = cell
        }
      })

      // 子表 → 父表（零件）
      partsExportData.forEach((it: any, idx) => {
        const inv = String(it['父表盘存编号'] || '')
        const parentRow = parentRowIndexMap[inv]
        if (parentRow) {
          const srcAddr = encode(partsColParentInv, idx + 1)
          const targetAddr = encode(toolingColInv, (parentRow - 1))
          const cell = (partsWs as any)[srcAddr] || { t: 's', v: inv }
          ;(cell as any).l = { Target: `#'工装信息'!` + targetAddr }
          ;(partsWs as any)[srcAddr] = cell
        }
      })

      // 子表 → 父表（标准件）
      childItemsExportData.forEach((it: any, idx) => {
        const inv = String(it['父表盘存编号'] || '')
        const parentRow = parentRowIndexMap[inv]
        if (parentRow) {
          const srcAddr = encode(childColParentInv, idx + 1)
          const targetAddr = encode(toolingColInv, (parentRow - 1))
          const cell = (childItemsWs as any)[srcAddr] || { t: 's', v: inv }
          ;(cell as any).l = { Target: `#'工装信息'!` + targetAddr }
          ;(childItemsWs as any)[srcAddr] = cell
        }
      })

      // 5. 导出文件
      const fileName = `工装信息_${new Date().toISOString().split('T')[0]}.xlsx`
      XLSX.writeFile(wb, fileName)
      
      message.destroy()
      message.success('导出成功')
    } catch (error) {
      console.error('导出失败:', error)
      message.destroy()
      message.error('导出失败，请重试')
    }
  }

  const triggerToolingImport = () => {
    // 打开导入二次弹窗
    setImportModalVisible(true)
  }

  // 选择文件并显示预览
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      try {
        // 确保元数据已经加载完成
        if (materialSources.length === 0 || materials.length === 0 || partTypes.length === 0) {
          await fetchAllMeta()
        }
        await parseImportFile(file)
        // 关闭当前弹窗，打开预览弹窗
        setImportModalVisible(false)
      } catch (error) {
        console.error('处理文件失败:', error)
        message.error('处理文件失败，请重试')
      }
    }
    // 重置input元素的值，以便用户可以选择同一个文件
    if (e.target) {
      e.target.value = ''
    }
  }

  // 导入预览父表列定义
  const importPreviewColumns = [
    {
      title: '序号',
      dataIndex: '_index',
      width: 80,
      render: (text: number) => <span>{text}</span>
    },
    {
      title: '盘存编号',
      dataIndex: '盘存编号',
      width: 140
    },
    {
      title: '项目名称',
      dataIndex: '项目名称',
      width: 200
    },
    {
      title: '投产单位',
      dataIndex: '投产单位',
      width: 120
    },
    {
      title: '工装类别',
      dataIndex: '工装类别',
      width: 120
    },
    {
      title: '接收日期',
      dataIndex: '接收日期',
      width: 120
    },
    {
      title: '需求日期',
      dataIndex: '需求日期',
      width: 120
    },
    {
      title: '完成日期',
      dataIndex: '完成日期',
      width: 120
    },
    {
      title: '责任人',
      dataIndex: '责任人',
      width: 100
    },
    {
      title: '零件数量',
      dataIndex: '_parts',
      width: 100,
      render: (parts: any[]) => parts.length
    },
    {
      title: '标准件数量',
      dataIndex: '_childItems',
      width: 100,
      render: (childItems: any[]) => childItems.length
    },
    {
      title: '状态',
      dataIndex: '_valid',
      width: 100,
      render: (valid: boolean) => (
        <span style={{ color: valid ? '#52c41a' : '#f5222d' }}>
          {valid ? '有效' : '无效'}
        </span>
      )
    },
    {
      title: '错误信息',
      dataIndex: '_errors',
      width: 300,
      render: (errors: string[]) => (
        <span style={{ color: '#f5222d', fontSize: '12px' }}>
          {errors.join('; ')}
        </span>
      )
    }
  ]
  
  // 零件信息子表列定义
  const importPartsColumns = [
    {
      title: '序号',
      dataIndex: '__seq',
      width: 80,
      render: (_text: any, record: any, index: number) => index + 1
    },
    {
      title: '盘存编号',
      dataIndex: '盘存编号',
      width: 140
    },
    {
      title: '图号',
      dataIndex: '图号',
      width: 120
    },
    {
      title: '零件名称',
      dataIndex: '零件名称',
      width: 180
    },
    {
      title: '数量',
      dataIndex: '数量',
      width: 80
    },
    {
      title: '材质',
      dataIndex: '材质',
      width: 120
    },
    {
      title: '材料来源',
      dataIndex: '材料来源',
      width: 120
    },
    {
      title: '料型',
      dataIndex: '料型',
      width: 120
    },
    {
      title: '规格',
      dataIndex: '规格',
      width: 150
    },
    {
      title: '备注',
      dataIndex: '备注',
      width: 150
    },
    {
      title: '状态',
      dataIndex: '_valid',
      width: 100,
      render: (valid: boolean) => (
        <span style={{ color: valid ? '#52c41a' : '#f5222d' }}>
          {valid ? '有效' : '无效'}
        </span>
      )
    },
    {
      title: '错误信息',
      dataIndex: '_errors',
      width: 300,
      render: (errors: string[]) => (
        <span style={{ color: '#f5222d', fontSize: '12px' }}>
          {errors.join('; ')}
        </span>
      )
    }
  ]
  
  // 标准件信息子表列定义
  const importChildItemsColumns = [
    {
      title: '序号',
      dataIndex: '__seq',
      width: 80,
      render: (_text: any, record: any, index: number) => index + 1
    },
    {
      title: '名称',
      dataIndex: '名称',
      width: 180
    },
    {
      title: '型号',
      dataIndex: '型号',
      width: 120
    },
    {
      title: '数量',
      dataIndex: '数量',
      width: 80
    },
    {
      title: '单位',
      dataIndex: '单位',
      width: 80
    },
    {
      title: '需求日期',
      dataIndex: '需求日期',
      width: 120
    },
    {
      title: '状态',
      dataIndex: '_valid',
      width: 100,
      render: (valid: boolean) => (
        <span style={{ color: valid ? '#52c41a' : '#f5222d' }}>
          {valid ? '有效' : '无效'}
        </span>
      )
    },
    {
      title: '错误信息',
      dataIndex: '_errors',
      width: 300,
      render: (errors: string[]) => (
        <span style={{ color: '#f5222d', fontSize: '12px' }}>
          {errors.join('; ')}
        </span>
      )
    }
  ]

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <Title level={2} className="mb-0">
          <ToolOutlined className="text-3xl text-red-500 mb-2" /> 工装信息
        </Title>
        <Space>
          <Button onClick={triggerToolingImport}>导入工装信息</Button>
          <Button onClick={triggerImport}>导入工艺卡片</Button>
          <Button onClick={() => handleExternalAction(exportToolingInfo)}>导出工装信息</Button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.xlsm" style={{ display: 'none' }} onChange={handleImportChange} />
          <Button
            type="primary"
            onClick={async () => {
              await handleExternalAction(async () => {
                // 获取选中的零件ID
                const partIds = selectedRowKeys.filter(k => k.startsWith('part-')).map(k => k.slice(5))
                if (partIds.length === 0) {
                  message.warning('请选择要生成下料单的零件')
                  return
                }
                
                // 收集选中的零件数据
                const selectedParts: any[] = []
                Object.values(partsMap).forEach(parts => {
                  parts.forEach(part => {
                    if (partIds.includes(part.id)) {
                      selectedParts.push({
                        ...part,
                        specifications_text: formatSpecificationsForProduction(part.specifications, part.part_category)
                      })
                    }
                  })
                })
                
                const result = await generateCuttingOrders(selectedParts, materials, materialSources, partTypes)
                if (result) {
                  navigate('/cutting-management')
                }
              })
            }}
          >
            生成下料单
          </Button>
          <Button
            type="primary"
            style={{ backgroundColor: '#52c41a', borderColor: '#52c41a' }}
            onClick={async () => {
              await handleExternalAction(async () => {
                // 获取选中的标准件ID和零件ID
                const childItemIds = selectedRowKeys.filter(k => k.startsWith('child-')).map(k => k.slice(6))
                const partIds = selectedRowKeys.filter(k => k.startsWith('part-')).map(k => k.slice(5))
                
                if (childItemIds.length === 0 && partIds.length === 0) {
                  message.warning('请选择要生成采购单的标准件或材料来源为外购的零件')
                  return
                }
                
                // 收集选中的数据
                const selectedItems: any[] = []
                
                // 添加标准件
                Object.values(childItemsMap).forEach(childItems => {
                  childItems.forEach(item => {
                    if (childItemIds.includes(item.id)) {
                      selectedItems.push({ 
                        ...item, 
                        type: 'childItem',
                        project_name: (data.find(d => d.id === item.tooling_id)?.project_name || '')
                      })
                    }
                  })
                })
                
                // 添加外购零件（严格筛选材料来源为“外购/采购/waigou”变体）
                const normalize = (s: string) => {
                  const t = String(s || '').replace(/\s+/g, '').toLowerCase()
                  if (!t) return ''
                  if (t.includes('外购') || t.includes('waigou') || t.includes('采购')) return '外购'
                  return s
                }
                Object.values(partsMap).forEach(parts => {
                  parts.forEach(part => {
                    if (!partIds.includes(part.id)) return
                    const ms = materialSources.find(ms => String(ms.id) === String(part.material_source_id))
                    if (!ms || normalize(ms.name) !== '外购') return
                    selectedItems.push({ 
                      ...part, 
                      type: 'part',
                      project_name: (data.find(d => d.id === part.tooling_id)?.project_name || ''),
                      specifications_text: formatSpecificationsForProduction(part.specifications, part.part_category)
                    })
                  })
                })
                
                // 二次校验：所有选中的必须完整，否则整体失败并提示
                const dateOk = (s: any) => typeof s === 'string' && /\d{4}-\d{2}-\d{2}/.test(String(s))
                const invalid: { name: string; reason: string }[] = []
                const isChildComplete = (it: any, parent: any) => {
                  const projectOk = !!String(parent.project_name || '').trim()
                  const prodUnitOk = !!String(parent.production_unit || '').trim()
                  const applicantOk = !!String(parent.recorder || '').trim()
                  const nameOk = !!String(it.name || '').trim()
                  const modelOk = !!String(it.model || '').trim()
                  const qtyOk = Number(it.quantity || 0) > 0
                  const unitOk = !!String(it.unit || '').trim()
                  const demandDateOk = dateOk(it.required_date)
                  return nameOk && modelOk && qtyOk && unitOk && demandDateOk && projectOk && prodUnitOk && applicantOk
                }
                const isPartComplete = (it: any, parent: any) => {
                  const projectOk = !!String(parent.project_name || '').trim()
                  const prodUnitOk = !!String(parent.production_unit || '').trim()
                  const applicantOk = !!String(parent.recorder || '').trim()
                  const nameOk = !!String(it.part_name || '').trim()
                  const qtyVal = (it.part_quantity === '' || it.part_quantity === null || typeof it.part_quantity === 'undefined') ? 0 : Number(it.part_quantity)
                  const qtyOk = qtyVal > 0
                  const demandDateOk = dateOk(it.remarks)
                  return nameOk && qtyOk && demandDateOk && projectOk && prodUnitOk && applicantOk
                }
                selectedItems.forEach((it: any) => {
                  const parent = data.find(d => d.id === (it.tooling_id || it.toolingId)) || {} as any
                  const ok = it.type === 'childItem' ? isChildComplete(it, parent) : isPartComplete(it, parent)
                  if (!ok) {
                    invalid.push({ name: String(it.part_name || it.name || it.part_drawing_number || '记录'), reason: '信息不完整或父级信息缺失' })
                  }
                })

                if (invalid.length > 0) {
                  message.error(`生成采购单失败：共有 ${invalid.length} 条信息不完整，请补全后重试`)
                  return
                }

                const result = await generatePurchaseOrders(selectedItems, materials, materialSources, partTypes)
                if (result) {
                  navigate('/purchase-management?tab=list')
                }
              })
            }}
          >
            生成采购单
          </Button>
          
          <Button
            danger
            onClick={async () => {
              await handleExternalAction(async () => {
                const toolingIds = selectedRowKeys.filter(k => !k.startsWith('blank-') && !k.startsWith('part-') && !k.startsWith('child-'))
                const partIds = selectedRowKeys.filter(k => k.startsWith('part-')).map(k => k.slice(5))
                const childItemIds = selectedRowKeys.filter(k => k.startsWith('child-')).map(k => k.slice(6))
                
                if (toolingIds.length === 0 && partIds.length === 0 && childItemIds.length === 0) {
                  message.warning('请选择要删除的记录')
                  return
                }
                
                const success = await batchDelete(toolingIds, partIds, childItemIds)
                if (success) {
                  setSelectedRowKeys(prev => prev.filter(k => 
                    !toolingIds.includes(k) && 
                    !(k.startsWith('part-') && partIds.includes(k.slice(5))) &&
                    !(k.startsWith('child-') && childItemIds.includes(k.slice(6)))
                  ))
                  
                  // 更新本地数据
                  setData(prev => prev.filter(r => !toolingIds.includes(r.id)))
                  setPartsMap(prev => {
                    const next = { ...prev }
                    toolingIds.forEach(id => { delete next[id] })
                    Object.keys(next).forEach(tid => {
                      next[tid] = (next[tid] || []).filter(p => !partIds.includes(p.id))
                    })
                    return next
                  })
                  setChildItemsMap(prev => {
                    const next = { ...prev }
                    toolingIds.forEach(id => { delete next[id] })
                    Object.keys(next).forEach(tid => {
                      next[tid] = (next[tid] || []).filter(c => !childItemIds.includes(c.id))
                    })
                    return next
                  })
                }
              })
            }}
          >批量删除</Button>
          <Button icon={<ReloadOutlined />} onClick={() => handleExternalAction(() => { fetchAllMeta(); fetchToolingData(); })}>刷新</Button>
          <Button icon={<LeftOutlined />} onClick={() => handleExternalAction(() => navigate('/dashboard'))}>返回</Button>
        </Space>
      </div>
      <div className="filter-bar" style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Input
          allowClear
          placeholder="搜索（盘存编号/项目/责任人）"
          style={{ width: 200 }}
          value={filterSearch}
          onChange={(e) => setFilterSearch(e.target.value)}
        />
        <AutoComplete
          placeholder="投产单位"
          style={{ width: 200 }}
          options={unitOptions as any}
          value={filterUnit}
          onSearch={(v) => setFilterUnit(v)}
          onSelect={(v) => setFilterUnit(String(v))}
          allowClear
        />
        <AutoComplete
          placeholder="工装类别"
          style={{ width: 200 }}
          options={categoryOptions as any}
          value={filterCategory}
          onSearch={(v) => setFilterCategory(v)}
          onSelect={(v) => setFilterCategory(String(v))}
          allowClear
        />
      </div>
        <div ref={tableWrapRef}>
          <style>{`
          .excel-table { --row-h: 32px; }
          .excel-table .ant-table-thead > tr > th { height: var(--row-h) !important; }
          .excel-table .ant-table-tbody > tr > td { height: var(--row-h) !important; padding: 0 8px; }
          .editing-input { border: none !important; box-shadow: none !important; outline: none !important; background: transparent !important; }
          .editing-input.ant-input:focus { border: none !important; box-shadow: none !important; outline: none !important; }
          .excel-table .ant-table-expand-icon-col,
          .excel-table .ant-table-row-expand-icon-cell { display: none !important; }
          .filter-bar .ant-input { border: none !important; box-shadow: none !important; }
          .filter-bar .ant-input-affix-wrapper { border: 1px solid #d9d9d9 !important; box-shadow: none !important; }
          `}</style>
        <Table
          className="excel-table"
          rowKey="id"
          loading={loading}
          components={{ header: { cell: HeaderCell } }}
          dataSource={ensureBlankToolings(visibleData)}
          columns={columns}
          pagination={false}
          bordered={false}
          scroll={{ y: 600 }}
          locale={{ emptyText: '' }}
          rowSelection={{
            selectedRowKeys,
            onChange: (keys) => {
              const newKeys = keys as string[]
              
              // 处理单个行选择
              const changedKeys = newKeys.filter(k => !selectedRowKeys.includes(k))
              const removedKeys = selectedRowKeys.filter(k => !newKeys.includes(k))
              
              // 处理父级行选择
              if (changedKeys.length > 0) {
                const parentKey = changedKeys.find(k => !k.startsWith('part-') && !k.startsWith('child-'))
                if (parentKey) {
                  const parentRecord = data.find(d => d.id === parentKey)
                  if (parentRecord) {
                    // 选择父级及其子项
                    const parts = partsMap[parentKey] || []
                    const childItems = childItemsMap[parentKey] || []
                    
                    const childKeys = [
                      ...parts.map(p => 'part-' + p.id),
                      ...childItems.map(c => 'child-' + c.id)
                    ]
                    
                    setSelectedRowKeys(prev => Array.from(new Set([...prev, parentKey, ...childKeys])))
                    return
                  }
                }
              }
              
              // 处理父级行取消选择
              if (removedKeys.length > 0) {
                const parentKey = removedKeys.find(k => !k.startsWith('part-') && !k.startsWith('child-'))
                if (parentKey) {
                  const parts = partsMap[parentKey] || []
                  const childItems = childItemsMap[parentKey] || []
                  
                  const childKeys = [
                    ...parts.map(p => 'part-' + p.id),
                    ...childItems.map(c => 'child-' + c.id)
                  ]
                  
                  // 取消选择父级及其子项
                  setSelectedRowKeys(prev => prev.filter(k => k !== parentKey && !childKeys.includes(k)))
                  return
                }
              }
              
              setSelectedRowKeys(newKeys)
            },
            onSelectAll: (selected) => {
              const currentList = ensureBlankToolings(visibleData).filter(r => !String(r.id || '').startsWith('blank-'))
              if (selected) {
                // 仅针对当前列表的父级行选择，以及其已加载子项
                const allKeys: string[] = []
                currentList.forEach(parent => {
                  const pid = String(parent.id)
                  allKeys.push(pid)
                  const parts = partsMap[pid] || []
                  allKeys.push(...parts.map(p => 'part-' + p.id))
                  const childItems = childItemsMap[pid] || []
                  allKeys.push(...childItems.map(c => 'child-' + c.id))
                })
                setSelectedRowKeys(prev => Array.from(new Set([...prev, ...allKeys])))
              } else {
                // 仅取消当前列表父级及其已加载子项，不影响其它已选内容
                const removeSet = new Set<string>()
                currentList.forEach(parent => {
                  const pid = String(parent.id)
                  removeSet.add(pid)
                  const parts = partsMap[pid] || []
                  parts.forEach(p => removeSet.add('part-' + p.id))
                  const childItems = childItemsMap[pid] || []
                  childItems.forEach(c => removeSet.add('child-' + c.id))
                })
                setSelectedRowKeys(prev => prev.filter(k => !removeSet.has(k)))
              }
            },
            columnWidth: 40,
            getCheckboxProps: (record: any) => ({ disabled: String(record?.id || '').startsWith('blank-') })
          }}
          expandIconColumnIndex={-1}
          expandable={{
            expandedRowKeys,
            rowExpandable: (record: any) => !String(record.id || '').startsWith('blank-'),
            onExpand: (expanded, record: any) => {
              const id = record.id as string
              setExpandedRowKeys(prev => expanded ? [...prev, id] : prev.filter(k => k !== id))
              if (expanded) {
                if (!partsMap[id] || partsMap[id].length === 0) fetchPartsData(id)
                if (!childItemsMap[id] || childItemsMap[id].length === 0) fetchChildItemsData(id)
              }
            },
            expandRowByClick: false,
            indentSize: 0,
            expandIcon: () => null,
            expandedRowRender: (record: any) => {
              const toolingId = record.id as string
              
              // 零件信息表格
              const partsContent = (() => {
                const list = partsMap[toolingId] || []
                const processedList = ensureBlankParts(toolingId, list as any)
                const parent = data.find(d => d.id === toolingId) as any
                const parentProject = parent?.project_name || ''
                const parentUnit = parent?.production_unit || ''
                const parentApplicant = parent?.recorder || ''

                // 优化：预先计算所有零件的重量，避免在 render 函数中重复计算
                const weightCache = new Map<string, number>()
                const getWeight = (rec: PartItem): number => {
                  if (weightCache.has(rec.id)) {
                    return weightCache.get(rec.id)!
                  }
                  const w = rec.weight
                  const weight = w && w > 0 ? w : calculatePartWeight(rec.specifications || {}, rec.material_id || '', rec.part_category || '', partTypes, materials)
                  weightCache.set(rec.id, weight)
                  return weight
                }

                const isPartReady = (rec: PartItem): boolean => {
                  const nameOk = !!String(rec.part_name || '').trim()
                  const q = (rec as any).part_quantity
                  const qtyOk = !(q === '' || q === null || typeof q === 'undefined') && Number(q) > 0
                  const demandDateOk = !!String((rec as any).remarks || '').match(/\d{4}-\d{2}-\d{2}/)
                  const projectOk = !!String(parentProject).trim()
                  const prodUnitOk = !!String(parentUnit).trim()
                  const applicantOk = !!String(parentApplicant).trim()
                  const msName = materialSources.find(ms => String(ms.id) === String((rec as any).material_source_id))?.name || ''
                  const normalized = String(msName || '').replace(/\s+/g, '').toLowerCase()
                  const sourceOk = normalized.includes('外购') || normalized.includes('waigou') || normalized.includes('采购')
                  return nameOk && qtyOk && demandDateOk && projectOk && prodUnitOk && applicantOk && sourceOk
                }
                const cols = [
                  {
                    title: '盘存编号',
                    dataIndex: 'part_inventory_number',
                    width: 160,
                    render: (text: string, rec: PartItem) => (
                      <EditableCell
                        value={text || ''}
                        record={rec as any}
                        dataIndex={'part_inventory_number' as any}
                        onSave={(pid, _k, v) => handlePartSave(toolingId, pid, 'part_inventory_number', v)}
                      />
                    )
                  },
                  {
                    title: '图号',
                    dataIndex: 'part_drawing_number',
                    width: 180,
                    render: (text: string, rec: PartItem) => (
                      <EditableCell
                        value={text || ''}
                        record={rec as any}
                        dataIndex={'part_drawing_number' as any}
                        onSave={(pid, _k, v) => handlePartSave(toolingId, pid, 'part_drawing_number', v)}
                      />
                    )
                  },
                  {
                    title: '零件名称',
                    dataIndex: 'part_name',
                    width: 180,
                    render: (text: string, rec: PartItem) => (
                      <EditableCell
                        value={text || ''}
                        record={rec as any}
                        dataIndex={'part_name' as any}
                        onSave={(pid, _k, v) => handlePartSave(toolingId, pid, 'part_name', v)}
                      />
                    )
                  },
                  {
                    title: '数量',
                    dataIndex: 'part_quantity',
                    width: 80,
                    render: (text: string, rec: PartItem) => (
                      <EditableCell
                        value={text as any}
                        record={rec as any}
                        dataIndex={'part_quantity' as any}
                        onSave={(pid, _k, v) => handlePartSave(toolingId, pid, 'part_quantity', v)}
                      />
                    )
                  },
                  {
                    title: '材质',
                    dataIndex: 'material_id',
                    width: 160,
                    render: (text: string, rec: PartItem) => (
                      <EditableCell
                        value={materials.find(m => m.id === text)?.name || ''}
                        record={rec as any}
                        dataIndex={'material_id' as any}
                        options={materialOptions}
                        onSave={(_pid, _k, v) => {
                          const selectedMaterial = materials.find(m => m.name === v)
                          handlePartSave(toolingId, rec.id, 'material_id', selectedMaterial?.id || '')
                        }}
                      />
                    )
                  },
                  {
                    title: '材料来源',
                    dataIndex: 'material_source_id',
                    width: 160,
                    render: (text: string, rec: PartItem) => (
                      <EditableCell
                        value={materialSourceNameMap[String(text)] || (rec as any)?.material_source?.name || ''}
                        record={rec as any}
                        dataIndex={'material_source_id' as any}
                        options={materialSourceOptions}
                        onSave={(_pid, _k, v) => {
                          // 导入的数据可能不存在于映射中，需要从materialSources中查找一次（防御性编程）
                          const selectedSource = materialSources.find(ms => ms.name === v)
                          const oldSource = materialSourceNameMap[String(rec.material_source_id)] || 
                                           (rec as any)?.material_source?.name || 
                                           materialSources.find(ms => String(ms.id) === String(rec.material_source_id))?.name || ''
                          const newSource = v
                          
                          if (rec.id.startsWith('blank-')) {
                             handlePartSave(toolingId, rec.id, 'material_source_id', selectedSource?.id || '')
                             return
                          }

                          const updates: any = { material_source_id: selectedSource?.id || '' }
                          
                          // 如果材料来源从外购改为其他，需要处理备注字段
                          // 仅当oldSource确认为“外购”时才执行此逻辑，防止因识别错误导致的误判
                          if (oldSource === '外购' && newSource !== '外购') {
                             // 如果原来的备注看起来是日期格式（包含-），则重置为需调质，否则保留
                             if (rec.remarks && rec.remarks.includes('-')) {
                                updates.remarks = '需调质'
                             }
                          } else if (newSource === '外购' && oldSource !== '外购') {
                             // 切到外购，清空备注以便填写日期
                             updates.remarks = ''
                          }
                          
                          handlePartBatchSave(toolingId, rec.id, updates)
                        }}
                      />
                    )
                  },
                  {
                    title: '料型',
                    dataIndex: 'part_category',
                    width: 160,
                    render: (text: string, rec: PartItem) => (
                      <EditableCell
                        value={text || ''}
                        record={rec as any}
                        dataIndex={'part_category' as any}
                        options={partTypeOptions}
                        onSave={(pid, _k, v) => handlePartSave(toolingId, pid, 'part_category', v)}
                      />
                    )
                  },
                  {
                    title: '规格',
                    dataIndex: 'specifications',
                    width: 200,
                    render: (text: string, rec: PartItem) => (
                      <SpecificationsInput
                        specs={rec.specifications || {}}
                        partType={rec.part_category}
                        partTypes={partTypes}
                        onSave={(v) => handlePartSave(toolingId, rec.id, 'specifications', v)}
                      />
                    )
                  },
                  {
                    title: '备注',
                    dataIndex: 'remarks',
                    width: 160,
                    render: (text: string, rec: PartItem) => {
                      const materialSource = materialSourceNameMap[String(rec.material_source_id)] || (rec as any)?.material_source?.name || ''
                      
                      if (materialSource === '外购') {
                        return (
                          <EditableCell
                            value={text || ''}
                            record={rec as any}
                            dataIndex={'remarks' as any}
                            onSave={(pid, _k, v) => handlePartSave(toolingId, pid, 'remarks', v)}
                          />
                        )
                      }
                      
                      if (materialSource === '') {
                        return null
                      }
                      
                      return (
                        <input
                          type="checkbox"
                          checked={text === '需调质'}
                          onChange={(e) => handlePartSave(toolingId, rec.id, 'remarks', e.target.checked ? '需调质' : '')}
                          style={{
                            width: '16px',
                            height: '16px',
                            margin: '0 auto',
                            display: 'block'
                          }}
                        />
                      )
                    }
                  },
                  {
                    title: '重量(kg)',
                    dataIndex: 'weight',
                    width: 100,
                    render: (_text: number, rec: PartItem) => {
                      const qty = (() => {
                        const q = rec.part_quantity as any
                        const n = typeof q === 'number' ? q : parseFloat(String(q || '0'))
                        return isNaN(n) ? 0 : n
                      })()
                      const unitW = getWeight(rec)
                      const totalWeight = qty > 0 && unitW > 0 ? Math.round(qty * unitW * 1000) / 1000 : null
                      return (
                        <span>
                          {totalWeight ? `${totalWeight.toFixed(3)}` : '-'}
                        </span>
                      )
                    }
                  },
                  {
                    title: '金额(元)',
                    dataIndex: 'total_price',
                    width: 160,
                    render: (_text: number, rec: PartItem) => {
                      const qty = (() => {
                        const q = rec.part_quantity as any
                        const n = typeof q === 'number' ? q : parseFloat(String(q || '0'))
                        return isNaN(n) ? 0 : n
                      })()
                      const unitW = getWeight(rec)
                      const totalWeight = qty > 0 && unitW > 0 ? Math.round(qty * unitW * 1000) / 1000 : 0
                      const material = materials.find(m => m.id === rec.material_id)
                      const unitPrice = material ? 50 : 0
                      const totalPrice = calculateTotalPrice(totalWeight, unitPrice)
                      return (
                        <span>
                          {totalPrice ? `¥${totalPrice.toFixed(2)}` : '-'}
                        </span>
                      )
                    }
                  },
                  {
                    title: '状态',
                    dataIndex: '__status',
                    width: 160,
                    render: (_t: any, rec: PartItem) => {
                      const statusKey = `status_part_${rec.id}`
                      let derived = safeLocalStorage.getItem(statusKey) || ''
                      try {
                        const plans = JSON.parse(safeLocalStorage.getItem('temporary_plans') || '[]')
                        const hit = plans.flatMap((g: any) => g.items || []).find((it: any) => it.part_id === rec.id)
                        if (hit) {
                          if (hit.arrival_date) derived = '已到货'
                          else if (hit.purchaser && String(hit.purchaser).trim()) derived = '采购中'
                          else derived = '审批中'
                        }
                      } catch {}
                      const keyCandidate = String(rec.part_inventory_number || rec.inventory_number || '').trim().toUpperCase()
                      let route = String((rec as any).process_route || '')
                      if (!route && keyCandidate) {
                        route = (keyCandidate && processRoutes[keyCandidate]) || ''
                        if (!route) {
                          let longest = ''
                          Object.keys(processRoutes).forEach(k => { if (keyCandidate.startsWith(k) && k.length > longest.length) longest = k })
                          if (longest) route = processRoutes[longest]
                        }
                      }
                      const steps = route ? route.split(/\s*→\s*/) : []
                      const completed = new Set((workHoursData[keyCandidate] || []).map(x => String(x).trim().toLowerCase()))
                      let latest = ''
                      for (const s of steps) { const t = s.trim().toLowerCase(); if (completed.has(t)) latest = s }
                      if (!latest) latest = processDoneMap[keyCandidate]?.last || ''
                      const txt = latest ? `${latest}` : derived
                      const color = latest ? '#28a745' : '#1890ff'
                      return <span style={{ color }}>{txt || '-'}</span>
                    }
                  },
                  {
                    title: '工艺路线',
                    dataIndex: 'process_route',
                    width: 320,
                    onCell: () => ({ onMouseDown: (e: any) => e.stopPropagation(), onClick: (e: any) => e.stopPropagation() }),
                    render: (_t: any, rec: PartItem) => {
                      const keyCandidate = String(rec.part_inventory_number || rec.inventory_number || '').trim().toUpperCase()
                      let currentRoute = String((rec as any).process_route || '')
                      if (!currentRoute && keyCandidate) {
                        currentRoute = (keyCandidate && processRoutes[keyCandidate]) || ''
                        if (!currentRoute) {
                          let longest = ''
                          Object.keys(processRoutes).forEach(k => {
                            if (keyCandidate.startsWith(k) && k.length > longest.length) longest = k
                          })
                          if (longest) currentRoute = processRoutes[longest]
                        }
                      }
                      const inventoryNo = String(rec.part_inventory_number || rec.inventory_number || '').trim().toUpperCase()
                      const completedSet = new Set<string>((workHoursData[inventoryNo] || []).map(x => x.trim().toLowerCase()))
                      const display = (val: string | undefined) => {
                        const route = String(val || '')
                        if (!route) return <span style={{ color: '#999' }}>-</span>
                        const steps = route.split(/\s*→\s*/).filter(Boolean)
                        return (
                          <span>
                            {steps.map((s, i) => {
                              const ok = completedSet.has(s.trim().toLowerCase())
                              return <span key={i} style={{ color: ok ? '#28a745' : '#333', fontWeight: 400 }}>{s}{i < steps.length - 1 ? '→' : ''}</span>
                            })}
                          </span>
                        )
                      }
                      return (
                        <EditableCell
                          value={currentRoute}
                          record={rec}
                          dataIndex="process_route"
                          renderDisplay={display}
                          onSave={async (id: string, key: keyof PartItem, value: string) => {
                            try {
                              // 更新本地零件数据
                              setPartsMap(prev => {
                                const newPartsMap = { ...prev }
                                Object.keys(newPartsMap).forEach(toolingId => {
                                  newPartsMap[toolingId] = newPartsMap[toolingId].map(part => 
                                    part.id === id ? { ...part, process_route: value } : part
                                  )
                                })
                                return newPartsMap
                              })
                               
                              // 保存到后端
                              const success = await savePartData(id, { process_route: value })
                              if (success) {
                                // 更新本地缓存
                                if (rec.part_inventory_number) {
                                  const newProcessRoutes = {
                                    ...processRoutes,
                                    [String(rec.part_inventory_number).trim().toUpperCase()]: value
                                  }
                                  try {
                                    const json = JSON.stringify(newProcessRoutes)
                                    if (json.length <= 900_000) {
                                      safeLocalStorage.setItem('process_routes_map', json)
                                    } else {
                                      message.warning('工艺路线缓存过大，已跳过写入本地缓存')
                                    }
                                  } catch {
                                    message.warning('本地缓存写入失败，已跳过（可能空间不足/浏览器禁用存储）')
                                  }
                                  setProcessRoutes(newProcessRoutes)
                                }
                              }
                            } catch (error) {
                              console.error('保存工艺路线失败:', error)
                              message.error('保存工艺路线失败，请重试')
                            }
                          }}
                        />
                      )
                    }
                  }
                ]
                
                return (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontWeight: 600, marginBottom: 8, color: '#1890ff' }}>零件信息</div>
                    <Table
                      rowKey="id"
                      columns={cols as any}
                      dataSource={processedList as any}
                      pagination={false}
                    bordered={false}
                    onRow={(rec: any) => ({
                      className: isPartReady(rec) ? 'text-blue-600' : undefined
                    })}
                    rowSelection={{
                        selectedRowKeys: selectedRowKeys.filter(k => k.startsWith('part-')).map(k => k.slice(5)),
                        onChange: (keys) => {
                          const prefixed = (keys as string[]).map(k => 'part-' + k)
                          setSelectedRowKeys(prev => {
                            const others = prev.filter(k => {
                              if (!k.startsWith('part-')) return true
                              return !processedList.some((p: any) => ('part-' + p.id) === k)
                            })
                            const merged = Array.from(new Set([...others, ...prefixed]))
                            return merged
                          })
                        },
                        columnWidth: 40,
                        getCheckboxProps: (rec: any) => ({ disabled: String(rec.id || '').startsWith('blank-') }),
                        checkStrictly: true
                      }}
                    />
                  </div>
                )
              })()

              // 标准件信息表格
              const childContent = (() => {
                const childList = childItemsMap[toolingId] || []
                const processedList = ensureBlankChildItems(childList, toolingId)
                const parent = data.find(d => d.id === toolingId) as any
                const parentProject = parent?.project_name || ''
                const parentUnit = parent?.production_unit || ''
                const parentApplicant = parent?.recorder || ''

                const isChildReady = (rec: ChildItem): boolean => {
                  const nameOk = !!String(rec.name || '').trim()
                  const modelOk = !!String(rec.model || '').trim()
                  const qtyOk = Number(rec.quantity || 0) > 0
                  const unitOk = !!String(rec.unit || '').trim()
                  const demandDateOk = !!String(rec.required_date || '').trim()
                  const projectOk = !!String(parentProject).trim()
                  const prodUnitOk = !!String(parentUnit).trim()
                  const applicantOk = !!String(parentApplicant).trim()
                  return nameOk && modelOk && qtyOk && unitOk && demandDateOk && projectOk && prodUnitOk && applicantOk
                }

                const childCols = [
                  {
                    title: '序号',
                    dataIndex: '__seq',
                    width: 60,
                    render: (_text: any, _record: ChildItem, index: number) => (
                      <span style={{ display: 'inline-block', width: '100%', textAlign: 'center', color: '#888' }}>
                        {index + 1}
                      </span>
                    )
                  },
                  {
                    title: '名称',
                    dataIndex: 'name',
                    width: 180,
                    render: (text: string, rec: ChildItem) => (
                      <EditableCell
                        value={text || ''}
                        record={rec as any}
                        dataIndex={'name' as any}
                        onSave={(pid, _k, v) => handleChildItemSave(toolingId, pid, 'name', v)}
                      />
                    )
                  },
                  {
                    title: '型号',
                    dataIndex: 'model',
                    width: 150,
                    render: (text: string, rec: ChildItem) => (
                      <EditableCell
                        value={text || ''}
                        record={rec as any}
                        dataIndex={'model' as any}
                        onSave={(pid, _k, v) => handleChildItemSave(toolingId, pid, 'model', v)}
                      />
                    )
                  },
                  {
                    title: '数量',
                    dataIndex: 'quantity',
                    width: 80,
                    render: (text: number, rec: ChildItem) => (
                      <EditableCell
                        value={text as any}
                        record={rec as any}
                        dataIndex={'quantity' as any}
                        onSave={(pid, _k, v) => handleChildItemSave(toolingId, pid, 'quantity', v)}
                      />
                    )
                  },
                  {
                    title: '单位',
                    dataIndex: 'unit',
                    width: 80,
                    render: (text: string, rec: ChildItem) => (
                      <EditableCell
                        value={text || ''}
                        record={rec as any}
                        dataIndex={'unit' as any}
                        onSave={(pid, _k, v) => handleChildItemSave(toolingId, pid, 'unit', v)}
                      />
                    )
                  },
                  {
                    title: '需求日期',
                    dataIndex: 'required_date',
                    width: 160,
                    render: (text: string, rec: ChildItem) => (
                      <EditableCell
                        value={text || ''}
                        record={rec as any}
                        dataIndex={'required_date' as any}
                        onSave={(pid, _k, v) => handleChildItemSave(toolingId, pid, 'required_date', v)}
                      />
                    )
                  },
                  {
                    title: '状态',
                    dataIndex: '__status',
                    width: 120,
                    render: (_t: any, rec: ChildItem) => {
                      const statusKey = `status_child_${rec.id}`
                      let derived = safeLocalStorage.getItem(statusKey) || ''
                      try {
                        const plans = JSON.parse(safeLocalStorage.getItem('temporary_plans') || '[]')
                        const hit = plans.flatMap((g: any) => g.items || []).find((it: any) => it.child_item_id === rec.id)
                        if (hit) {
                          if (hit.arrival_date) derived = '已到货'
                          else if (hit.purchaser && String(hit.purchaser).trim()) derived = '采购中'
                          else derived = '审批中'
                        }
                      } catch {}
                      return <span style={{ color: '#1890ff' }}>{derived || '-'}</span>
                    }
                  }
                ]

                return (
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 8, color: '#52c41a' }}>标准件信息</div>
                    <Table
                      rowKey="id"
                      columns={childCols as any}
                      dataSource={processedList as any}
                      pagination={false}
                    bordered={false}
                    size="small"
                      onRow={(rec: any) => ({
                        className: isChildReady(rec) ? 'text-blue-600' : undefined
                      })}
                    rowSelection={{
                        selectedRowKeys: selectedRowKeys.filter(k => k.startsWith('child-')).map(k => k.slice(6)),
                        onChange: (keys) => {
                          const prefixed = (keys as string[]).map(k => 'child-' + k)
                          setSelectedRowKeys(prev => {
                            const others = prev.filter(k => {
                              if (!k.startsWith('child-')) return true
                              return !processedList.some(p => ('child-' + p.id) === k)
                            })
                            const merged = Array.from(new Set([...others, ...prefixed]))
                            return merged
                          })
                        },
                        columnWidth: 40,
                        getCheckboxProps: (rec: any) => ({ disabled: String(rec.id || '').startsWith('blank-') }),
                        checkStrictly: true
                      }}
                    />
                  </div>
                )
              })()

              return (
                <div style={{ padding: '16px 24px', background: '#fafafa' }}>
                  {partsContent}
                  {childContent}
                </div>
              )
            }
          }}
        />
      </div>
      
      {/* 导入二次弹窗 */}
      <Modal
        title="导入工装信息"
        open={importModalVisible}
        onCancel={() => setImportModalVisible(false)}
        footer={null}
        width={600}
        destroyOnHidden
      >
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold mb-2">导入说明</h3>
            <ul className="list-disc list-inside space-y-1 text-gray-600">
              <li>请严格按照模板格式填写工装信息</li>
              <li>必填字段不可为空，请参考模板中的示例数据</li>
              <li>日期格式为YYYY-MM-DD</li>
              <li>零件盘存编号格式：父表盘存编号+两位序号（如：LD26010101）</li>
              <li>"父表盘存编号"必须与工装信息表中的"盘存编号"完全一致</li>
              <li>批量导入前请先备份现有数据</li>
            </ul>
          </div>
          
          <div>
            <h3 className="text-lg font-semibold mb-2">操作步骤</h3>
            <ol className="list-decimal list-inside space-y-1 text-gray-600">
              <li>点击下方按钮下载导入模板</li>
              <li>打开模板并按照要求填写数据</li>
              <li>保存填写好的Excel文件</li>
              <li>点击"选择文件"按钮上传填写好的文件</li>
              <li>在预览页面检查数据，确认无误后点击"确认导入"</li>
            </ol>
          </div>
          
          <div className="flex flex-col space-y-4">
            <Button type="primary" onClick={downloadImportTemplate} block>
              下载导入模板
            </Button>
            
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
              <p className="text-gray-600 mb-4">选择要导入的Excel文件</p>
              <input
                ref={importFileInputRef}
                type="file"
                accept=".xlsx,.xls,.xlsm"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
              <Button 
                type="default" 
                icon={<UploadOutlined />}
                onClick={() => importFileInputRef.current?.click()}
              >
                选择文件
              </Button>
              <p className="text-xs text-gray-500 mt-2">支持 .xlsx, .xls, .xlsm 格式</p>
            </div>
          </div>
        </div>
      </Modal>
      
      {/* 导入预览模态框 */}
      <Modal
        title="导入预览"
        open={importPreviewVisible}
        onCancel={cancelImport}
        footer={[
          <Button key="cancel" onClick={cancelImport}>取消</Button>,
          <Button key="confirm" type="primary" onClick={confirmImport}>
            确认导入
          </Button>
        ]}
        width={1200}
        destroyOnHidden
      >
        <div className="mb-4">
          <p>共 {importPreviewData.length} 条工装记录，其中有效记录 {importPreviewData.filter(item => item._valid).length} 条，无效记录 {importPreviewData.filter(item => !item._valid).length} 条。</p>
          <p style={{ color: '#f5222d' }}>红色标记的记录为无效记录，将被跳过。</p>
        </div>
        <Table
          dataSource={importPreviewData}
          columns={importPreviewColumns}
          rowKey="_index"
          pagination={false}
          scroll={{ x: 1000 }}
          rowClassName={(record: any) => record._valid ? '' : 'bg-red-50'}
          expandable={{
            expandedRowRender: (record: any) => {
              return (
                <div style={{ padding: '16px 24px', background: '#fafafa' }}>
                  {/* 零件信息表格 */}
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontWeight: '600', marginBottom: '8px', color: '#1890ff' }}>零件信息</div>
                    <Table
                      dataSource={record._parts}
                      columns={importPartsColumns}
                      rowKey={(record: any) => `part_${record['父表盘存编号']}_${record['盘存编号']}_${record['图号']}`}
                      pagination={false}
                      scroll={{ x: 1000 }}
                      rowClassName={(record: any) => record._valid ? '' : 'bg-red-50'}
                    />
                  </div>
                  
                  {/* 标准件信息表格 */}
                  <div>
                    <div style={{ fontWeight: '600', marginBottom: '8px', color: '#52c41a' }}>标准件信息</div>
                    <Table
                      dataSource={record._childItems}
                      columns={importChildItemsColumns}
                      rowKey={(record: any) => `child_${record['父表盘存编号']}_${record['名称']}_${record['型号']}`}
                      pagination={false}
                      scroll={{ x: 1000 }}
                      rowClassName={(record: any) => record._valid ? '' : 'bg-red-50'}
                    />
                  </div>
                </div>
              )
            },
            rowExpandable: () => true,
            expandRowByClick: false,
            indentSize: 0
          }}
        />
      </Modal>
    </Card>
  )
}

export default ToolingInfoPage
