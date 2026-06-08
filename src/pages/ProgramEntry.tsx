import React from 'react'
import { AutoComplete, Button, Card, Input, InputNumber, message, Select, Space, Table, Tag, Typography } from 'antd'
import { LeftOutlined, ReloadOutlined } from '@ant-design/icons'
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

const createEmptyRow = (programmer: string): ProgramEntryRow => ({
  id: createUuid(),
  part_inventory_number: '',
  part_drawing_number: '',
  process_name: '',
  process_options: [],
  program_no: '',
  program_duration_minutes: null,
  programmed_at: formatNow(),
  programmer: programmer || '系统用户',
  save_status: 'idle'
})

const normalizeSearch = (value: string) => String(value || '')
  .replace(/[\u200B-\u200D\uFEFF]/g, '')
  .replace(/[^A-Za-z0-9]/g, '')
  .trim()
  .toUpperCase()

const ProgramEntry: React.FC = () => {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [rows, setRows] = React.useState<ProgramEntryRow[]>(() => [createEmptyRow(String(user?.real_name || '系统用户'))])
  const [inventoryOptions, setInventoryOptions] = React.useState<InventoryOption[]>([])
  const [loadingInventory, setLoadingInventory] = React.useState(false)
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

  const resetRows = React.useCallback((programmer: string) => {
    lastSavedSnapshotRef.current = {}
    inFlightRowIdsRef.current = {}
    setRows([createEmptyRow(programmer)])
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
    rows.forEach(row => {
      if (row.programmer !== latestProgrammer && !row.part_inventory_number && !row.process_name && !row.program_no && row.program_duration_minutes === null) {
        updateRow(row.id, { programmer: latestProgrammer, programmed_at: formatNow(), save_status: 'idle' })
      }
    })
  }, [latestProgrammer, rows, updateRow])

  React.useEffect(() => {
    fetchInventory('')
  }, [fetchInventory])

  const hasRowContent = React.useCallback((row: ProgramEntryRow) => {
    return !!(
      String(row.part_inventory_number || '').trim()
      || String(row.process_name || '').trim()
      || String(row.program_no || '').trim()
      || row.program_duration_minutes !== null
    )
  }, [])

  const isRowComplete = React.useCallback((row: ProgramEntryRow) => {
    return !!(
      String(row.part_inventory_number || '').trim()
      && String(row.part_drawing_number || '').trim()
      && String(row.process_name || '').trim()
      && String(row.program_no || '').trim()
      && row.program_duration_minutes !== null
      && row.program_duration_minutes !== undefined
      && Number(row.program_duration_minutes) >= 0
    )
  }, [])

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

  React.useEffect(() => {
    setRows(prev => {
      if (!prev.length) return [createEmptyRow(latestProgrammer)]
      let next = [...prev]
      let changed = false
      while (next.length > 1 && !hasRowContent(next[next.length - 1]) && !hasRowContent(next[next.length - 2])) {
        next = next.slice(0, -1)
        changed = true
      }
      if (hasRowContent(next[next.length - 1])) {
        next = [...next, createEmptyRow(latestProgrammer)]
        changed = true
      }
      return changed ? next : prev
    })
  }, [hasRowContent, latestProgrammer])

  const handleInventoryChange = React.useCallback((rowId: string, value: string, option?: any) => {
    const selected = option as InventoryOption | undefined
    const route = String(selected?.meta?.process_route || '')
    const processOptions = route
      .split('→')
      .map(item => item.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
    updateRow(rowId, {
      part_inventory_number: String(value || ''),
      part_drawing_number: String(selected?.meta?.part_drawing_number || ''),
      process_name: '',
      process_options: processOptions,
      programmed_at: formatNow(),
      programmer: latestProgrammer,
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
          program_no: String(row.program_no || '').trim(),
          program_duration_minutes: Number(row.program_duration_minutes || 0),
          programmed_at: programmedAt
        }]
      }
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
      if (!json?.success) {
        throw new Error(String(json?.error || '保存失败'))
      }
      lastSavedSnapshotRef.current[row.id] = snapshot
      updateRow(row.id, {
        programmed_at: programmedAt,
        programmer,
        save_status: 'saved'
      })
    } catch (error: any) {
      updateRow(row.id, { save_status: 'error' })
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
      width: 520,
      align: 'center' as const,
      render: (_: any, row: ProgramEntryRow) => (
        <Select
          className="program-entry-inventory-select"
          showSearch
          allowClear
          style={{ width: '100%' }}
          value={row.part_inventory_number || undefined}
          placeholder="输入或选择盘存编号"
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
      width: 180,
      align: 'center' as const,
      render: (_: any, row: ProgramEntryRow) => (
        <Input value={row.part_drawing_number} placeholder="自动带出" readOnly />
      )
    },
    {
      title: '工艺工序',
      dataIndex: 'process_name',
      width: 200,
      align: 'center' as const,
      render: (_: any, row: ProgramEntryRow) => (
        <AutoComplete
          value={row.process_name}
          placeholder="请选择或输入工序"
          options={row.process_options.map(item => ({ value: item, label: item }))}
          filterOption={(inputValue, option) => String(option?.value || '').toLowerCase().includes(String(inputValue || '').toLowerCase())}
          onChange={(value) => updateRow(row.id, { process_name: String(value || ''), save_status: 'idle' })}
          onSelect={() => window.setTimeout(() => requestSave(row.id), 0)}
        >
          <Input onBlur={() => requestSave(row.id)} onPressEnter={() => requestSave(row.id)} />
        </AutoComplete>
      )
    },
    {
      title: '程序编号',
      dataIndex: 'program_no',
      width: 160,
      align: 'center' as const,
      render: (_: any, row: ProgramEntryRow) => (
        <Input
          value={row.program_no}
          placeholder="请输入程序编号"
          onChange={(e) => updateRow(row.id, { program_no: e.target.value, save_status: 'idle' })}
          onBlur={() => requestSave(row.id)}
          onPressEnter={() => requestSave(row.id)}
        />
      )
    },
    {
      title: '程序时长(分钟)',
      dataIndex: 'program_duration_minutes',
      width: 150,
      align: 'center' as const,
      render: (_: any, row: ProgramEntryRow) => (
        <InputNumber
          min={0}
          step={1}
          controls={false}
          style={{ width: '100%' }}
          placeholder="分钟"
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
        <Input value={row.programmed_at} readOnly />
      )
    },
    {
      title: '编程人',
      dataIndex: 'programmer',
      width: 120,
      align: 'center' as const,
      render: (_: any, row: ProgramEntryRow) => (
        <div style={{ textAlign: 'center' }}>
          <Tag color="cyan">{row.programmer || latestProgrammer}</Tag>
        </div>
      )
    }
  ], [fetchInventory, handleInventoryChange, inventoryOptions, latestProgrammer, loadingInventory, requestSave, updateRow])

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
      `}</style>
      <Card bordered={false}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12, padding: '12px 16px', background: '#f5f5f5', borderRadius: 4 }}>
          <div>
            <Typography.Title level={4} style={{ margin: 0 }}>程序录入</Typography.Title>
            <Typography.Text type="secondary">表格样式对齐工装信息，输入完整后自动保存并自动补空白行</Typography.Text>
          </div>
          <Space wrap>
            <Button icon={<ReloadOutlined />} onClick={() => resetRows(latestProgrammer)}>清空</Button>
            <Button icon={<LeftOutlined />} onClick={() => navigate('/dashboard')}>返回</Button>
          </Space>
        </div>

        <Table
          rowKey="id"
          size="small"
          bordered={false}
          pagination={false}
          scroll={{ x: 'max-content' }}
          dataSource={rows}
          columns={columns as any}
        />
      </Card>
    </div>
  )
}

export default ProgramEntry
