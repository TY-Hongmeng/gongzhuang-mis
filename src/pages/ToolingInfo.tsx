﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿import React, { useEffect, useRef, useState, useMemo, useCallback, memo } from 'react'
import * as XLSX from 'xlsx'
import { Card, Typography, Button, Space, Table, message, Modal, Input, Select, DatePicker, AutoComplete, Popconfirm, Rate, Segmented } from 'antd'
import { LeftOutlined, ToolOutlined, ReloadOutlined, DeleteOutlined, UploadOutlined, DownloadOutlined } from '@ant-design/icons'
import { fetchWithFallback } from '../utils/api'
import { safeLocalStorage } from '../utils/safeStorage'
import { getProcessDone } from '../utils/processDone'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { CATEGORY_CODE_MAP } from '../types/tooling'
import { formatSpecificationsForProduction } from '../utils/productionFormat'
import { calculateTotalPrice } from '../utils/priceCalculator'
import { generateInventoryNumber, canGenerateInventoryNumber } from '../utils/toolingCalculations'
import { useToolingData } from '../hooks/useToolingData'
import { useToolingMeta } from '../hooks/useToolingMeta'
import { useToolingOperations } from '../hooks/useToolingOperations'
import EditableCell from '../components/EditableCell'
import SpecificationsInput from '../components/SpecificationsInput'
import type { Material } from '../types/tooling'

const { Title } = Typography
const debugLog = (...args: any[]) => {
  if ((import.meta as any).env?.DEV === true) {
    console.log(...args)
  }
}
const summarizeImportErrors = (errors: string[], maxItems = 8, maxLength = 360) => {
  if (!Array.isArray(errors) || errors.length === 0) return ''
  const items = errors.slice(0, maxItems).map((item) => String(item || '').trim()).filter(Boolean)
  const remain = Math.max(errors.length - items.length, 0)
  const summary = items.join('；')
  const trimmed = summary.length > maxLength ? `${summary.slice(0, maxLength)}...` : summary
  return remain > 0 ? `${trimmed}；其余${remain}条请查看导入源数据` : trimmed
}

const WORK_HOURS_AGG_CHUNK_SIZE = 120
const WORK_HOURS_CACHE_TTL = 5 * 60 * 1000
const INVENTORY_CHILD_SEARCH_MIN_DIGITS = 7
const DRAWING_CHILD_SEARCH_MIN_LEN = 4
const AUTO_EXPAND_PARENT_LIMIT = 12
const VISIBLE_PART_PREFETCH_LIMIT = 8

type WorkHoursLatestMetaMap = Record<string, {
  process_name: string
  operator: string
  shift: string
  team_name: string
  device_no: string
  device_name: string
  process_unit_price: number
  completed_quantity: number
  at: number
}>

type WorkHoursAggregateCacheEntry = {
  fetchedAt: number
  data: string[]
  processCompletedQtyData: Record<string, number>
  processHoursData: Record<string, number>
  amountData: number
  processLatestMetaData: WorkHoursLatestMetaMap
}

const chunkArray = <T,>(items: T[], size: number): T[][] => {
  if (!Array.isArray(items) || items.length === 0) return []
  const safeSize = Math.max(1, size)
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += safeSize) {
    chunks.push(items.slice(i, i + safeSize))
  }
  return chunks
}

const sanitizeAlphaNumeric = (value: any) => String(value || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
const getDigitCount = (value: any) => (String(value || '').match(/\d/g) || []).length
const shouldRunInventoryChildSearch = (value: any) => getDigitCount(value) >= INVENTORY_CHILD_SEARCH_MIN_DIGITS
const shouldRunDrawingChildSearch = (value: any) => sanitizeAlphaNumeric(value).length >= DRAWING_CHILD_SEARCH_MIN_LEN

const getBatchSize = () => {
  try {
    const raw = safeLocalStorage.getItem('parts_fetch_batch_size') || ''
    const n = parseInt(raw, 10)
    if (!Number.isFinite(n) || Number.isNaN(n)) return 10
    return Math.min(20, Math.max(2, n))
  } catch { return 10 }
}
const getImportConcurrency = () => {
  try {
    const raw = safeLocalStorage.getItem('tooling_import_concurrency') || ''
    const n = parseInt(raw, 10)
    if (!Number.isFinite(n) || Number.isNaN(n)) return 4
    return Math.min(8, Math.max(1, n))
  } catch { return 4 }
}

// 防抖函数
function debounce<T extends (...args: any[]) => any>(func: T, wait: number): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null
      func(...args)
    }
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(later, wait)
  }
}

function useDebouncedValue<T>(value: T, delay = 180) {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => clearTimeout(timer)
  }, [value, delay])

  return debouncedValue
}

async function runWithConcurrency<T, R>(
  items: T[],
  maxConcurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return []
  const concurrency = Math.max(1, Math.min(maxConcurrency, items.length))
  const results: R[] = new Array(items.length)
  let cursor = 0
  const runners = Array.from({ length: concurrency }).map(async () => {
    while (true) {
      const index = cursor++
      if (index >= items.length) break
      results[index] = await worker(items[index], index)
    }
  })
  await Promise.all(runners)
  return results
}

interface RowItem {
  id: string
  inventory_number?: string
  production_unit?: string
  category?: string
  priority_level?: number
  received_date?: string
  demand_date?: string
  completed_date?: string
  project_name?: string
  production_date?: string
  sets_count?: number
  recorder?: string
  material_total?: number | null
  process_total?: number | null
  totals_updated_at?: string
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
  process_amount?: number | null
  amounts_updated_at?: string
  remarks?: string
  heat_treatment?: string
  required_date?: string
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

const isDateString = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim())
const normalizeDateInput = (value: string) => {
  const v = String(value || '').trim()
  const m = v.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/)
  if (!m) return v
  const mm = String(Number(m[2])).padStart(2, '0')
  const dd = String(Number(m[3])).padStart(2, '0')
  return `${m[1]}-${mm}-${dd}`
}

const parsePartRemarkFields = (remarks: string) => {
  const raw = String(remarks || '').trim()
  if (!raw) return { heatTreatment: '', demandDate: '' }
  const low = raw.toLowerCase()
  if (['false', '0', '否', 'no', 'null', 'undefined', 'none', '-'].includes(low)) {
    return { heatTreatment: '', demandDate: '' }
  }
  if (['true', '1', '是', 'yes'].includes(low)) {
    return { heatTreatment: '需调质', demandDate: '' }
  }
  const heatMatch = raw.match(/(?:^|;)\s*热处理[:：]\s*([^;]+)/)
  const demandMatch = raw.match(/(?:^|;)\s*需求日期[:：]\s*([^;]+)/)
  if (heatMatch || demandMatch) {
    const heatTreatment = String((heatMatch?.[1] || '')).trim()
    const normalizedDemand = normalizeDateInput(String((demandMatch?.[1] || '')).trim())
    const demandDate = /^\d{4}-\d{2}-\d{2}$/.test(normalizedDemand) ? normalizedDemand : ''
    return { heatTreatment, demandDate }
  }
  const normalizedRaw = normalizeDateInput(raw)
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedRaw)) {
    return { heatTreatment: '', demandDate: normalizedRaw }
  }
  return { heatTreatment: raw, demandDate: '' }
}

const composePartRemarkFields = (heatTreatment: string, demandDate: string) => {
  const heat = String(heatTreatment || '').trim()
  const normalizedDemand = normalizeDateInput(String(demandDate || '').trim())
  const demand = /^\d{4}-\d{2}-\d{2}$/.test(normalizedDemand) ? normalizedDemand : ''
  if (heat && demand) return `热处理:${heat};需求日期:${demand}`
  if (heat) return heat
  if (demand) return demand
  return ''
}

const getNextPartInventoryNumbers = (
  parentInventoryNumber: string,
  parts: Array<Pick<PartItem, 'part_inventory_number'>>,
  count: number
) => {
  const parentInv = String(parentInventoryNumber || '').trim().toUpperCase()
  if (!parentInv) return Array.from({ length: count }).map(() => '')
  let maxSeq = 0
  ;(parts || []).forEach((item) => {
    const inv = String(item?.part_inventory_number || '').trim().toUpperCase()
    if (!inv || !inv.startsWith(parentInv)) return
    const suffix = inv.slice(parentInv.length)
    if (!/^\d+$/.test(suffix)) return
    const seq = Number(suffix)
    if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq
  })
  const start = maxSeq + 1
  const width = Math.max(2, String(start + Math.max(0, count - 1)).length)
  return Array.from({ length: count }).map((_, idx) => `${parentInv}${String(start + idx).padStart(width, '0')}`)
}

const getPartTypeColor = (partType?: string) => {
  const t = String(partType || '').replace(/\s+/g, '')
  if (!t) return '#000000'
  if (t.includes('板材') || t.includes('板料')) return '#003a8c'
  if (t.includes('圆钢') || t.includes('圆料')) return '#d46b08'
  if (t.includes('圆环')) return '#d4b106'
  return '#000000'
}

const ExpandedSubTables: React.FC<{
  toolingId: string
  parts: PartItem[]
  childItems: ChildItem[]
  partsLoading: boolean
  childLoading: boolean
  parentProject: string
  parentUnit: string
  parentApplicant: string
  partColumns: any[]
  childColumns: any[]
  selectedRowKeys: string[]
  setSelectedRowKeys: (keys: string[] | ((prev: string[]) => string[])) => void
  onAddPart: () => void
  onAddPartBatch: () => void
  onAddChildItem: () => void
  onToggleChildTable: () => void
}> = React.memo(({
  toolingId,
  parts,
  childItems,
  partsLoading,
  childLoading,
  parentProject,
  parentUnit,
  parentApplicant,
  partColumns,
  childColumns,
  selectedRowKeys,
  setSelectedRowKeys,
  onAddPart,
  onAddPartBatch,
  onAddChildItem,
  onToggleChildTable
}) => {
  const [showChildTable, setShowChildTable] = useState(false)

  const handleToggleChildTable = useCallback(() => {
    setShowChildTable(prev => !prev)
    if (!showChildTable) {
      onToggleChildTable()
    }
  }, [showChildTable, onToggleChildTable])
  const isPartCompleted = (rec: PartItem): boolean => {
    const v = String((rec as any).purchase_status || '').trim()
    return isDateString(v)
  }
  const isPartReady = (rec: PartItem): boolean => {
    const nameOk = !!String(rec.part_name || '').trim()
    const q = rec.part_quantity
    const qtyOk = !(q === '' || q === null || typeof q === 'undefined') && Number(q) > 0
    const partFields = parsePartRemarkFields(String(rec.remarks || ''))
    const demandDateOk = !!partFields.demandDate
    const projectOk = !!String(parentProject).trim()
    const prodUnitOk = !!String(parentUnit).trim()
    const applicantOk = !!String(parentApplicant).trim()
    const ready = nameOk && qtyOk && demandDateOk && projectOk && prodUnitOk && applicantOk
    return ready
  }
  const isChildCompleted = (rec: ChildItem): boolean => {
    const v = String((rec as any).purchase_status || '').trim()
    return isDateString(v)
  }
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

  const [partFilterStatus, setPartFilterStatus] = useState<'all' | 'completed' | 'incomplete'>('all')
  const { filteredParts, counts } = useMemo(() => {
    let result = parts
    
    // 计算各状态数量
    const allCount = parts.length
    const completedCount = parts.filter(p => isPartCompleted(p)).length
    const incompleteCount = allCount - completedCount

    if (partFilterStatus !== 'all') {
      result = result.filter(p => {
        const isCompleted = isPartCompleted(p)
        if (partFilterStatus === 'completed') return isCompleted
        return !isCompleted
      })
    }
    
    return {
      filteredParts: result,
      counts: { all: allCount, completed: completedCount, incomplete: incompleteCount }
    }
  }, [parts, partFilterStatus])

  const [childFilterStatus, setChildFilterStatus] = useState<'all' | 'completed' | 'incomplete'>('all')
  const { filteredChildItems, childCounts } = useMemo(() => {
    let result = childItems

    const allCount = childItems.length
    const completedCount = childItems.filter(p => isChildCompleted(p)).length
    const incompleteCount = allCount - completedCount

    if (childFilterStatus !== 'all') {
      result = result.filter(p => {
        const isCompleted = isChildCompleted(p)
        if (childFilterStatus === 'completed') return isCompleted
        return !isCompleted
      })
    }

    return {
      filteredChildItems: result,
      childCounts: { all: allCount, completed: completedCount, incomplete: incompleteCount }
    }
  }, [childItems, childFilterStatus])

  return (
    <div style={{ padding: '8px 24px 16px', background: '#fafafa' }} onClick={(e) => e.stopPropagation()}>
      <style>{`
        .subtable-no-hover .ant-table-tbody > tr:hover > td { background: inherit !important; }
        .subtable-no-hover .ant-table-tbody > tr.row-completed:hover > td { background: #2f8f4e !important; }
        .subtable-no-hover .ant-table-thead > tr > th,
        .subtable-no-hover .ant-table-tbody > tr > td {
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
        }
        .subtable-no-hover .ant-table-tbody > tr > td.process-route-cell {
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          line-height: 1.2 !important;
        }
      `}</style>
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button type="dashed" size="small" onClick={onAddPart} icon={<ToolOutlined />}>添加零件</Button>
            <Button type="dashed" size="small" onClick={onAddPartBatch}>批量添加</Button>
            <Button
              type={showChildTable ? 'primary' : 'dashed'}
              size="small"
              onClick={handleToggleChildTable}
            >
              标准件{childItems.length > 0 ? ` (${childItems.length})` : ''}
            </Button>
          </div>
          <Segmented
            options={[
              { label: `全部 (${counts.all})`, value: 'all' },
              { label: `完成 (${counts.completed})`, value: 'completed' },
              { label: `未完成 (${counts.incomplete})`, value: 'incomplete' }
            ]}
            value={partFilterStatus}
            onChange={(v) => setPartFilterStatus(v as any)}
            size="small"
          />
        </div>
        <div style={{ overflowX: 'auto' }}>
          <Table
            className="subtable-no-hover"
            rowKey="id"
            columns={partColumns}
            dataSource={filteredParts}
            loading={partsLoading}
            pagination={false}
            bordered={false}
            size="small"
            tableLayout="auto"
            locale={{ emptyText: partsLoading ? '' : '暂无数据' }}
          onRow={(rec: any) => ({
            className: isPartCompleted(rec) ? 'row-completed' : (isPartReady(rec) ? 'text-blue-600' : undefined)
          })}
          rowSelection={{
            selectedRowKeys: selectedRowKeys.filter(k => k.startsWith('part-')).map(k => k.slice(5)),
            onChange: (keys) => {
              const prefixed = (keys as string[])
                .map(k => 'part-' + k)
                // Remove filter for blank rows to allow deletion
              setSelectedRowKeys(prev => {
                const others = prev.filter(k => {
                  if (!k.startsWith('part-')) return true
                  return !parts.some(p => ('part-' + p.id) === k)
                })
                return Array.from(new Set([...others, ...prefixed]))
              })
            },
            columnWidth: 40,
            getCheckboxProps: (rec: any) => ({ 
              // Enable checkbox for blank rows to allow deletion
              disabled: false 
            }),
            checkStrictly: true,
            preserveSelectedRowKeys: true
          }}
          />
        </div>
      </div>
      {showChildTable && (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <Button type="dashed" size="small" onClick={onAddChildItem} icon={<ToolOutlined />}>添加标准件</Button>
          <Segmented
            options={[
              { label: `全部 (${childCounts.all})`, value: 'all' },
              { label: `完成 (${childCounts.completed})`, value: 'completed' },
              { label: `未完成 (${childCounts.incomplete})`, value: 'incomplete' }
            ]}
            value={childFilterStatus}
            onChange={(v) => setChildFilterStatus(v as any)}
            size="small"
          />
        </div>
        <div style={{ overflowX: 'auto' }}>
          <Table
            className="subtable-no-hover"
            rowKey="id"
            columns={childColumns}
            dataSource={filteredChildItems}
            loading={childLoading}
            pagination={false}
            bordered={false}
            size="small"
            tableLayout="auto"
            locale={{ emptyText: childLoading ? '' : '暂无数据' }}
            onRow={(rec: any) => ({
              className: isChildCompleted(rec) ? 'row-completed' : (isChildReady(rec) ? 'text-blue-600' : undefined)
            })}
            rowSelection={{
              selectedRowKeys: selectedRowKeys.filter(k => k.startsWith('child-')).map(k => k.slice(6)),
              onChange: (keys) => {
                const prefixed = (keys as string[])
                  .map(k => 'child-' + k)
                  // Remove filter for blank rows
                setSelectedRowKeys(prev => {
                  const others = prev.filter(k => {
                    if (!k.startsWith('child-')) return true
                    return !childItems.some(p => ('child-' + p.id) === k)
                  })
                  return Array.from(new Set([...others, ...prefixed]))
                })
              },
              columnWidth: 40,
              getCheckboxProps: (rec: any) => ({ 
                // Enable checkbox for blank rows
                disabled: false 
              }),
              checkStrictly: true,
              preserveSelectedRowKeys: true
            }}
          />
        </div>
      </div>
      )}
    </div>
  )
})

// 🔥 性能优化: 缓存的工艺路线单元格组件
const ProcessRouteCell = memo(({
  rec,
  processRoute,
  inventoryNo,
  steps,
  workHoursCompleted,
  manualCompletedTokens,
  processCompletedQtyMap,
  processHoursMap,
  requiredQty,
  onStepToggle,
  onSave
}: {
  rec: any
  processRoute: string
  inventoryNo: string
  steps: string[]
  workHoursCompleted: Set<string>
  manualCompletedTokens: Set<string>
  processCompletedQtyMap: Record<string, number>
  processHoursMap: Record<string, number>
  requiredQty: number
  onStepToggle: (step: string, index: number, checked: boolean) => void
  onSave: (id: string, key: string, value: any) => Promise<void>
}) => {
  const normalizeProcessKey = useCallback((v: string) => String(v || '').replace(/\s+/g, '').replace(/^[0-9]+[.\-、:：]*/g, '').trim().toLowerCase(), [])
  
  const getStepCompletedQty = useCallback((step: string) => {
    const key = normalizeProcessKey(step)
    const qty = Number(processCompletedQtyMap[key] || 0)
    return Number.isFinite(qty) ? qty : 0
  }, [processCompletedQtyMap, normalizeProcessKey])
  
  const getStepHours = useCallback((step: string) => {
    const key = normalizeProcessKey(step)
    const h = Number(processHoursMap[key] || 0)
    return Number.isFinite(h) ? h : 0
  }, [processHoursMap, normalizeProcessKey])
  
  const fmtHours = useCallback((v: any) => {
    const n = Number(v || 0)
    if (!Number.isFinite(n)) return '0'
    const s = n.toFixed(2)
    return s.replace(/\.?0+$/, '')
  }, [])
  
  // 缓存步骤渲染结果
  const stepElements = useMemo(() => {
    return steps.map((s, i) => {
      const stepDone = workHoursCompleted.has(normalizeProcessKey(s)) || manualCompletedTokens.has(`__STEP__${i}__${normalizeProcessKey(s)}`)
      const stepCompletedQty = getStepCompletedQty(s)
      const stepHours = getStepHours(s)
      const stepDoneByQty = Number.isFinite(requiredQty) && requiredQty > 0 && stepCompletedQty >= requiredQty
      const stepInProgress = stepDone || stepCompletedQty > 0
      const stepColor = stepDoneByQty ? '#28a745' : (stepInProgress ? '#1890ff' : '#333')
      const qtyText = stepHours > 0 ? `(${fmtHours(stepHours)}h)` : ''
      return (
        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <input
            type="checkbox"
            checked={stepDone}
            onChange={(e) => onStepToggle(s, i, e.target.checked)}
            style={{ cursor: 'pointer', margin: 0 }}
            onClick={(e) => e.stopPropagation()}
          />
          <span style={{ color: stepColor, fontWeight: 500 }}>{`${s}${qtyText}`}</span>
          {i < steps.length - 1 && <span style={{ color: '#999', marginLeft: 4 }}>→</span>}
        </span>
      )
    })
  }, [steps, workHoursCompleted, manualCompletedTokens, requiredQty, normalizeProcessKey, getStepCompletedQty, getStepHours, fmtHours, onStepToggle])
  
  const displayContent = useMemo(() => {
    if (!processRoute) return <span style={{ color: '#999' }}>-</span>
    return (
      <span style={{ display: 'inline-flex', flexWrap: 'nowrap', gap: '4px 8px', alignItems: 'center', whiteSpace: 'nowrap' }}>
        {stepElements}
      </span>
    )
  }, [processRoute, stepElements])
  
  return (
    <EditableCell
      value={processRoute}
      record={rec}
      dataIndex="process_route"
      renderDisplay={() => displayContent}
      onSave={(id: string, _key: string, value: string) => onSave(id, _key, value)}
    />
  )
})
ProcessRouteCell.displayName = 'ProcessRouteCell'

// 🔥 性能优化: 缓存的加工时长单元格
const normalizeProcessKeyForHours = (v: string) => String(v || '')
  .replace(/\s+/g, '')
  .replace(/^[0-9]+[.\-、:：]*/g, '')
  .trim()
  .toLowerCase()

const ProcessHoursCell = memo(({
  currentRoute,
  processHoursMap,
  hasProgress
}: {
  currentRoute: string
  processHoursMap: Record<string, number>
  hasProgress: boolean
}) => {
  const totalHours = useMemo(() => {
    if (Object.keys(processHoursMap).length === 0) return 0
    if (currentRoute) {
      const steps = currentRoute.split(/\s*→\s*/).map(s => s.trim()).filter(Boolean)
      let total = 0
      steps.forEach(step => {
        const key = normalizeProcessKeyForHours(step)
        const hours = Number(processHoursMap[key] || 0)
        if (Number.isFinite(hours)) total += hours
      })
      return total
    }
    return Object.values(processHoursMap).reduce((sum, h) => sum + (Number.isFinite(h) ? h : 0), 0)
  }, [currentRoute, processHoursMap])
  
  if (totalHours === 0) {
    if (hasProgress) return <span style={{ color: '#000000', fontWeight: 500 }}>0</span>
    return <span style={{ color: '#999' }}>-</span>
  }
  return <span style={{ color: '#000000', fontWeight: 500 }}>{totalHours.toFixed(1)}</span>
})
ProcessHoursCell.displayName = 'ProcessHoursCell'

// 🔥 性能优化: 缓存的状态单元格
const StatusCell = memo(({
  rec,
  purchaseStatus,
  currentRoute,
  routeProgressStatus,
  ready,
  renderStatusText,
  toolingId,
  saveStatusInput
}: {
  rec: any
  purchaseStatus: string
  currentRoute: string
  routeProgressStatus: any
  ready: boolean
  renderStatusText: (v: string) => React.ReactNode
  toolingId: string
  saveStatusInput: (tid: string, type: string, pid: string, v: any) => void
}) => {
  const displayValue = useMemo(() => {
    const raw = String(purchaseStatus || '').trim()
    if (raw.match(/^\d{4}-\d{2}-\d{2}$/)) return renderStatusText(raw)
    if (routeProgressStatus?.hasRoute) return { text: routeProgressStatus.text, color: routeProgressStatus.color }
    if (raw) return renderStatusText(raw)
    if (routeProgressStatus) return { text: routeProgressStatus.text, color: routeProgressStatus.color }
    return ready 
      ? { text: '就绪', color: '#1890ff' }
      : { text: '-', color: '#999' }
  }, [purchaseStatus, routeProgressStatus, ready, renderStatusText])
  
  const isDateStr = typeof displayValue === 'object'
  const displayText = isDateStr ? displayValue.text : renderStatusText(String(displayValue || ''))
  const displayColor = isDateStr ? displayValue.color : undefined
  
  return (
    <EditableCell
      value={purchaseStatus}
      record={rec}
      dataIndex={'__status' as any}
      onSave={(pid: string, _k: string, v: any) => saveStatusInput(toolingId, 'part', String(pid || ''), v)}
      renderDisplay={() => (
        <span style={displayColor ? { color: displayColor } : undefined}>
          {displayText}
        </span>
      )}
    />
  )
})
StatusCell.displayName = 'StatusCell'

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
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])
  const [blankPartDisabledMap, setBlankPartDisabledMap] = useState<Record<string, boolean>>({})
  const [blankChildDisabledMap, setBlankChildDisabledMap] = useState<Record<string, boolean>>({})
  const blankPartDisabledMapRef = useRef(blankPartDisabledMap)
  const blankChildDisabledMapRef = useRef(blankChildDisabledMap)
  useEffect(() => { blankPartDisabledMapRef.current = blankPartDisabledMap }, [blankPartDisabledMap])
  useEffect(() => { blankChildDisabledMapRef.current = blankChildDisabledMap }, [blankChildDisabledMap])
  const [extraRows, setExtraRows] = useState(2)
  const tableWrapRef = useRef<HTMLDivElement>(null)
  const savedScrollTopRef = useRef<number>(0)
  const [tableScrollY, setTableScrollY] = useState(600)
  const statusColorMap: Record<string, string> = {
    '审批中': '#faad14',
    '采购中': '#1890ff',
    '已到货': '#52c41a'
  }
  const renderStatusText = useCallback((status: string) => {
    if (!status) return null
    if (isDateString(status)) {
      return <span style={{ color: '#000000' }}>{status}</span>
    }
    return <span style={{ color: statusColorMap[status] || '#595959' }}>{status}</span>
  }, [])
  const ROUTE_BUCKET_PREFIX = 'process_routes_bucket:'
  const ROUTE_BUCKET_SLICE = 4
  const bucketKeyForInv = (inv: string) => ROUTE_BUCKET_PREFIX + String(inv || '').trim().toUpperCase().slice(0, ROUTE_BUCKET_SLICE)
  const [processRoutes, setProcessRoutes] = useState<Record<string, string>>(() => {
    try {
      const MAX_CACHE_CHARS = 900_000
      const SEGMENT_PREFIX = 'process_routes_map:'
      // 读取分段缓存
      let combined = ''
      for (let i = 0; i < 10; i++) {
        const seg = safeLocalStorage.getItem(SEGMENT_PREFIX + i)
        if (!seg) break
        combined += seg
      }
      // 主键优先，其次分段
      let stored = safeLocalStorage.getItem('process_routes_map') || ''
      if (!stored && combined) stored = combined
      if (!stored) stored = '{}'
      if (stored.length > MAX_CACHE_CHARS) {
        safeLocalStorage.removeItem('process_routes_map')
        for (let i = 0; i < 10; i++) safeLocalStorage.removeItem(SEGMENT_PREFIX + i)
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
  const workHoursFetchRef = useRef<{ timer: NodeJS.Timeout | null; lastFetchTime: number; lastKey: string }>({ timer: null, lastFetchTime: 0, lastKey: '' })
  const workHoursAggregateCacheRef = useRef<Record<string, WorkHoursAggregateCacheEntry>>({})
  const weightCacheRef = useRef<Map<string, any>>(new Map())
  const priceCacheRef = useRef<Map<string, any>>(new Map())
  const toolingRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const calibratedToolingIdsRef = useRef<Set<string>>(new Set())  // 记录已校准的行ID
  useEffect(() => {
    weightCacheRef.current.clear()
    priceCacheRef.current.clear()
  }, [materials, partTypes])
  useEffect(() => {
    partColumnsCacheRef.current.clear()
  }, [processRoutes])
  
  // 导入相关状态
  const [importModalVisible, setImportModalVisible] = useState(false)
  const [importPreviewVisible, setImportPreviewVisible] = useState(false)
  const [importPreviewData, setImportPreviewData] = useState<any[]>([])
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importSummaryVisible, setImportSummaryVisible] = useState(false)
  const [partBatchModal, setPartBatchModal] = useState<{ toolingId: string; open: boolean }>({ toolingId: '', open: false })
  const [partBatchCount, setPartBatchCount] = useState('5')
  const [importSummary, setImportSummary] = useState({
    tooling: { total: 0, success: 0, failed: 0 },
    parts: { total: 0, success: 0, failed: 0 },
    childItems: { total: 0, success: 0, failed: 0 }
  })
  const importValidationCacheRef = useRef<{ ts: number; existingInvSet: Set<string>; existingPartInvSet: Set<string> } | null>(null)
  const importValidationInflightRef = useRef<Promise<{ existingInvSet: Set<string>; existingPartInvSet: Set<string> }> | null>(null)
  const IMPORT_VALIDATION_CACHE_TTL = 60 * 1000

  // 使用自定义Hooks
  const {
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
    setSelectedRowKeys,
    setPartsMap,
    setChildItemsMap,
    setExpandedRowKeys,
    setExpandedChildKeys,
    fetchToolingData,
    fetchPartsData,
    fetchChildItemsData,
    setPartsLoadingMap,
    setChildLoadingMap,
    saveToolingData,
    savePartData,
    createTooling,
    createPart,
    createChildItem,
    batchDelete
  } = useToolingData()
  const selectedParentIds = useMemo(() => selectedRowKeys.filter(k => !k.startsWith('blank-') && !k.startsWith('part-') && !k.startsWith('child-')), [selectedRowKeys])
  const activeExpandedToolingIds = useMemo(() => {
    return Array.from(new Set(
      [...expandedRowKeys, ...expandedChildKeys]
        .map((id) => String(id || '').trim())
        .filter((id) => id && !id.startsWith('blank-') && !id.startsWith('part-') && !id.startsWith('child-'))
    ))
  }, [expandedRowKeys, expandedChildKeys])
  const toolingIdsKey = useMemo(() => {
    return data
      .map((item: any) => String(item?.id || '').trim())
      .filter((id: string) => id && !id.startsWith('blank-'))
      .sort()
      .join('|')
  }, [data])
  const saveStatusInput = useCallback(async (toolingId: string, type: 'part' | 'child', id: string, value: string) => {
    const normalized = String(normalizeDateInput(value || '') || '').trim()
    const nextValue = normalized ? normalized : null
    if (type === 'part') {
      setPartsMap(prev => {
        const list = prev[toolingId] || []
        const updated = list.map(item => item.id === id ? { ...item, purchase_status: nextValue || '' } : item)
        return { ...prev, [toolingId]: updated }
      })
      const ok = await savePartData(id, { purchase_status: nextValue })
      if (!ok) {
        message.error('状态保存失败，请重试')
        await fetchPartsData(toolingId, true)
      }
      return
    }
    setChildItemsMap(prev => {
      const list = prev[toolingId] || []
      const updated = list.map(item => item.id === id ? { ...item, purchase_status: nextValue || '' } : item)
      return { ...prev, [toolingId]: updated }
    })
    try {
      const response = await fetchWithFallback(`/api/tooling/child-items/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purchase_status: nextValue })
      })
      if (!response.ok) {
        message.error('状态保存失败，请重试')
        await fetchChildItemsData(toolingId, true)
      }
    } catch {
      message.error('状态保存失败，请重试')
      await fetchChildItemsData(toolingId, true)
    }
  }, [setPartsMap, setChildItemsMap, savePartData, fetchPartsData, fetchChildItemsData])

  const partsMapRef = useRef(partsMap)
  useEffect(() => {
    debugLog('[partsMap] updated, keys:', Object.keys(partsMap), 'total items:', Object.values(partsMap).reduce((sum, list) => sum + list.length, 0), 'timestamp:', Date.now())
    partsMapRef.current = partsMap
  }, [partsMap])
  
  const dataRef = useRef(data)
  useEffect(() => {
    dataRef.current = data
  }, [data])
  
  const materialsRef = useRef(materials)
  useEffect(() => {
    materialsRef.current = materials
  }, [materials])
  const materialUnitPriceMapRef = useRef<Record<string, number>>({})
  useEffect(() => {
    const map: Record<string, number> = {}
    ;(materials || []).forEach((m: any) => {
      const id = String(m?.id || '')
      if (!id) return
      const unitPrice = Number(m?.unit_price || 0)
      map[id] = Number.isFinite(unitPrice) ? unitPrice : 0
    })
    materialUnitPriceMapRef.current = map
  }, [materials])
  
  const materialSourcesRef = useRef(materialSources)
  const materialSourceIdNameMapRef = useRef<Map<string, string>>(new Map())
  useEffect(() => {
    materialSourcesRef.current = materialSources
    const m = new Map<string, string>()
    materialSources.forEach(ms => { if (ms.id) m.set(String(ms.id), String(ms.name || '')) })
    materialSourceIdNameMapRef.current = m
  }, [materialSources])
  
  const partTypesRef = useRef(partTypes)
  useEffect(() => {
    partTypesRef.current = partTypes
  }, [partTypes])
  
  const childItemsMapRef = useRef(childItemsMap)
  useEffect(() => {
    childItemsMapRef.current = childItemsMap
  }, [childItemsMap])
  
  const fetchPartsDataRef = useRef(fetchPartsData)
  useEffect(() => {
    fetchPartsDataRef.current = fetchPartsData
  }, [fetchPartsData])
  
  const fetchChildItemsDataRef = useRef(fetchChildItemsData)
  useEffect(() => {
    fetchChildItemsDataRef.current = fetchChildItemsData
  }, [fetchChildItemsData])
  
  const expandedRowKeysRef = useRef(expandedRowKeys)
  useEffect(() => {
    expandedRowKeysRef.current = expandedRowKeys
  }, [expandedRowKeys])

  const expandedChildKeysRef = useRef(expandedChildKeys)
  useEffect(() => {
    expandedChildKeysRef.current = expandedChildKeys
  }, [expandedChildKeys])

  const partsLoadingMapRef = useRef(partsLoadingMap)
  useEffect(() => {
    partsLoadingMapRef.current = partsLoadingMap
  }, [partsLoadingMap])

  const childLoadingMapRef = useRef(childLoadingMap)
  useEffect(() => {
    childLoadingMapRef.current = childLoadingMap
  }, [childLoadingMap])
  
  const expandedLoadInflightRef = useRef<Set<string>>(new Set())
  const toNullableTotal = useCallback((value: any): number | null => {
    if (value === null || typeof value === 'undefined' || value === '') return null
    const num = Number(value)
    return Number.isFinite(num) ? num : null
  }, [])
  const applyToolingTotalsToRow = useCallback((toolingId: string, totals: {
    material_total?: any
    process_total?: any
  }) => {
    const normalizedId = String(toolingId || '').trim()
    if (!normalizedId) return
    setData(prev => prev.map((row: any) => {
      if (String(row?.id || '') !== normalizedId) return row
      return {
        ...row,
        material_total: toNullableTotal(totals.material_total),
        process_total: toNullableTotal(totals.process_total)
      }
    }))
  }, [setData, toNullableTotal])
  const toNullableProcessAmount = useCallback((value: any): number | null => {
    if (value === null || typeof value === 'undefined' || value === '') return null
    const num = Number(value)
    return Number.isFinite(num) ? num : null
  }, [])
  const saveToolingTotalsRef = useRef<Set<string>>(new Set())
  const persistToolingTotals = useCallback(async (toolingId: string, materialTotal: number | null, processTotal: number | null) => {
    const normalizedId = String(toolingId || '').trim()
    if (!normalizedId || normalizedId.startsWith('blank-')) return
    const payloadKey = `${normalizedId}|${materialTotal ?? 'null'}|${processTotal ?? 'null'}`
    if (saveToolingTotalsRef.current.has(payloadKey)) return
    saveToolingTotalsRef.current.add(payloadKey)
    try {
      await fetchWithFallback(`/api/tooling/${encodeURIComponent(normalizedId)}/save-totals-direct`, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          material_total: materialTotal,
          process_total: processTotal
        })
      })
    } catch {
    } finally {
      window.setTimeout(() => {
        saveToolingTotalsRef.current.delete(payloadKey)
      }, 1500)
    }
  }, [])
  const resolvePartProcessAmount = useCallback((part: any): number | null => {
    const inv = String(part?.part_inventory_number || part?.inventory_number || '').trim().toUpperCase()
    if (inv && Object.prototype.hasOwnProperty.call(workHoursAmountDataRef.current, inv)) {
      const liveAmount = Number(workHoursAmountDataRef.current[inv] || 0)
      if (Number.isFinite(liveAmount)) return liveAmount
    }
    return toNullableProcessAmount(part?.process_amount)
  }, [toNullableProcessAmount])
  const syncLocalToolingTotals = useCallback((toolingId: string) => {
    const normalizedId = String(toolingId || '').trim()
    if (!normalizedId || normalizedId.startsWith('blank-')) return

    const parts = (partsMapRef.current[normalizedId] || []).filter((p: any) => !String(p?.id || '').startsWith('blank-'))
    if (parts.length === 0) {
      applyToolingTotalsToRow(normalizedId, {
        material_total: null,
        process_total: null
      })
      void persistToolingTotals(normalizedId, null, null)
      return
    }

    let materialTotal = 0
    let processTotal = 0

    parts.forEach((part: any) => {
      const qty = Number(part?.part_quantity || 0)
      const storedWeight = Number(part?.weight || 0)
      const unitWeight = storedWeight > 0 ? storedWeight : Number(calculatePartWeightRef.current(
        part?.specifications || {}, part?.material_id || '', part?.part_category || '',
        partTypesRef.current, materialsRef.current
      ) || 0)
      const totalWeight = qty > 0 && unitWeight > 0 ? Math.round(unitWeight * qty * 1000) / 1000 : 0
      const unitPrice = Number(materialUnitPriceMapRef.current[String(part?.material_id || '')] || 0)
      const matAmount = totalWeight > 0 && unitPrice > 0
        ? Number(calculateTotalPriceRef.current(totalWeight, unitPrice))
        : 0
      materialTotal += matAmount

      const inv = String(part?.part_inventory_number || part?.inventory_number || '').trim().toUpperCase()
      const resolvedAmount = resolvePartProcessAmount(part)
      const invAmount = Number(resolvedAmount || 0)
      processTotal += invAmount

    })

    const roundedMaterialTotal = Math.round(materialTotal)
    const roundedProcessTotal = Math.round(processTotal)
    applyToolingTotalsToRow(normalizedId, {
      material_total: roundedMaterialTotal,
      process_total: roundedProcessTotal
    })
    void persistToolingTotals(normalizedId, roundedMaterialTotal, roundedProcessTotal)
  }, [applyToolingTotalsToRow, persistToolingTotals, resolvePartProcessAmount])
  const fetchToolingTotalsSummary = useCallback(async (toolingIds: string[]) => {
    const ids = Array.from(new Set((toolingIds || []).map((id) => String(id || '').trim()).filter(Boolean)))
    if (ids.length === 0) return
    try {
      const response = await fetchWithFallback('/api/tooling/totals/summary', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids })
      })
      if (!response.ok) return
      const result = await response.json()
      if (!result || result.success !== true || !Array.isArray(result.items)) return
      setData((prev: any[]) => prev.map((row: any) => {
        const hit = result.items.find((item: any) => String(item?.tooling_id || '') === String(row?.id || ''))
        if (!hit) return row
        return {
          ...row,
          material_total: toNullableTotal(hit.material_total),
          process_total: toNullableTotal(hit.process_total)
        }
      }))
    } catch {
    }
  }, [setData, toNullableTotal])
  
  const ensureExpandedDataLoaded = useCallback(async (toolingId: string, force = false) => {
    // 防止重复加载同一工装的数据
    if (expandedLoadInflightRef.current.has(toolingId)) return
    expandedLoadInflightRef.current.add(toolingId)
    const tasks: Promise<any>[] = []

    const hasPartsLoaded = Object.prototype.hasOwnProperty.call(partsMapRef.current, toolingId)
    const hasChildLoaded = Object.prototype.hasOwnProperty.call(childItemsMapRef.current, toolingId)
    const partsLoading = !!partsLoadingMapRef.current[toolingId]
    const childLoading = !!childLoadingMapRef.current[toolingId]

    try {
      // 只加载未加载且不在加载中的数据
      if (!hasPartsLoaded && !partsLoading) {
        setPartsLoadingMap(prev => prev[toolingId] ? prev : ({ ...prev, [toolingId]: true }))
        tasks.push(fetchPartsDataRef.current(toolingId))
      }

      if (!hasChildLoaded && !childLoading) {
        setChildLoadingMap(prev => prev[toolingId] ? prev : ({ ...prev, [toolingId]: true }))
        tasks.push(fetchChildItemsDataRef.current(toolingId))
      }

      // 🔥 优化：并行预加载工时金额数据（无需等待800ms防抖）
      const existingParts = partsMapRef.current[toolingId] || []
      let workHoursPromise: Promise<void> | null = null
      if (existingParts.length > 0) {
        const invs = existingParts
          .map((p: any) => String(p.part_inventory_number || p.inventory_number || '').trim().toUpperCase())
          .filter(Boolean)
        if (invs.length > 0) {
          workHoursPromise = fetchWorkHoursDataRef.current(invs)
        }
      }

      if (tasks.length > 0) {
        await Promise.all(tasks)

        // 零件数据加载完成后，再次触发工时数据加载（确保覆盖所有新零件）
        const freshParts = partsMapRef.current[toolingId] || []
        if (freshParts.length > 0) {
          const freshInvs = freshParts
            .map((p: any) => String(p.part_inventory_number || p.inventory_number || '').trim().toUpperCase())
            .filter(Boolean)
          if (freshInvs.length > 0) {
            const freshPromise = fetchWorkHoursDataRef.current(freshInvs)
            if (workHoursPromise) {
              workHoursPromise = Promise.all([workHoursPromise, freshPromise]).then(() => {})
            } else {
              workHoursPromise = freshPromise
            }
          }
        }
      }

      // 🔥 关键：等待工时数据加载完成后，再计算总额
      if (workHoursPromise) {
        await workHoursPromise
        const finalParts = partsMapRef.current[toolingId] || []
        const finalInvs = finalParts
          .map((p: any) => String(p.part_inventory_number || p.inventory_number || '').trim().toUpperCase())
          .filter(Boolean)
        if (finalInvs.length > 0) {
          workHoursFetchRef.current.lastKey = finalInvs.slice().sort().join('|')
          workHoursFetchRef.current.lastFetchTime = Date.now()
        }
      }

      syncLocalToolingTotals(toolingId)
    } finally {
      expandedLoadInflightRef.current.delete(toolingId)
    }
  }, [setPartsLoadingMap, setChildLoadingMap, syncLocalToolingTotals])

  const setExpandedChildKeysRef = useRef(setExpandedChildKeys)
  useEffect(() => {
    setExpandedChildKeysRef.current = setExpandedChildKeys
  }, [setExpandedChildKeys])
  useEffect(() => {
    const invs = new Set<string>()
    ensureBlankToolings(data).forEach(d => {
      const inv = String(d.inventory_number || '').trim().toUpperCase()
      if (inv) invs.add(inv)
    })
    Object.values(partsMap).forEach(list => (list || []).forEach(p => {
      const inv = String(p.part_inventory_number || '').trim().toUpperCase()
      if (inv) invs.add(inv)
    }))
    const buckets = Array.from(new Set(Array.from(invs).map(bucketKeyForInv)))
    const merged: Record<string, string> = {}
    buckets.forEach(k => {
      try {
        const s = safeLocalStorage.getItem(k)
        if (!s) return
        const obj = JSON.parse(s)
        Object.entries(obj || {}).forEach(([kk, vv]) => {
          if (typeof vv === 'string') merged[kk] = String(vv)
        })
      } catch {}
    })
    if (Object.keys(merged).length > 0) setProcessRoutes(prev => ({ ...prev, ...merged }))
  }, [data, partsMap])
  
  const selectedRowKeysRef = useRef(selectedRowKeys)
  useEffect(() => {
    selectedRowKeysRef.current = selectedRowKeys
  }, [selectedRowKeys])
  
  useEffect(() => {
    const parentKeys = selectedRowKeys.filter(k => !k.startsWith('part-') && !k.startsWith('child-'))
    const existingChildKeys = selectedRowKeys.filter(k => k.startsWith('part-') || k.startsWith('child-'))
    const derivedChildKeys: string[] = []
    parentKeys.forEach(pid => {
      const parts = (partsMap[String(pid)] || []).filter(p => !String(p.id || '').startsWith('blank-'))
      derivedChildKeys.push(...parts.map(p => 'part-' + p.id))
      const childItems = (childItemsMap[String(pid)] || []).filter(c => !String(c.id || '').startsWith('blank-'))
      derivedChildKeys.push(...childItems.map(c => 'child-' + c.id))
    })
    const nextSet = new Set([...parentKeys, ...existingChildKeys, ...derivedChildKeys])
    const prevSet = new Set(selectedRowKeys)
    const next = Array.from(nextSet)
    const diff = nextSet.size !== prevSet.size || next.some(k => !prevSet.has(k))
    if (diff) setSelectedRowKeys(next)
  }, [partsMap, childItemsMap, selectedRowKeys])
  
  // 防抖保存空白行的定时器
  const partSaveTimersRef = useRef<Record<string, NodeJS.Timeout>>({})
  // 子表防抖保存定时器
  const childSaveTimersRef = useRef<Record<string, NodeJS.Timeout>>({})
  // 零件保存锁，防止并发保存
  const partSaveLockRef = useRef<Set<string>>(new Set())
  // 缓存 columns，避免重复创建
  const partColumnsCacheRef = useRef<Map<string, any>>(new Map())
  const childColumnsCacheRef = useRef<Map<string, any>>(new Map())
  const MAX_COLUMN_CACHE = 50

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

    const batch = Array.from(keys).slice(0, 400)
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
      const chunkSize = 20
      for (let i = 0; i < batch.length; i += chunkSize) {
        if (cancelled) break
        const slice = batch.slice(i, i + chunkSize)
        const results = await Promise.all(slice.map(k => getProcessDone(k)))
        results.forEach((v, idx) => {
          if (!cancelled && v) pairs.push([slice[idx], v])
        })
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
    const rn = String(user?.real_name || '').trim()
    if (!rn) return ''
    return String(userTeamsMap[rn] || '').trim()
  }, [user, userTeamsMap])
  useEffect(() => {
    (async () => {
      try {
        const companyId = String((user as any)?.company_id || '').trim()
        const [usersResp, teamsResp] = await Promise.all([
          fetchWithFallback('/api/users'),
          fetchWithFallback(companyId ? `/api/tooling/org/teams?company_id=${encodeURIComponent(companyId)}&ts=${Date.now()}` : `/api/tooling/org/teams?ts=${Date.now()}`)
        ])
        const usersJson = usersResp.ok ? await usersResp.json() : { users: [] }
        const teamsJson = teamsResp.ok ? await teamsResp.json() : { items: [] }
        const map: Record<string, string> = {}
        const teams = Array.isArray(teamsJson?.items) ? teamsJson.items : (Array.isArray(teamsJson?.data) ? teamsJson.data : [])
        const teamNameById = new Map<string, string>()
        ;(teams || []).forEach((team: any) => {
          const id = String(team?.id || '').trim()
          if (!id) return
          teamNameById.set(id, String(team?.name || '').trim())
        })
        const users = Array.isArray(usersJson?.users) ? usersJson.users : (Array.isArray(usersJson?.items) ? usersJson.items : [])
        ;(users || []).forEach((u: any) => {
          const companyMatched = !companyId || String(u?.company_id || '').trim() === companyId
          if (!companyMatched) return
          const name = String(u?.real_name || '').trim()
          if (!name) return
          const teamId = String(u?.team_id || u?.team?.id || '').trim()
          const teamName = String(u?.team?.name || teamNameById.get(teamId) || '').trim()
          map[name] = teamName
        })
        setUserTeamsMap(map)
        setTeamsLoaded(true)
      } catch {
        setUserTeamsMap({})
        setTeamsLoaded(true)
      }
    })()
  }, [user])

  const visibleData = useMemo(() => {
    if (isTechnician && !teamsLoaded) return []
    if (!isTechnician) return data
    const currentUserName = String(user?.real_name || '').trim()
    if (!myTeamName && !currentUserName) return data
    return (data || []).filter((row: any) => {
      const rec = String(row?.recorder || '').trim()
      const team = String(userTeamsMap[rec] || '').trim()
      const sameTeam = !!myTeamName && team === myTeamName
      const ownCreated = !!currentUserName && rec === currentUserName
      return sameTeam || ownCreated
    })
  }, [data, isTechnician, myTeamName, userTeamsMap, teamsLoaded, user])
  const [filterInventory, setFilterInventory] = useState('')
  const [filterProject, setFilterProject] = useState('')
  const [filterPartDrawing, setFilterPartDrawing] = useState('')
  const [filterUnit, setFilterUnit] = useState<string | undefined>(undefined)
  const [filterCategory, setFilterCategory] = useState<string | undefined>(undefined)
  const [filterRecorder, setFilterRecorder] = useState<string | undefined>(undefined)
  const [filterPriority, setFilterPriority] = useState<number | undefined>(undefined)
  const [filterStatus, setFilterStatus] = useState<'all' | 'completed' | 'incomplete'>('incomplete')
  const [inventoryMatchedToolingIds, setInventoryMatchedToolingIds] = useState<string[] | null>(null)
  const [partDrawingMatchedToolingIds, setPartDrawingMatchedToolingIds] = useState<string[] | null>(null)
  const [partDrawingOptions, setPartDrawingOptions] = useState<Array<{ value: string; label: string }>>([])
  const debouncedFilterInventory = useDebouncedValue(filterInventory)
  const debouncedFilterProject = useDebouncedValue(filterProject)
  const debouncedFilterPartDrawing = useDebouncedValue(filterPartDrawing)
  const debouncedFilterUnit = useDebouncedValue(filterUnit)
  const debouncedFilterCategory = useDebouncedValue(filterCategory)
  const debouncedFilterRecorder = useDebouncedValue(filterRecorder)
  const { filteredVisibleData, counts } = useMemo(() => {
    let result = visibleData || []
    
    if (filterPriority) {
      result = result.filter((row: any) => Number(row.priority_level || 0) === filterPriority)
    }

    const unitKeyword = String(debouncedFilterUnit || '').trim().toUpperCase()
    if (unitKeyword) {
      result = result.filter((row: any) => String(row?.production_unit || '').trim().toUpperCase().includes(unitKeyword))
    }

    const categoryKeyword = String(debouncedFilterCategory || '').trim().toUpperCase()
    if (categoryKeyword) {
      result = result.filter((row: any) => String(row?.category || '').trim().toUpperCase().includes(categoryKeyword))
    }

    const inventoryKeyword = sanitizeAlphaNumeric(debouncedFilterInventory)
    if (inventoryKeyword) {
      const matchedSet = new Set((inventoryMatchedToolingIds || []).map((id) => String(id || '').trim()).filter(Boolean))
      result = result.filter((row: any) => {
        const parentInv = sanitizeAlphaNumeric(row?.inventory_number)
        const id = String(row?.id || '').trim()
        return parentInv.includes(inventoryKeyword) || matchedSet.has(id)
      })
    }

    const projectKeyword = String(debouncedFilterProject || '').trim().toUpperCase()
    if (projectKeyword) {
      result = result.filter((row: any) => String(row?.project_name || '').trim().toUpperCase().includes(projectKeyword))
    }

    const drawingKeyword = sanitizeAlphaNumeric(debouncedFilterPartDrawing)
    if (drawingKeyword && shouldRunDrawingChildSearch(drawingKeyword)) {
      if (Array.isArray(partDrawingMatchedToolingIds)) {
        const matchedSet = new Set(partDrawingMatchedToolingIds.map((id) => String(id || '').trim()).filter(Boolean))
        result = result.filter((row: any) => matchedSet.has(String(row?.id || '').trim()))
      } else {
        result = []
      }
    }

    const recorderKeyword = String(debouncedFilterRecorder || '').trim().toUpperCase()
    if (recorderKeyword) {
      result = result.filter((row: any) => String(row?.recorder || '').trim().toUpperCase().includes(recorderKeyword))
    }

    // 计算各状态数量
    const allCount = result.length
    const completedCount = result.filter((row: any) => !!row.completed_date && String(row.completed_date).trim() !== '').length
    const incompleteCount = allCount - completedCount
    
    if (filterStatus !== 'all') {
      result = result.filter((row: any) => {
        // 只要有完成日期，就是完成状态
        const hasCompletedDate = !!row.completed_date && String(row.completed_date).trim() !== ''
        
        if (filterStatus === 'completed') return hasCompletedDate
        if (filterStatus === 'incomplete') return !hasCompletedDate
        return true
      })
    }

    // 排序逻辑：按盘存编号排序（提取数字部分），字母不同的按接收日期、需求日期排序
    const sortedResult = [...result].sort((a: any, b: any) => {
      // 1. 按盘存编号排序
      const invA = String(a.inventory_number || '').trim().toUpperCase()
      const invB = String(b.inventory_number || '').trim().toUpperCase()

      // 提取字母前缀和数字部分
      const matchA = invA.match(/^([A-Z]+)(\d+)$/)
      const matchB = invB.match(/^([A-Z]+)(\d+)$/)

      if (matchA && matchB) {
        const prefixA = matchA[1]
        const prefixB = matchB[1]
        const numA = matchA[2]
        const numB = matchB[2]

        // 如果字母前缀相同，按数字部分排序
        if (prefixA === prefixB) {
          return numA.localeCompare(numB, undefined, { numeric: true })
        }
      }

      // 字母不同或格式不匹配，按接收日期排序
      const dateA = String(a.received_date || '').trim()
      const dateB = String(b.received_date || '').trim()

      if (dateA && dateB) {
        const cmp = dateA.localeCompare(dateB)
        if (cmp !== 0) return cmp
      } else if (dateA) {
        return -1
      } else if (dateB) {
        return 1
      }

      // 接收日期相同或都为空，按需求日期排序
      const demandA = String(a.demand_date || '').trim()
      const demandB = String(b.demand_date || '').trim()

      if (demandA && demandB) {
        return demandA.localeCompare(demandB)
      } else if (demandA) {
        return -1
      } else if (demandB) {
        return 1
      }

      return 0
    })

    return {
      filteredVisibleData: sortedResult,
      counts: { all: allCount, completed: completedCount, incomplete: incompleteCount }
    }
  }, [visibleData, filterPriority, filterStatus, debouncedFilterInventory, inventoryMatchedToolingIds, debouncedFilterProject, debouncedFilterPartDrawing, partDrawingMatchedToolingIds, debouncedFilterRecorder, debouncedFilterUnit, debouncedFilterCategory])

  useEffect(() => {
    if (shouldRunInventoryChildSearch(debouncedFilterInventory) || shouldRunDrawingChildSearch(debouncedFilterPartDrawing)) {
      return
    }
    const parentIds = (filteredVisibleData || [])
      .map((row: any) => String(row?.id || '').trim())
      .filter((id: string) => id && !id.startsWith('blank-'))
      .slice(0, VISIBLE_PART_PREFETCH_LIMIT)
    const targetIds = Array.from(new Set([...activeExpandedToolingIds, ...parentIds]))
    const needFetch = targetIds.filter((id) => !Object.prototype.hasOwnProperty.call(partsMapRef.current, id) && !partsLoadingMapRef.current[id])
    if (needFetch.length === 0) return
    let cancelled = false
    const timer = setTimeout(async () => {
      const chunkSize = 4
      for (let i = 0; i < needFetch.length; i += chunkSize) {
        if (cancelled) return
        const group = needFetch.slice(i, i + chunkSize)
        await Promise.all(group.map((id) => fetchPartsDataRef.current(id).catch(() => null)))
      }
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [filteredVisibleData, partsMap, partsLoadingMap, debouncedFilterInventory, debouncedFilterPartDrawing, activeExpandedToolingIds])

  const tableRows = useMemo(() => ensureBlankToolings(filteredVisibleData), [filteredVisibleData])

  const autoExpandPartDrawingRef = useRef('')
  const autoExpandInventoryRef = useRef('')
  useEffect(() => {
    const keyword = sanitizeAlphaNumeric(debouncedFilterInventory)
    if (!keyword) {
      autoExpandInventoryRef.current = ''
      setInventoryMatchedToolingIds(null)
      return
    }
    if (!shouldRunInventoryChildSearch(keyword)) {
      autoExpandInventoryRef.current = ''
      setInventoryMatchedToolingIds(null)
      return
    }
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const resp = await fetchWithFallback(`/api/tooling/parts/inventory-list?page=1&pageSize=120&search=${encodeURIComponent(keyword)}`, { cache: 'no-store' })
        const js = await resp.json().catch(() => ({}))
        const items = Array.isArray(js?.items) ? js.items : []
        if (cancelled) return
        const matchedIds: string[] = Array.from(new Set<string>(
          items
            .filter((it: any) => sanitizeAlphaNumeric(it?.part_inventory_number).includes(keyword))
            .map((it: any) => String(it?.tooling_id || '').trim())
            .filter(Boolean)
        ))
        setInventoryMatchedToolingIds(matchedIds)
      } catch {
        if (!cancelled) {
          setInventoryMatchedToolingIds([])
        }
      }
    }, 220)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [debouncedFilterInventory])

  useEffect(() => {
    const keyword = sanitizeAlphaNumeric(debouncedFilterInventory)
    if (!keyword || !shouldRunInventoryChildSearch(keyword)) return
    const targetIds = (filteredVisibleData || [])
      .map((row: any) => String(row?.id || '').trim())
      .filter((id: string) => id && !id.startsWith('blank-'))
      .slice(0, AUTO_EXPAND_PARENT_LIMIT)
    if (targetIds.length === 0) return
    const signature = `${keyword}|${targetIds.join(',')}`
    if (autoExpandInventoryRef.current === signature) return
    autoExpandInventoryRef.current = signature
    let cancelled = false
    const timer = setTimeout(async () => {
      if (cancelled) return
      setExpandedRowKeys(prev => Array.from(new Set([...prev, ...targetIds])))
      setExpandedChildKeys(prev => Array.from(new Set([...prev, ...targetIds])))
      for (const id of targetIds) {
        if (cancelled) return
        await ensureExpandedDataLoaded(id, false)
      }
    }, 120)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [debouncedFilterInventory, filteredVisibleData, ensureExpandedDataLoaded, setExpandedChildKeys, setExpandedRowKeys])

  useEffect(() => {
    const keyword = String(debouncedFilterPartDrawing || '').trim()
    if (!keyword) {
      autoExpandPartDrawingRef.current = ''
      setPartDrawingMatchedToolingIds(null)
      setPartDrawingOptions([])
      return
    }
    const normalizedKeyword = sanitizeAlphaNumeric(keyword)
    if (!shouldRunDrawingChildSearch(normalizedKeyword)) {
      autoExpandPartDrawingRef.current = ''
      setPartDrawingMatchedToolingIds(null)
      setPartDrawingOptions([])
      return
    }
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const resp = await fetchWithFallback(`/api/tooling/parts/inventory-list?page=1&pageSize=200&search=${encodeURIComponent(keyword)}`, { cache: 'no-store' })
        const js = await resp.json().catch(() => ({}))
        const items = (Array.isArray(js?.items) ? js.items : []).filter((it: any) => {
          const drawing = String(it?.part_drawing_number || '').replace(/\s+/g, '').toUpperCase()
          return !!drawing && drawing.includes(normalizedKeyword)
        })
        if (cancelled) return
        const matchedIds: string[] = Array.from(new Set<string>(
          items
            .map((it: any) => String(it?.tooling_id || '').trim())
            .filter(Boolean)
        ))
        const drawings: string[] = Array.from(new Set<string>(
          items
            .map((it: any) => sanitizeAlphaNumeric(it?.part_drawing_number))
            .filter((v: string) => v.includes(normalizedKeyword))
        )).slice(0, 40)
        setPartDrawingMatchedToolingIds(matchedIds)
        setPartDrawingOptions(drawings.map(v => ({ value: v, label: v })))
      } catch {
        if (!cancelled) {
          setPartDrawingMatchedToolingIds([])
          setPartDrawingOptions([])
        }
      }
    }, 260)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [debouncedFilterPartDrawing])

  useEffect(() => {
    const keyword = String(debouncedFilterPartDrawing || '').trim()
    if (!keyword || !shouldRunDrawingChildSearch(keyword)) return
    const targetIds = (filteredVisibleData || [])
      .map((row: any) => String(row?.id || '').trim())
      .filter((id: string) => id && !id.startsWith('blank-'))
      .slice(0, AUTO_EXPAND_PARENT_LIMIT)
    if (targetIds.length === 0) return
    const signature = `${keyword}|${targetIds.join(',')}`
    if (autoExpandPartDrawingRef.current === signature) return
    autoExpandPartDrawingRef.current = signature
    let cancelled = false
    const timer = setTimeout(async () => {
      if (cancelled) return
      setExpandedRowKeys(prev => Array.from(new Set([...prev, ...targetIds])))
      setExpandedChildKeys(prev => Array.from(new Set([...prev, ...targetIds])))
      for (const id of targetIds) {
        if (cancelled) return
        await ensureExpandedDataLoaded(id, false)
      }
    }, 120)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [debouncedFilterPartDrawing, filteredVisibleData, ensureExpandedDataLoaded, setExpandedChildKeys, setExpandedRowKeys])

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
  const projectOptions = useMemo(() => {
    const keyword = String(filterProject || '').trim().toUpperCase()
    const set = new Set<string>()
    data.forEach(d => {
      const v = String(d.project_name || '').trim()
      if (!v) return
      if (!keyword || v.toUpperCase().includes(keyword)) set.add(v)
    })
    return Array.from(set).slice(0, 80).map(v => ({ value: v, label: v }))
  }, [data, filterProject])
  const recorderOptions = useMemo(() => {
    const keyword = String(filterRecorder || '').trim().toUpperCase()
    const set = new Set<string>()
    data.forEach(d => {
      const v = String(d.recorder || '').trim()
      if (!v) return
      if (!keyword || v.toUpperCase().includes(keyword)) set.add(v)
    })
    return Array.from(set).slice(0, 80).map(v => ({ value: v, label: v }))
  }, [data, filterRecorder])
  
  // 工时数据状态，存储所有已录入的工时记录
  const [workHoursData, setWorkHoursData] = useState<Record<string, string[]>>({})
  const [workHoursProcessCompletedQtyData, setWorkHoursProcessCompletedQtyData] = useState<Record<string, Record<string, number>>>({})
  const [workHoursProcessHoursData, setWorkHoursProcessHoursData] = useState<Record<string, Record<string, number>>>({})
  const [workHoursAmountData, setWorkHoursAmountData] = useState<Record<string, number>>({})
  const [workHoursProcessLatestMetaData, setWorkHoursProcessLatestMetaData] = useState<Record<string, Record<string, {
    process_name: string
    operator: string
    shift: string
    team_name: string
    device_no: string
    device_name: string
    process_unit_price: number
    completed_quantity: number
    at: number
  }>>>({})
  const [manualStepUpdateMap, setManualStepUpdateMap] = useState<Record<string, {
    step_key: string
    step_name: string
    operator: string
    updated_at: number
  }>>({})
  const workHoursAmountDataRef = useRef(workHoursAmountData)
  useEffect(() => {
    workHoursAmountDataRef.current = workHoursAmountData
  }, [workHoursAmountData])
  
  // 获取工时数据，用于判断工艺路线是否已录入工时
  const fetchWorkHoursData = useCallback(async (invs?: string[]) => {
    const normalizedInvs = Array.from(new Set(
      (Array.isArray(invs) ? invs : [])
        .map((inv) => String(inv || '').trim().toUpperCase())
        .filter(Boolean)
    ))
    if (normalizedInvs.length === 0) {
      setWorkHoursData({})
      setWorkHoursProcessCompletedQtyData({})
      setWorkHoursProcessHoursData({})
      setWorkHoursAmountData({})
      setWorkHoursProcessLatestMetaData({})
      return
    }

    const buildStateFromCache = (targetInvs: string[]) => {
      const nextData: Record<string, string[]> = {}
      const nextProcessCompletedQty: Record<string, Record<string, number>> = {}
      const nextProcessHours: Record<string, Record<string, number>> = {}
      const nextAmount: Record<string, number> = {}
      const nextLatestMeta: Record<string, WorkHoursLatestMetaMap> = {}
      targetInvs.forEach((inv) => {
        const entry = workHoursAggregateCacheRef.current[inv]
        if (!entry) return
        nextData[inv] = Array.isArray(entry.data) ? [...entry.data] : []
        nextProcessCompletedQty[inv] = { ...(entry.processCompletedQtyData || {}) }
        nextProcessHours[inv] = { ...(entry.processHoursData || {}) }
        nextAmount[inv] = Number(entry.amountData || 0)
        nextLatestMeta[inv] = { ...(entry.processLatestMetaData || {}) }
      })
      setWorkHoursData(nextData)
      setWorkHoursProcessCompletedQtyData(nextProcessCompletedQty)
      setWorkHoursProcessHoursData(nextProcessHours)
      setWorkHoursAmountData(nextAmount)
      setWorkHoursProcessLatestMetaData(nextLatestMeta)
      return nextData
    }

    const now = Date.now()
    const staleInvs = normalizedInvs.filter((inv) => {
      const entry = workHoursAggregateCacheRef.current[inv]
      return !entry || now - Number(entry.fetchedAt || 0) > WORK_HOURS_CACHE_TTL
    })

    if (staleInvs.length === 0) {
      const cachedData = buildStateFromCache(normalizedInvs)
      debugLog('命中工时缓存:', cachedData)
      return
    }

    let hasFreshData = false
    let lastError: any = null
    for (const chunk of chunkArray(staleInvs, WORK_HOURS_AGG_CHUNK_SIZE)) {
      try {
        const url = `/api/tooling/work-hours/aggregates?invs=${encodeURIComponent(chunk.join(','))}`
        const response = await fetchWithFallback(url, { cache: 'no-store' })
        if (!response.ok) {
          throw new Error(`获取工时数据失败(${response.status})`)
        }
        const result = await response.json()
        if (!result || typeof result !== 'object') {
          throw new Error('获取工时数据失败，响应格式错误')
        }
        if (result.success !== true) {
          throw new Error(String(result.error || '获取工时数据失败'))
        }

        const hoursByInventoryNo: Record<string, string[]> = result?.data || {}
        const processCompletedQtyByInventoryNo: Record<string, Record<string, number>> = result?.processCompletedQtyData || {}
        const processHoursByInventoryNo: Record<string, Record<string, number>> = result?.processHoursData || {}
        const amountByInventoryNo: Record<string, number> = result?.amountData || {}
        const processLatestMetaByInventoryNo: Record<string, WorkHoursLatestMetaMap> = result?.processLatestMetaData || {}

        chunk.forEach((inv) => {
          workHoursAggregateCacheRef.current[inv] = {
            fetchedAt: Date.now(),
            data: Array.isArray(hoursByInventoryNo[inv]) ? [...hoursByInventoryNo[inv]] : [],
            processCompletedQtyData: { ...(processCompletedQtyByInventoryNo[inv] || {}) },
            processHoursData: { ...(processHoursByInventoryNo[inv] || {}) },
            amountData: Number(amountByInventoryNo[inv] || 0),
            processLatestMetaData: { ...(processLatestMetaByInventoryNo[inv] || {}) }
          }
        })
        hasFreshData = true
      } catch (error) {
        lastError = error
        console.error('获取工时数据失败:', error)
      }
    }

    const mergedData = buildStateFromCache(normalizedInvs)
    if (!hasFreshData && lastError) {
      console.error('工时聚合全部请求失败，继续使用已有缓存/空结果:', lastError)
    } else {
      debugLog('成功获取工时数据:', mergedData)
    }
  }, [])
  
  const fetchWorkHoursDataRef = useRef(fetchWorkHoursData)
  useEffect(() => {
    fetchWorkHoursDataRef.current = fetchWorkHoursData
  }, [fetchWorkHoursData])
  
  // 当展开/子表加载或筛选变更时，按当前页面相关盘存编号按需拉取工时数据（500ms 防抖）
  useEffect(() => {
    if (activeExpandedToolingIds.length === 0) {
      if (workHoursFetchRef.current.timer) clearTimeout(workHoursFetchRef.current.timer)
      workHoursFetchRef.current.timer = null
      workHoursFetchRef.current.lastKey = ''
      return
    }
    const invsSet = new Set<string>()
    activeExpandedToolingIds.forEach((toolingId) => {
      const partsList = partsMapRef.current[toolingId] || []
      partsList.forEach((part: any) => {
        const partInv = String(part?.part_inventory_number || part?.inventory_number || '').trim().toUpperCase()
        if (partInv) invsSet.add(partInv)
      })
    })
    const invs = Array.from(invsSet)
    if (invs.length === 0) return
    const now = Date.now()
    const last = workHoursFetchRef.current.lastFetchTime || 0
    const nextKey = invs.slice().sort().join('|')
    if (nextKey === workHoursFetchRef.current.lastKey && now - last < 3000) return
    workHoursFetchRef.current.lastKey = nextKey
    if (workHoursFetchRef.current.timer) clearTimeout(workHoursFetchRef.current.timer)
    // 固定延迟拉取，避免盘存编号编辑后立即触发大量计算和请求，提升输入顺滑度
    workHoursFetchRef.current.timer = setTimeout(() => {
      fetchWorkHoursData(invs)
      workHoursFetchRef.current.lastFetchTime = Date.now()
    }, 800)
    return () => {
      if (workHoursFetchRef.current.timer) clearTimeout(workHoursFetchRef.current.timer)
      workHoursFetchRef.current.timer = null
    }
  }, [activeExpandedToolingIds, partsMap, fetchWorkHoursData])

  useEffect(() => {
    // 智能总额计算策略 - 分阶段执行：
    // 阶段1: data 加载完成 → 计算材料总额（不依赖工时数据）
    // 阶段2: partsMap 加载完成 → 补充计算之前跳过的行
    // 阶段3: workHoursAmountData 到达 → 重新计算加工总额

    const allToolingIds = data
      .filter(item => !String(item.id || '').startsWith('blank-'))
      .map(item => String(item.id || ''))

    if (allToolingIds.length === 0) return

    // ✅ 正确策略：页面加载用DB值，展开子表时校准更新
    //
    // 1. 页面加载 → 直接显示后端返回的 material_total/process_total（不计算）
    // 2. 用户展开某行的子表 → 触发一次校准计算 + 保存到数据库
    // 3. 使用 calibratedToolingIds 记录已校准的行，避免重复

  }, [data, partsMap, workHoursAmountData])
  
  // 监听工时提交广播，刷新工时数据
  useEffect(() => {
    let bc: BroadcastChannel | null = null
    try {
      bc = new BroadcastChannel('work_hours_channel')
      bc.onmessage = (event) => {
        if (event.data?.type === 'work_hours_submitted') {
          console.log('收到工时提交广播:', event.data)
          // 清除缓存，强制刷新工时数据
          workHoursFetchRef.current.lastKey = ''
          workHoursFetchRef.current.lastFetchTime = 0
          const submittedInv = String(event.data?.inventoryNo || '').trim().toUpperCase()
          if (submittedInv) {
            delete workHoursAggregateCacheRef.current[submittedInv]
          } else {
            workHoursAggregateCacheRef.current = {}
          }
          // 清除列缓存，确保列定义重新创建
          partColumnsCacheRef.current.clear()
          childColumnsCacheRef.current.clear()
          // 使用广播中的盘存编号，同时仅收集当前已展开行相关盘存编号
          const invsSet = new Set<string>()
          if (submittedInv) invsSet.add(submittedInv)
          activeExpandedToolingIds.forEach((toolingId) => {
            const parent = dataRef.current.find((row: any) => String(row?.id || '') === toolingId)
            const inv = String(parent?.inventory_number || '').trim().toUpperCase()
            if (inv) invsSet.add(inv)
            const partsList = partsMapRef.current[toolingId] || []
            partsList.forEach((part: any) => {
              const partInv = String(part?.part_inventory_number || '').trim().toUpperCase()
              if (partInv) invsSet.add(partInv)
            })
          })
          const invs = Array.from(invsSet)
          console.log('刷新工时数据，盘存编号列表:', invs)
          if (invs.length > 0) {
            fetchWorkHoursData(invs)
            workHoursFetchRef.current.lastFetchTime = Date.now()
            workHoursFetchRef.current.lastKey = invs.slice().sort().join('|')
          }
        }
      }
    } catch {}
    return () => {
      if (bc) {
        try { bc.close() } catch {}
      }
    }
  }, [activeExpandedToolingIds, fetchWorkHoursData])
  
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
  
  const materialOptionsRef = useRef(materialOptions)
  useEffect(() => {
    materialOptionsRef.current = materialOptions
  }, [materialOptions])
  
  const materialSourceNameMapRef = useRef(materialSourceNameMap)
  useEffect(() => {
    materialSourceNameMapRef.current = materialSourceNameMap
  }, [materialSourceNameMap])
  
  const materialSourceOptionsRef = useRef(materialSourceOptions)
  useEffect(() => {
    materialSourceOptionsRef.current = materialSourceOptions
  }, [materialSourceOptions])
  
  const partTypeOptionsRef = useRef(partTypeOptions)
  useEffect(() => {
    partTypeOptionsRef.current = partTypeOptions
  }, [partTypeOptions])
  
  const workHoursDataRef = useRef(workHoursData)
  useEffect(() => {
    workHoursDataRef.current = workHoursData
  }, [workHoursData])
  
  const {
    generateCuttingOrders,
    generatePurchaseOrders,
    calculatePartWeight
  } = useToolingOperations()
  
  const calculatePartWeightRef = useRef(calculatePartWeight)
  useEffect(() => {
    calculatePartWeightRef.current = calculatePartWeight
  }, [calculatePartWeight])
  
  const calculateTotalPriceRef = useRef(calculateTotalPrice)
  useEffect(() => {
    calculateTotalPriceRef.current = calculateTotalPrice
  }, [calculateTotalPrice])

  const calcPartMetrics = useCallback((row: PartItem, forceRecalculate = false) => {
    const unitWeightRaw = Number(row.weight ?? 0)
    // 当 forceRecalculate 为 true 时，强制根据规格重新计算重量
    const unitWeight = (unitWeightRaw > 0 && !forceRecalculate)
      ? unitWeightRaw
      : calculatePartWeightRef.current(row.specifications || {}, row.material_id || '', row.part_category || '', partTypesRef.current, materialsRef.current)
    const qty = Number(row.part_quantity || 0)
    const totalWeight = qty > 0 && unitWeight > 0 ? Math.round(unitWeight * qty * 1000) / 1000 : 0
    const unitPrice = Number(materialUnitPriceMapRef.current[String(row.material_id || '')] || 0)
    const totalPrice = totalWeight > 0 && unitPrice > 0 ? Number(calculateTotalPriceRef.current(totalWeight, unitPrice)) : 0
    return {
      unitWeight: Number.isFinite(unitWeight) ? unitWeight : 0,
      totalWeight: Number.isFinite(totalWeight) ? totalWeight : 0,
      totalPrice: Number.isFinite(totalPrice) ? totalPrice : 0
    }
  }, [])

  // 空白行数据
  function ensureBlankToolings(list: RowItem[]) {
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
        priority_level: 0,
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

  // 输入后不立即全量重拉，避免旧数据覆盖导致“必须刷新才显示”的感知。
  // 改为延迟合并刷新，既保留丝滑编辑体验，也维持后端一致性。
  const scheduleBackgroundRefresh = useCallback((delayMs = 1500) => {
    if (toolingRefreshTimerRef.current) {
      clearTimeout(toolingRefreshTimerRef.current)
    }
    toolingRefreshTimerRef.current = setTimeout(() => {
      runWithPreservedScroll(async () => {
        await fetchToolingData({ silent: true })
      }).catch(() => {})
    }, delayMs)
  }, [fetchToolingData, runWithPreservedScroll])

  useEffect(() => {
    return () => {
      if (toolingRefreshTimerRef.current) {
        clearTimeout(toolingRefreshTimerRef.current)
      }
    }
  }, [])
  useEffect(() => {
    const ids = toolingIdsKey ? toolingIdsKey.split('|').filter(Boolean) : []
    if (ids.length === 0) return
    fetchToolingTotalsSummary(ids)
  }, [fetchToolingTotalsSummary, toolingIdsKey])
  const handleRefresh = useCallback(async () => {
    await fetchAllMeta(true)
    await fetchToolingData()
    const expandedIds = Array.from(new Set([...expandedRowKeys, ...expandedChildKeys]))
    if (expandedIds.length > 0) {
      const concurrency = Math.max(1, Math.min(6, getBatchSize()))
      await runWithConcurrency(expandedIds, concurrency, async (id) => {
        await Promise.all([
        fetchPartsData(id, true),
        fetchChildItemsData(id, true)
        ])
      })
    }
  }, [fetchAllMeta, fetchToolingData, fetchPartsData, fetchChildItemsData, expandedRowKeys, expandedChildKeys])

  const handleCollapseAll = useCallback(() => {
    setExpandedRowKeys([])
    setExpandedChildKeys([])
  }, [setExpandedChildKeys, setExpandedRowKeys])

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
  const handleSave = useCallback(async (id: string, key: keyof RowItem, value: any) => {
    try {
      // 重复盘存编号即时校验与提示
      if (key === 'inventory_number') {
        const newInv = String(value || '').trim().toUpperCase()
        value = newInv
        if (newInv) {
          const dup = dataRef.current.find(r => !String(r.id).startsWith('blank-') && String(r.inventory_number || '').trim().toUpperCase() === newInv)
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
            priority_level: 0,
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

          const exists = prev.some(r => r.id === id)
          if (exists) {
            return prev.map(r => r.id === id ? updatedRow : r)
          }
          // 修复：渲染层生成的空白行首次输入时，先写入真实状态，避免失焦后“消失”
          return [...prev, updatedRow]
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
        if (Number(updatedRowData.priority_level || 0) > 0) {
          payload.priority_level = Number(updatedRowData.priority_level || 0)
        }
        if (updatedRowData.received_date && updatedRowData.received_date.trim() !== '') {
          payload.received_date = normalizeDateInput(updatedRowData.received_date).trim()
        }
        if (updatedRowData.demand_date && updatedRowData.demand_date.trim() !== '') {
          payload.demand_date = normalizeDateInput(updatedRowData.demand_date).trim()
        }
        if (updatedRowData.completed_date && updatedRowData.completed_date.trim() !== '') {
          payload.completed_date = normalizeDateInput(updatedRowData.completed_date).trim()
        }
        if (updatedRowData.recorder && String(updatedRowData.recorder).trim() !== '') {
          payload.recorder = String(updatedRowData.recorder).trim()
        }
        payload.sets_count = 1
        
        const created = await createTooling(payload)
        if (created && created.success && created.data) {
          const keepLocalWhenServerEmpty = (serverValue: any, localValue: any) => {
            if (serverValue === undefined || serverValue === null) return localValue
            if (typeof serverValue === 'string') {
              const localText = String(localValue ?? '').trim()
              if (serverValue.trim() === '' && localText !== '') return localValue
            }
            return serverValue
          }
          const mergedCreatedRow: RowItem = {
            ...updatedRowData!,
            ...created.data,
            id: String(created.data.id || updatedRowData!.id),
            inventory_number: keepLocalWhenServerEmpty(created.data.inventory_number, updatedRowData!.inventory_number),
            project_name: keepLocalWhenServerEmpty(created.data.project_name, updatedRowData!.project_name),
            production_unit: keepLocalWhenServerEmpty(created.data.production_unit, updatedRowData!.production_unit),
            category: keepLocalWhenServerEmpty(created.data.category, updatedRowData!.category),
            received_date: keepLocalWhenServerEmpty(created.data.received_date, updatedRowData!.received_date),
            demand_date: keepLocalWhenServerEmpty(created.data.demand_date, updatedRowData!.demand_date),
            completed_date: keepLocalWhenServerEmpty(created.data.completed_date, updatedRowData!.completed_date),
            production_date: keepLocalWhenServerEmpty(created.data.production_date, updatedRowData!.production_date),
            recorder: keepLocalWhenServerEmpty(created.data.recorder, updatedRowData!.recorder),
            priority_level: Number(keepLocalWhenServerEmpty(created.data.priority_level, updatedRowData!.priority_level || 0)) || 0,
            sets_count: Number(keepLocalWhenServerEmpty(created.data.sets_count, updatedRowData!.sets_count || 1)) || 1
          }
          // 使用后端返回的完整数据替换本地数据，并避免与已存在记录重复
          setData(prev => {
            const existedIdx = prev.findIndex(r => r.id === created.data.id)
            let newData: RowItem[]
            if (existedIdx >= 0) {
              // 已存在该记录：更新已存在记录，删除当前空白行
              newData = prev
                .map(r => (r.id === created.data.id ? { ...r, ...mergedCreatedRow } : r))
                .filter(r => r.id !== id)
            } else {
              // 不存在：优先替换空白行；若空白行不存在则直接插入创建结果
              const existsBlank = prev.some(r => r.id === id)
              newData = existsBlank
                ? prev.map(r => r.id === id ? mergedCreatedRow : r)
                : [mergedCreatedRow, ...prev]
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
                priority_level: 0,
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
          // 盘存编号输入后不再额外拉长刷新延迟，避免“短暂消失”体感被放大
          scheduleBackgroundRefresh(1200)
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
        
        const dateFields = ['received_date', 'demand_date', 'completed_date', 'production_date']
        const textFields = ['inventory_number', 'production_unit', 'category', 'project_name', 'recorder']
        const normalizedValue = (() => {
          if (dateFields.includes(String(key))) {
            const v = normalizeDateInput(String(value ?? ''))
            return String(v || '').trim() === '' ? null : String(v).trim()
          }
          if (textFields.includes(String(key))) {
            const v = String(value ?? '').trim()
            return v === '' ? null : v
          }
          return value
        })()
        const payload: any = { [key]: normalizedValue }
        if (autoRecorder) payload.recorder = autoRecorder
        const success = await saveToolingData(id, payload)
        if (!success) {
          // 如果API调用失败，重新获取数据以回滚到服务器状态
          await runWithPreservedScroll(async () => {
            await fetchToolingData()
          })
        } else {
          // 统一刷新节奏，避免盘存编号字段出现更长时间的视觉空窗
          scheduleBackgroundRefresh(1200)
        }
      }
    } catch (error) {
      console.warn('保存失败:', error)
      message.error('保存失败，请重试')
      await runWithPreservedScroll(async () => {
        await fetchToolingData()
      })
    }
  }, [user, shouldAutoFillRecorder, updateAllPartsInventoryNumbers, createTooling, saveToolingData, fetchToolingData, runWithPreservedScroll, scheduleBackgroundRefresh])

  // 保存零件数据
  const handlePartSave = useCallback(async (toolingId: string, id: string, key: keyof PartItem, value: any) => {
    debugLog('[handlePartSave] called:', { toolingId, id, key, value }, 'timestamp:', Date.now())
    const lockKey = `${toolingId}-${id}-${key}`
    
    if (partSaveLockRef.current.has(lockKey)) {
      return
    }
    
    let shouldProceed = true
    
    try {
      partSaveLockRef.current.add(lockKey)
      
      // 零件盘存编号重复即时校验
      if (key === 'part_inventory_number') {
        const newInv = String(value || '').trim().toUpperCase()
        if (newInv) {
          // 前缀必须与父表盘存编号一致
          const parent = dataRef.current.find(d => d.id === toolingId)
          const parentInv = String(parent?.inventory_number || '').trim().toUpperCase()
          if (parentInv && !newInv.startsWith(parentInv)) {
            message.error(`零件盘存编号必须以父表盘存编号"${parentInv}"作为前缀`)
            shouldProceed = false
          }
          // 本地已加载数据去重
          if (shouldProceed) {
            const localDup = Object.values(partsMapRef.current).some((list: any) =>
              (list || []).some((p: any) => String(p.part_inventory_number || '').trim().toUpperCase() === newInv && p.id !== id)
            )
            if (localDup) {
              message.error(`零件盘存编号"${newInv}"已存在，不能重复`)
              shouldProceed = false
            }
          }
          // 远端数据去重（快速检索）
          if (shouldProceed) {
            try {
              const resp = await fetchWithFallback(`/api/tooling/parts/inventory-list?page=1&pageSize=1&search=${encodeURIComponent(newInv)}`, { cache: 'no-store' })
              const result = await resp.json().catch(() => ({ items: [] }))
              const items = Array.isArray(result?.items) ? result.items : []
              const hit = items.find((it: any) => String(it.part_inventory_number || '').trim().toUpperCase() === newInv)
              if (hit && String(hit.id) !== String(id)) {
                message.error(`零件盘存编号"${newInv}"已存在，不能重复`)
                shouldProceed = false
              }
            } catch {}
          }
          if (shouldProceed) {
            value = newInv
          }
        }
      }
      
      if (!shouldProceed) {
        return
      }
      
      let updatedPartData: PartItem | null = null
      
      // 检查是否需要添加空白行
      const currentList = partsMapRef.current[toolingId] || []
      const blankId = `blank-${toolingId}-0`
      const hasBlank = currentList.some(x => String(x.id) === blankId)
      const needsBlank = !hasBlank && !id.startsWith('blank-')
      
      setPartsMap(prev => {
        const list = prev[toolingId] || []
        let updated = list.map(r => {
          if (r.id !== id) return r
          const nextVal = key === 'part_quantity' ? (String(value).trim() === '' ? '' : Number(value)) : value
          const updatedRow = { ...r, [key]: nextVal } as PartItem
          if (key === 'specifications' || key === 'material_id' || key === 'part_category' || key === 'part_quantity' || key === 'weight') {
            // 规格、材质、零件类别变化时，强制重新计算重量（因为这些字段影响重量计算）
            const forceRecalculate = key === 'specifications' || key === 'material_id' || key === 'part_category'
            const metrics = calcPartMetrics(updatedRow, forceRecalculate)
            updatedRow.weight = metrics.unitWeight
            updatedRow.total_price = metrics.totalPrice
          }
          if (r.id === id) {
            updatedPartData = updatedRow
          }
          return updatedRow
        })
        
        // 非空白行编辑不再主动补充空白行，避免状态长度在普通编辑时增长
        return { ...prev, [toolingId]: updated }
      })
      
      // 如果有更新的零件数据，按单字段最小载荷保存到后端
      if (!id.startsWith('blank-')) {
        const list = partsMapRef.current[toolingId] || []
        const current = list.find(r => r.id === id) as any
        let payload: any = {}
        switch (key) {
          case 'part_inventory_number': {
            const s = String(value || '').trim().toUpperCase()
            payload.part_inventory_number = s || null
            break
          }
          case 'part_drawing_number': {
            const s = String(value || '').trim()
            payload.part_drawing_number = s || null
            break
          }
          case 'part_name': {
            const s = String(value || '').trim()
            payload.part_name = s || null
            break
          }
          case 'part_quantity': {
            const n = Number(value)
            payload.part_quantity = (!value || Number.isNaN(n) || n <= 0) ? null : n
            break
          }
          case 'material_id': {
            const s = String(value ?? '').trim()
            payload.material_id = s ? s : null
            break
          }
          case 'material_source_id': {
            const s = String(value ?? '').trim()
            payload.material_source_id = s || null
            break
          }
          case 'part_category': {
            const s = String(value ?? '').trim()
            payload.part_category = s || null
            break
          }
          case 'specifications': {
            payload.specifications = value || {}
            break
          }
          case 'remarks': {
            const s = String(value ?? '').trim()
            payload.remarks = s || null
            break
          }
          case 'weight': {
            const w = typeof value === 'number' ? value : Number(value)
            payload.weight = Number.isNaN(w) ? null : w
            break
          }
          default: {
            payload[key as string] = value
          }
        }

        // 关键字段更新需要联动重量与金额并持久化
        if (key === 'specifications' || key === 'material_id' || key === 'part_category' || key === 'part_quantity' || key === 'weight') {
          // 获取最新的行数据（包括刚刚在 setPartsMap 中更新的）
          const latestList = partsMapRef.current[toolingId] || []
          const latestRow = latestList.find((r: any) => r.id === id) as any
          const baseRow = latestRow || current || {}
          
          // 对于 specifications，需要合并而不是替换
          let nextRow: any
          if (key === 'specifications') {
            nextRow = { 
              ...baseRow, 
              specifications: { ...(baseRow.specifications || {}), ...value }
            }
          } else {
            nextRow = { ...baseRow, [key]: value }
          }
          
          // 规格、材质、零件类别变化时，强制重新计算重量
          const forceRecalculate = key === 'specifications' || key === 'material_id' || key === 'part_category'
          const metrics = calcPartMetrics(nextRow, forceRecalculate)
          payload.weight = metrics.unitWeight
          payload.total_price = metrics.totalPrice
        }

        const success = await savePartData(id, payload)
        if (success) {
          // 保存成功，本地状态已通过 setPartsMap 更新（乐观更新），无需重新拉取
        } else {
          // 保存失败，回滚为服务端数据
          // 移除 fetchPartsData 调用，避免重复请求导致卡死
          // 继续执行，让锁能正确释放
        }
      }
      
      // 如果是空白行，使用防抖机制创建新记录
      if (id.startsWith('blank-')) {
        const timerKey = `${toolingId}-${id}`
        
        // 清除之前的定时器
        if (partSaveTimersRef.current[timerKey]) {
          clearTimeout(partSaveTimersRef.current[timerKey])
        }
        
        // 设置新的定时器，延迟300毫秒后创建记录
        partSaveTimersRef.current[timerKey] = setTimeout(async () => {
          try {
            const list = partsMapRef.current[toolingId] || []
            const existing = list.find(r => r.id === id) || { 
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
              if (q === null || typeof q === 'undefined' || q === '') return false
              const n = Number(q)
              return !isNaN(n) && n > 0
            })()
            const anyHas = (
              (nextRow.part_inventory_number || '').trim() !== '' ||
              (nextRow.part_drawing_number || '').trim() !== '' ||
              (nextRow.part_name || '').trim() !== '' ||
              qtyHas ||
              (nextRow.material_id || '').toString().trim() !== '' ||
              (nextRow.material_source_id ?? '').toString().trim() !== '' ||
              (nextRow.part_category || '').trim() !== '' ||
              (nextRow.remarks || '').trim() !== '' ||
              (nextRow.specifications && Object.keys(nextRow.specifications).length > 0)
            )
            if (!anyHas) return
            
            const parent = dataRef.current.find(d => d.id === toolingId)
            const metrics = calcPartMetrics(nextRow)
            let nextInventoryNumber = String(nextRow.part_inventory_number || '').trim().toUpperCase()
            if (!nextInventoryNumber) {
              const generated = getNextPartInventoryNumbers(
                String(parent?.inventory_number || ''),
                (list || []).filter((r: any) => String(r.id || '') !== String(id)),
                1
              )[0] || ''
              nextInventoryNumber = generated
              if (nextInventoryNumber) {
                setPartsMap(prev => {
                  const rows = prev[toolingId] || []
                  return {
                    ...prev,
                    [toolingId]: rows.map(r => r.id === id ? { ...r, part_inventory_number: nextInventoryNumber } : r)
                  }
                })
              }
            }
            
            const postData: any = { 
              part_drawing_number: nextRow.part_drawing_number || '', 
              part_name: nextRow.part_name || '',
              source: '自备',
              specifications: nextRow.specifications || {},
              weight: metrics.unitWeight,
              total_price: metrics.totalPrice,
              remarks: nextRow.remarks || ''
            }
            
            // 只有在盘存编号不为空时才添加该字段
            if (nextInventoryNumber) {
              postData.part_inventory_number = nextInventoryNumber
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
                  total_price: created.total_price ?? r.total_price ?? 0,
                  remarks: created.remarks ?? r.remarks ?? '',
                  part_inventory_number: created.part_inventory_number ?? r.part_inventory_number ?? ''
                } : r)
                return { ...prev, [toolingId]: nl }
              })
              setTimeout(() => { fetchPartsData(toolingId) }, 200)
            }
          } finally {
            delete partSaveTimersRef.current[timerKey]
          }
        }, 300) // 延迟300毫秒后创建记录
      }
    } catch (error) {
      console.error('保存零件数据错误:', error)
      message.error('保存零件数据失败')
      // 移除 fetchPartsData 调用，避免重复请求导致卡死
    } finally {
      partSaveLockRef.current.delete(lockKey)
    }
  }, [savePartData, createPart, calcPartMetrics])


  const handlePartBatchSave = useCallback(async (toolingId: string, id: string, updates: Partial<PartItem>) => {
    debugLog('[handlePartBatchSave] called:', { toolingId, id, updates }, 'timestamp:', Date.now())
    const lockKey = `${toolingId}-${id}-batch`
    
    if (partSaveLockRef.current.has(lockKey)) {
      return
    }
    
    try {
      partSaveLockRef.current.add(lockKey)
      
      let updatedPartData: PartItem | null = null
      
      setPartsMap(prev => {
        const list = prev[toolingId] || []
        let updated = list.map(r => {
          if (r.id !== id) return r
          const updatedRow = { ...r, ...updates } as PartItem
          if ('specifications' in updates || 'material_id' in updates || 'part_category' in updates || 'part_quantity' in updates || 'weight' in updates) {
            const metrics = calcPartMetrics(updatedRow)
            updatedRow.weight = metrics.unitWeight
            updatedRow.total_price = metrics.totalPrice
          }
          if (r.id === id) {
            updatedPartData = updatedRow
          }
          return updatedRow
        })
        
        return { ...prev, [toolingId]: updated }
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
            weight: updatedPartData.weight,
            total_price: updatedPartData.total_price
        }
        
        const success = await savePartData(id, payload)
        if (success) {
          setTimeout(() => { fetchPartsData(toolingId) }, 200)
        }
      }
    } catch (error) {
      console.error('批量保存失败:', error)
      message.error('保存失败')
      // 移除 fetchPartsData 调用，避免重复请求导致卡死
    } finally {
      partSaveLockRef.current.delete(lockKey)
    }
  }, [savePartData, calcPartMetrics])

  // 保存标准件数据
  const handleChildItemSave = useCallback(async (toolingId: string, id: string, key: keyof ChildItem, value: any) => {
    try {
      // 立即更新本地状态，让用户看到输入
      let nextItem: ChildItem | null = null
      setChildItemsMap(prev => {
        const list = prev[toolingId] || []
        let updated = list.map(item => {
          if (item.id !== id) return item
          const v = key === 'quantity'
            ? (String(value).trim() === '' ? '' : Number(value))
            : (key === 'remark' || key === 'required_date' ? normalizeDateInput(String(value ?? '')) : value)
          const row = { ...item, [key]: v }
          nextItem = row
          return row
        })
        // 空白行在输入后不再本地补充，由数据Hook统一处理
        if (id.startsWith('blank-')) {
          // 保持updated原样，随后由fetchChildItemsData统一补充空白行
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
      const hasAny = !!(
        String(nextItem.name || '').trim()
        || String(nextItem.model || '').trim()
        || qtyHas
        || String(nextItem.unit || '').trim()
        || String(nextItem.required_date || '').trim()
        || String(nextItem.remark || '').trim()
      )
      if (!hasAny) return

      if (id.startsWith('blank-')) {
        // 空白行使用防抖机制
        const timerKey = `child-${toolingId}-${id}`
        
        // 清除之前的定时器
        if (childSaveTimersRef.current[timerKey]) {
          clearTimeout(childSaveTimersRef.current[timerKey])
        }
        
        // 设置新的定时器，延迟1秒后创建记录
        childSaveTimersRef.current[timerKey] = setTimeout(async () => {
          try {
            const postData: any = { tooling_id: toolingId }
            if (nextItem!.name && String(nextItem!.name).trim() !== '') postData.name = String(nextItem!.name).trim()
            if (nextItem!.model && String(nextItem!.model).trim() !== '') postData.model = String(nextItem!.model).trim()
            if (typeof nextItem!.quantity === 'number' && nextItem!.quantity > 0) postData.quantity = nextItem!.quantity
            if (nextItem!.unit && String(nextItem!.unit).trim() !== '') postData.unit = String(nextItem!.unit).trim()
            if (nextItem!.required_date && String(nextItem!.required_date).trim() !== '') postData.required_date = String(nextItem!.required_date).trim()
            if (nextItem!.remark && String(nextItem!.remark).trim() !== '') postData.remark = String(nextItem!.remark).trim()

            const created = await createChildItem(toolingId, postData)
            if (created) {
              setChildItemsMap(prev => {
                const list = prev[toolingId] || []
                const updated = list.map(item => item.id === id ? { ...item, ...created, id: created.id } : item)
                return { ...prev, [toolingId]: updated }
              })
              // 保存成功，无需重新拉取
            } else {
              message.error('创建标准件失败')
            }
          } finally {
            delete childSaveTimersRef.current[timerKey]
          }
        }, 1000) // 延迟1秒后创建记录
      } else {
        // 已有记录直接保存（允许清空为 null，保持与父表一致行为）
        const updateData: any = {}
        if (key === 'quantity') {
          const num = typeof value === 'number' ? value : Number(value)
          updateData.quantity = (value === '' || value === null || isNaN(Number(num)) || Number(num) <= 0) ? null : Number(num)
        } else if (key === 'name' || key === 'model' || key === 'unit' || key === 'required_date' || key === 'remark') {
          const raw = (key === 'remark' || key === 'required_date') ? normalizeDateInput(String(value ?? '')) : String(value ?? '')
          const txt = String(raw).trim()
          updateData[key] = txt !== '' ? txt : null
        }

        const response = await fetchWithFallback(`/api/tooling/child-items/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateData)
        })
        if (!response.ok) {
          message.error('保存标准件数据失败')
        } else {
          // 保存成功，无需重新拉取
        }
      }
    } catch (error) {
      console.error('处理标准件数据错误:', error)
      message.error('处理标准件数据失败')
    }
  }, [createChildItem])

  const handleDeletePart = useCallback(async (toolingId: string, id: string) => {
    try {
      if (String(id || '').startsWith('blank-')) {
        setPartsMap(prev => {
          const list = prev[toolingId] || []
          const updated = list.filter(item => item.id !== id)
          return { ...prev, [toolingId]: updated }
        })
        setBlankPartDisabledMap(prev => ({ ...prev, [toolingId]: true }))
        setSelectedRowKeys(prev => prev.filter(k => k !== ('part-' + id)))
        return
      }
      const resp = await fetchWithFallback(`/api/tooling/parts/${id}`, { method: 'DELETE' })
      if (resp.ok) {
        // 关键修复：立即清空该工装的缓存，强制重新获取最新数据
        setPartsMap(prev => {
          const updated = (prev[toolingId] || []).filter(item => item.id !== id)
          return { ...prev, [toolingId]: updated }
        })
        setSelectedRowKeys(prev => prev.filter(k => k !== ('part-' + id)))
        message.success('已删除零件')
        // 本地状态已更新，无需重新拉取
      } else {
        message.error('删除零件失败')
      }
    } catch {
      message.error('删除零件失败')
    }
  }, [fetchPartsData])

  const handlePartSaveRef = useRef(handlePartSave)
  useEffect(() => {
    handlePartSaveRef.current = handlePartSave
  }, [handlePartSave])
  
  const handlePartBatchSaveRef = useRef(handlePartBatchSave)
  useEffect(() => {
    handlePartBatchSaveRef.current = handlePartBatchSave
  }, [handlePartBatchSave])
  
  const handleDeletePartRef = useRef(handleDeletePart)
  useEffect(() => {
    handleDeletePartRef.current = handleDeletePart
  }, [handleDeletePart])

  const handleDeleteChildItem = useCallback(async (toolingId: string, id: string) => {
    try {
      if (String(id || '').startsWith('blank-')) {
        setChildItemsMap(prev => {
          const list = prev[toolingId] || []
          const updated = list.filter(item => item.id !== id)
          return { ...prev, [toolingId]: updated }
        })
        setBlankChildDisabledMap(prev => ({ ...prev, [toolingId]: true }))
        setSelectedRowKeys(prev => prev.filter(k => k !== ('child-' + id)))
        return
      }
      const resp = await fetchWithFallback(`/api/tooling/child-items/${id}`, { method: 'DELETE' })
      if (resp.ok) {
        // 关键修复：立即清空该工装的标准件缓存，强制重新获取最新数据
        setChildItemsMap(prev => {
          const updated = (prev[toolingId] || []).filter(item => item.id !== id)
          return { ...prev, [toolingId]: updated }
        })
        setSelectedRowKeys(prev => prev.filter(k => k !== ('child-' + id)))
        message.success('已删除标准件')
        // 本地状态已更新，无需重新拉取
      } else {
        message.error('删除标准件失败')
      }
    } catch {
      message.error('删除标准件失败')
    }
  }, [fetchChildItemsData])

  const handleChildItemSaveRef = useRef(handleChildItemSave)
  useEffect(() => {
    handleChildItemSaveRef.current = handleChildItemSave
  }, [handleChildItemSave])
  useEffect(() => {
    const calc = () => {
      const el = tableWrapRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const h = window.innerHeight - rect.top - 16
      setTableScrollY(Math.max(320, Math.floor(h) - 40))
    }
    const raf = requestAnimationFrame(calc)
    window.addEventListener('resize', calc)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', calc)
    }
  }, [filterInventory, filterProject, filterPartDrawing, filterRecorder, filterUnit, filterCategory, expandedRowKeys.length])
  
  const handleDeleteChildItemRef = useRef(handleDeleteChildItem)
  useEffect(() => {
    handleDeleteChildItemRef.current = handleDeleteChildItem
  }, [handleDeleteChildItem])

  const createPartColumns = useCallback((toolingId: string, parentProject: string, parentUnit: string, parentApplicant: string) => {
    const WEIGHT_CACHE_LIMIT = 500
    const PRICE_CACHE_LIMIT = 500
    const getWeightCached = (rec: PartItem) => {
      const qty = Number(rec.part_quantity) || 0
      const storedUnitWeight = Number(rec.weight || 0)
      if (storedUnitWeight > 0) {
        return { unitWeight: storedUnitWeight, totalWeight: storedUnitWeight * qty }
      }
      const key = `${rec.material_id}|${rec.part_category}|${JSON.stringify(rec.specifications||{})}|${rec.part_quantity}|${rec.weight||''}`
      const cached = weightCacheRef.current.get(key)
      if (cached) return cached
      const unitWeight = calculatePartWeightRef.current(rec.specifications || {}, rec.material_id || '', rec.part_category || '', partTypesRef.current, materialsRef.current)
      const totalWeight = unitWeight * qty
      const val = { unitWeight, totalWeight }
      weightCacheRef.current.set(key, val)
      if (weightCacheRef.current.size > WEIGHT_CACHE_LIMIT) {
        const k = weightCacheRef.current.keys().next().value
        weightCacheRef.current.delete(k)
      }
      return val
    }
    const getPriceCached = (rec: PartItem) => {
      const dep = getWeightCached(rec)
      const unitPrice = Number(materialUnitPriceMapRef.current[String(rec.material_id || '')] || 0)
      const key = `${rec.id}|${rec.material_id}|${dep.totalWeight}|${unitPrice}`
      const cached = priceCacheRef.current.get(key)
      if (cached) return cached
      const total = (dep.totalWeight > 0 && unitPrice > 0)
        ? calculateTotalPriceRef.current(dep.totalWeight, unitPrice)
        : 0
      const val = { total }
      priceCacheRef.current.set(key, val)
      if (priceCacheRef.current.size > PRICE_CACHE_LIMIT) {
        const k = priceCacheRef.current.keys().next().value
        priceCacheRef.current.delete(k)
      }
      return val
    }
    const normalizeProcessKey = (v: string) => String(v || '')
      .replace(/\s+/g, '')
      .replace(/^[0-9]+[.\-、:：]*/g, '')
      .trim()
      .toLowerCase()
    const buildManualStepToken = (step: string, index: number) => `__STEP__${index}__${normalizeProcessKey(step)}`
    const resolveManualCompletedTokens = (steps: string[], completedStepsRaw: any[]) => {
      const savedValues = Array.isArray(completedStepsRaw)
        ? completedStepsRaw.map((x: any) => String(x || '').trim()).filter(Boolean)
        : []
      const tokenSet = new Set<string>()
      const legacyCounts: Record<string, number> = {}
      savedValues.forEach((value) => {
        if (value.startsWith('__STEP__')) {
          tokenSet.add(value)
          return
        }
        const key = normalizeProcessKey(value)
        if (!key) return
        legacyCounts[key] = (legacyCounts[key] || 0) + 1
      })
      steps.forEach((step, index) => {
        const key = normalizeProcessKey(step)
        if (!key) return
        if ((legacyCounts[key] || 0) > 0) {
          tokenSet.add(buildManualStepToken(step, index))
          legacyCounts[key] -= 1
        }
      })
      return tokenSet
    }
    const fmtPieces = (v: any) => {
      const n = Number(v || 0)
      if (!Number.isFinite(n)) return '0'
      const s = n.toFixed(3)
      return s.replace(/\.?0+$/, '')
    }
    const fmtHours = (v: any) => {
      const n = Number(v || 0)
      if (!Number.isFinite(n)) return '0'
      const s = n.toFixed(2)
      return s.replace(/\.?0+$/, '')
    }
    const getRouteProgressStatus = (rec: PartItem, routeText: string) => {
      const route = String(routeText || '')
      const steps = route.split(/\s*→\s*/).map(s => s.trim()).filter(Boolean)
      const inventoryNo = String(rec.part_inventory_number || rec.inventory_number || '').trim().toUpperCase()
      const processCompletedQtyMap = workHoursProcessCompletedQtyData[inventoryNo] || {}
      const processHoursMap = workHoursProcessHoursData[inventoryNo] || {}
      const processLatestMetaMap = workHoursProcessLatestMetaData[inventoryNo] || {}
      const requiredQty = Number(rec.part_quantity || 0)
      const workHoursForThisInv = workHoursData[inventoryNo] || []
      const workHoursCompleted = new Set<string>(workHoursForThisInv.map(x => normalizeProcessKey(x)))
      const dbCompletedSteps = Array.isArray((rec as any).completed_steps) ? (rec as any).completed_steps : []
      const manualCompletedTokens = resolveManualCompletedTokens(steps, dbCompletedSteps)

      // 无工艺路线但有工时数据的情况 - 直接从工时汇总判断状态
      if (steps.length === 0) {
        const totalCompletedQty = Object.values(processCompletedQtyMap).reduce((sum: number, v: any) => sum + (Number(v) || 0), 0)
        const totalHours = Object.values(processHoursMap).reduce((sum: number, v: any) => sum + (Number(v) || 0), 0)
        const amountValue = Number(workHoursAmountData[inventoryNo] || 0)
        const hasEffectiveData = totalCompletedQty > 0 || totalHours > 0 || amountValue > 0

        if (!hasEffectiveData) return null

        if (totalCompletedQty >= requiredQty && requiredQty > 0) {
          return { text: `加工完成${fmtPieces(totalCompletedQty)}件`, color: '#28a745', hasRoute: false }
        }

        const latestEntry = Object.values(processLatestMetaMap)[0] as any
        if (latestEntry) {
          const teamName = String(latestEntry?.team_name || '').trim()
          const operator = String(latestEntry?.operator || '').trim()
          const actorText = [teamName, operator].filter(Boolean).join(' ')
          return { text: actorText ? `${actorText}加工中 已完成${fmtPieces(totalCompletedQty)}件` : `加工中 已完成${fmtPieces(totalCompletedQty)}件`, color: '#1890ff', hasRoute: false }
        }

        return { text: `加工中 已完成${fmtPieces(totalCompletedQty)}件`, color: '#1890ff', hasRoute: false }
      }
      function statesFromRoute(stepsRaw: string[]) {
        return stepsRaw.map((step, index) => {
          const key = normalizeProcessKey(step)
          const token = buildManualStepToken(step, index)
          const workRecorded = workHoursCompleted.has(key)
          const qty = Number((processCompletedQtyMap as Record<string, number>)[key] || 0)
          const stepQty = Number.isFinite(qty) ? qty : 0
          const stepHours = Number((processHoursMap as Record<string, number>)[key] || 0)
          const doneByQty = Number.isFinite(requiredQty) && requiredQty > 0 && stepQty >= requiredQty
          const inProgressByWork = workRecorded || stepQty > 0 || stepHours > 0
          const manualChecked = manualCompletedTokens.has(token)
          const inProgress = manualChecked || inProgressByWork
          const latestMeta = (processLatestMetaMap as Record<string, any>)[key] || null
          return { step, key, token, stepQty, stepHours, doneByQty, inProgressByWork, inProgress, manualChecked, latestMeta, workRecorded }
        })
      }
      const states = statesFromRoute(steps)
      const currentWorkStepIdx = (() => {
        const activeIdx = states.findIndex((s) => s.inProgressByWork && !s.doneByQty)
        if (activeIdx >= 0) return activeIdx
        let lastIdx = -1
        states.forEach((s, idx) => {
          if (s.inProgressByWork || s.doneByQty) lastIdx = idx
        })
        return lastIdx
      })()
      const manualSteps = states.filter((s: any) => s.manualChecked && !s.inProgressByWork)
      const manualUpdate = manualStepUpdateMap[String(rec.id || '')]
      const eligibleManualSteps = manualSteps.filter((s: any) => {
        const idx = states.findIndex((it: any) => it.token === s.token)
        return idx >= 0 && (currentWorkStepIdx < 0 || idx >= currentWorkStepIdx)
      })
      if (eligibleManualSteps.length > 0) {
        const manualStep = (() => {
          if (manualUpdate?.step_key) {
            const hit = eligibleManualSteps.find((s: any) => s.token === manualUpdate.step_key)
            if (hit) return hit
          }
          return eligibleManualSteps[eligibleManualSteps.length - 1]
        })()
        const operatorName = String(manualUpdate?.operator || '').trim()
        return {
          text: operatorName ? `${operatorName}更新了${manualStep.step}工序完成` : `${manualStep.step}工序已标记完成`,
          color: '#28a745',
          hasRoute: true
        }
      }
      const allDone = states.length > 0 && states.every(s => s.doneByQty)
      const formatActorText = (state: any) => {
        const teamName = String(state?.latestMeta?.team_name || '').trim()
        const operator = String(state?.latestMeta?.operator || '').trim()
        const deviceNo = String(state?.latestMeta?.device_no || '').trim()
        const deviceName = String(state?.latestMeta?.device_name || '').trim()
        const teamText = teamName
        const operatorText = operator
        const deviceText = deviceNo
          ? (deviceName ? `${deviceNo}号${deviceName}` : `${deviceNo}号设备`)
          : (deviceName || '')
        const prefix = [teamText, operatorText].filter(Boolean).join(' ')
        if (prefix && deviceText) return `${prefix} 用${deviceText}`
        if (deviceText) return `用${deviceText}`
        return prefix
      }
      if (allDone) {
        const last = states[states.length - 1]
        const actorText = formatActorText(last)
        const pieces = Number.isFinite(requiredQty) && requiredQty > 0 ? requiredQty : Number(last?.stepQty || 0)
        return { text: actorText ? `${actorText}加工完成${fmtPieces(pieces)}件` : `加工完成${fmtPieces(pieces)}件`, color: '#28a745', hasRoute: true }
      }
      const active = states.find(s => s.inProgress && !s.doneByQty)
      if (active) {
        const actorText = formatActorText(active)
        if (Number(active.stepQty || 0) <= 0 && Number(active.stepHours || 0) <= 0) {
          return {
            text: actorText ? `${actorText}已开始${active.step}` : `已开始${active.step}`,
            color: '#1890ff',
            hasRoute: true
          }
        }
        return { text: actorText ? `${actorText}加工中 已完成${fmtPieces(active.stepQty)}件` : `加工中 已完成${fmtPieces(active.stepQty)}件`, color: '#1890ff', hasRoute: true }
      }
      const completed = [...states].reverse().find(s => s.doneByQty)
      if (completed) {
        const actorText = formatActorText(completed)
        const pieces = Number.isFinite(requiredQty) && requiredQty > 0 ? requiredQty : Number(completed?.stepQty || 0)
        return { text: actorText ? `${actorText}加工完成${fmtPieces(pieces)}件` : `加工完成${fmtPieces(pieces)}件`, color: '#28a745', hasRoute: true }
      }
      // 工艺路线存在但无工时进展，不覆盖原状态（如下料中）
      return null
    }
    return [
      {
        title: '盘存编号',
        dataIndex: 'part_inventory_number',
        width: 140,
        onCell: () => ({ onMouseDown: (e: any) => e.stopPropagation(), onClick: (e: any) => e.stopPropagation() }),
        render: (text: string, rec: PartItem) => (
          <EditableCell
            value={text || ''}
            record={rec as any}
            dataIndex={'part_inventory_number' as any}
            onSave={(pid, _k, v) => handlePartSaveRef.current(toolingId, pid, 'part_inventory_number', v)}
          />
        )
      },
      {
        title: '零件名称',
        dataIndex: 'part_name',
        width: 180,
        onCell: () => ({ onMouseDown: (e: any) => e.stopPropagation(), onClick: (e: any) => e.stopPropagation() }),
        render: (text: string, rec: PartItem) => (
          <EditableCell
            value={text || ''}
            record={rec as any}
            dataIndex={'part_name' as any}
            onSave={(pid, _k, v) => handlePartSaveRef.current(toolingId, pid, 'part_name', v)}
          />
        )
      },
      {
        title: '图号',
        dataIndex: 'part_drawing_number',
        width: 220,
        onCell: () => ({ onMouseDown: (e: any) => e.stopPropagation(), onClick: (e: any) => e.stopPropagation() }),
        render: (text: string, rec: PartItem) => (
          <EditableCell
            value={text || ''}
            record={rec as any}
            dataIndex={'part_drawing_number' as any}
            onSave={(pid, _k, v) => handlePartSaveRef.current(toolingId, pid, 'part_drawing_number', v)}
          />
        )
      },
      {
        title: '数量',
        dataIndex: 'part_quantity',
        width: 80,
        onCell: () => ({ onMouseDown: (e: any) => e.stopPropagation(), onClick: (e: any) => e.stopPropagation() }),
        render: (text: string, rec: PartItem) => (
          <EditableCell
            value={text as any}
            record={rec as any}
            dataIndex={'part_quantity' as any}
            onSave={(pid, _k, v) => handlePartSaveRef.current(toolingId, pid, 'part_quantity', v)}
          />
        )
      },
      {
        title: '材质',
        dataIndex: 'material_id',
        width: 90,
        onCell: () => ({ onMouseDown: (e: any) => e.stopPropagation(), onClick: (e: any) => e.stopPropagation() }),
        render: (text: string, rec: PartItem) => (
          <EditableCell
            value={materialsRef.current.find(m => String(m.id) === String(text))?.name || ''}
            record={rec as any}
            dataIndex={'material_id' as any}
            options={materialOptionsRef.current}
            onSave={(_pid, _k, v) => {
              const selectedMaterial = materialsRef.current.find(m => m.name === v)
              handlePartSaveRef.current(toolingId, rec.id, 'material_id', selectedMaterial?.id || '')
            }}
          />
        )
      },
      {
        title: '材料来源',
        dataIndex: 'material_source_id',
        width: 90,
        onCell: () => ({ onMouseDown: (e: any) => e.stopPropagation(), onClick: (e: any) => e.stopPropagation() }),
        render: (text: string, rec: PartItem) => (
          <EditableCell
            value={materialSourceNameMapRef.current[String(text)] || (rec as any)?.material_source?.name || ''}
            record={rec as any}
            dataIndex={'material_source_id' as any}
            options={materialSourceOptionsRef.current}
            onSave={(_pid, _k, v) => {
              const selectedSource = materialSourcesRef.current.find(ms => ms.name === v)
              const oldSource = materialSourceNameMapRef.current[String(rec.material_source_id)] || 
                               (rec as any)?.material_source?.name || 
                               materialSourceIdNameMapRef.current.get(String(rec.material_source_id || '')) || ''
              const newSource = v
              const nextSourceId = selectedSource?.id || ''
              
              if (rec.id.startsWith('blank-')) {
                 handlePartSaveRef.current(toolingId, rec.id, 'material_source_id', nextSourceId)
                 return
              }

              if (String(rec.material_source_id || '') !== String(nextSourceId)) {
                handlePartSaveRef.current(toolingId, rec.id, 'material_source_id', nextSourceId)
              }

              if (oldSource === '外购' && newSource !== '外购') {
                const parsed = parsePartRemarkFields(String(rec.remarks || ''))
                if (parsed.demandDate) {
                  handlePartSaveRef.current(toolingId, rec.id, 'remarks', composePartRemarkFields(parsed.heatTreatment, ''))
                }
              }
            }}
          />
        )
      },
      {
        title: '料型',
        dataIndex: 'part_category',
        width: 90,
        onCell: () => ({ onMouseDown: (e: any) => e.stopPropagation(), onClick: (e: any) => e.stopPropagation() }),
        render: (text: string, rec: PartItem) => (
          <EditableCell
            value={text || ''}
            record={rec as any}
            dataIndex={'part_category' as any}
            options={partTypeOptionsRef.current}
            onSave={(pid, _k, v) => handlePartSaveRef.current(toolingId, pid, 'part_category', v)}
          />
        )
      },
      {
        title: '规格',
        dataIndex: 'specifications',
        width: 120,
        onCell: () => ({ onMouseDown: (e: any) => e.stopPropagation(), onClick: (e: any) => e.stopPropagation() }),
        render: (text: string, rec: PartItem) => (
          <SpecificationsInput
            specs={rec.specifications || {}}
            partType={rec.part_category}
            partTypes={partTypesRef.current}
            onSave={(v) => handlePartSaveRef.current(toolingId, rec.id, 'specifications', v)}
            textColor={getPartTypeColor(rec.part_category)}
          />
        )
      },
      {
        title: '热处理',
        dataIndex: '__heat_treatment',
        width: 100,
        onCell: () => ({ onMouseDown: (e: any) => e.stopPropagation(), onClick: (e: any) => e.stopPropagation() }),
        render: (_text: string, rec: PartItem) => {
          const parsed = parsePartRemarkFields(String(rec.remarks || ''))
          return (
            <EditableCell
              value={parsed.heatTreatment}
              record={rec as any}
              dataIndex={'__heat_treatment' as any}
              onSave={(pid, _k, v) => {
                const nextHeat = String(v || '').trim()
                const merged = composePartRemarkFields(nextHeat, parsed.demandDate)
                handlePartSaveRef.current(toolingId, pid, 'remarks', merged)
              }}
            />
          )
        }
      },
      {
        title: '需求日期',
        dataIndex: '__required_date',
        width: 120,
        onCell: () => ({ onMouseDown: (e: any) => e.stopPropagation(), onClick: (e: any) => e.stopPropagation() }),
        render: (_text: string, rec: PartItem) => {
          const materialSource = materialSourceNameMapRef.current[String(rec.material_source_id)] || (rec as any)?.material_source?.name || ''
          const parsed = parsePartRemarkFields(String(rec.remarks || ''))
          if (materialSource !== '外购') return <span style={{ color: '#999' }}>-</span>
          return (
            <EditableCell
              value={parsed.demandDate}
              record={rec as any}
              dataIndex={'__required_date' as any}
              onSave={(pid, _k, v) => {
                const nextDemand = normalizeDateInput(String(v || '').trim())
                const merged = composePartRemarkFields(parsed.heatTreatment, nextDemand)
                handlePartSaveRef.current(toolingId, pid, 'remarks', merged)
              }}
              renderDisplay={(val) => {
                const normalized = normalizeDateInput(String(val || '').trim())
                return normalized || '\u00A0'
              }}
            />
          )
        }
      },
      {
        title: '重量(kg)',
        dataIndex: 'weight',
        width: 100,
        render: (text: number, rec: PartItem) => {
          const dep = getWeightCached(rec)
          return <span style={{ color: '#000000' }}>{dep.totalWeight.toFixed(0)}</span>
        }
      },
      {
        title: '材料金额(元)',
        dataIndex: 'total_price',
        width: 100,
        render: (text: number, rec: PartItem) => {
          const { total } = getPriceCached(rec)
          return <span style={{ color: '#000000' }}>{total.toFixed(0)}</span>
        }
      },
      {
        title: '加工金额(元)',
        dataIndex: '__process_price',
        width: 110,
        render: (_text: any, rec: PartItem) => {
          const resolvedAmount = resolvePartProcessAmount(rec)
          if (resolvedAmount === null) {
            return <span style={{ color: '#999' }}>-</span>
          }
          const calculatedAmount = Number(resolvedAmount || 0)
          return <span style={{ color: '#000000' }}>{Number.isFinite(calculatedAmount) ? calculatedAmount.toFixed(0) : '0'}</span>
        }
      },
      {
        title: '状态',
        dataIndex: '__status',
        width: 220,
        render: (_text: any, rec: PartItem) => {
          const purchaseStatus = String((rec as any).purchase_status || '').trim()
          const currentRoute = String((rec as any).process_route || (processRoutes[String(rec.part_inventory_number || rec.inventory_number || '').trim().toUpperCase()] || ''))
          const routeProgressStatus = getRouteProgressStatus(rec, currentRoute)
          const nameOk = !!String(rec.part_name || '').trim()
          const q = rec.part_quantity
          const qtyOk = !(q === '' || q === null || typeof q === 'undefined') && Number(q) > 0
          const partFields = parsePartRemarkFields(String(rec.remarks || ''))
          const demandDateOk = !!partFields.demandDate
          const projectOk = !!String(parentProject).trim()
          const prodUnitOk = !!String(parentUnit).trim()
          const applicantOk = !!String(parentApplicant).trim()
          const msName = materialSourceIdNameMapRef.current.get(String(rec.material_source_id || '')) || ''
          const normalized = String(msName || '').replace(/\s+/g, '').toLowerCase()
          const sourceOk = normalized.includes('外购') || normalized.includes('waigou') || normalized.includes('采购')
          const ready = nameOk && qtyOk && demandDateOk && projectOk && prodUnitOk && applicantOk && sourceOk
          return (
            <StatusCell
              rec={rec}
              purchaseStatus={purchaseStatus}
              currentRoute={currentRoute}
              routeProgressStatus={routeProgressStatus}
              ready={ready}
              renderStatusText={renderStatusText}
              toolingId={toolingId}
              saveStatusInput={saveStatusInput}
            />
          )
        }
      },
      {
        title: '加工时长(h)',
        dataIndex: '__process_hours_total',
        width: 100,
        align: 'center',
        render: (_text: any, rec: PartItem) => {
          const inventoryNo = String(rec.part_inventory_number || rec.inventory_number || '').trim().toUpperCase()
          const currentRoute = String((rec as any).process_route || (processRoutes[inventoryNo] || ''))
          const processHoursMap = workHoursProcessHoursData[inventoryNo] || {}
          const steps = currentRoute.split(/\s*→\s*/).map(s => s.trim()).filter(Boolean)
          const dbCompletedSteps = Array.isArray((rec as any).completed_steps) ? (rec as any).completed_steps : []
          const manualCompletedTokens = resolveManualCompletedTokens(steps, dbCompletedSteps)
          const workHoursForThisInv = workHoursData[inventoryNo] || []
          const workHoursCompleted = new Set<string>(workHoursForThisInv.map(x => normalizeProcessKey(x)))
          const hasProgress = steps.some((step, index) => {
            const key = normalizeProcessKey(step)
            const token = buildManualStepToken(step, index)
            return workHoursCompleted.has(key) || manualCompletedTokens.has(token)
          })
          return (
            <ProcessHoursCell
              currentRoute={currentRoute}
              processHoursMap={processHoursMap}
              hasProgress={hasProgress}
            />
          )
        }
      },
      {
        title: '工艺路线',
        dataIndex: 'process_route',
        width: 600,
        onCell: () => ({ className: 'process-route-cell', onMouseDown: (e: any) => e.stopPropagation(), onClick: (e: any) => e.stopPropagation() }),
        render: (_t: any, rec: PartItem) => {
          const keyCandidate = String(rec.part_inventory_number || rec.inventory_number || '').trim().toUpperCase()
          let currentRoute = String((rec as any).process_route || '')
          if (!currentRoute && keyCandidate) {
            currentRoute = (keyCandidate && processRoutes[keyCandidate]) || ''
          }
          const inventoryNo = String(rec.part_inventory_number || rec.inventory_number || '').trim().toUpperCase()
          const processCompletedQtyMap = workHoursProcessCompletedQtyData[inventoryNo] || {}
          const processHoursMap = workHoursProcessHoursData[inventoryNo] || {}
          const requiredQty = Number(rec.part_quantity || 0)
          const steps = String(currentRoute || '').split(/\s*→\s*/).filter(Boolean)
          const dbCompletedSteps = Array.isArray((rec as any).completed_steps) ? (rec as any).completed_steps : []
          const manualCompletedTokens = resolveManualCompletedTokens(steps, dbCompletedSteps)
          const workHoursForThisInv = workHoursData[inventoryNo] || []
          const workHoursCompleted = new Set<string>(workHoursForThisInv.map(x => normalizeProcessKey(x)))

          const handleStepToggle = async (step: string, index: number, checked: boolean) => {
            const stepKey = normalizeProcessKey(step)
            const stepToken = buildManualStepToken(step, index)
            const newCompleted = new Set<string>(manualCompletedTokens)
            if (checked) {
              newCompleted.add(stepToken)
            } else {
              newCompleted.delete(stepToken)
            }
            const completedStepsArray = Array.from(newCompleted)
            const success = await savePartData(rec.id, { completed_steps: completedStepsArray })
            if (success) {
              setPartsMap(prev => {
                const newPartsMap = { ...prev }
                Object.keys(newPartsMap).forEach(tid => {
                  newPartsMap[tid] = newPartsMap[tid].map(part => 
                    part.id === rec.id ? { ...part, completed_steps: completedStepsArray } : part
                  )
                })
                return newPartsMap
              })
              setManualStepUpdateMap(prev => {
                const next = { ...prev }
                const manualKeys = completedStepsArray
                  .map((x) => String(x || '').trim())
                  .filter((k) => k && !workHoursCompleted.has(k.replace(/^__STEP__\d+__/, '')))
                if (!manualKeys.includes(stepToken)) {
                  delete next[String(rec.id || '')]
                  return next
                }
                next[String(rec.id || '')] = {
                  step_key: stepToken,
                  step_name: step,
                  operator: String(user?.real_name || '当前用户').trim() || '当前用户',
                  updated_at: Date.now()
                }
                return next
              })
            }
          }

          const handleSave = async (id: string, _key: string, value: string) => {
            try {
              setPartsMap(prev => {
                const newPartsMap = { ...prev }
                Object.keys(newPartsMap).forEach(tid => {
                  newPartsMap[tid] = newPartsMap[tid].map(part => 
                    part.id === id ? { ...part, process_route: value } : part
                  )
                })
                return newPartsMap
              })
              const success = await savePartData(id, { process_route: value })
              if (success && rec.part_inventory_number) {
                const newProcessRoutes = {
                  ...processRoutes,
                  [String(rec.part_inventory_number).trim().toUpperCase()]: value
                }
                try {
                  const invKey = String(rec.part_inventory_number).trim().toUpperCase()
                  const bucketKey = bucketKeyForInv(invKey)
                  let obj: Record<string, string> = {}
                  try {
                    const s = safeLocalStorage.getItem(bucketKey)
                    if (s) obj = JSON.parse(s) || {}
                  } catch {}
                  obj[invKey] = value
                  safeLocalStorage.setItem(bucketKey, JSON.stringify(obj))
                } catch {
                  message.warning('本地缓存写入失败，已跳过（可能空间不足/浏览器禁用存储）')
                }
                setProcessRoutes(newProcessRoutes)
              }
            } catch (error) {
              console.error('保存工艺路线失败:', error)
              message.error('保存工艺路线失败，请重试')
            }
          }

          return (
            <ProcessRouteCell
              rec={rec}
              processRoute={currentRoute}
              inventoryNo={inventoryNo}
              steps={steps}
              workHoursCompleted={workHoursCompleted}
              manualCompletedTokens={manualCompletedTokens}
              processCompletedQtyMap={processCompletedQtyMap}
              processHoursMap={processHoursMap}
              requiredQty={requiredQty}
              onStepToggle={handleStepToggle}
              onSave={handleSave}
            />
          )
        }
      },
      
    ]
  }, [renderStatusText, resolvePartProcessAmount, saveStatusInput, workHoursData, workHoursProcessCompletedQtyData, workHoursProcessHoursData, workHoursProcessLatestMetaData, manualStepUpdateMap, processRoutes, user])

  const createChildColumns = useCallback((toolingId: string, parentProject: string, parentUnit: string, parentApplicant: string) => {
    return [
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
            onSave={(pid, _k, v) => handleChildItemSaveRef.current(toolingId, pid, 'name', v)}
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
            onSave={(pid, _k, v) => handleChildItemSaveRef.current(toolingId, pid, 'model', v)}
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
            onSave={(pid, _k, v) => handleChildItemSaveRef.current(toolingId, pid, 'quantity', v)}
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
            onSave={(pid, _k, v) => handleChildItemSaveRef.current(toolingId, pid, 'unit', v)}
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
            onSave={(pid, _k, v) => handleChildItemSaveRef.current(toolingId, pid, 'required_date', v)}
          />
        )
      },
      {
        title: '状态',
        dataIndex: '__status',
        width: 140,
        render: (_text: any, rec: ChildItem) => {
          const purchaseStatus = String((rec as any).purchase_status || '').trim()
          const nameOk = !!String(rec.name || '').trim()
          const modelOk = !!String(rec.model || '').trim()
          const qtyOk = Number(rec.quantity || 0) > 0
          const unitOk = !!String(rec.unit || '').trim()
          const demandDateOk = !!String(rec.required_date || '').trim()
          const projectOk = !!String(parentProject).trim()
          const prodUnitOk = !!String(parentUnit).trim()
          const applicantOk = !!String(parentApplicant).trim()
          const ready = nameOk && modelOk && qtyOk && unitOk && demandDateOk && projectOk && prodUnitOk && applicantOk
          return (
            <EditableCell
              value={purchaseStatus}
              record={rec as any}
              dataIndex={'__status' as any}
              onSave={(pid, _k, v) => saveStatusInput(toolingId, 'child', String(pid || ''), v)}
              renderDisplay={(val) => {
                const raw = String(val || '').trim()
                if (raw) return renderStatusText(raw)
                return ready ? <span style={{ color: '#1890ff' }}>就绪</span> : <span style={{ color: '#999' }}>-</span>
              }}
            />
          )
        }
      },
      {
        title: '备注',
        dataIndex: 'remark',
        width: 200,
        render: (text: string, rec: ChildItem) => {
          return (
            <EditableCell
              value={text || ''}
              record={rec as any}
              dataIndex={'remark' as any}
              onSave={(pid, _k, v) => handleChildItemSaveRef.current(toolingId, pid, 'remark', normalizeDateInput(v))}
              renderDisplay={(val) => {
                const normalized = normalizeDateInput(String(val || '').trim())
                return normalized || '\u00A0'
              }}
            />
          )
        }
      },
      
    ]
  }, [renderStatusText, saveStatusInput])

  const addBlankParts = useCallback((toolingId: string, count: number) => {
    const safeCount = Math.max(1, Math.min(200, Math.floor(Number(count) || 1)))
    setPartsMap(prev => {
      const list = prev[toolingId] || []
      const parent = dataRef.current.find(d => d.id === toolingId)
      const parentInv = String(parent?.inventory_number || '')
      const generated = getNextPartInventoryNumbers(parentInv, list, safeCount)
      const now = Date.now()
      const added = Array.from({ length: safeCount }).map((_, idx) => ({
        id: `blank-${toolingId}-${now}-${idx}-${Math.random().toString(36).slice(2, 8)}`,
        tooling_id: toolingId,
        part_inventory_number: generated[idx] || '',
        part_drawing_number: '',
        part_name: '',
        part_quantity: '',
        material_id: '',
        material_source_id: '',
        part_category: '',
        specifications: {},
        weight: 0,
        remarks: ''
      }))
      return { ...prev, [toolingId]: [...list, ...added] }
    })
  }, [setPartsMap])

  const toolingById = useMemo(() => {
    const map: Record<string, any> = {}
    ;(data || []).forEach((item: any) => {
      const id = String(item?.id || '')
      if (id) map[id] = item
    })
    return map
  }, [data])

  const expandedRowRender = useCallback((record: any) => {
    const toolingId = record.id as string
    const parent = toolingById[toolingId] as any
    const parentProject = parent?.project_name || ''
    const parentUnit = parent?.production_unit || ''
    const parentApplicant = parent?.recorder || ''
    
    // 获取当前数据，不再自动添加空白行
    const partsList = partsMap[toolingId] || []
    const childList = childItemsMap[toolingId] || []
    const inventoryKeyword = sanitizeAlphaNumeric(filterInventory)
    const drawingKeyword = sanitizeAlphaNumeric(filterPartDrawing)
    const allowInventoryPartFilter = shouldRunInventoryChildSearch(inventoryKeyword)
    const allowDrawingPartFilter = shouldRunDrawingChildSearch(drawingKeyword)
    const matchPart = (part: any) => {
      const drawing = String(part?.part_drawing_number || '').replace(/\s+/g, '').toUpperCase()
      if (allowDrawingPartFilter && drawingKeyword) return drawing.includes(drawingKeyword)
      if (!allowInventoryPartFilter || !inventoryKeyword) return true
      const inv = String(part?.part_inventory_number || '').replace(/\s+/g, '').toUpperCase()
      return inv.includes(inventoryKeyword)
    }
    const matchedParts = (partsList || []).filter((p: any) => matchPart(p))
    const displayParts = ((allowDrawingPartFilter && drawingKeyword) || (allowInventoryPartFilter && inventoryKeyword)) && matchedParts.length > 0
      ? matchedParts
      : partsList
    const hasPartsLoaded = Object.prototype.hasOwnProperty.call(partsMap, toolingId)
    const hasChildLoaded = Object.prototype.hasOwnProperty.call(childItemsMap, toolingId)
    const partsLoading = !!partsLoadingMap[toolingId]
    const childLoading = !!childLoadingMap[toolingId]

    // 生成包含工时数据的缓存键，确保工时数据变化时重新创建列
    const workHoursKey = Object.keys(workHoursData).sort().join(',')
    const completedQtyKey = Object.entries(workHoursProcessCompletedQtyData)
      .sort(([a], [b]) => String(a).localeCompare(String(b)))
      .map(([k, v]) => {
        const processMap = Object.entries(v || {})
          .sort(([p1], [p2]) => String(p1).localeCompare(String(p2)))
          .map(([p, qty]) => `${p}:${qty}`)
          .join(',')
        return `${k}:{${processMap}}`
      })
      .join('|')
    const hoursKey = Object.entries(workHoursProcessHoursData)
      .sort(([a], [b]) => String(a).localeCompare(String(b)))
      .map(([k, v]) => {
        const processMap = Object.entries(v || {})
          .sort(([p1], [p2]) => String(p1).localeCompare(String(p2)))
          .map(([p, h]) => `${p}:${h}`)
          .join(',')
        return `${k}:{${processMap}}`
      })
      .join('|')
    const amountTotalKey = Object.entries(workHoursAmountData)
      .sort(([a], [b]) => String(a).localeCompare(String(b)))
      .map(([k, amount]) => `${k}:${amount}`)
      .join('|')
    const latestMetaKey = Object.entries(workHoursProcessLatestMetaData)
      .sort(([a], [b]) => String(a).localeCompare(String(b)))
      .map(([k, v]) => {
        const processMap = Object.entries(v || {})
          .sort(([p1], [p2]) => String(p1).localeCompare(String(p2)))
          .map(([p, meta]: any) => `${p}:${meta?.operator || ''}|${meta?.team_name || ''}|${meta?.device_no || ''}|${meta?.device_name || ''}|${meta?.process_unit_price || ''}|${meta?.at || ''}`)
          .join(',')
        return `${k}:{${processMap}}`
      })
      .join('|')
    const manualUpdateKey = Object.entries(manualStepUpdateMap)
      .sort(([a], [b]) => String(a).localeCompare(String(b)))
      .map(([pid, info]) => `${pid}:${info?.step_key || ''}|${info?.operator || ''}|${info?.updated_at || 0}`)
      .join(',')
    const cacheKey = `${toolingId}-${parentProject}-${parentUnit}-${parentApplicant}-${workHoursKey}-${completedQtyKey}-${hoursKey}-${amountTotalKey}-${latestMetaKey}-${manualUpdateKey}`
    let cols = partColumnsCacheRef.current.get(cacheKey)
    if (!cols) {
      cols = createPartColumns(toolingId, parentProject, parentUnit, parentApplicant)
      partColumnsCacheRef.current.set(cacheKey, cols)
      while (partColumnsCacheRef.current.size > MAX_COLUMN_CACHE) {
        const k = partColumnsCacheRef.current.keys().next().value
        partColumnsCacheRef.current.delete(k)
      }
    }

    const childCacheKey = `${toolingId}-${parentProject}-${parentUnit}-${parentApplicant}`
    let childCols = childColumnsCacheRef.current.get(childCacheKey)
    if (!childCols) {
      childCols = createChildColumns(toolingId, parentProject, parentUnit, parentApplicant)
      childColumnsCacheRef.current.set(childCacheKey, childCols)
      while (childColumnsCacheRef.current.size > MAX_COLUMN_CACHE) {
        const k = childColumnsCacheRef.current.keys().next().value
        childColumnsCacheRef.current.delete(k)
      }
    }

    // 手动添加标准件行
    const handleAddChildItem = () => {
      const newChild = {
        id: `blank-${toolingId}-${Date.now()}`,
        tooling_id: toolingId,
        name: '',
        model: '',
        quantity: '',
        remarks: ''
      }
      setChildItemsMap(prev => ({
        ...prev,
        [toolingId]: [...(prev[toolingId] || []), newChild]
      }))
    }

    const handleToggleChildTable = () => {
      fetchChildItemsData(toolingId)
    }

    return (
      <ExpandedSubTables
        toolingId={toolingId}
        parts={displayParts as any}
        childItems={childList as any}
        partsLoading={partsLoading}
        childLoading={childLoading}
        parentProject={parentProject}
        parentUnit={parentUnit}
        parentApplicant={parentApplicant}
        partColumns={cols}
        childColumns={childCols}
        selectedRowKeys={selectedRowKeys}
        setSelectedRowKeys={setSelectedRowKeys}
        onAddPart={() => addBlankParts(toolingId, 1)}
        onAddPartBatch={() => setPartBatchModal({ toolingId, open: true })}
        onAddChildItem={handleAddChildItem}
        onToggleChildTable={handleToggleChildTable}
      />
    )
  }, [
    partsMap,
    childItemsMap,
    selectedRowKeys,
    createPartColumns,
    createChildColumns,
    addBlankParts,
    toolingById,
    setChildItemsMap,
    setPartBatchModal,
    workHoursData,
    workHoursProcessCompletedQtyData,
    workHoursProcessHoursData,
    workHoursAmountData,
    workHoursProcessLatestMetaData,
    manualStepUpdateMap,
    filterInventory,
    filterPartDrawing,
    fetchChildItemsData
  ])

  const confirmPartBatchAdd = useCallback(() => {
    const toolingId = String(partBatchModal.toolingId || '')
    if (!toolingId) return
    const count = Math.floor(Number(partBatchCount))
    if (!Number.isFinite(count) || count <= 0) {
      message.warning('请输入大于0的批量数量')
      return
    }
    const parent = dataRef.current.find(d => d.id === toolingId)
    const parentInv = String(parent?.inventory_number || '').trim()
    if (!parentInv) {
      message.warning('请先填写父表盘存编号后再批量添加')
      return
    }
    addBlankParts(toolingId, count)
    setPartBatchModal({ toolingId: '', open: false })
    setPartBatchCount('5')
  }, [partBatchModal, partBatchCount, addBlankParts])

  // 确保展开的子表至少有一行空白行
  useEffect(() => {
    const idsToCheck = new Set([...expandedRowKeys, ...expandedChildKeys])
    if (idsToCheck.size === 0) return

    setPartsMap(prev => {
      const next = { ...prev }
      let hasChange = false
      expandedRowKeys.forEach(tid => {
        const list = next[tid]
        // 仅当明确为数组且长度为0时（已加载但无数据），添加空白行
        if (Array.isArray(list) && list.length === 0) {
          const parent = dataRef.current.find(d => d.id === tid)
          const parentInv = String(parent?.inventory_number || '')
          const nextInv = getNextPartInventoryNumbers(parentInv, [], 1)[0] || ''
          next[tid] = [{
            id: `blank-${tid}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            tooling_id: tid,
            part_inventory_number: nextInv,
            part_drawing_number: '',
            part_name: '',
            part_quantity: '',
            material_id: '',
            material_source_id: '',
            part_category: '',
            specifications: {},
            weight: 0,
            remarks: ''
          }]
          hasChange = true
        }
      })
      return hasChange ? next : prev
    })

    setChildItemsMap(prev => {
      const next = { ...prev }
      let hasChange = false
      expandedChildKeys.forEach(tid => {
        const list = next[tid]
        if (Array.isArray(list) && list.length === 0) {
          next[tid] = [{
            id: `blank-${tid}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            tooling_id: tid,
            name: '',
            model: '',
            quantity: '',
            remarks: ''
          }]
          hasChange = true
        }
      })
      return hasChange ? next : prev
    })
  }, [expandedRowKeys, expandedChildKeys, setPartsMap, setChildItemsMap])

  // 初始化数据
  useEffect(() => {
    fetchAllMeta(true)
    fetchToolingData()
    return () => {
      // 清理所有定时器
      Object.values(partSaveTimersRef.current).forEach(timer => clearTimeout(timer))
      Object.values(childSaveTimersRef.current).forEach(timer => clearTimeout(timer))
      partSaveTimersRef.current = {}
      childSaveTimersRef.current = {}
    }
  }, [])

  const importProcessRoutes = async (file: File) => {
    const loadingKey = 'process-import'
    message.loading({ content: '正在解析工艺卡片...', key: loadingKey })
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const sheetName = wb.SheetNames[0]
      if (!sheetName) {
        message.error({ content: '未找到可用的工作表', key: loadingKey })
        return
      }
      const ws = wb.Sheets[sheetName]
      if (!ws) {
        message.error({ content: '未找到可用的工作表', key: loadingKey })
        return
      }
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][]
      if (!rows || rows.length === 0) {
        message.error({ content: '工艺卡片为空或无法解析', key: loadingKey })
        return
      }
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
    debugLog('[ProcessImport] segments:', segments.length, 'routes(inv):', Object.keys(cardRoutes), 'routes(drawing):', Object.keys(cardRoutesByDrawing))

    // 为每个卡片的 inv 生成映射与匹配
    const allChildKeysOnPage: string[] = []
    Object.values(partsMap).forEach(list => (list || []).forEach((p: any) => {
      const k = String(p.part_inventory_number || '').trim().toUpperCase()
      if (k) allChildKeysOnPage.push(k)
    }))

    const mapUpdates: Record<string, string> = {}
    const unresolvedInvs: string[] = []
    const serverMatchCache = new Map<string, string[]>()
    const queryServerMatches = async (invKey: string): Promise<string[]> => {
      const key = String(invKey || '').trim().toUpperCase()
      if (!key) return []
      if (serverMatchCache.has(key)) return serverMatchCache.get(key) || []
      try {
        const resp = await fetchWithFallback(`/api/tooling/parts/inventory-list?page=1&pageSize=500&search=${encodeURIComponent(key)}`, { cache: 'no-store' })
        if (!resp.ok) throw new Error(String(resp.status))
        const js = await resp.json().catch(() => ({}))
        const items = Array.isArray(js?.items) ? js.items : []
        const keys = items
          .map((it: any) => String(it?.part_inventory_number || '').trim().toUpperCase())
          .filter((k: string) => !!k && (k === key || k.startsWith(key)))
        const uniq: string[] = Array.from(new Set<string>(keys))
        serverMatchCache.set(key, uniq)
        return uniq
      } catch {
        serverMatchCache.set(key, [])
        return []
      }
    }
    for (const [invK, routeText] of Object.entries(cardRoutes)) {
      // 首先尝试精确匹配
      let matchedKeys = allChildKeysOnPage.filter(k => k === invK)
      // 如果没有精确匹配，尝试前缀匹配（零件盘存编号以工艺卡片盘存编号开头）
      if (matchedKeys.length === 0) {
        matchedKeys = allChildKeysOnPage.filter(k => k.startsWith(invK))
      }
      // 如果还是没有匹配，走服务端查询做最终匹配（避免受本地状态异步刷新影响）
      if (matchedKeys.length === 0) {
        matchedKeys = await queryServerMatches(invK)
      }
      if (matchedKeys.length === 0) {
        // 未匹配到，记录日志以便调试
        console.warn(`[ProcessImport] 未找到匹配的零件: ${invK}`)
        unresolvedInvs.push(invK)
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
    if (mappings.length === 0) {
      message.warning({ content: '未识别到可导入的工艺路线', key: loadingKey })
      return
    }
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
        } catch {
          persistValue = safeMapUpdates
          try { persistJson = JSON.stringify(safeMapUpdates) } catch { persistJson = '{}' }
        }

        try {
          const grouped: Record<string, Record<string, string>> = {}
          Object.entries(finalSafe).forEach(([k, v]) => {
            if (typeof v !== 'string') return
            const inv = k.startsWith('DRAWING:') ? 'DRAWING' : k
            const bk = k.startsWith('DRAWING:') ? (ROUTE_BUCKET_PREFIX + 'DRAWING') : bucketKeyForInv(inv)
            if (!grouped[bk]) grouped[bk] = {}
            grouped[bk][k] = String(v)
          })
          Object.entries(grouped).forEach(([bk, obj]) => {
            const json = JSON.stringify(obj)
            safeLocalStorage.setItem(bk, json)
          })
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
              const drawingK = String(p.part_drawing_number || '').trim()
              // 通过盘存编号匹配
              if (k && mapKeys.includes(k)) {
                return { ...p, process_route: mapUpdates[k] }
              }
              // 通过图号匹配（处理 DRAWING: 前缀的情况）
              if (drawingK && mapKeys.includes(`DRAWING:${drawingK}`)) {
                return { ...p, process_route: mapUpdates[`DRAWING:${drawingK}`] }
              }
              return p
            })
          })
          return next
        })
        const backendUpdated = Number(result?.updated || 0)
        const backendFailed = Number(result?.failedCount || 0)
        const msg = backendFailed > 0
          ? `工艺路线导入完成：成功更新${backendUpdated}条，未匹配${backendFailed}条`
          : `生成并保存工艺路线：共${Object.keys(mapUpdates).length}条映射`
        message.success({ content: msg, key: loadingKey })
        if (unresolvedInvs.length > 0) {
          message.warning(`有${unresolvedInvs.length}个盘存编号未匹配到零件：${unresolvedInvs.slice(0, 5).join('，')}${unresolvedInvs.length > 5 ? ' 等' : ''}`)
        }
        // 刷新当前工装零件信息以展示后端值
        fetchToolingData()
      } else {
        message.error({ content: '保存工艺路线失败：' + (result?.error || '未知错误'), key: loadingKey })
      }
    } catch (e: any) {
      message.error({ content: '保存工艺路线失败：' + (e?.message || '网络错误'), key: loadingKey })
    }
    } catch (e: any) {
      message.error({ content: '工艺卡片解析失败：' + (e?.message || '网络错误'), key: loadingKey })
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

  const hasPartMeaningfulContent = useCallback((part: any) => {
    return [
      part?.part_inventory_number,
      part?.part_drawing_number,
      part?.part_name,
      part?.part_quantity,
      part?.material_id,
      part?.process_route
    ].some((v) => String(v ?? '').trim() !== '' && String(v ?? '').trim() !== '0')
  }, [])

  const columns = useMemo(() => [
    {
      title: '序号',
      dataIndex: '__seq',
      width: 40,
      render: (_text: any, record: RowItem, index: number) => {
        const isBlank = String(record.id).startsWith('blank-')
        if (isBlank) {
          return (
            <span style={{ display: 'inline-block', width: '100%', textAlign: 'center', color: '#888' }}>{index + 1}</span>
          )
        }
        return (
          <span style={{ display: 'inline-flex', width: '100%', alignItems: 'center', justifyContent: 'center', gap: 4, color: '#000000' }}>
            <span
              onClick={(e) => {
                e.stopPropagation()
                const id = record.id
                
                // 控制零件信息展开
                const isExpanded = expandedRowKeys.includes(id)
                const partsNext = isExpanded ? expandedRowKeys.filter(k => k !== id) : [...expandedRowKeys, id]
                setExpandedRowKeys(partsNext)
                
                // 同时控制标准件信息展开
                const isChildExpanded = expandedChildKeys.includes(id)
                const childNext = isChildExpanded ? expandedChildKeys.filter(k => k !== id) : [...expandedChildKeys, id]
                setExpandedChildKeys(childNext)
                // 如果即将展开（当前未展开），则加载数据
                const willExpand = !isExpanded || !isChildExpanded
                if (willExpand) {
                  ensureExpandedDataLoaded(id, false)
                }
              }}
              style={{ cursor: 'pointer', color: '#000000', fontWeight: 600, fontSize: '26px' }}
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
      width: 80,
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
      width: 147,
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
      width: 80,
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
      width: 80,
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
      title: '级别',
      dataIndex: 'priority_level',
      width: 60,
      onCell: () => ({ onMouseDown: (e: any) => e.stopPropagation(), onClick: (e: any) => e.stopPropagation() }),
      render: (_: any, record: RowItem) => (
        record.project_name ? (
          <Rate
            count={3}
            value={Number(record.priority_level || 0)}
            onChange={(v) => handleSave(record.id, 'priority_level', v || 0)}
          />
        ) : null
      )
    },
    {
      title: '接收日期',
      dataIndex: 'received_date',
      width: 70,
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
      width: 70,
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
      width: 70,
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
      title: '材料总额(元)',
      dataIndex: '__material_total',
      width: 90,
      render: (_text: any, record: RowItem) => {
        const total = toNullableTotal(record.material_total)
        return total === null
          ? <span style={{ color: '#999' }}>-</span>
          : <span style={{ color: '#000000' }}>{Math.round(total)}</span>
      }
    },
    {
      title: '加工总额(元)',
      dataIndex: '__process_total',
      width: 90,
      render: (_text: any, record: RowItem) => {
        const total = toNullableTotal(record.process_total)
        return total === null
          ? <span style={{ color: '#999' }}>-</span>
          : <span style={{ color: '#000000' }}>{Math.round(total)}</span>
      }
    },
    {
      title: '责任人',
      dataIndex: 'recorder',
      width: 60,
      render: (text: string, record: RowItem) => (
        <span style={{ color: '#000000' }}>{text || '-'}</span>
      )
    }
  ], [handleSave, expandedRowKeys, expandedChildKeys, setExpandedRowKeys, setExpandedChildKeys, ensureExpandedDataLoaded, productionUnits, toolingCategories, toNullableTotal])

  // 导出工装信息为Excel
  const handleExport = async () => {
    try {
      // 确保元数据与子表均已加载
      if (materialSources.length === 0 || materials.length === 0 || partTypes.length === 0) {
        await fetchAllMeta(true)
      }
      const parentIds = data.filter(item => !String(item.id || '').startsWith('blank-')).map(i => String(i.id))
      const needPartsFetch = parentIds.filter(id => !partsMap[id] || partsMap[id].length === 0)
      const needChildFetch = parentIds.filter(id => !childItemsMap[id] || childItemsMap[id].length === 0)
      const chunk = (arr: string[], size: number) => {
        const res: string[][] = []
        for (let i = 0; i < arr.length; i += size) res.push(arr.slice(i, i + size))
        return res
      }
      const size = getBatchSize()
      const perf: { ts: number; size: number; parts: Array<{ len: number; ms: number }>; child: Array<{ len: number; ms: number }>; totalMs: number } = { ts: Date.now(), size, parts: [], child: [], totalMs: 0 }
      const t0 = Date.now()
      for (const group of chunk(needPartsFetch, size)) {
        const s = Date.now()
        await Promise.all(group.map(id => fetchPartsData(id)))
        perf.parts.push({ len: group.length, ms: Date.now() - s })
      }
      for (const group of chunk(needChildFetch, size)) {
        const s = Date.now()
        await Promise.all(group.map(id => fetchChildItemsData(id)))
        perf.child.push({ len: group.length, ms: Date.now() - s })
      }
      perf.totalMs = Date.now() - t0
      try { safeLocalStorage.setItem('parts_fetch_perf', JSON.stringify(perf)) } catch {}

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
          const parsed = parsePartRemarkFields(String(part.remarks || ''))
          
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
            '热处理': parsed.heatTreatment || '',
            '需求日期': parsed.demandDate || ''
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
      const wb = XLSX.utils.book_new()

      const toolingHeaders = ['盘存编号', '项目名称', '投产单位', '工装类别', '接收日期', '需求日期', '完成日期', '责任人']
      const partsHeaders = ['父表盘存编号', '盘存编号', '图号', '零件名称', '数量', '材质', '材料来源', '料型', '规格', '热处理', '需求日期']
      const childHeaders = ['父表盘存编号', '名称', '型号', '数量', '单位', '需求日期']

      const toolingWs = XLSX.utils.aoa_to_sheet([toolingHeaders])
      XLSX.utils.book_append_sheet(wb, toolingWs, '工装信息')

      const partsWs = XLSX.utils.aoa_to_sheet([partsHeaders])
      XLSX.utils.book_append_sheet(wb, partsWs, '零件信息')

      const childItemsWs = XLSX.utils.aoa_to_sheet([childHeaders])
      XLSX.utils.book_append_sheet(wb, childItemsWs, '标准件信息')

      const unitSamples = productionUnits.map((x: any) => String(x || '').trim()).filter(Boolean).slice(0, 8).join('、') || '请先在基础数据中维护'
      const categorySamples = toolingCategories.map((x: any) => String(x || '').trim()).filter(Boolean).slice(0, 8).join('、') || '请先在基础数据中维护'
      const materialSamples = materials.map((x: any) => String(x?.name || '').trim()).filter(Boolean).slice(0, 8).join('、') || '请先在基础数据中维护'
      const sourceSamples = materialSources.map((x: any) => String(x?.name || '').trim()).filter(Boolean).slice(0, 8).join('、') || '请先在基础数据中维护'
      const partTypeSamples = partTypes.map((x: any) => String(x?.name || '').trim()).filter(Boolean).slice(0, 8).join('、') || '请先在基础数据中维护'

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
        ['   - 零件信息建议使用“热处理”和“需求日期”列，不再建议填写“备注”列'],
        ['   - 材质、材料来源、料型可为空，系统将提示但仍可导入'],
        ['   - 无效记录（如缺少必填字段）会被跳过，不会影响其他记录的导入'],
        [''],
        ['5. 当前系统可用基础数据示例：'],
        [`   - 投产单位：${unitSamples}`],
        [`   - 工装类别：${categorySamples}`],
        [`   - 材质：${materialSamples}`],
        [`   - 材料来源：${sourceSamples}`],
        [`   - 料型：${partTypeSamples}`]
      ]

      const instructionsWs = XLSX.utils.aoa_to_sheet(instructionsData)
      XLSX.utils.book_append_sheet(wb, instructionsWs, '导入说明')

      XLSX.writeFile(wb, '工装信息导入模板.xlsx')
      message.success('模板下载成功')
    } catch (error) {
      console.error('模板下载失败:', error)
      message.error('模板下载失败，请重试')
    }
  }

  const getImportValidationData = useCallback(async () => {
    const now = Date.now()
    const cached = importValidationCacheRef.current
    if (cached && now - cached.ts < IMPORT_VALIDATION_CACHE_TTL) {
      return {
        existingInvSet: new Set(cached.existingInvSet),
        existingPartInvSet: new Set(cached.existingPartInvSet)
      }
    }
    if (importValidationInflightRef.current) {
      const data = await importValidationInflightRef.current
      return {
        existingInvSet: new Set(data.existingInvSet),
        existingPartInvSet: new Set(data.existingPartInvSet)
      }
    }
    const promise = (async () => {
      const getItems = (result: any) => Array.isArray(result?.items) ? result.items : (Array.isArray(result?.data) ? result.data : [])
      const fetchPaginatedItems = async (buildUrl: (page: number, pageSize: number) => string) => {
        const pageSize = 1000
        let page = 1
        const all: any[] = []
        while (true) {
          const resp = await fetchWithFallback(buildUrl(page, pageSize), { cache: 'no-store' })
          const result = await resp.json().catch(() => ({ items: [] }))
          const items = getItems(result)
          all.push(...items)
          if (items.length < pageSize) break
          page += 1
        }
        return all
      }
      const normalizeText = (value: any) => String(value ?? '').trim()
      const existingInvSet = new Set<string>()
      const existingPartInvSet = new Set<string>()
      try {
        const allToolingItems = await fetchPaginatedItems((page, pageSize) => `/api/tooling?page=${page}&pageSize=${pageSize}&sortField=created_at&sortOrder=asc`)
        allToolingItems.forEach((it: any) => {
          const inv = normalizeText(it?.inventory_number)
          if (inv) existingInvSet.add(inv)
        })
      } catch {}
      try {
        const allPartInventoryItems = await fetchPaginatedItems((page, pageSize) => `/api/tooling/parts/inventory-list?page=${page}&pageSize=${pageSize}`)
        allPartInventoryItems.forEach((it: any) => {
          const pinv = normalizeText(it?.part_inventory_number)
          if (pinv) existingPartInvSet.add(pinv)
        })
      } catch {}
      importValidationCacheRef.current = {
        ts: Date.now(),
        existingInvSet,
        existingPartInvSet
      }
      return {
        existingInvSet: new Set(existingInvSet),
        existingPartInvSet: new Set(existingPartInvSet)
      }
    })()
    importValidationInflightRef.current = promise
    try {
      return await promise
    } finally {
      importValidationInflightRef.current = null
    }
  }, [IMPORT_VALIDATION_CACHE_TTL])

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

      const normalizeText = (value: any) => String(value ?? '').trim()

      const buildCountMap = (rows: any[], field: string) => {
        const counts: Record<string, number> = {}
        rows.forEach((row) => {
          const value = normalizeText(row?.[field])
          if (value) counts[value] = (counts[value] || 0) + 1
        })
        return counts
      }

      const groupByParentInventory = (rows: any[]) => {
        const grouped = new Map<string, any[]>()
        for (const row of rows) {
          const parentInv = normalizeText(row?.['父表盘存编号'])
          if (!parentInv) continue
          const list = grouped.get(parentInv)
          if (list) {
            list.push(row)
          } else {
            grouped.set(parentInv, [row])
          }
        }
        return grouped
      }
      
      // 文件内重复盘存编号统计
      const fileInvCounts = buildCountMap(toolingData, '盘存编号')

      const { existingInvSet, existingPartInvSet } = await getImportValidationData()

      // 文件内重复子表盘存编号统计
      const filePartInvCounts = buildCountMap(partsData, '盘存编号')
      const partsByParentInventory = groupByParentInventory(partsData)
      const childItemsByParentInventory = groupByParentInventory(childItemsData)

      const materialNameSet = new Set(materials.map((m: any) => normalizeText(m?.name)).filter(Boolean))
      const sourceNameSet = new Set(materialSources.map((m: any) => normalizeText(m?.name)).filter(Boolean))
      const partTypeNameSet = new Set(partTypes.map((m: any) => normalizeText(m?.name)).filter(Boolean))

      const appendMissingRequiredErrors = (target: string[], row: any, fields: string[]) => {
        for (const field of fields) {
          if (!row[field] || normalizeText(row[field]) === '') {
            target.push(`缺少必填字段${field}`)
          }
        }
      }

      const validatePreviewPartRow = (part: any) => {
        const errors: string[] = []
        const warnings: string[] = []
        appendMissingRequiredErrors(errors, part, ['父表盘存编号', '零件名称', '数量'])

        const materialName = normalizeText(part['材质'])
        if (materialName) {
          if (!materialNameSet.has(materialName)) {
            errors.push(`材质“${materialName}”不存在`)
          }
        } else {
          warnings.push('材质为空')
        }

        const sourceName = normalizeText(part['材料来源'])
        if (sourceName) {
          if (!sourceNameSet.has(sourceName)) {
            errors.push(`材料来源“${sourceName}”不存在`)
          }
        } else {
          warnings.push('材料来源为空')
        }

        const partCategory = normalizeText(part['料型'])
        if (partCategory) {
          if (!partTypeNameSet.has(partCategory)) {
            errors.push(`料型“${partCategory}”不存在`)
          }
        } else {
          warnings.push('料型为空')
        }

        const specText = normalizeText(part['规格'])
        if (specText && (specText.includes('×') || specText.includes('x'))) {
          errors.push(`规格中使用了乘号(×或x)作为乘号，请使用星号(*)格式`)
        }

        const parentInventoryNumber = normalizeText(part['父表盘存编号'])
        const partInventoryNumber = normalizeText(part['盘存编号'])
        if (parentInventoryNumber && partInventoryNumber) {
          const expectedFormat = new RegExp(`^${parentInventoryNumber}[0-9]+$`)
          if (!expectedFormat.test(partInventoryNumber)) {
            errors.push(`零件盘存编号“${partInventoryNumber}”不符合格式要求，应为父级盘存编号+数字（如：${parentInventoryNumber}01）`)
          }
        }

        if (partInventoryNumber) {
          if (existingPartInvSet.has(partInventoryNumber)) errors.push(`零件盘存编号“${partInventoryNumber}”已存在于系统中，导入时将自动更新`)
          if ((filePartInvCounts[partInventoryNumber] || 0) > 1) errors.push(`零件盘存编号“${partInventoryNumber}”在导入文件中重复出现`)
        }

        const normalizedPartDemandDate = normalizeDateInput(String(formatExcelDate(part['需求日期']) || '').trim())
        const legacyRemark = String(part['备注'] || '').trim()
        const parsedLegacyRemark = parsePartRemarkFields(legacyRemark)
        const partHeatTreatment = String(part['热处理'] || parsedLegacyRemark.heatTreatment || '').trim()
        const partDemandDate = /^\d{4}-\d{2}-\d{2}$/.test(normalizedPartDemandDate)
          ? normalizedPartDemandDate
          : String(parsedLegacyRemark.demandDate || '')
        const formattedPart = {
          ...part,
          '热处理': partHeatTreatment,
          '需求日期': partDemandDate
        }

        return {
          ...formattedPart,
          _errors: errors,
          _warnings: warnings,
          _valid: errors.length === 0
        }
      }

      const validatePreviewChildRow = (child: any) => {
        const formattedChild = {
          ...child,
          '需求日期': formatExcelDate(child['需求日期'])
        }
        const errors: string[] = []
        appendMissingRequiredErrors(errors, formattedChild, ['父表盘存编号', '名称', '型号', '数量', '单位', '需求日期'])
        return {
          ...formattedChild,
          _errors: errors,
          _valid: errors.length === 0
        }
      }

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
        const toolingWarnings: string[] = []
        appendMissingRequiredErrors(toolingErrors, formattedTooling, ['盘存编号', '项目名称', '投产单位', '工装类别', '接收日期'])

        // 盘存编号重复校验（系统内→警告允许导入，文件内→错误拒绝）
        const inv = normalizeText(formattedTooling['盘存编号'])
        if (inv) {
          if (existingInvSet.has(inv)) toolingWarnings.push(`盘存编号“${inv}”已存在于系统中，导入时将自动更新`)
          if ((fileInvCounts[inv] || 0) > 1) toolingErrors.push(`盘存编号“${inv}”在导入文件中重复出现`)
        }
        
        // 查找关联的零件信息
        const toolingInv = normalizeText(formattedTooling['盘存编号'])
        const associatedParts = toolingInv ? (partsByParentInventory.get(toolingInv) || []) : []
        // 查找关联的标准件信息
        const associatedChildItems = toolingInv ? (childItemsByParentInventory.get(toolingInv) || []) : []
        
        // 验证零件信息
        const validatedParts = associatedParts.map(validatePreviewPartRow)
        
        // 验证标准件信息
        const validatedChildItems = associatedChildItems.map(validatePreviewChildRow)
        
        return {
          ...formattedTooling,
          _sheet: '工装信息',
          _index: index + 1,
          _errors: toolingErrors,
          _warnings: toolingWarnings,
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
      const importConcurrency = getImportConcurrency()
      if (materialSources.length === 0 || materials.length === 0 || partTypes.length === 0) {
        await fetchAllMeta(true)
      }
      debugLog('开始导入文件:', importFile.name, '大小:', importFile.size)
      const buf = await importFile.arrayBuffer()
      debugLog('文件读取完成，开始解析')
      const wb = XLSX.read(buf, { type: 'array' })
      
      // 1. 解析工装信息工作表
      const toolingWs = wb.Sheets['工装信息']
      if (!toolingWs) {
        message.error('未找到"工装信息"工作表')
        return
      }
      
      const toolingRows = XLSX.utils.sheet_to_json(toolingWs)
      const toolingTotal = toolingRows.length
      
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
      
      debugLog('工装数据解析完成，有效行:', validToolingRows.length)
      
      // 导入工装数据
      let successCount = 0
      let toolingSuccessCount = 0 // 单独跟踪工装成功数量
      const inventoryNumberMap: Record<string, string> = {} // 盘存编号映射：父表盘存编号 -> 实际ID
      
      // 收集工装导入错误信息
      const toolingImportErrors: string[] = []
      
      const toolingImportResults = await runWithConcurrency(validToolingRows, importConcurrency, async (row) => {
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
        debugLog('创建工装payload:', payload)
        try {
          const created = await createTooling(payload)
          if (created && created.success && created.data) {
            return {
              ok: true as const,
              inventoryNumber: payload.inventory_number,
              toolingId: String(created.data.id)
            }
          }
          return {
            ok: false as const,
            error: `工装“${row['盘存编号']}”（${row['项目名称']}）：创建失败，错误：${created?.error || '服务器返回空数据'}`
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          return {
            ok: false as const,
            error: `工装“${row['盘存编号']}”（${row['项目名称']}）：创建失败，错误信息：${errorMsg}`
          }
        }
      })
      toolingImportResults.forEach((result) => {
        if (result.ok) {
          successCount++
          toolingSuccessCount++
          inventoryNumberMap[result.inventoryNumber] = result.toolingId
          return
        }
        toolingImportErrors.push(result.error)
      })
      
      // 打印映射关系
      debugLog('工装映射关系表:', inventoryNumberMap)
      
      // 如果有工装导入错误，显示给用户
      if (toolingImportErrors.length > 0) {
        message.warning(`工装信息导入完成，成功${toolingSuccessCount}条，失败${toolingImportErrors.length}条。失败原因：${summarizeImportErrors(toolingImportErrors)}`)
      }
      
      // 2. 解析零件信息工作表（如果存在）
      const partsWs = wb.Sheets['零件信息']
      let partsTotal = 0
      let partSuccessCount = 0
      if (partsWs) {
        const partsRows = XLSX.utils.sheet_to_json(partsWs)
        partsTotal = partsRows.length
        
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
          '热处理'?: string
          '需求日期'?: string
          '备注': string
          '自备'?: string | number | boolean
        }
        
        const validPartsRows = (partsRows as PartImportRow[]).filter(row => {
          const requiredFields = ['父表盘存编号', '零件名称', '数量']
          return requiredFields.every(field => row[field] && String(row[field]).trim() !== '')
        })
        
        const partImportErrors: string[] = []
        let missingMaterialCount = 0
        let missingSourceCount = 0
        let missingPartTypeCount = 0
        const materialByName = new Map<string, any>()
        materials.forEach((m: any) => {
          const key = String(m?.name || '').trim().toLowerCase()
          if (key) materialByName.set(key, m)
        })
        const sourceByName = new Map<string, any>()
        const sourceNameById = new Map<string, string>()
        materialSources.forEach((ms: any) => {
          const name = String(ms?.name || '').trim()
          if (name) sourceByName.set(name.toLowerCase(), ms)
          if (ms?.id !== undefined && ms?.id !== null) sourceNameById.set(String(ms.id), name)
        })
        const partTypeSet = new Set(partTypes.map((pt: any) => String(pt?.name || '').trim()).filter(Boolean))
        const creatingSourceTask = new Map<string, Promise<any | null>>()
        const normalizeSource = (s: string) => {
          const normalized = s.replace(/\s+/g, '').toLowerCase()
          if (!normalized) return ''
          if (['自备','钢料自备','含料自备'].some(source => s.includes(source))) return '自备'
          if (['含料','hanliao'].some(source => normalized.includes(source))) return '含料'
          if (['waigou','采购','外购'].some(source => normalized.includes(source))) return '外购'
          if (['火切','huoqie','切割'].some(source => normalized.includes(source))) return '火切'
          if (['锯切','jvqie','锯床割方','割方'].some(source => normalized.includes(source))) return '锯切'
          return s
        }
        const getOrCreateSource = async (normSource: string, rawSource: string) => {
          const byNorm = sourceByName.get(normSource.toLowerCase())
          if (byNorm) return byNorm
          const byRaw = rawSource ? sourceByName.get(rawSource.toLowerCase()) : null
          if (byRaw) return byRaw
          if (!normSource) return null
          const sourceKey = normSource.toLowerCase()
          let task = creatingSourceTask.get(sourceKey)
          if (!task) {
            task = (async () => {
              try {
                const resp = await fetchWithFallback('/api/options/material-sources', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: normSource, description: '', is_active: true }) })
                const j = await resp.json().catch(() => ({}))
                if (j?.success && j?.data?.id) {
                  const created = { id: j.data.id, name: normSource } as any
                  sourceByName.set(sourceKey, created)
                  sourceNameById.set(String(j.data.id), normSource)
                  return created
                }
              } catch {}
              return null
            })()
            creatingSourceTask.set(sourceKey, task)
          }
          return await task
        }
        const parseSpecifications = (spec: string, partCategory: string) => {
          const numbers = spec.match(/[0-9]+\.?[0-9]*/g)?.map(Number) || []
          switch (partCategory) {
            case '板料':
            case '锯床割方':
              return { 长: numbers[0] || 0, 宽: numbers[1] || 0, 高: numbers[2] || 0, A: numbers[0] || 0, B: numbers[1] || 0, C: numbers[2] || 0 }
            case '圆料':
              return { 直径: numbers[0] || 0, 高: numbers[1] || 0, φA: numbers[0] || 0, B: numbers[1] || 0 }
            case '圆环':
              return { 外径: numbers[0] || 0, 内径: numbers[1] || 0, 高: numbers[2] || 0, φA: numbers[0] || 0, φB: numbers[1] || 0, C: numbers[2] || 0 }
            case '板料割圆':
              return { 直径: numbers[0] || 0, 厚: numbers[1] || 0, φA: numbers[0] || 0, B: numbers[1] || 0 }
            case '圆管':
            default:
              return { 规格: spec }
          }
        }
        const partImportResults = await runWithConcurrency(validPartsRows, importConcurrency, async (row) => {
          const parentInventoryNumber = row['父表盘存编号']
          debugLog('查找零件关联工装:', parentInventoryNumber)
          const toolingId = inventoryNumberMap[parentInventoryNumber]
          if (!toolingId) {
            return { ok: false as const, error: `零件“${row['零件名称']}”（${row['盘存编号']}）：未找到关联的工装（父表盘存编号：${parentInventoryNumber}）`, missingMaterial: 0, missingSource: 0, missingPartType: 0 }
          }
          debugLog('找到零件关联工装:', parentInventoryNumber, '->', toolingId)
          const partInventoryNumber = String(row['盘存编号'] || '').trim()
          if (parentInventoryNumber && partInventoryNumber) {
            const expectedFormat = new RegExp(`^${parentInventoryNumber}[0-9]+$`)
            if (!expectedFormat.test(partInventoryNumber)) {
              return { ok: false as const, error: `零件“${row['零件名称']}”（${row['盘存编号']}）：盘存编号格式不符合要求，应为父级盘存编号+数字（如：${parentInventoryNumber}01）`, missingMaterial: 0, missingSource: 0, missingPartType: 0 }
            }
          }
          const materialName = String(row['材质'] || '').trim()
          const selectedMaterial = materialName ? (materialByName.get(materialName.toLowerCase()) || null) : null
          if (materialName && !selectedMaterial) {
            return { ok: false as const, error: `零件“${row['零件名称']}”（${row['盘存编号']}）：未找到材质“${materialName}”`, missingMaterial: 0, missingSource: 0, missingPartType: 0 }
          }
          const rawSource = String(row['材料来源'] || '').trim()
          const normSource = normalizeSource(rawSource)
          let selectedSource: any = await getOrCreateSource(normSource, rawSource)
          if (rawSource && !selectedSource) {
            const zibeiFlag = row['自备']
            const zibeiTruth = typeof zibeiFlag === 'boolean' ? zibeiFlag : /^(是|yes|y|1)$/i.test(String(zibeiFlag || '').trim())
            if (zibeiTruth) {
              selectedSource = sourceByName.get('自备') || null
            }
            if (!selectedSource) {
              return { ok: false as const, error: `零件“${row['零件名称']}”（${row['盘存编号']}）：未找到材料来源“${row['材料来源']}”`, missingMaterial: materialName ? 0 : 1, missingSource: 0, missingPartType: 0 }
            }
          }
          const partCategory = String(row['料型'] || '').trim()
          if (partCategory && !partTypeSet.has(partCategory)) {
            return { ok: false as const, error: `零件“${row['零件名称']}”（${row['盘存编号']}）：未找到料型“${partCategory}”`, missingMaterial: materialName ? 0 : 1, missingSource: rawSource ? 0 : 1, missingPartType: 0 }
          }
          const specText = String(row['规格'] || '').trim()
          const normalizedSpecText = specText.replace(/[×x]/g, '*')
          const payload: any = {
            part_inventory_number: partInventoryNumber,
            part_drawing_number: String(row['图号'] || '').trim(),
            part_name: String(row['零件名称']).trim(),
            part_quantity: Number(row['数量']),
            part_category: partCategory || null,
            specifications: parseSpecifications(normalizedSpecText, partCategory),
            remarks: '',
            source: '自备'
          }
          if (selectedMaterial) payload.material_id = selectedMaterial.id
          if (selectedSource) payload.material_source_id = selectedSource.id
          const sourceName = selectedSource?.name || (payload.material_source_id ? sourceNameById.get(String(payload.material_source_id)) || '' : '')
          const formattedLegacyRemark = formatExcelDate(row['备注'])
          const rawLegacyRemark = String(formattedLegacyRemark || '').trim()
          const rawHeat = String(row['热处理'] || '').trim()
          const rawDemand = normalizeDateInput(String(formatExcelDate(row['需求日期']) || '').trim())
          const parsedLegacy = parsePartRemarkFields(rawLegacyRemark)
          const heatTreatment = rawHeat || parsedLegacy.heatTreatment
          let demandDate = rawDemand || parsedLegacy.demandDate
          if (sourceName !== '外购') demandDate = ''
          payload.remarks = composePartRemarkFields(heatTreatment, demandDate)
          try {
            const created = await createPart(toolingId, payload)
            if (!created) {
              return { ok: false as const, error: `零件“${row['零件名称']}”（${row['盘存编号']}）：创建失败，服务器返回空数据`, missingMaterial: materialName ? 0 : 1, missingSource: rawSource ? 0 : 1, missingPartType: partCategory ? 0 : 1 }
            }
            return { ok: true as const, missingMaterial: materialName ? 0 : 1, missingSource: rawSource ? 0 : 1, missingPartType: partCategory ? 0 : 1 }
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error)
            return { ok: false as const, error: `零件“${row['零件名称']}”（${row['盘存编号']}）：创建失败，错误信息：${errorMsg}`, missingMaterial: materialName ? 0 : 1, missingSource: rawSource ? 0 : 1, missingPartType: partCategory ? 0 : 1 }
          }
        })
        partImportResults.forEach((result) => {
          missingMaterialCount += result.missingMaterial
          missingSourceCount += result.missingSource
          missingPartTypeCount += result.missingPartType
          if (result.ok) {
            successCount++
            partSuccessCount++
            return
          }
          partImportErrors.push(result.error)
        })
        
        // 如果有零件导入错误，显示给用户
        if (partImportErrors.length > 0) {
          message.warning(`零件信息导入完成，成功${partSuccessCount}条，失败${partImportErrors.length}条。失败原因：${summarizeImportErrors(partImportErrors)}`)
        }
        if (missingMaterialCount + missingSourceCount + missingPartTypeCount > 0) {
          message.warning(`零件信息存在空字段提示：材质为空${missingMaterialCount}条，材料来源为空${missingSourceCount}条，料型为空${missingPartTypeCount}条`)
        }
      }
      
      // 3. 解析标准件信息工作表（如果存在）
      const childItemsWs = wb.Sheets['标准件信息']
      let childTotal = 0
      let childSuccessCount = 0
      if (childItemsWs) {
        const childItemsRows = XLSX.utils.sheet_to_json(childItemsWs)
        childTotal = childItemsRows.length
        
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
        
        const childImportResults = await runWithConcurrency(validChildItemsRows, importConcurrency, async (row) => {
          const parentInventoryNumber = row['父表盘存编号']
          debugLog('查找标准件关联工装:', parentInventoryNumber)
          const toolingId = inventoryNumberMap[parentInventoryNumber]
          if (!toolingId) {
            return {
              ok: false as const,
              error: `标准件“${row['名称']}”（${row['型号']}）：未找到关联的工装（父表盘存编号：${parentInventoryNumber}）`
            }
          }
          debugLog('找到标准件关联工装:', parentInventoryNumber, '->', toolingId)
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
            if (created) return { ok: true as const }
            return {
              ok: false as const,
              error: `标准件“${row['名称']}”（${row['型号']}）：创建失败，服务器返回空数据`
            }
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error)
            return {
              ok: false as const,
              error: `标准件“${row['名称']}”（${row['型号']}）：创建失败，错误信息：${errorMsg}`
            }
          }
        })
        childImportResults.forEach((result) => {
          if (result.ok) {
            successCount++
            childSuccessCount++
            return
          }
          childImportErrors.push(result.error)
        })
        
        // 如果有标准件导入错误，显示给用户
        if (childImportErrors.length > 0) {
          message.warning(`标准件信息导入完成，成功${childSuccessCount}条，失败${childImportErrors.length}条。失败原因：${summarizeImportErrors(childImportErrors)}`)
        }
      }
      
      debugLog('导入完成，成功条数:', successCount)
      
      // 刷新数据：只刷新工装列表，不刷新零件数据
      // 因为导入时已经在本地状态中更新了数据，不需要再次刷新
      await fetchToolingData()
      importValidationCacheRef.current = null
      
      // 移除对每个工装都调用 fetchPartsData 和 fetchChildItemsData 的逻辑
      // 这样可以避免大量请求导致页面卡死
      // 如果用户需要查看导入的数据，可以手动展开工装行
      
      setImportSummary({
        tooling: { total: toolingTotal, success: toolingSuccessCount, failed: Math.max(toolingTotal - toolingSuccessCount, 0) },
        parts: { total: partsTotal, success: partSuccessCount, failed: Math.max(partsTotal - partSuccessCount, 0) },
        childItems: { total: childTotal, success: childSuccessCount, failed: Math.max(childTotal - childSuccessCount, 0) }
      })
      setImportSummaryVisible(true)
      
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
        await fetchAllMeta(true)
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
          await fetchAllMeta(true)
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

  const renderPreviewStatus = (valid?: boolean) => {
    if (valid === true) {
      return <span style={{ color: '#52c41a' }}>有效</span>
    }
    if (valid === false) {
      return <span style={{ color: '#f5222d' }}>无效</span>
    }
    return <span style={{ color: '#999' }}>—</span>
  }

  const renderPreviewErrors = (errors?: string[]) => {
    const list = Array.isArray(errors) ? errors.filter(e => String(e || '').trim()) : []
    return (
      <span style={{ color: '#f5222d', fontSize: '12px' }}>
        {list.length > 0 ? list.join('; ') : '-'}
      </span>
    )
  }

  const renderPreviewWarnings = (warnings?: string[]) => {
    const list = Array.isArray(warnings) ? warnings.filter(w => String(w || '').trim()) : []
    return (
      <span style={{ color: '#fa8c16', fontSize: '12px' }}>
        {list.length > 0 ? list.join('; ') : '-'}
      </span>
    )
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
      render: (valid: boolean) => renderPreviewStatus(valid)
    },
    {
      title: '错误信息',
      dataIndex: '_errors',
      width: 300,
      render: (errors: string[]) => renderPreviewErrors(errors)
    },
    {
      title: '提示',
      dataIndex: '_warnings',
      width: 240,
      render: (warnings: string[]) => renderPreviewWarnings(warnings)
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
      title: '热处理',
      dataIndex: '热处理',
      width: 150
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
      render: (valid: boolean) => renderPreviewStatus(valid)
    },
    {
      title: '错误信息',
      dataIndex: '_errors',
      width: 300,
      render: (errors: string[]) => renderPreviewErrors(errors)
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
      render: (valid: boolean) => renderPreviewStatus(valid)
    },
    {
      title: '错误信息',
      dataIndex: '_errors',
      width: 300,
      render: (errors: string[]) => renderPreviewErrors(errors)
    }
  ]

  return (
    <Card style={{ height: 'calc(100vh - 24px)' }} bodyStyle={{ display: 'flex', flexDirection: 'column', height: '100%', padding: isMobile ? 8 : 24 }}>
      <div className="flex items-center justify-between mb-4" style={{ flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center', gap: isMobile ? 8 : 0 }}>
        <Title level={2} className="mb-0">
          <ToolOutlined className="text-3xl text-red-500 mb-2" /> 工装信息
        </Title>
        <Space wrap>
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
                // 获取选中的父级、标准件、零件
                const parentIds = selectedRowKeys.filter(k => !k.startsWith('blank-') && !k.startsWith('part-') && !k.startsWith('child-'))
                const childItemIds = selectedRowKeys.filter(k => k.startsWith('child-')).map(k => k.slice(6))
                const partIds = selectedRowKeys.filter(k => k.startsWith('part-')).map(k => k.slice(5))
                
                // 如果仅选择了父级，确保加载子数据（无需展开）
                if (parentIds.length > 0) {
                  const fetchTasks: Promise<any>[] = []
                  parentIds.forEach(pid => {
                    const tid = String(pid)
                    if (!Array.isArray(partsMap[tid]) || partsMap[tid].length === 0) fetchTasks.push(fetchPartsData(tid))
                    if (!Array.isArray(childItemsMap[tid]) || childItemsMap[tid].length === 0) fetchTasks.push(fetchChildItemsData(tid))
                  })
                  if (fetchTasks.length > 0) {
                    try { await Promise.all(fetchTasks) } catch {}
                  }
                }
                
                // 收集选中的数据
                const selectedItems: any[] = []
                
                // 添加标准件
                const pushChild = (item: any) => selectedItems.push({ 
                  ...item, 
                  type: 'childItem',
                  project_name: (data.find(d => d.id === item.tooling_id)?.project_name || ''),
                  applicant: (data.find(d => d.id === item.tooling_id)?.recorder || '')
                })
                if (childItemIds.length > 0) {
                  Object.values(childItemsMap).forEach(childItems => {
                    childItems.forEach(item => { if (childItemIds.includes(item.id)) pushChild(item) })
                  })
                } else if (parentIds.length > 0) {
                  parentIds.forEach(pid => {
                    const list = childItemsMap[pid] || []
                    list.forEach(item => pushChild(item))
                  })
                }
                
                // 添加外购零件（严格筛选材料来源为“外购/采购/waigou”变体）
                const normalize = (s: string) => {
                  const t = String(s || '').replace(/\s+/g, '').toLowerCase()
                  if (!t) return ''
                  if (t.includes('外购') || t.includes('waigou') || t.includes('采购')) return '外购'
                  return s
                }
                const pushPartIfWaigou = (part: any) => {
                  const ms = materialSources.find(ms => String(ms.id) === String(part.material_source_id))
                  if (!ms || normalize(ms.name) !== '外购') return
                  selectedItems.push({
                    ...part,
                    type: 'part',
                    project_name: (data.find(d => d.id === part.tooling_id)?.project_name || ''),
                    production_unit: (data.find(d => d.id === part.tooling_id)?.production_unit || ''),
                    specifications_text: formatSpecificationsForProduction(part.specifications, part.part_category),
                    applicant: (data.find(d => d.id === part.tooling_id)?.recorder || '')
                  })
                }
                if (partIds.length > 0) {
                  Object.values(partsMap).forEach(parts => parts.forEach(part => { if (partIds.includes(part.id)) pushPartIfWaigou(part) }))
                } else if (parentIds.length > 0) {
                  parentIds.forEach(pid => {
                    const list = partsMap[pid] || []
                    list.forEach(part => pushPartIfWaigou(part))
                  })
                }
                
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
                  const demandDateOk = dateOk(parsePartRemarkFields(String(it.remarks || '')).demandDate)
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
                if (selectedItems.length === 0) {
                  message.warning('未找到可生成采购单的记录（需选择外购零件或任何标准件）')
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
          
          <Popconfirm
            title="确认批量删除？"
            description={`将删除：工装 ${selectedRowKeys.filter(k => !k.startsWith('blank-') && !k.startsWith('part-') && !k.startsWith('child-')).length}，零件 ${selectedRowKeys.filter(k => k.startsWith('part-')).length}，标准件 ${selectedRowKeys.filter(k => k.startsWith('child-')).length}（不可恢复）`}
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            overlayClassName="danger-popconfirm"
            onConfirm={async () => {
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
          >
            <Button danger>批量删除</Button>
          </Popconfirm>
          <Button icon={<ReloadOutlined />} onClick={() => handleExternalAction(handleRefresh)}>刷新</Button>
          <Button icon={<LeftOutlined />} onClick={() => handleExternalAction(() => navigate('/dashboard'))}>返回</Button>
        </Space>
      </div>
      <div className="filter-bar" style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Input
            allowClear
            placeholder="盘存编号（第7位数字触发子表）"
            style={{ width: isMobile ? '100%' : 200 }}
            value={filterInventory}
            onChange={(e) => setFilterInventory(sanitizeAlphaNumeric(e.target.value))}
          />
          <AutoComplete
            allowClear
            placeholder="项目名称"
            style={{ width: isMobile ? '100%' : 220 }}
            options={projectOptions as any}
            value={filterProject}
            onSearch={(v) => setFilterProject(String(v || ''))}
            onSelect={(v) => setFilterProject(String(v))}
          />
          <AutoComplete
            allowClear
            placeholder="图号（子表满4位触发）"
            style={{ width: isMobile ? '100%' : 180 }}
            options={partDrawingOptions as any}
            value={filterPartDrawing}
            onSearch={(v) => setFilterPartDrawing(sanitizeAlphaNumeric(v))}
            onSelect={(v) => setFilterPartDrawing(sanitizeAlphaNumeric(v))}
          />
          <AutoComplete
            placeholder="投产单位"
            style={{ width: isMobile ? '100%' : 200 }}
            options={unitOptions as any}
            value={filterUnit}
            onSearch={(v) => setFilterUnit(v)}
            onSelect={(v) => setFilterUnit(String(v))}
            allowClear
          />
          <AutoComplete
            placeholder="工装类别"
            style={{ width: isMobile ? '100%' : 200 }}
            options={categoryOptions as any}
            value={filterCategory}
            onSearch={(v) => setFilterCategory(v)}
            onSelect={(v) => setFilterCategory(String(v))}
            allowClear
          />
          <AutoComplete
            placeholder="责任人"
            style={{ width: isMobile ? '100%' : 160 }}
            options={recorderOptions as any}
            value={filterRecorder}
            onSearch={(v) => setFilterRecorder(String(v || ''))}
            onSelect={(v) => setFilterRecorder(String(v))}
            allowClear
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>优先级</span>
            <Rate
              count={3}
              value={filterPriority || 0}
              onChange={(v) => setFilterPriority(v ? v : undefined)}
            />
          </div>
          <Space size={6}>
            <Button size="small" onClick={() => handleExternalAction(handleCollapseAll)}>全部折叠</Button>
          </Space>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: isMobile ? 'space-between' : 'flex-end', width: isMobile ? '100%' : undefined }}>
          <Segmented
            options={[
              { label: `全部 (${counts.all})`, value: 'all' },
              { label: `完成 (${counts.completed})`, value: 'completed' },
              { label: `未完成 (${counts.incomplete})`, value: 'incomplete' }
            ]}
            value={filterStatus}
            onChange={(v) => setFilterStatus(v as any)}
          />
        </div>
      </div>
        <div ref={tableWrapRef} style={{ flex: 1, minHeight: 0 }}>
          <style>{`
          .excel-table { --row-h: 32px; }
          .excel-table .ant-table-thead > tr > th { height: var(--row-h) !important; }
          .excel-table .ant-table-tbody > tr > td { height: var(--row-h) !important; padding: 0 8px; }
          .excel-table .ant-table-thead > tr > th,
          .excel-table .ant-table-tbody > tr > td {
            white-space: nowrap !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
          }
          .excel-table .ant-table-tbody > tr:hover > td { background: inherit !important; }
          .editing-input { border: none !important; box-shadow: none !important; outline: none !important; background: transparent !important; }
          .editing-input.ant-input:focus { border: none !important; box-shadow: none !important; outline: none !important; }
          .row-completed > td { background: #2f8f4e !important; }
          .excel-table .ant-table-tbody > tr.row-completed:hover > td { background: #2f8f4e !important; }
          .excel-table .ant-table-expand-icon-col,
          .excel-table .ant-table-row-expand-icon-cell { display: none !important; }
          .filter-bar .ant-input { border: none !important; box-shadow: none !important; }
          .filter-bar .ant-input-affix-wrapper { border: 1px solid #d9d9d9 !important; box-shadow: none !important; }
          .danger-popconfirm .ant-popover-inner { background-color: #fff1f0 !important; border: 1px solid #ffccc7 !important; }
          .danger-popconfirm .ant-popover-message-title { color: #cf1322 !important; font-weight: 600; }
          .danger-popconfirm .ant-popover-arrow::before { background-color: #fff1f0 !important; }
          `}</style>
        <Table
          className="excel-table"
          rowKey="id"
          loading={loading}
          components={{ header: { cell: HeaderCell } }}
          dataSource={tableRows}
          columns={columns}
          pagination={false}
          bordered={false}
          tableLayout="fixed"
          scroll={{ x: 777, y: tableScrollY }}
          sticky={{ offsetScroll: 0 }}
          locale={{ emptyText: '' }}
          rowClassName={(record: any) => {
            const isBlank = String(record?.id || '').startsWith('blank-')
            if (isBlank) return ''
            // 只要有完成日期，就显示绿色背景
            const hasCompletedDate = !!record.completed_date && String(record.completed_date).trim() !== ''
            return hasCompletedDate ? 'row-completed' : ''
          }}
          rowSelection={{
            selectedRowKeys: selectedRowKeys.filter(k => !k.startsWith('part-') && !k.startsWith('child-')),
            onChange: (keys) => {
              const parentKeys = (keys as (string | number)[]).map(k => String(k))
              const childKeys: string[] = []
              parentKeys.forEach(pid => {
                const parts = (partsMap[pid] || []).filter(p => !String(p.id || '').startsWith('blank-'))
                childKeys.push(...parts.map(p => 'part-' + p.id))
                const childItems = (childItemsMap[pid] || []).filter(c => !String(c.id || '').startsWith('blank-'))
                childKeys.push(...childItems.map(c => 'child-' + c.id))
              })
              setSelectedRowKeys(prev => {
                const prevChild = prev.filter(k => k.startsWith('part-') || k.startsWith('child-'))
                return Array.from(new Set([...prevChild, ...parentKeys, ...childKeys]))
              })
            },
            onSelectAll: (selected) => {
              const currentList = tableRows.filter(r => !String(r.id || '').startsWith('blank-'))
              if (selected) {
                // 仅针对当前列表的父级行选择，以及其已加载子项
                const allKeys: string[] = []
                currentList.forEach(parent => {
                  const pid = String(parent.id)
                  allKeys.push(pid)
                  const parts = (partsMap[pid] || []).filter(p => !String(p.id || '').startsWith('blank-'))
                  allKeys.push(...parts.map(p => 'part-' + p.id))
                  const childItems = (childItemsMap[pid] || []).filter(c => !String(c.id || '').startsWith('blank-'))
                  allKeys.push(...childItems.map(c => 'child-' + c.id))
                })
                setSelectedRowKeys(prev => Array.from(new Set([...prev, ...allKeys])))
              } else {
                // 仅取消当前列表父级及其已加载子项，不影响其它已选内容
                const removeSet = new Set<string>()
                currentList.forEach(parent => {
                  const pid = String(parent.id)
                  removeSet.add(pid)
                  const parts = (partsMap[pid] || []).filter(p => !String(p.id || '').startsWith('blank-'))
                  parts.forEach(p => removeSet.add('part-' + p.id))
                  const childItems = (childItemsMap[pid] || []).filter(c => !String(c.id || '').startsWith('blank-'))
                  childItems.forEach(c => removeSet.add('child-' + c.id))
                })
                setSelectedRowKeys(prev => prev.filter(k => !removeSet.has(k)))
              }
            },
            columnWidth: 40,
            getCheckboxProps: (record: any) => ({ disabled: String(record?.id || '').startsWith('blank-') }),
            checkStrictly: true
          }}
          expandIconColumnIndex={-1}
          expandable={{
            expandedRowKeys,
            rowExpandable: (record: any) => !String(record.id || '').startsWith('blank-'),
            onExpand: (expanded, record: any) => {
              const id = record.id as string
              setExpandedRowKeys(prev => {
                if (expanded) {
                  return prev.includes(id) ? prev : [...prev, id]
                }
                return prev.filter(k => k !== id)
              })
              setExpandedChildKeys(prev => {
                if (expanded) {
                  return prev.includes(id) ? prev : [...prev, id]
                }
                return prev.filter(k => k !== id)
              })
              if (expanded) {
                ensureExpandedDataLoaded(id, false)

                // ✅ 展开子表时校准总额（只校准一次）
                // 注意：ensureExpandedDataLoaded 内部已经会调用 syncLocalToolingTotals
                // 这里不再重复调用，避免同一工具被保存多次
                if (!calibratedToolingIdsRef.current.has(id)) {
                  calibratedToolingIdsRef.current.add(id)
                }
              }
            },
            expandRowByClick: false,
            indentSize: 0,
            expandIcon: () => null,
            expandedRowRender
          }}
        />
      </div>

      <Modal
        title="批量添加零件"
        open={partBatchModal.open}
        onCancel={() => {
          setPartBatchModal({ toolingId: '', open: false })
          setPartBatchCount('5')
        }}
        onOk={confirmPartBatchAdd}
        destroyOnHidden
      >
        <div style={{ display: 'grid', gap: 8 }}>
          <div>请输入要批量添加的零件行数</div>
          <Input
            value={partBatchCount}
            onChange={(e) => setPartBatchCount(String(e.target.value || '').replace(/[^\d]/g, ''))}
            placeholder="例如：5"
          />
          <div style={{ color: '#888', fontSize: 12 }}>系统将自动生成连续零件盘存编号，后续仍可手动修改。</div>
        </div>
      </Modal>
      
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
              <li>材质、材料来源、料型可为空，系统将提示但仍可导入</li>
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

      <Modal
        title="导入结果"
        open={importSummaryVisible}
        onCancel={() => setImportSummaryVisible(false)}
        footer={[
          <Button key="ok" type="primary" onClick={() => setImportSummaryVisible(false)}>
            确定
          </Button>
        ]}
      >
        <div className="space-y-4">
          <div>
            <div className="font-medium">父表（工装信息）</div>
            <div className="text-gray-600">成功 {importSummary.tooling.success} 条，失败 {importSummary.tooling.failed} 条</div>
          </div>
          <div>
            <div className="font-medium">子表（零件信息）</div>
            <div className="text-gray-600">成功 {importSummary.parts.success} 条，失败 {importSummary.parts.failed} 条</div>
          </div>
          <div>
            <div className="font-medium">子表（标准件信息）</div>
            <div className="text-gray-600">成功 {importSummary.childItems.success} 条，失败 {importSummary.childItems.failed} 条</div>
          </div>
        </div>
      </Modal>
    </Card>
  )
}

export default ToolingInfoPage
