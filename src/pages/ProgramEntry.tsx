import React from 'react'
import { AutoComplete, Button, Card, Input, InputNumber, message, Select, Space, Table, Tag, Typography } from 'antd'
import { LeftOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useNavigate } from 'react-router-dom'
import { fetchWithFallback } from '../utils/api'
import { useAuthStore } from '../stores/authStore'

interface InventoryOption {
  value: string
  label: string
  meta: {
    part_name: string
    part_drawing_number: string
    process_route: string
  }
}

interface ProgramEntryRow {
  id: string
  part_inventory_number: string
  part_drawing_number: string
  process_name: string
  process_options: string[]
  program_no: string
  program_duration_minutes: number | null
  programmed_at: string
  programmer: string
  save_status?: 'idle' | 'saving' | 'saved' | 'error'
}

interface ProgramEntryApiItem {
  id?: string
  part_inventory_number?: string
  part_drawing_number?: string
  process_name?: string
  program_no?: string
  program_duration_minutes?: number | string | null
  programmed_at?: string
  programmer?: string
}

const createUuid = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const rand = Math.floor(Math.random() * 16)
    const value = char === 'x' ? rand : ((rand & 0x3) | 0x8)
    return value.toString(16)
  })
}

const formatNow = () => dayjs().format('YYYY-MM-DD HH:mm:ss')

const createEmptyRow = (): ProgramEntryRow => ({
  id: createUuid(),
  part_inventory_number: '',
  part_drawing_number: '',
  process_name: '',
  process_options: [],
  program_no: '',
  program_duration_minutes: null,
  programmed_at: '',
  programmer: '',
  save_status: 'idle'
})

const normalizeSearch = (value: string) => String(value || '')
  .replace(/[\u200B-\u200D\uFEFF]/g, '')
  .replace(/[^A-Za-z0-9]/g, '')
  .trim()
  .toUpperCase()
const normalizeProgramGroupValue = (value: string) => String(value || '')
  .replace(/[\u200B-\u200D\uFEFF]/g, '')
  .replace(/\s+/g, '')
  .trim()
  .toUpperCase()

const buildProcessOptions = (route: string) => String(route || '')
  .split('→')
  .map(item => item.replace(/\s+/g, ' ').trim())
  .filter(Boolean)

const sortLoadedProgramEntries = (items: ProgramEntryApiItem[]) => {
  return [...items].sort((a, b) => {
    const timeA = dayjs(String(a?.programmed_at || '')).valueOf()
    const timeB = dayjs(String(b?.programmed_at || '')).valueOf()
    if (Number.isFinite(timeA) && Number.isFinite(timeB) && timeA !== timeB) {
      return timeA - timeB
    }
    const programNoA = Number(String(a?.program_no || '').trim())
    const programNoB = Number(String(b?.program_no || '').trim())
    if (Number.isFinite(programNoA) && Number.isFinite(programNoB) && programNoA !== programNoB) {
      return programNoA - programNoB
    }
    return String(a?.id || '').localeCompare(String(b?.id || ''))
  })
}

// #region debug-point shared:report
const reportProgramEntryDebug = (hypothesisId: string, msg: string, data?: Record<string, any>) => {
  try {
    fetch('http://127.0.0.1:7777/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'program-entry-missing',
        runId: 'pre-fix',
        hypothesisId,
        location: 'src/pages/ProgramEntry.tsx',
        msg,
        data: data || {},
        ts: Date.now()
      })
    }).catch(() => {})
  } catch {}
}
// #endregion

const ProgramEntry: React.FC = () => {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [rows, setRows] = React.useState<ProgramEntryRow[]>(() => [createEmptyRow()])
  const [inventoryOptions, setInventoryOptions] = React.useState<InventoryOption[]>([])
  const [loadingInventory, setLoadingInventory] = React.useState(false)
  const [loadingEntries, setLoadingEntries] = React.useState(false)
  const inventoryTimerRef = React.useRef<any>(null)
  const inventoryCacheRef = React.useRef<InventoryOption[]>([])
  const inventoryAbortRef = React.useRef<AbortController | null>(null)
  const inventoryRequestRef = React.useRef(0)
  const lastSavedSnapshotRef = React.useRef<Record<string, string>>({})
  const inFlightRowIdsRef = React.useRef<Record<string, boolean>>({})
  const rowsRef = React.useRef<ProgramEntryRow[]>(rows)

  const latestProgrammer = React.useMemo(() => String(user?.real_name || '').trim() || '系统用户', [user])

  const updateRow = React.useCallback((id: string, patch: Partial<ProgramEntryRow>) => {
    setRows(prev => prev.map(row => row.id === id ? { ...row, ...patch } : row))
  }, [])

  const resolveLatestProgrammer = React.useCallback(async () => {
    let name = latestProgrammer
    try {
      const uid = String((user as any)?.id || '').trim()
      if (!uid) return name
      const resp = await fetchWithFallback(`/api/auth/me?userId=${encodeURIComponent(uid)}`)
      if (!resp.ok) return name
      const json = await resp.json()
      const serverName = String(json?.user?.real_name || '').trim()
      if (serverName) name = serverName
    } catch {}
    return name || '系统用户'
  }, [latestProgrammer, user])

  const getInventoryOptionByNumber = React.useCallback((inventoryNumber: string) => {
    const normalizedInventoryNumber = normalizeSearch(inventoryNumber)
    if (!normalizedInventoryNumber) return null
    return inventoryCacheRef.current.find(option => normalizeSearch(option.value) === normalizedInventoryNumber) || null
  }, [])

  const hydrateRowFromApi = React.useCallback((item: ProgramEntryApiItem): ProgramEntryRow => {
    const partInventoryNumber = String(item?.part_inventory_number || '').trim()
    const matchedOption = getInventoryOptionByNumber(partInventoryNumber)
    const processOptions = buildProcessOptions(String(matchedOption?.meta?.process_route || ''))
    return {
      id: String(item?.id || createUuid()).trim() || createUuid(),
      part_inventory_number: partInventoryNumber,
      part_drawing_number: String(item?.part_drawing_number || matchedOption?.meta?.part_drawing_number || '').trim(),
      process_name: String(item?.process_name || '').trim(),
      process_options: processOptions,
      program_no: String(item?.program_no || '').trim(),
      program_duration_minutes: item?.program_duration_minutes === null || item?.program_duration_minutes === undefined || item?.program_duration_minutes === ''
        ? null
        : Number(item.program_duration_minutes),
      programmed_at: String(item?.programmed_at || '').trim()
        ? dayjs(String(item?.programmed_at || '')).format('YYYY-MM-DD HH:mm:ss')
        : '',
      programmer: String(item?.programmer || '').trim(),
      save_status: 'saved'
    }
  }, [getInventoryOptionByNumber])

  const buildRowSnapshot = React.useCallback((row: ProgramEntryRow) => {
    return JSON.stringify({
      part_inventory_number: String(row.part_inventory_number || '').trim(),
      part_drawing_number: String(row.part_drawing_number || '').trim(),
      process_name: String(row.process_name || '').trim(),
      program_no: String(row.program_no || '').trim(),
      program_duration_minutes: row.program_duration_minutes === null || row.program_duration_minutes === undefined
        ? null
        : Number(row.program_duration_minutes)
    })
  }, [])

  const loadProgramEntries = React.useCallback(async () => {
    try {
      setLoadingEntries(true)
      const resp = await fetchWithFallback('/api/tooling/program-entries?page=1&pageSize=500')
      if (!resp.ok) {
        throw new Error(`读取程序录入失败: ${resp.status}`)
      }
      const json = await resp.json()
      const items = Array.isArray(json?.items) ? json.items : []
      const loadedRows = sortLoadedProgramEntries(items).map(hydrateRowFromApi)
      const snapshotMap: Record<string, string> = {}
      loadedRows.forEach((row) => {
        snapshotMap[row.id] = buildRowSnapshot(row)
      })
      lastSavedSnapshotRef.current = snapshotMap
      setRows(loadedRows.length > 0 ? [...loadedRows, createEmptyRow()] : [createEmptyRow()])
      reportProgramEntryDebug('F', '[DEBUG] ProgramEntry loaded existing rows', {
        itemCount: items.length,
        rowCount: loadedRows.length
      })
    } catch (error: any) {
      message.error(error?.message || '加载程序录入失败')
      reportProgramEntryDebug('G', '[DEBUG] ProgramEntry load failed', {
        message: String(error?.message || error || '')
      })
    } finally {
      setLoadingEntries(false)
    }
  }, [buildRowSnapshot, hydrateRowFromApi])

  const fetchInventory = React.useCallback(async (keyword: string) => {
    const requestId = ++inventoryRequestRef.current
    const searchText = String(keyword || '').trim()
    try {
      setLoadingInventory(true)
      if (inventoryAbortRef.current) inventoryAbortRef.current.abort()
      inventoryAbortRef.current = new AbortController()
      const resp = await fetchWithFallback(
        `/api/tooling/parts/inventory-list?page=1&pageSize=${searchText ? 300 : 200}&search=${encodeURIComponent(searchText)}`,
        { signal: inventoryAbortRef.current.signal }
      )
      if (!resp.ok) {
        throw new Error(`获取盘存编号失败: ${resp.status}`)
      }
      const json = await resp.json()
      const items = Array.isArray(json?.items) ? json.items : (Array.isArray(json?.data) ? json.data : [])
      const map = new Map<string, InventoryOption>()
      items.forEach((item: any) => {
        const inventoryNo = String(item?.part_inventory_number || item?.inventory_number || '').trim()
        if (!inventoryNo) return
        const key = normalizeSearch(inventoryNo)
        if (map.has(key)) return
        const partName = String(item?.part_name || '').trim()
        map.set(key, {
          value: inventoryNo,
          label: partName ? `${inventoryNo} | ${partName}` : inventoryNo,
          meta: {
            part_name: partName,
            part_drawing_number: String(item?.part_drawing_number || '').trim(),
            process_route: String(item?.process_route || '')
          }
        })
      })
      const nextOptions = Array.from(map.values())
      if (requestId !== inventoryRequestRef.current) return
      inventoryCacheRef.current = nextOptions
      setInventoryOptions(nextOptions)
    } catch (error: any) {
      if (requestId !== inventoryRequestRef.current) return
      if (inventoryCacheRef.current.length > 0) {
        const q = normalizeSearch(searchText)
        setInventoryOptions(
          inventoryCacheRef.current.filter(option => {
            if (!q) return true
            return normalizeSearch(option.label).includes(q) || normalizeSearch(option.value).includes(q)
          })
        )
      } else {
        message.error(error?.message || '获取盘存编号失败')
      }
    } finally {
      if (requestId === inventoryRequestRef.current) {
        setLoadingInventory(false)
      }
    }
  }, [])

  React.useEffect(() => {
    rowsRef.current = rows
  }, [rows])

  React.useEffect(() => {
    setRows(prev => {
      const nextProgramNoMap = new Map<string, string>()
      const counterMap = new Map<string, number>()
      prev.forEach((row) => {
        const inventoryNo = normalizeProgramGroupValue(row.part_inventory_number)
        const processName = normalizeProgramGroupValue(row.process_name)
        if (!inventoryNo || !processName) {
          nextProgramNoMap.set(row.id, '')
          return
        }
        const groupKey = `${inventoryNo}__${processName}`
        const nextCount = Number(counterMap.get(groupKey) || 0) + 1
        counterMap.set(groupKey, nextCount)
        nextProgramNoMap.set(row.id, String(nextCount))
      })
      let changed = false
      const next = prev.map((row) => {
        const nextProgramNo = nextProgramNoMap.get(row.id) ?? ''
        if (String(row.program_no || '') === nextProgramNo) return row
        changed = true
        return { ...row, program_no: nextProgramNo, save_status: row.save_status === 'saved' ? 'idle' : row.save_status }
      })
      return changed ? next : prev
    })
  }, [rows])

  React.useEffect(() => {
    fetchInventory('')
  }, [fetchInventory])

  React.useEffect(() => {
    loadProgramEntries()
  }, [loadProgramEntries])

  React.useEffect(() => {
    // #region debug-point E:page-mount
    reportProgramEntryDebug('E', '[DEBUG] ProgramEntry mounted', {
      rowCount: rowsRef.current.length
    })
    // #endregion
  }, [])

  const hasRowContent = React.useCallback((row: ProgramEntryRow) => {
    return !!(
      String(row.part_inventory_number || '').trim()
      || String(row.process_name || '').trim()
      || row.program_duration_minutes !== null
    )
  }, [])

  const isRowComplete = React.useCallback((row: ProgramEntryRow) => {
    return !!(
      String(row.part_inventory_number || '').trim()
      && String(row.part_drawing_number || '').trim()
      && String(row.process_name || '').trim()
      && row.program_duration_minutes !== null
      && row.program_duration_minutes !== undefined
      && Number(row.program_duration_minutes) >= 0
    )
  }, [])

  React.useEffect(() => {
    setRows(prev => {
      if (!prev.length) return [createEmptyRow()]
      let next = [...prev]
      let changed = false
      while (next.length > 1 && !hasRowContent(next[next.length - 1]) && !hasRowContent(next[next.length - 2])) {
        next = next.slice(0, -1)
        changed = true
      }
      if (hasRowContent(next[next.length - 1])) {
        next = [...next, createEmptyRow()]
        changed = true
      }
      return changed ? next : prev
    })
  }, [hasRowContent, rows])

  React.useEffect(() => {
    if (inventoryCacheRef.current.length === 0) return
    setRows(prev => {
      let changed = false
      const next = prev.map((row) => {
        if (!String(row.part_inventory_number || '').trim()) return row
        const matchedOption = getInventoryOptionByNumber(row.part_inventory_number)
        if (!matchedOption) return row
        const nextDrawingNumber = String(row.part_drawing_number || '').trim() || String(matchedOption.meta.part_drawing_number || '').trim()
        const nextProcessOptions = buildProcessOptions(String(matchedOption.meta.process_route || ''))
        const sameDrawingNumber = nextDrawingNumber === String(row.part_drawing_number || '').trim()
        const sameProcessOptions = JSON.stringify(nextProcessOptions) === JSON.stringify(row.process_options || [])
        if (sameDrawingNumber && sameProcessOptions) return row
        changed = true
        return {
          ...row,
          part_drawing_number: nextDrawingNumber,
          process_options: nextProcessOptions
        }
      })
      return changed ? next : prev
    })
  }, [getInventoryOptionByNumber, inventoryOptions])

  const handleInventoryChange = React.useCallback((rowId: string, value: string, option?: any) => {
    const selected = option as InventoryOption | undefined
    const nextInventoryNumber = String(value || '').trim()
    const route = String(selected?.meta?.process_route || '')
    const processOptions = route
      .split('→')
      .map(item => item.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
    updateRow(rowId, {
      part_inventory_number: nextInventoryNumber,
      part_drawing_number: nextInventoryNumber ? String(selected?.meta?.part_drawing_number || '') : '',
      process_name: '',
      process_options: processOptions,
      program_no: '',
      programmed_at: nextInventoryNumber ? formatNow() : '',
      programmer: nextInventoryNumber ? latestProgrammer : '',
      save_status: 'idle'
    })
  }, [latestProgrammer, updateRow])

  const saveRow = React.useCallback(async (row: ProgramEntryRow) => {
    if (!isRowComplete(row)) return
    const snapshot = buildRowSnapshot(row)
    if (lastSavedSnapshotRef.current[row.id] === snapshot) return
    if (inFlightRowIdsRef.current[row.id]) return

    inFlightRowIdsRef.current[row.id] = true
    updateRow(row.id, { save_status: 'saving' })
    try {
      const programmer = await resolveLatestProgrammer()
      const programmedAt = formatNow()
      const payload = {
        operator: programmer,
        user_id: String((user as any)?.id || ''),
        user_phone: String((user as any)?.phone || ''),
        items: [{
          id: row.id,
          part_inventory_number: String(row.part_inventory_number || '').trim(),
          part_drawing_number: String(row.part_drawing_number || '').trim(),
          process_name: String(row.process_name || '').trim(),
          program_no: String(row.program_no || '').trim() || '1',
          program_duration_minutes: Number(row.program_duration_minutes || 0),
          programmed_at: programmedAt
        }]
      }
      // #region debug-point A:save-request
      reportProgramEntryDebug('A', '[DEBUG] ProgramEntry save requested', {
        rowId: row.id,
        payload
      })
      // #endregion
      const resp = await fetchWithFallback('/api/tooling/program-entries/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!resp.ok) {
        let detail = ''
        try {
          const errJson = await resp.json()
          detail = String(errJson?.error || errJson?.message || '').trim()
        } catch {}
        throw new Error(detail || `保存失败: ${resp.status}`)
      }
      const json = await resp.json()
      // #region debug-point B:save-response
      reportProgramEntryDebug('B', '[DEBUG] ProgramEntry save response received', {
        rowId: row.id,
        status: resp.status,
        body: json
      })
      // #endregion
      if (!json?.success) {
        throw new Error(String(json?.error || '保存失败'))
      }
      lastSavedSnapshotRef.current[row.id] = snapshot
      updateRow(row.id, {
        programmed_at: programmedAt,
        programmer,
        save_status: 'saved'
      })
      // #region debug-point C:save-success
      reportProgramEntryDebug('C', '[DEBUG] ProgramEntry save marked saved', {
        rowId: row.id,
        programmedAt,
        programmer
      })
      // #endregion
    } catch (error: any) {
      updateRow(row.id, { save_status: 'error' })
      // #region debug-point D:save-error
      reportProgramEntryDebug('D', '[DEBUG] ProgramEntry save failed', {
        rowId: row.id,
        message: String(error?.message || error || '')
      })
      // #endregion
      message.error(error?.message || '自动保存失败')
    } finally {
      delete inFlightRowIdsRef.current[row.id]
    }
  }, [buildRowSnapshot, isRowComplete, resolveLatestProgrammer, updateRow, user])

  const requestSave = React.useCallback((rowId: string) => {
    const row = rowsRef.current.find(item => item.id === rowId)
    if (!row) return
    if (!hasRowContent(row)) return
    if (!isRowComplete(row)) return
    saveRow(row)
  }, [hasRowContent, isRowComplete, saveRow])

  const columns = React.useMemo(() => [
    {
      title: '盘存编号',
      dataIndex: 'part_inventory_number',
      width: 350,
      align: 'center' as const,
      render: (_: any, row: ProgramEntryRow) => (
        <Select
          className="program-entry-inventory-select"
          showSearch
          allowClear
          variant="borderless"
          style={{ width: '100%' }}
          value={row.part_inventory_number || undefined}
          options={inventoryOptions}
          optionLabelProp="label"
          loading={loadingInventory}
          filterOption={(input, option) => {
            const q = normalizeSearch(String(input || ''))
            const label = normalizeSearch(String(option?.label || ''))
            const value = normalizeSearch(String(option?.value || ''))
            return label.includes(q) || value.includes(q)
          }}
          onSearch={(value) => {
            if (inventoryTimerRef.current) clearTimeout(inventoryTimerRef.current)
            inventoryTimerRef.current = setTimeout(() => fetchInventory(value), 250)
          }}
          onOpenChange={(open) => {
            if (open && inventoryOptions.length === 0) fetchInventory('')
          }}
          onChange={(value, option) => {
            handleInventoryChange(row.id, String(value || ''), option)
            window.setTimeout(() => requestSave(row.id), 0)
          }}
        />
      )
    },
    {
      title: '零件编号',
      dataIndex: 'part_drawing_number',
      width: 240,
      align: 'center' as const,
      render: (_: any, row: ProgramEntryRow) => (
        <div className="program-entry-cell-static">{row.part_drawing_number || ''}</div>
      )
    },
    {
      title: '工艺工序',
      dataIndex: 'process_name',
      width: 200,
      align: 'center' as const,
      render: (_: any, row: ProgramEntryRow) => (
        <AutoComplete
          className="program-entry-auto-complete"
          value={row.process_name}
          options={row.process_options.map(item => ({ value: item, label: item }))}
          filterOption={(inputValue, option) => String(option?.value || '').toLowerCase().includes(String(inputValue || '').toLowerCase())}
          onChange={(value) => updateRow(row.id, { process_name: String(value || ''), save_status: 'idle' })}
          onSelect={() => window.setTimeout(() => requestSave(row.id), 0)}
        >
          <Input variant="borderless" onBlur={() => requestSave(row.id)} onPressEnter={() => requestSave(row.id)} />
        </AutoComplete>
      )
    },
    {
      title: '程序编号',
      dataIndex: 'program_no',
      width: 120,
      align: 'center' as const,
      render: (_: any, row: ProgramEntryRow) => (
        <div className="program-entry-cell-static">{row.program_no || ''}</div>
      )
    },
    {
      title: '程序时长(分钟)',
      dataIndex: 'program_duration_minutes',
      width: 150,
      align: 'center' as const,
      render: (_: any, row: ProgramEntryRow) => (
        <InputNumber
          variant="borderless"
          className="program-entry-cell-number"
          min={0}
          step={1}
          controls={false}
          style={{ width: '100%' }}
          value={row.program_duration_minutes}
          onChange={(value) => updateRow(row.id, {
            program_duration_minutes: value === null ? null : Number(value),
            save_status: 'idle'
          })}
          onBlur={() => requestSave(row.id)}
          onPressEnter={() => requestSave(row.id)}
        />
      )
    },
    {
      title: '编程日期时间',
      dataIndex: 'programmed_at',
      width: 190,
      align: 'center' as const,
      render: (_: any, row: ProgramEntryRow) => (
        <div className="program-entry-cell-static">{row.programmed_at || ''}</div>
      )
    },
    {
      title: '编程人',
      dataIndex: 'programmer',
      width: 120,
      align: 'center' as const,
      render: (_: any, row: ProgramEntryRow) => (
        row.programmer ? <div style={{ textAlign: 'center' }}><Tag color="cyan">{row.programmer}</Tag></div> : <div className="program-entry-cell-static" />
      )
    }
  ], [fetchInventory, handleInventoryChange, inventoryOptions, loadingInventory, requestSave, updateRow])

  return (
    <div style={{ padding: 16 }}>
      <style>{`
        .program-entry-inventory-select.ant-select-single {
          width: 100%;
        }
        .program-entry-inventory-select.ant-select-single .ant-select-selector {
          width: 100% !important;
          min-width: 100% !important;
          height: 36px !important;
          padding-left: 10px !important;
          padding-right: 28px !important;
          border: none !important;
          box-shadow: none !important;
          background: transparent !important;
        }
        .program-entry-inventory-select.ant-select-single .ant-select-selection-wrap {
          width: 100%;
          min-width: 0;
        }
        .program-entry-inventory-select.ant-select-single .ant-select-selection-search,
        .program-entry-inventory-select.ant-select-single .ant-select-selection-item,
        .program-entry-inventory-select.ant-select-single .ant-select-selection-placeholder {
          max-width: 100% !important;
        }
        .program-entry-inventory-select.ant-select-single .ant-select-selection-item,
        .program-entry-inventory-select.ant-select-single .ant-select-selection-placeholder,
        .program-entry-inventory-select.ant-select-single .ant-select-selection-search-input {
          font-size: 12px;
        }
        .program-entry-auto-complete,
        .program-entry-auto-complete .ant-select,
        .program-entry-cell-input,
        .program-entry-cell-number {
          width: 100%;
        }
        .program-entry-auto-complete .ant-select-selector {
          border: none !important;
          box-shadow: none !important;
          background: transparent !important;
          padding-left: 0 !important;
          padding-right: 0 !important;
        }
        .program-entry-cell-input.ant-input,
        .program-entry-auto-complete .ant-input,
        .program-entry-cell-number.ant-input-number {
          border: none !important;
          box-shadow: none !important;
          background: transparent !important;
        }
        .program-entry-cell-number.ant-input-number .ant-input-number-input {
          text-align: center;
        }
        .program-entry-cell-static {
          min-height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 4px 8px;
          background: transparent;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      `}</style>
      <Card bordered={false}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12, padding: '12px 16px', background: '#f5f5f5', borderRadius: 4 }}>
          <div>
            <Typography.Title level={4} style={{ margin: 0 }}>程序录入</Typography.Title>
          </div>
          <Space wrap>
            <Button icon={<LeftOutlined />} onClick={() => navigate('/dashboard')}>返回</Button>
          </Space>
        </div>

        <Table
          rowKey="id"
          size="small"
          bordered={false}
          pagination={false}
          loading={loadingEntries}
          scroll={{ x: 'max-content' }}
          dataSource={rows}
          columns={columns as any}
        />
      </Card>
    </div>
  )
}

export default ProgramEntry
