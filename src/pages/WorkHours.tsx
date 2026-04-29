import React from 'react'
import { Card, Typography, Form, Select, Input, InputNumber, DatePicker, Button, message, Table, Space, Modal, AutoComplete } from 'antd'
import { ReloadOutlined, LeftOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useAuthStore } from '../stores/authStore'
import { fetchWithFallback } from '../utils/api'
import { useNavigate } from 'react-router-dom'
import { upsertProcessDone } from '../utils/processDone'
import QuickTimeInput from '../components/QuickTimeInput'

// 立即在全局作用域定义setAuxRange函数，确保在任何地方调用都不会出错
;(function() {
  if (typeof window !== 'undefined') {
    // 使用类型断言避免TypeScript错误
    (window as any).setAuxRange = function(range: any) {
      // 空函数，用于防止setAuxRange is not defined错误
    };
  }
})();

// 添加CSS样式，隐藏DatePicker和TimePicker的默认灰色提示文字
const WorkHoursFormStyle = {
  '.work-hours-form .ant-picker-input > input::placeholder': {
    color: 'transparent !important',
  },
  '.work-hours-form .ant-picker-input > input::-webkit-input-placeholder': {
    color: 'transparent !important',
  },
  '.work-hours-form .ant-picker-input > input::-moz-placeholder': {
    color: 'transparent !important',
  },
  '.work-hours-form .ant-picker-input > input:-ms-input-placeholder': {
    color: 'transparent !important',
  }
};

type WorkHoursMode = 'entry' | 'recent'

const WorkHours: React.FC<{ mode?: WorkHoursMode }> = ({ mode }) => {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const viewMode = mode || 'entry'
  const showEntry = viewMode === 'entry'
  const showRecent = viewMode === 'recent'
  const [invOptions, setInvOptions] = React.useState<any[]>([])
  const [loadingInv, setLoadingInv] = React.useState(false)
  const [selectedInv, setSelectedInv] = React.useState<string>('')
  const [selectedInvType, setSelectedInvType] = React.useState<string>('')
  const [selectedInfo, setSelectedInfo] = React.useState<{ name?: string; drawing?: string }>({})
  const [deviceOptions, setDeviceOptions] = React.useState<any[]>([])
  const [deviceName, setDeviceName] = React.useState<string>('')
  const [selectedDeviceMaxAuxMinutes, setSelectedDeviceMaxAuxMinutes] = React.useState<number | null>(null)
  const [processOptions, setProcessOptions] = React.useState<string[]>([])
  const [fixedInvOptions, setFixedInvOptions] = React.useState<any[]>([])
  const [useManualProcess, setUseManualProcess] = React.useState(false)
  const [manualProcessHint, setManualProcessHint] = React.useState('请填写当前工序')
  const [recentItems, setRecentItems] = React.useState<any[]>([])
  const [loadingRecent, setLoadingRecent] = React.useState(false)
  const [selectedRecentKeys, setSelectedRecentKeys] = React.useState<React.Key[]>([])
  const [lastCompletedTime, setLastCompletedTime] = React.useState<string>('')
  // 添加 completedTime 状态来替代 form 中的 completed_time 字段
  const [completedTime, setCompletedTime] = React.useState<string>('')
  const [partMetaMap, setPartMetaMap] = React.useState<Record<string, { name: string; drawing: string }>>({})
  const normalizePartKey = React.useCallback((v: any) => {
    return String(v || '')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/[^A-Za-z0-9]/g, '')
      .trim()
      .toUpperCase()
  }, [])
  const resolvePartMeta = React.useCallback((row: any) => {
    const inv = normalizePartKey(row?.part_inventory_number)
    const draw = normalizePartKey(row?.part_drawing_number)
    return (inv && partMetaMap[inv]) || (draw && partMetaMap[draw]) || null
  }, [partMetaMap, normalizePartKey])
  const resolvePartName = React.useCallback((row: any) => {
    const byMeta = resolvePartMeta(row)?.name
    if (byMeta) return byMeta
    const direct = String(row?.part_name || '').trim()
    if (direct) return direct
    return '-'
  }, [resolvePartMeta])
  const resolvePartDrawingNumber = React.useCallback((row: any) => {
    const byMeta = resolvePartMeta(row)?.drawing
    if (byMeta) return byMeta
    const direct = String(row?.part_drawing_number || '').trim()
    if (direct) return direct
    return '-'
  }, [resolvePartMeta])
  const getAuxMinutesFromRow = React.useCallback((row: any) => {
    const toMin = (t: string) => { const [h, m] = String(t || '').split(':').map((x) => Number(x || 0)); return h * 60 + m }
    if (row?.aux_start_time && row?.aux_end_time) {
      const s = toMin(String(row.aux_start_time || ''))
      const e = toMin(String(row.aux_end_time || ''))
      return e >= s ? (e - s) : (e + 1440 - s)
    }
    return Math.max(0, Math.round(Number(row?.aux_hours || 0) * 60))
  }, [])
  const invAbortRef = React.useRef<AbortController | null>(null)
  const invTimerRef = React.useRef<any>(null)
  const invCacheRef = React.useRef<any[]>([])
  const invReqSeqRef = React.useRef(0)
  


  // 使用Form.useWatch监听所有必要的表单字段，确保组件能及时重新渲染，避免直接调用form.getFieldValue导致的警告
  const wProcMinutes = Form.useWatch('proc_minutes', form)
  const wDeviceNo = Form.useWatch('device_no', form)
  const wShift = Form.useWatch('shift', form)
  const wProcessName = Form.useWatch('process_name', form)
  const wCompletedQuantity = Form.useWatch('completed_quantity', form)
  const wAuxCount = Form.useWatch('aux_count', form)
  const wProcessQuantity = Form.useWatch('process_quantity', form)
  const wShiftDate = Form.useWatch('shift_date', form)
  
  // 关键修复：添加Form.useWatch监听辅助开始和结束时间变化
  // 这会确保当用户选择时间时，组件会重新渲染，触发calculateAuxDuration函数重新计算
  const wAuxStart = Form.useWatch('aux_start', form)
  const wAuxDurationMinutes = Form.useWatch('aux_duration_minutes', form)
  const isNonProduction = selectedInvType === 'non_production'
  const wAuxEnd = React.useMemo(() => {
    if (!wAuxStart || wAuxDurationMinutes === undefined || wAuxDurationMinutes === null) return null
    const dur = Math.max(0, Number(wAuxDurationMinutes || 0))
    return dayjs(wAuxStart).add(dur, 'minute')
  }, [wAuxStart, wAuxDurationMinutes])
  const resolveWorkDate = React.useCallback((shiftDate: any, shift: any, auxStart: any, auxEnd: any) => {
    const baseDate = dayjs(shiftDate || undefined)
    if (!baseDate.isValid()) return null
    const shiftText = String(shift || '')
    if (!shiftText) return null
    const isNightShift = shiftText === '夜班'
    if (!isNightShift) return baseDate
    const nextDayCutoffMinutes = 12 * 60
    const toMinutes = (t: any) => (t ? (t.hour() * 60 + t.minute()) : null)
    const auxStartMinutes = toMinutes(auxStart)
    const auxEndMinutes = toMinutes(auxEnd)
    const crossMidnight = !!(auxStart && auxEnd && (
      auxEnd.hour() < auxStart.hour() ||
      (auxEnd.hour() === auxStart.hour() && auxEnd.minute() < auxStart.minute())
    ))
    const isAfterMidnightInNightShift = (auxStartMinutes !== null && auxStartMinutes < nextDayCutoffMinutes)
      || (auxEndMinutes !== null && auxEndMinutes < nextDayCutoffMinutes)
    return (crossMidnight || isAfterMidnightInNightShift) ? baseDate.add(1, 'day') : baseDate
  }, [])
  const wWorkDate = React.useMemo(() => resolveWorkDate(wShiftDate, wShift, wAuxStart, wAuxEnd), [resolveWorkDate, wShiftDate, wShift, wAuxStart, wAuxEnd])
  const auxEndDisplay = React.useMemo(() => {
    if (!wWorkDate || !wAuxStart || !wAuxEnd) return '-'
    const start = dayjs(wWorkDate).hour(wAuxStart.hour()).minute(wAuxStart.minute())
    const endRaw = dayjs(wWorkDate).hour(wAuxEnd.hour()).minute(wAuxEnd.minute())
    const end = endRaw.isBefore(start) ? endRaw.add(1, 'day') : endRaw
    return end.format('MM-DD HH:mm')
  }, [wWorkDate, wAuxStart, wAuxEnd])
  const isSubmitDisabled = !wShift
    || !selectedInv
    || !wProcessName
    || !wAuxStart
    || !wAuxEnd
    || wAuxDurationMinutes === undefined
    || wAuxDurationMinutes === null
    || !wShiftDate
    || (!isNonProduction && (
      !wDeviceNo
      || !wProcMinutes
      || wCompletedQuantity === undefined
      || wCompletedQuantity === null
      || wAuxCount === undefined
      || wAuxCount === null
      || wProcessQuantity === undefined
      || wProcessQuantity === null
    ))

  React.useEffect(() => {
    if (!wDeviceNo) {
      setSelectedDeviceMaxAuxMinutes(null)
      return
    }
    const found = deviceOptions.find((d: any) => String(d?.value || '') === String(wDeviceNo || ''))
    const maxAux = Number(found?.meta?.max_aux_minutes)
    setSelectedDeviceMaxAuxMinutes(Number.isFinite(maxAux) ? maxAux : null)
  }, [wDeviceNo, deviceOptions])



  // 彻底修复的完成时间计算
  React.useEffect(() => {
    if (wAuxEnd && wAuxStart && wProcMinutes !== undefined && wAuxDurationMinutes !== undefined && wAuxDurationMinutes !== null) {
      // 获取当前工作日期
      const workDate = wWorkDate
      if (workDate && workDate.isValid()) {
        // 创建辅助开始和结束的完整日期时间对象
        const auxStartTime = dayjs(workDate).hour(wAuxStart.hour()).minute(wAuxStart.minute())
        const auxEndTime = dayjs(workDate).hour(wAuxEnd.hour()).minute(wAuxEnd.minute())
        
        // 如果辅助结束时间早于辅助开始时间，说明跨天了，需要加1天
        const actualAuxEndTime = auxEndTime.isBefore(auxStartTime) ? auxEndTime.add(1, 'day') : auxEndTime
        
        // 直接使用wProcMinutes，它已经是最新值
        const calculatedCompletedTime = actualAuxEndTime.add(wProcMinutes, 'minute')
        
        // 格式化显示
        const formattedTime = calculatedCompletedTime.format('MM-DD HH:mm')
        
        // 更新状态完成时间，不再使用form
        setCompletedTime(formattedTime)
        
        // 调试输出，方便查看计算过程
        console.log('完成时间计算：', {
          auxStart: auxStartTime.format('YYYY-MM-DD HH:mm'),
          auxEnd: auxEndTime.format('YYYY-MM-DD HH:mm'),
          actualAuxEnd: actualAuxEndTime.format('YYYY-MM-DD HH:mm'),
          wProcMinutes,
          completedTime: calculatedCompletedTime.format('YYYY-MM-DD HH:mm'),
          formattedTime
        })
      } else {
        // 更新状态完成时间，不再使用form
        setCompletedTime('')
      }
    } else {
      // 更新状态完成时间，不再使用form
      setCompletedTime('')
    }
  }, [wProcMinutes, wAuxStart, wAuxEnd, wAuxDurationMinutes, wWorkDate, form])



  React.useEffect(() => {
    let cancelled = false
    const fetchLastForDevice = async () => {
      if (!wDeviceNo) {
        if (!cancelled) setLastCompletedTime('')
        return
      }
      try {
        const params = new URLSearchParams()
        params.set('page', '1')
        params.set('pageSize', '200')
        params.set('order', 'created_at')
        params.set('order_dir', 'desc')
        params.set('device_no', String(wDeviceNo))
        const resp = await fetchWithFallback(`/api/tooling/work-hours?${params.toString()}`)
        if (!resp.ok) throw new Error(`API请求失败: ${resp.status} ${resp.statusText}`)
        const json = await resp.json()
        const rows = Array.isArray(json?.items)
          ? json.items
          : (Array.isArray(json?.data) ? json.data : (Array.isArray(json) ? json : []))
        let latest: dayjs.Dayjs | null = null
        let latestOperator = ''
        for (const row of rows) {
          const workDate = dayjs(String(row?.work_date || ''))
          if (!workDate.isValid()) continue
          const start = String(row?.aux_start_time || '')
          const end = String(row?.aux_end_time || '')
          if (!start || !end) continue
          const [sHour, sMin] = start.split(':').map((x: string) => Number(x || 0))
          const [eHour, eMin] = end.split(':').map((x: string) => Number(x || 0))
          const auxStartTime = dayjs(workDate).hour(sHour).minute(sMin)
          const auxEndTime = dayjs(workDate).hour(eHour).minute(eMin)
          const actualAuxEndTime = auxEndTime.isBefore(auxStartTime) ? auxEndTime.add(1, 'day') : auxEndTime
          const procMinutes = Math.round(Number(row?.proc_hours || 0) * 60)
          const doneAt = actualAuxEndTime.add(procMinutes, 'minute')
          if (!latest || doneAt.valueOf() > latest.valueOf()) {
            latest = doneAt
            latestOperator = String(row?.operator || '').trim()
          }
        }
        if (!cancelled) {
          setLastCompletedTime(latest ? `${latest.format('MM-DD HH:mm')}${latestOperator ? ` (${latestOperator})` : ''}` : '')
        }
      } catch {
        if (!cancelled) setLastCompletedTime('')
      }
    }
    fetchLastForDevice()
    return () => {
      cancelled = true
    }
  }, [wDeviceNo])

  const fetchInventory = async (q: string, fixedOverride?: any[]) => {
    const requestSeq = ++invReqSeqRef.current
    const keyword = String(q || '').trim()
    const normalize = (v: string) => String(v || '').replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/[^A-Za-z0-9]/g, '').toUpperCase()
    const filterFromCache = (searchText: string) => {
      const nq = normalize(searchText)
      if (!nq) return [...invCacheRef.current]
      return invCacheRef.current.filter((opt: any) => {
        const label = normalize(String(opt?.label || ''))
        const value = normalize(String(opt?.value || ''))
        const name = normalize(String(opt?.meta?.part_name || ''))
        return label.includes(nq) || value.includes(nq) || name.includes(nq)
      })
    }
    try {
      setLoadingInv(true)
      if (invAbortRef.current) invAbortRef.current.abort()
      invAbortRef.current = new AbortController()
      const ts = Date.now()
      if (keyword && invCacheRef.current.length > 0) {
        setInvOptions(filterFromCache(keyword))
      }
      const fetchInventoryPage = async (searchText: string, page: number, signal?: AbortSignal) => {
        const pageSize = searchText ? 300 : 500
        let lastError = ''
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            const resp = await fetchWithFallback(`/api/tooling/parts/inventory-list?page=${page}&pageSize=${pageSize}&search=${encodeURIComponent(searchText)}&_ts=${ts}` , { signal })
            if (!resp.ok) {
              let detail = ''
              try {
                const errJson = await resp.json()
                detail = String(errJson?.error || errJson?.message || '').trim()
              } catch {}
              const suffix = detail ? ` - ${detail}` : ''
              throw new Error(`API请求失败: ${resp.status}${suffix}`)
            }
            const json = await resp.json()
            return Array.isArray(json?.items) ? json.items : (Array.isArray(json?.data) ? json.data : [])
          } catch (err: any) {
            if (signal?.aborted) throw err
            lastError = String(err?.message || '获取盘存编号失败')
            if (attempt < 2) {
              await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)))
            }
          }
        }
        throw new Error(lastError || '获取盘存编号失败')
      }
      let invItems = await fetchInventoryPage(keyword, 1, invAbortRef.current.signal)
      if (keyword && invItems.length === 0) {
        const allRows: any[] = []
        for (let page = 1; page <= 6; page += 1) {
          const rows = await fetchInventoryPage('', page, invAbortRef.current.signal)
          allRows.push(...rows)
          if (rows.length < 500) break
        }
        const nq = normalize(keyword)
        invItems = allRows.filter((it: any) => {
          const inv = normalize(String(it?.part_inventory_number || it?.inventory_number || ''))
          const name = normalize(String(it?.part_name || ''))
          const drawing = normalize(String(it?.part_drawing_number || ''))
          return inv.includes(nq) || name.includes(nq) || drawing.includes(nq)
        })
      }
      const formatInventoryLabel = (inventoryNo: string, partName: string) => {
        const inv = String(inventoryNo || '').trim()
        const name = String(partName || '').trim()
        return name ? `${inv} | ${name}` : inv
      }
      const formatMaintenanceLabel = (inventoryNo: string, partName: string) => {
        const inv = String(inventoryNo || '').trim()
        return inv
      }
      const mergedByInv = new Map<string, any>()
      ;[...invItems].forEach((it: any) => {
        const inv = String(it.part_inventory_number || it.inventory_number || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim()
        if (!inv) return
        const key = normalize(inv)
        const partName = String(it.part_name || '').trim()
        if (!mergedByInv.has(key)) {
          mergedByInv.set(key, {
            value: inv,
            label: formatInventoryLabel(inv, partName),
            meta: {
              part_name: partName,
              part_drawing_number: String(it.part_drawing_number || ''),
              process_route: String(it.process_route || '')
            },
            type: 'inventory'
          })
        }
      })
      const invOpts = Array.from(mergedByInv.values())

      let maintenanceOpts: any[] = []
      const fixedSource = Array.isArray(fixedOverride) ? fixedOverride : fixedInvOptions
      maintenanceOpts = fixedSource
        .map((mo: any) => {
          const rawVal = String(mo?.value ?? mo?.option_value ?? mo?.inventory_number ?? '').trim()
          const rawLabel = String(mo?.label ?? mo?.option_label ?? rawVal).trim()
          const isNonProduction = /非生产/.test(`${rawVal} ${rawLabel}`)
          return {
            label: formatMaintenanceLabel(rawVal, rawLabel),
            value: rawVal,
            type: isNonProduction ? 'non_production' : 'maintenance',
            meta: {
              part_name: rawLabel,
              part_drawing_number: '-',
              process_route: ''
            }
          }
        })
        .filter((x: any) => !!x.value)
      if (q) {
        const lowerQ = q.toLowerCase()
        maintenanceOpts = maintenanceOpts.filter(opt =>
          String(opt.value).toLowerCase().includes(lowerQ) ||
          String(opt.meta.part_name).toLowerCase().includes(lowerQ)
        )
      }
      const maintenanceValues = new Set(maintenanceOpts.map((o: any) => normalize(String(o?.value || ''))))
      const normalInvOpts = invOpts.filter((o: any) => !maintenanceValues.has(normalize(String(o?.value || ''))))
      const combined = [...maintenanceOpts, ...normalInvOpts]
      if (requestSeq !== invReqSeqRef.current) return
      if (!keyword) {
        invCacheRef.current = combined
      } else if (combined.length > 0) {
        const byValue = new Set(invCacheRef.current.map((it: any) => String(it?.value || '')))
        combined.forEach((it: any) => {
          const value = String(it?.value || '')
          if (!value || byValue.has(value)) return
          byValue.add(value)
          invCacheRef.current.push(it)
        })
      }
      setInvOptions(combined.length > 0 ? combined : filterFromCache(keyword))
    } catch (e: any) {
      console.error('Fetch inventory failed', e)
      if (requestSeq !== invReqSeqRef.current) return
      if (invCacheRef.current.length > 0) {
        setInvOptions(filterFromCache(String(q || '').trim()))
      } else {
        message.error(e?.message || '获取盘存编号失败')
      }
    } finally {
      if (requestSeq === invReqSeqRef.current) {
        setLoadingInv(false)
      }
    }
  }

  const onSelectInv = (val: string, option: any) => {
    setSelectedInv(String(val || ''))
    if (!val) {
      setSelectedInvType('')
      setSelectedInfo({})
      setProcessOptions([])
      setManualProcessHint('请填写当前工序')
      setUseManualProcess(false)
      setDeviceName('')
      setSelectedDeviceMaxAuxMinutes(null)
      return
    }
    const meta = option?.meta
    setSelectedInfo({ name: meta?.part_name || '', drawing: meta?.part_drawing_number || '' })
    const optType = String(option?.type || '')
    setSelectedInvType(optType)
    const isFixed = optType === 'fixed' || optType === 'maintenance' || optType === 'non_production'
    const route = String(meta?.process_route || '')
    const items = route.split('→').map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean)
    const shouldManual = isFixed || items.length === 0
    if (optType === 'non_production') {
      setManualProcessHint('请填写劳动内容')
    } else if (optType === 'maintenance' || optType === 'fixed') {
      setManualProcessHint('请填写维修的模具名称')
    } else {
      setManualProcessHint('请填写当前工序')
    }
    setUseManualProcess(shouldManual)
    if (shouldManual) {
      setProcessOptions([])
    } else {
      setProcessOptions(items)
    }
    if (optType === 'non_production') {
      form.setFieldsValue({
        device_no: undefined,
        aux_count: undefined,
        proc_minutes: undefined,
        process_quantity: undefined,
        completed_quantity: undefined
      })
      setDeviceName('')
      setSelectedDeviceMaxAuxMinutes(null)
      setLastCompletedTime('')
    }
  }

  React.useEffect(() => {
    fetchRecent()
    if (viewMode === 'entry') {
      ;(async () => {
        const fixed = await fetchFixedOptions()
        await fetchDevices()
        await fetchInventory('', fixed)
      })()
    }
    if (viewMode === 'recent') {
      fetchPartNameMap()
    }
  }, [viewMode])

  // 获取零件名称映射
  const fetchPartNameMap = async () => {
    try {
      const pageSize = 1000
      let page = 1
      const all: any[] = []
      while (true) {
        const r = await fetchWithFallback(`/api/tooling/parts/inventory-list?page=${page}&pageSize=${pageSize}`)
        if (!r.ok) {
          throw new Error(`API请求失败: ${r.status} ${r.statusText}`)
        }
        const j = await r.json()
        const rows = Array.isArray(j?.items) ? j.items : (Array.isArray(j?.data) ? j.data : [])
        all.push(...rows)
        if (rows.length < pageSize) break
        page += 1
      }
      const map: Record<string, { name: string; drawing: string }> = {}
      const upsertMeta = (key: string, meta: { name: string; drawing: string }) => {
        if (!key) return
        const prev = map[key]
        if (!prev) {
          map[key] = meta
          return
        }
        map[key] = {
          name: prev.name || meta.name,
          drawing: prev.drawing || meta.drawing
        }
      }
      all.forEach((p: any) => {
        const name = String(p.part_name || '').trim()
        const drawing = String(p.part_drawing_number || '').trim()
        const inv = normalizePartKey(p.part_inventory_number)
        const draw = normalizePartKey(p.part_drawing_number)
        upsertMeta(inv, { name, drawing })
        upsertMeta(draw, { name, drawing })
      })
      setPartMetaMap(map)
    } catch {}
  }

  const fetchFixedOptions = async () => {
    const host = typeof window !== 'undefined' ? String(window.location?.host || '') : ''
    const isGhPages = /github\.io/i.test(host)
    const supUrl = (import.meta as any)?.env?.VITE_SUPABASE_URL || 'https://oltsiocyesbgezlrcxze.supabase.co'
    const restBase = String(supUrl).replace(/\/$/, '') + '/rest/v1'
    const r = await fetchWithFallback(isGhPages ? `${restBase}/fixed_inventory_options?select=*` : '/api/tooling/fixed-inventory-options')
    if (!r.ok) {
      throw new Error(`API请求失败: ${r.status} ${r.statusText}`)
    }
    const j = await r.json()
    const fixedItems = Array.isArray(j?.items) ? j.items : (Array.isArray(j?.data) ? j.data : (Array.isArray(j) ? j : []))
    const opts = fixedItems
      .filter((x: any) => x.is_active !== false)
      .map((x: any) => ({
        value: String(x.option_value || x.inventory_number || '').trim(),
        label: String(x.option_value || x.inventory_number || '').trim(),
        option_label: String(x.option_label || x.name || '').trim(),
        meta: null,
        type: 'fixed'
      }))
      .filter((x: any) => !!x.value)
    setFixedInvOptions(opts)
    return opts
  }

  const fetchDevices = async () => {
    let lastError = ''
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const r = await fetchWithFallback('/api/tooling/devices')
        if (!r.ok) {
          let detail = ''
          try {
            const errJson = await r.json()
            detail = String(errJson?.error || errJson?.message || '').trim()
          } catch {}
          const suffix = detail ? ` - ${detail}` : ''
          throw new Error(`API请求失败: ${r.status}${suffix}`)
        }
        const j = await r.json()
        const deviceItems = Array.isArray(j?.items) ? j.items : (Array.isArray(j?.data) ? j.data : (Array.isArray(j) ? j : []))
        const uniqueDevices = new Map<string, any>()
        deviceItems.forEach((d: any) => {
          const val = String(d.device_no || '')
          if (!val) return
          if (!uniqueDevices.has(val)) {
            const maxAux = Number(d.max_aux_minutes)
            uniqueDevices.set(val, {
              value: val,
              label: `${val}-${String(d.device_name || '')}`,
              meta: {
                device_name: String(d.device_name || ''),
                max_aux_minutes: Number.isFinite(maxAux) ? maxAux : null
              }
            })
          }
        })
        const list = Array.from(uniqueDevices.values())
        list.sort((a, b) => String(a.value).localeCompare(String(b.value), 'zh-Hans-CN', { numeric: true }))
        setDeviceOptions(list)
        return
      } catch (e: any) {
        lastError = String(e?.message || '加载设备编号失败')
        if (attempt < 2) {
          await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)))
        }
      }
    }
    setDeviceOptions([])
    throw new Error(lastError || '加载设备编号失败')
  }

  const handleRefresh = async () => {
    if (showRecent) {
      setSelectedRecentKeys([])
      await fetchRecent()
      await fetchPartNameMap()
      return
    }
    setSelectedInv('')
    setSelectedInfo({})
    setProcessOptions([])
    setDeviceName('')
    setSelectedDeviceMaxAuxMinutes(null)
    form.resetFields()
    const fixed = await fetchFixedOptions()
    await Promise.all([fetchInventory('', fixed), fetchDevices()])
    await fetchRecent()
  }

  const handleGoRecent = () => navigate('/work-hours-recent')
  const handleGoEntry = () => navigate('/work-hours')

  const fetchRecent = async () => {
    try {
      setLoadingRecent(true)
      const params = new URLSearchParams()
      params.set('page', '1')
      params.set('pageSize', '50')
      params.set('order', 'created_at')
      params.set('order_dir', 'desc')
      if (user?.real_name) params.set('operator', user.real_name)
      const resp = await fetchWithFallback(`/api/tooling/work-hours?${params.toString()}`)
      if (!resp.ok) {
        throw new Error(`API请求失败: ${resp.status} ${resp.statusText}`)
      }
      const json = await resp.json()
      const rawItems = Array.isArray(json?.items)
        ? json.items
        : (Array.isArray(json?.data) ? json.data : (Array.isArray(json) ? json : []))
      if (json?.success || rawItems.length > 0) {
        const items = rawItems.map(item => {
          const auxCount = Math.max(Number(item.aux_count || 1), 1)
          const processQuantity = Math.max(Number(item.process_quantity || 1), 1)
          const auxMinutes = getAuxMinutesFromRow(item)
          const singleAuxMinutesRaw = Number(item.single_aux_minutes)
          const singleAuxCountRaw = Number(item.single_aux_count)
          return ({
          id: String(item.id || ''),
          part_inventory_number: String(item.part_inventory_number || ''),
          part_drawing_number: String(item.part_drawing_number || ''),
          part_name: String(item.part_name || ''),
          hours: Number(item.hours || 0),
          aux_hours: Number(item.aux_hours || 0),
          proc_hours: Number(item.proc_hours || 0),
          aux_start_time: String(item.aux_start_time || ''),
          aux_end_time: String(item.aux_end_time || ''),
          work_date: String(item.work_date || ''),
          shift_date: String(item.shift_date || ''),
          process_name: String(item.process_name || ''),
          operator: String(item.operator || ''),
          aux_count: auxCount,
          process_quantity: processQuantity,
          single_aux_minutes: Number.isFinite(singleAuxMinutesRaw) && singleAuxMinutesRaw > 0 ? singleAuxMinutesRaw : (auxCount > 0 ? (auxMinutes / auxCount) : 0),
          single_aux_count: Number.isFinite(singleAuxCountRaw) && singleAuxCountRaw > 0 ? singleAuxCountRaw : (processQuantity > 0 ? (auxCount / processQuantity) : 0),
          completed_quantity: Number(item.completed_quantity || 0),
          device_no: String(item.device_no || ''),
          shift: String(item.shift || ''),
          created_at: String(item.created_at || '')
        })})
        setRecentItems(items)
      } else {
        setRecentItems([])
      }
    } finally {
      setLoadingRecent(false)
    }
  }

  // 计算子表格中需要合并的列的rowSpan
  const getRowSpanConfig = (data: any[]) => {
    const result = Array.from({ length: data.length }, () => ({ shouldRender: true, rowSpan: 1 }))
    let i = 0
    while (i < data.length) {
      const r = data[i]
      const key = `${r.shift_date || r.work_date}-${r.shift}`
      let j = i + 1
      while (j < data.length) {
        const nr = data[j]
        const nkey = `${nr.shift_date || nr.work_date}-${nr.shift}`
        if (nkey !== key) break
        j++
      }
      const span = j - i
      result[i] = { shouldRender: true, rowSpan: span }
      for (let k = i + 1; k < j; k++) {
        result[k] = { shouldRender: false, rowSpan: 0 }
      }
      i = j
    }
    return result
  };

  // 计算最近提交记录的统计数据，用于日统计、日辅助、日程序列
  const recentStats = React.useMemo(() => {
    if (!showRecent) return {}
    const statsMap: Record<string, { statHours: number; auxHours: number; procHours: number; runningCount: number }> = {};
    const deviceSetMap: Record<string, Set<string>> = {};
    
    // 遍历所有最近提交记录，计算每个日期和班次的统计数据
    recentItems.forEach(r => {
      const key = `${r.work_date}-${r.shift}`;
      if (!statsMap[key]) {
        statsMap[key] = { statHours: 0, auxHours: 0, procHours: 0, runningCount: 0 };
        deviceSetMap[key] = new Set<string>();
      }
      
      const toMin = (t: string) => { const [h,m] = String(t||'').split(':').map((x)=>Number(x||0)); return h*60+m };
      let auxMinutes = 0;
      if (r.aux_start_time && r.aux_end_time) {
        const s = toMin(r.aux_start_time);
        const e = toMin(r.aux_end_time);
        auxMinutes = e >= s ? (e - s) : (e + 1440 - s);
      } else {
        auxMinutes = Math.round(Number(r.aux_hours || 0) * 60);
      }
      
      const procMinutes = Math.round(Number(r.proc_hours || 0) * 60);
      const statMinutes = auxMinutes + procMinutes;
      
      statsMap[key].statHours += statMinutes;
      statsMap[key].auxHours += auxMinutes;
      statsMap[key].procHours += procMinutes;
      
      // 统计开动设备数量
      if (procMinutes > 0 && r.device_no) {
        deviceSetMap[key].add(r.device_no);
      }
    });
    
    // 计算开动设备数量
    Object.keys(statsMap).forEach(key => {
      statsMap[key].runningCount = deviceSetMap[key].size;
    });
    
    return statsMap;
  }, [recentItems, showRecent]);

  // 将最近提交表格的columns数组提取出来，并使用useMemo缓存，避免每次渲染都重新创建
  const recentColumns = React.useMemo(() => {
    if (!showRecent) return [] as any
    // 需要合并的列
    const mergeColumns = ['shift_date', 'shift', 'daily_stat_hours', 'daily_aux_hours', 'daily_proc_hours', 'running_count'];
    
    // 基础列配置
    const baseColumns = [
      { title: '班次日期', dataIndex: 'shift_date', align: 'center' },
      { title: '班次', dataIndex: 'shift', align: 'center' },
      { title: '日统计', key: 'daily_stat_hours', render: (_: any, r: any) => {
        const key = `${r.work_date}-${r.shift}`;
        const sum = recentStats[key]?.statHours || 0;
        return (sum / 60).toFixed(2);
      }, width: 60, align: 'center' },
      { title: '日辅助', key: 'daily_aux_hours', render: (_: any, r: any) => {
        const key = `${r.work_date}-${r.shift}`;
        const sum = recentStats[key]?.auxHours || 0;
        return (sum / 60).toFixed(2);
      }, width: 60, align: 'center' },
      { title: '日程序', key: 'daily_proc_hours', render: (_: any, r: any) => {
        const key = `${r.work_date}-${r.shift}`;
        const sum = recentStats[key]?.procHours || 0;
        return (sum / 60).toFixed(2);
      }, width: 60, align: 'center' },
      { title: '开动', key: 'running_count', render: (_: any, r: any) => {
        const key = `${r.work_date}-${r.shift}`;
        return recentStats[key]?.runningCount || 0;
      }, width: 50, align: 'center' },
      { title: '盘存编号', dataIndex: 'part_inventory_number', align: 'center' },
      { title: '图号', key: 'part_drawing_number', render: (_: any, r: any) => resolvePartDrawingNumber(r), align: 'center' },
      { title: '零件名称', key: 'part_name', render: (_: any, r: any) => resolvePartName(r), align: 'center' },
      { title: '工序', dataIndex: 'process_name', align: 'center' },
      { title: '设备编号', key: 'device', render: (_: any, r: any) => {
        return r.device_no || '-' 
      }, width: 80, align: 'center' },
      { title: '辅助时间', key: 'work_date_aux', render: (_: any, r: any) => {
        const fmt = (t: string) => {
          const s = String(t || '')
          if (!s) return '-' 
          return s.length >= 5 ? s.slice(0, 5) : s
        }
        const toMin = (t: string) => { const [h,m] = String(t||'').split(':').map((x)=>Number(x||0)); return h*60+m }
        const hasBoth = !!r.aux_start_time && !!r.aux_end_time
        let auxTime = '-' 
        if (hasBoth) {
          const s = toMin(r.aux_start_time)
          const e = toMin(r.aux_end_time)
          const mins = e >= s ? (e - s) : (e + 1440 - s)
          auxTime = `${fmt(r.aux_start_time)}--${fmt(r.aux_end_time)} (${mins})`
        }
        return auxTime
      }, width: 180, align: 'center' },
      { title: '辅助', dataIndex: 'aux_hours', render: (_: any, r: any) => {
        const toMin = (t: string) => { const [h,m] = String(t||'').split(':').map((x)=>Number(x||0)); return h*60+m }
        let mins = 0
        if (r.aux_start_time && r.aux_end_time) {
          const s = toMin(r.aux_start_time)
          const e = toMin(r.aux_end_time)
          mins = e >= s ? (e - s) : (e + 1440 - s)
        } else {
          mins = Math.round(Number(r.aux_hours||0)*60)
        }
        return String(mins)
      }, width: 60, align: 'center' },
      { title: '程序', dataIndex: 'proc_hours', render: (v: number) => ((Number(v||0)*60).toFixed(0)), width: 60, align: 'center' },
      { title: '辅助次数', dataIndex: 'aux_count', render: (v: any) => String(Math.max(Number(v || 1), 1)), width: 70, align: 'center' },
      { title: '加工数量', dataIndex: 'process_quantity', render: (v: any) => String(Math.max(Number(v || 1), 1)), width: 70, align: 'center' },
      { title: '单次辅助时长', dataIndex: 'single_aux_minutes', render: (v: any) => Number(v || 0).toFixed(1), width: 90, align: 'center' },
      { title: '单件辅助次数', dataIndex: 'single_aux_count', render: (v: any) => Number(v || 0).toFixed(2), width: 90, align: 'center' },
      { title: '统计', key: 'stat_hours', render: (_: any, r: any) => {
        const toMin = (t: string) => { const [h,m] = String(t||'').split(':').map((x)=>Number(x||0)); return h*60+m }
        let auxMinutes = 0
        if (r.aux_start_time && r.aux_end_time) {
          const s = toMin(r.aux_start_time)
          const e = toMin(r.aux_end_time)
          auxMinutes = e >= s ? (e - s) : (e + 1440 - s)
        } else {
          auxMinutes = Math.round(Number(r.aux_hours || 0) * 60)
        }
        const procMinutes = Math.round(Number(r.proc_hours || 0) * 60)
        // 简化计算，不考虑系数，直接相加
        const statMinutes = auxMinutes + procMinutes
        return statMinutes.toFixed(0)
      }, width: 60, align: 'center' },
      { title: '完成时间', key: 'completed_time', render: (_: any, r: any) => {
        if (!r.aux_start_time || !r.aux_end_time) return '-' 
        
        // 解析加工日期
        const workDate = dayjs(r.work_date || undefined)
        if (!workDate.isValid()) return '-' 
        
        // 解析辅助开始时间和辅助结束时间
        const auxStartTime = dayjs(`${r.work_date} ${r.aux_start_time}`)
        const auxEndTime = dayjs(`${r.work_date} ${r.aux_end_time}`)
        
        // 如果辅助结束时间早于辅助开始时间，说明跨越了一天
        const actualAuxEndTime = auxEndTime.isBefore(auxStartTime) 
          ? auxEndTime.add(1, 'day') 
          : auxEndTime
        
        // 计算程序时长（小时）
        const procHours = Number(r.proc_hours || 0)
        
        // 计算完成时间
        const completedTime = actualAuxEndTime.add(procHours, 'hour')
        
        return completedTime.format('MM-DD HH:mm')
      }, width: 100, align: 'center' },
      { title: '完成数量', dataIndex: 'completed_quantity', align: 'center' }
    ] as any;
    
    // 计算rowSpan配置
    const rowSpanConfig = getRowSpanConfig(recentItems);
    
    // 为需要合并的列添加onCell属性
    return baseColumns.map(col => {
      const shouldMerge = mergeColumns.includes(col.dataIndex || col.key);
      
      if (shouldMerge) {
        return {
          ...col,
          onCell: (_: any, index: number) => {
            const config = rowSpanConfig[index];
            return {
              rowSpan: config.rowSpan
            };
          }
        };
      }
      return col;
    });
  }, [recentItems, recentStats, resolvePartName, resolvePartDrawingNumber, showRecent])

  return (
    <div className="work-hours-container">
      <style>{`
        .work-hours-container { padding: 8px; max-width: 520px; margin: 0 auto; }
        .work-hours-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
        .work-hours-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 6px; row-gap: 6px; }
        .work-hours-item { min-width: 0; }
        .work-hours-card { border-radius: 12px; }
        .work-hours-info { background: #fafafa; border: 1px solid #f0f0f0; border-radius: 8px; padding: 8px 10px; min-height: 56px; }
        .work-hours-form .ant-form-item-label > label { font-weight: 500; }
        .work-hours-form .ant-picker,
        .work-hours-form .ant-input,
        .work-hours-form .ant-select,
        .work-hours-form .ant-input-number { width: 100%; }
        .work-hours-form .line-row { display: flex; align-items: stretch; gap: 8px; margin-bottom: 10px; }
        .work-hours-form .line-label {
          width: 86px;
          flex: 0 0 86px;
          min-height: 38px;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          font-size: 14px;
          line-height: 1.3;
          text-align: right;
          padding-right: 2px;
          white-space: nowrap;
          color: rgba(0, 0, 0, 0.88);
        }
        .work-hours-form .line-value { flex: 1; min-width: 0; }
        .work-hours-form .line-value .ant-form-item { margin-bottom: 0; }
        .work-hours-form .line-hint {
          margin-top: 4px;
          color: rgba(0, 0, 0, 0.45);
          font-size: 12px;
          line-height: 1.35;
        }
        .work-hours-form .line-value .ant-picker,
        .work-hours-form .line-value .ant-input,
        .work-hours-form .line-value .ant-input-number,
        .work-hours-form .line-value .ant-select-selector {
          min-height: 38px !important;
          height: 38px !important;
          font-size: 14px;
          border-radius: 8px !important;
        }
        .work-hours-form .line-value .ant-input,
        .work-hours-form .line-value .ant-picker .ant-picker-input > input,
        .work-hours-form .line-value .ant-input-number .ant-input-number-input {
          height: 36px;
          line-height: 36px;
          font-size: 14px;
        }
        .work-hours-form .line-value .ant-input-number .ant-input-number-input-wrap {
          height: 100%;
        }
        .work-hours-form .line-value .ant-select-single .ant-select-selector .ant-select-selection-item,
        .work-hours-form .line-value .ant-select-single .ant-select-selector .ant-select-selection-placeholder {
          line-height: 36px !important;
          font-size: 14px;
        }
        .work-hours-form .line-static {
          min-height: 38px;
          display: flex;
          align-items: center;
          border: 1px solid #d9d9d9;
          border-radius: 8px;
          padding: 0 10px;
          background: #fff;
          font-size: 14px;
        }
        .work-hours-form .line-static-label {
          color: rgba(0, 0, 0, 0.45);
          margin-right: 0;
          white-space: nowrap;
        }
        .work-hours-form .line-static-value {
          color: rgba(0, 0, 0, 0.88);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .work-hours-form .line-static-hint {
          color: #69b1ff;
        }
        .work-hours-form .ant-btn {
          min-height: 40px;
          font-size: 15px;
          border-radius: 8px;
        }
        @media (min-width: 768px) {
          .work-hours-container { max-width: 900px; }
          .work-hours-row { column-gap: 12px; row-gap: 12px; }
        }
        @media (min-width: 1024px) {
          .work-hours-container { max-width: 980px; }
          .work-hours-row { display: grid; grid-template-columns: repeat(2, minmax(260px, 1fr)); column-gap: 16px; row-gap: 12px; }
          .work-hours-item { min-width: 0; }
        }
        @media (min-width: 1200px) {
          .work-hours-container { max-width: 1100px; }
        }
      `}</style>
      <div className="work-hours-header">
        <Space>
          {showEntry && (
            <Button onClick={handleGoRecent}>最近提交</Button>
          )}
          <Button icon={<ReloadOutlined />} onClick={handleRefresh}>刷新</Button>
          {showRecent && (
            <Button onClick={handleGoEntry}>返回录入</Button>
          )}
          <Button icon={<LeftOutlined />} onClick={() => navigate('/dashboard')}>返回</Button>
        </Space>
      </div>
      {showEntry && (
      <Card className="work-hours-card" styles={{ body: { padding: 10 } }}>
        <Form
          layout="vertical"
          size="small"
          form={form}
          className="work-hours-form"
          validateTrigger="onChange"
          onFinish={async (vals) => {
            if (!vals.shift) {
              message.warning('请选择班次后再提交')
              return
            }
            if (!selectedInv) {
              message.warning('请先选择盘存编号')
              return
            }
            const isNonProd = selectedInvType === 'non_production'
            const auxCount = isNonProd ? 1 : Math.max(Number(vals.aux_count || 1), 1)
            const processQuantity = isNonProd ? 1 : Math.max(Number(vals.process_quantity || 1), 1)
            const auxMinutes = Math.max(0, Number(vals.aux_duration_minutes || 0))
            const procMinutesInput = isNonProd ? 0 : Math.max(0, Number(vals.proc_minutes || 0))
            if (auxMinutes > 660) {
              message.error('辅助时长不能超过660分钟')
              return
            }
            if (!isNonProd && procMinutesInput > 660) {
              message.error('程序时长不能超过660分钟')
              return
            }
            const singleAuxMinutes = auxCount > 0 ? (auxMinutes / auxCount) : 0
            const singleAuxCount = processQuantity > 0 ? (auxCount / processQuantity) : 0
            if (!isNonProd && selectedDeviceMaxAuxMinutes !== null && singleAuxMinutes > selectedDeviceMaxAuxMinutes) {
              message.error(`单次辅助时长(${singleAuxMinutes.toFixed(1)}分钟)不能超过设备最大辅助时间(${selectedDeviceMaxAuxMinutes}分钟)`)
              return
            }
            // Validate device time order against last record for the same device
            const deviceNo = isNonProd ? '' : form.getFieldValue('device_no')
            if (deviceNo) {
              let lastSame: any = null
              try {
                const params = new URLSearchParams()
                params.set('page', '1')
                params.set('pageSize', '200')
                params.set('order', 'created_at')
                params.set('order_dir', 'desc')
                params.set('device_no', String(deviceNo || ''))
                const resp = await fetchWithFallback(`/api/tooling/work-hours?${params.toString()}`)
                if (resp.ok) {
                  const json = await resp.json()
                  const rows = Array.isArray(json?.items)
                    ? json.items
                    : (Array.isArray(json?.data) ? json.data : (Array.isArray(json) ? json : []))
                  lastSame = Array.isArray(rows) ? rows[0] : null
                }
              } catch {}
              if (lastSame) {
                const toMin = (t: string) => { const [h,m] = String(t||'').split(':').map((x)=>Number(x||0)); return h*60+m }
                const pad = (n: number) => String(n).padStart(2,'0')
                if (!lastSame.aux_end_time) {
                  message.error('该设备上一个作业尚未结束，请先补充结束时间或删除后再提交')
                  return
                }
                if (vals.aux_start) {
                  const submitWorkDate = resolveWorkDate(vals.shift_date, vals.shift, vals.aux_start, wAuxEnd)
                  if (!submitWorkDate) {
                    message.error('班次日期无效，请重新选择')
                    return
                  }
                  const endMin = toMin(lastSame.aux_end_time)
                  const pm = Math.round(Number(lastSame.proc_hours || 0) * 60)
                  const compTotal = endMin + pm
                  const daysAdd = Math.floor(compTotal / 1440)
                  const comp = compTotal % 1440
                  const hh = Math.floor(comp / 60)
                  const mi = comp % 60
                  const prevEndTs = dayjs(lastSame.work_date).add(daysAdd, 'day').hour(hh).minute(mi).valueOf()
                  const currStartTs = dayjs(submitWorkDate).hour(vals.aux_start.hour()).minute(vals.aux_start.minute()).valueOf()
                  if (currStartTs < prevEndTs) {
                    message.error('本次辅助起始时间早于该设备上一次结束时间，请调整后再提交')
                    return
                  }
                }
              }
            }
            const hide = message.loading('提交中...', 0)
            const auxStart = wAuxStart ? wAuxStart.format('HH:mm') : ''
            const auxEnd = wAuxEnd ? wAuxEnd.format('HH:mm') : ''
            const auxHours = auxMinutes / 60
            const procHours = procMinutesInput / 60
            const submitWorkDate = resolveWorkDate(vals.shift_date, vals.shift, vals.aux_start, wAuxEnd)
            if (!submitWorkDate) {
              hide()
              message.error('班次日期无效，请重新选择')
              return
            }
            let latestOperator = String(user?.real_name || '')
            try {
              const uid = String((user as any)?.id || '').trim()
              if (uid) {
                const meResp = await fetchWithFallback(`/api/auth/me?userId=${encodeURIComponent(uid)}`)
                if (meResp.ok) {
                  const meJson = await meResp.json()
                  const meName = String(meJson?.user?.real_name || '').trim()
                  if (meName) latestOperator = meName
                }
              }
            } catch {}
            // 确保payload中的所有属性都是基本类型，避免循环引用警告
            const payload = {
              part_inventory_number: String(selectedInv),
              part_drawing_number: String(selectedInfo.drawing || ''),
              part_name: String(selectedInfo.name || ''),
              hours: Number(auxHours + procHours),
              aux_hours: Number(auxHours),
              proc_hours: Number(procHours),
              aux_start_time: String(auxStart || ''),
              aux_end_time: String(auxEnd || ''),
              work_date: String(submitWorkDate.format('YYYY-MM-DD')),
              shift_date: String(vals.shift_date?.format('YYYY-MM-DD') || ''),
              process_name: String(vals.process_name || ''),
              operator: latestOperator,
              user_id: String((user as any)?.id || ''),
              user_phone: String((user as any)?.phone || ''),
              aux_count: Number(auxCount),
              process_quantity: Number(processQuantity),
              single_aux_minutes: Number(singleAuxMinutes),
              single_aux_count: Number(singleAuxCount),
              completed_quantity: isNonProd ? 0 : Number(vals.completed_quantity || 0),
              device_no: isNonProd ? '' : String(vals.device_no || ''),
              shift: String(vals.shift || '')
            }
            try {
              const resp = await fetchWithFallback('/api/tooling/work-hours', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
              if (!resp.ok) {
                let detail = ''
                try {
                  const errJson = await resp.json()
                  detail = String(errJson?.error || errJson?.message || '').trim()
                } catch {}
                const suffix = detail ? ` - ${detail}` : ''
                throw new Error(`API请求失败: ${resp.status}${suffix}`)
              }
              const json = await resp.json()
              if (json?.success) {
                hide()
                message.success('提交成功')
                
                // 广播工时提交事件，通知其他页面刷新数据
                try {
                  const bc = new BroadcastChannel('work_hours_channel')
                  bc.postMessage({ type: 'work_hours_submitted', inventoryNo: selectedInv, processName: vals.process_name, timestamp: Date.now() })
                  bc.close()
                } catch {}
                
                // 使用try-catch防止setAuxRange错误
                try {
                  try {
                    const k = String(selectedInv || selectedInfo.drawing || '')
                    if (k) {
                      await upsertProcessDone(k, String(vals.process_name || ''))
                    }
                  } catch {}
                  // 直接清空所有状态
                  setSelectedInv('')
                  setSelectedInvType('')
                  setSelectedInfo({})
                  setProcessOptions([])
                  setManualProcessHint('请填写当前工序')
                  setDeviceName('')
                  setSelectedDeviceMaxAuxMinutes(null)
                  setUseManualProcess(false)
                  
                  // 强制清空所有表单字段，不依赖setFieldsValue
                  form.resetFields()
                  
                  // 额外清除，确保字段被清空 - 使用适当的空值而非undefined，避免JSON.stringify循环引用警告
                  form.setFieldValue('aux_start', null)
                  form.setFieldValue('aux_duration_minutes', null)
                  form.setFieldValue('aux_count', null)
                  form.setFieldValue('process_quantity', null)
                  form.setFieldValue('process_name', '')
                  form.setFieldValue('device_no', '')
                  form.setFieldValue('proc_minutes', null)
                  form.setFieldValue('completed_quantity', null)
                  
                  // 刷新最近提交列表
                  await fetchRecent()
                } catch (e: any) {
                  // 忽略所有错误，确保提交成功提示正常显示
                  console.error('重置表单时出错:', e)
                }
              } else {
                hide()
                message.error(json?.error || '提交失败')
              }
            } catch (e: any) {
              hide()
              message.error(e?.message || '网络错误')
            }
          }}
        >
          <div className="line-row">
            <div className="line-label">班次日期：</div>
            <div className="line-value">
              <Form.Item name="shift_date" rules={[{ required: true, message: '请选择班次日期' }]} preserve={false}>
                <DatePicker placeholder="请先选择起始日期" style={{ width: '100%' }} />
              </Form.Item>
            </div>
          </div>

          <div className="line-row">
            <div className="line-label">当班班次：</div>
            <div className="line-value">
              <Form.Item name="shift" rules={[{ required: true, message: '请选择班次' }]}>
                <Select
                  placeholder="联动加工日期"
                  options={[
                    { label: '白班', value: '白班' },
                    { label: '夜班', value: '夜班' }
                  ]}
                />
              </Form.Item>
            </div>
          </div>

          <div className="line-row">
            <div className="line-label">盘存编号：</div>
            <div className="line-value">
              <Select
                placeholder="一物一码"
                showSearch
                filterOption={(input, option) => {
                  const normalize = (v: string) => String(v || '').replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/[^A-Za-z0-9]/g, '').toUpperCase()
                  const q = normalize(String(input || ''))
                  const label = String(option?.label || '')
                  const value = String(option?.value || '')
                  return normalize(label).includes(q) || normalize(value).includes(q)
                }}
                onSearch={(val) => {
                  if (invTimerRef.current) clearTimeout(invTimerRef.current)
                  invTimerRef.current = setTimeout(() => { fetchInventory(val) }, 250)
                }}
                onOpenChange={(open) => { if (open) fetchInventory(selectedInv || '') }}
                options={invOptions}
                loading={loadingInv}
                style={{ width: '100%' }}
                value={selectedInv || undefined}
                allowClear
                onChange={onSelectInv}
              />
            </div>
          </div>

          {!isNonProduction && (
            <div className="line-row">
              <div className="line-label">零件编号：</div>
              <div className="line-value">
                <div className="line-static">
                  {selectedInfo.drawing ? (
                    <span className="line-static-value">{selectedInfo.drawing}</span>
                  ) : (
                    <span className="line-static-value line-static-hint">请仔细核对</span>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="line-row">
            <div className="line-label">工艺工序：</div>
            <div className="line-value">
              <Form.Item name="process_name" rules={[{ required: true, message: '请选择或填写加工工序' }]}>
                <AutoComplete
                  placeholder={useManualProcess ? manualProcessHint : '请选择或填写当前工序'}
                  options={processOptions.map(p => ({ value: p, label: p }))}
                  filterOption={(inputValue, option) => String(option?.value || '').toLowerCase().includes(String(inputValue || '').toLowerCase())}
                />
              </Form.Item>
            </div>
          </div>

          {!isNonProduction && (
            <div className="line-row">
              <div className="line-label">设备编号：</div>
              <div className="line-value">
                <Form.Item name="device_no" rules={[{ required: true, message: '请选择设备编号' }]} preserve={false}>
                  <Select
                    placeholder="无设备请填0"
                    showSearch
                    filterOption={(input, option) => String(option?.label || '').includes(input)}
                    options={deviceOptions}
                    onOpenChange={(open) => {
                      if (open && deviceOptions.length === 0) {
                        fetchDevices().catch((e: any) => message.error(e?.message || '加载设备编号失败'))
                      }
                    }}
                    onSelect={(_val, opt: any) => {
                      setDeviceName(opt?.meta?.device_name || '')
                      const maxAux = Number(opt?.meta?.max_aux_minutes)
                      setSelectedDeviceMaxAuxMinutes(Number.isFinite(maxAux) ? maxAux : null)
                    }}
                    onClear={() => setSelectedDeviceMaxAuxMinutes(null)}
                  />
                </Form.Item>
              </div>
            </div>
          )}

          {!isNonProduction && (
            <div className="line-row">
              <div className="line-label">上次结束：</div>
              <div className="line-value">
                <div className="line-static">
                  {lastCompletedTime ? (
                    <span className="line-static-value">{lastCompletedTime}</span>
                  ) : (
                    <span className="line-static-value line-static-hint">上次记录结束时间</span>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="line-row">
            <div className="line-label">辅助开始：</div>
            <div className="line-value">
              <Form.Item name="aux_start" rules={[{ required: true, message: '请选择辅助开始时间' }]} preserve={false}>
                <QuickTimeInput placeholder="24小时制4位数字" displayDate={wWorkDate} />
              </Form.Item>
            </div>
          </div>

          <div className="line-row">
            <div className="line-label">辅助时长：</div>
            <div className="line-value">
              <Form.Item
                name="aux_duration_minutes"
                rules={[
                  { required: true, message: '请输入辅助时长' },
                  {
                    validator: (_, value) => {
                      if (value === undefined || value === null || value === '') return Promise.resolve()
                      return Number(value) <= 660 ? Promise.resolve() : Promise.reject(new Error('超出当班辅助时长上限'))
                    }
                  }
                ]}
              >
                <InputNumber
                  min={0}
                  step={5}
                  controls={false}
                  inputMode="numeric"
                  placeholder="当班内多次辅助填写总时长"
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </div>
          </div>

          <div className="line-row">
            <div className="line-label">辅助结束：</div>
            <div className="line-value">
              <div className="line-static">
                {auxEndDisplay && auxEndDisplay !== '-' ? (
                  <span className="line-static-value">{auxEndDisplay}</span>
                ) : (
                  <span className="line-static-value line-static-hint">程序开始运行的时间</span>
                )}
              </div>
            </div>
          </div>

          {!isNonProduction && (
            <div className="line-row">
              <div className="line-label">辅助次数：</div>
              <div className="line-value">
                <Form.Item
                  name="aux_count"
                  preserve={false}
                  rules={[
                    { required: true, message: '请输入辅助次数' },
                    {
                      validator: (_, value) => {
                        if (value === undefined || value === null || value === '') return Promise.resolve()
                        return Number(value) >= 1 ? Promise.resolve() : Promise.reject(new Error('辅助次数至少为1'))
                      }
                    }
                  ]}
                >
                  <InputNumber
                    min={1}
                    step={1}
                    controls={false}
                    inputMode="numeric"
                    placeholder="对应辅助时长的次数"
                    style={{ width: '100%' }}
                  />
                </Form.Item>
              </div>
            </div>
          )}

          {!isNonProduction && (
            <div className="line-row">
              <div className="line-label">程序时长：</div>
              <div className="line-value">
                <Form.Item
                  name="proc_minutes"
                  preserve={false}
                  rules={[
                    { required: true, message: '请输入程序时长' },
                    {
                      validator: (_, value) => {
                        if (value === undefined || value === null || value === '') return Promise.resolve()
                        return Number(value) <= 660 ? Promise.resolve() : Promise.reject(new Error('超出当班程序时长上限'))
                      }
                    }
                  ]}
                >
                  <InputNumber
                    min={0}
                    step={5}
                    controls={false}
                    inputMode="numeric"
                    placeholder="请填写机床面板程序运行的时间，而不是机床的开动时间"
                    style={{ width: '100%' }}
                  />
                </Form.Item>
              </div>
            </div>
          )}

          {!isNonProduction && (
            <div className="line-row">
              <div className="line-label">本次完成：</div>
              <div className="line-value">
                <div className="line-static">
                  {completedTime ? (
                    <span className="line-static-value">{completedTime}</span>
                  ) : (
                    <span className="line-static-value line-static-hint">不应超出当班时间</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {!isNonProduction && (
            <div className="line-row">
              <div className="line-label">加工数量：</div>
              <div className="line-value">
                <Form.Item
                  name="process_quantity"
                  preserve={false}
                  rules={[
                    { required: true, message: '请输入加工数量' },
                    {
                      validator: (_, value) => {
                        if (value === undefined || value === null || value === '') return Promise.resolve()
                        return Number(value) >= 1 ? Promise.resolve() : Promise.reject(new Error('加工数量至少为1'))
                      }
                    }
                  ]}
                >
                  <InputNumber
                    min={1}
                    step={1}
                    controls={false}
                    inputMode="numeric"
                    placeholder="实际加工的零件数量"
                    style={{ width: '100%' }}
                  />
                </Form.Item>
              </div>
            </div>
          )}

          {!isNonProduction && (
            <div className="line-row">
              <div className="line-label">完成数量：</div>
              <div className="line-value">
                <Form.Item name="completed_quantity" preserve={false} rules={[{ required: true, message: '请输入完成数量' }]}>
                  <InputNumber
                    min={0}
                    step={1}
                    controls={false}
                    inputMode="numeric"
                    placeholder="加工完成可以交检的数量，未完成填0"
                    style={{ width: '100%' }}
                  />
                </Form.Item>
              </div>
            </div>
          )}

          {/* 第八行：提交按钮 */}
          <Form.Item style={{ marginBottom: 0 }}>
            <Button 
              type="primary" 
              htmlType="submit" 
              block
              disabled={isSubmitDisabled}
            >
              提交
            </Button>
          </Form.Item>
        </Form>
      </Card>
      )}
      {showRecent && (
      <Card className="mt-3 work-hours-card" styles={{ body: { padding: 12 } }}>
        <div className="flex items-center justify-between mb-2">
          <Typography.Text strong>最近提交</Typography.Text>
          <Button danger disabled={!selectedRecentKeys.length} onClick={async () => {
            try {
              if (!selectedRecentKeys.length) return
              const ok = await new Promise<boolean>((resolve) => {
                Modal.confirm({
                  title: '确认删除',
                  content: `将永久删除 ${selectedRecentKeys.length} 条记录，确定执行？`,
                  okText: '确定',
                  cancelText: '取消',
                  onOk: () => resolve(true),
                  onCancel: () => resolve(false)
                })
              })
              if (!ok) return
              message.loading({ content: '删除中...', key: 'del' })
              await Promise.all(selectedRecentKeys.map((id) => fetchWithFallback(`/api/tooling/work-hours/${id}`, { method: 'DELETE' })))
              message.success({ content: '删除成功', key: 'del' })
              setSelectedRecentKeys([])
              fetchRecent()
            } catch {
              message.error({ content: '删除失败', key: 'del' })
            }
          }}>删除选中</Button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <Table
            size="small"
            rowKey={(r) => r.id || `${r.part_inventory_number}-${r.work_date}-${r.process_name}`}
            loading={loadingRecent}
            pagination={false}
            dataSource={recentItems}
            rowSelection={{ selectedRowKeys: selectedRecentKeys, onChange: (keys) => setSelectedRecentKeys(keys) }}
            scroll={{ x: 'max-content' }}
            columns={recentColumns}
          />
        </div>
      </Card>
      )}
    </div>
  )
}

export default WorkHours
