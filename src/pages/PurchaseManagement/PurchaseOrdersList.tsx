﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Button, message, Row, Col, Space, Segmented, Select, DatePicker } from 'antd';
import * as XLSX from 'xlsx'
import { fetchWithFallback } from '../../utils/api'
import { rollbackPurchaseOrders, updateChildPurchaseStatus, updatePartPurchaseStatus } from '../../services/toolingService';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase';


// Excel表格样式 - 与工装信息保持一致
const excelTableStyles = `
  .excel-table {
    --row-h: 36px;
  }
  .excel-table .ant-table-thead > tr > th {
    height: var(--row-h) !important;
    padding: 8px 12px !important;
    background: #fafafa !important;
    font-weight: 600 !important;
    border-right: 1px solid #f0f0f0 !important;
    position: sticky !important;
    top: 0 !important;
    z-index: 10 !important;
  }
  .excel-table .ant-table-tbody > tr > td {
    height: var(--row-h) !important;
    padding: 8px 12px !important;
    border-right: 1px solid #f0f0f0 !important;
  }
  .excel-table .ant-table-tbody > tr:hover > td {
    background-color: #f5f5f5 !important;
  }
  .excel-table .ant-table-expanded-row-fixed {
    overflow: visible !important;
  }
  .excel-table .ant-table-row-expand-icon-cell {
    display: none !important;
  }
  .excel-table .ant-table-selection-column {
    width: 40px !important;
    min-width: 40px !important;
  }
`;

// 添加样式标签
const StyleInjector = () => (
  <style dangerouslySetInnerHTML={{ __html: excelTableStyles }} />
);

interface PurchaseOrder {
  id: string;
  inventory_number: string;
  project_name: string;
  part_name: string;
  part_quantity: number;
  unit: string;
  model: string;
  material_source: string;
  production_unit: string;
  created_date: string;
  demand_date?: string;
  applicant: string;
  status: string;
  updated_date?: string;
  source?: '工装信息' | '临时计划' | '未知来源';
  weight?: number;
  unit_price?: number;
  total_price?: number;
}

const PRINT_DENSITY_LEVEL = 6 as const;
const PRINT_PORTRAIT_PAGE_UNIT_BUDGET = 40
const PRINT_PORTRAIT_MIN_LAST_PAGE_UNITS = 8
const PRINT_DENSITY_PROFILES = {
  1: { pageUnitBudget: 30, minLastPageUnits: 10 },
  2: { pageUnitBudget: 31, minLastPageUnits: 11 },
  3: { pageUnitBudget: 32, minLastPageUnits: 11 },
  4: { pageUnitBudget: 33, minLastPageUnits: 12 },
  5: { pageUnitBudget: 34, minLastPageUnits: 13 },
  6: { pageUnitBudget: 34, minLastPageUnits: 14 },
  7: { pageUnitBudget: 35, minLastPageUnits: 14 },
  8: { pageUnitBudget: 35, minLastPageUnits: 15 },
  9: { pageUnitBudget: 36, minLastPageUnits: 15 },
  10: { pageUnitBudget: 36, minLastPageUnits: 16 }
} as const;
type PrintDensityLevel = keyof typeof PRINT_DENSITY_PROFILES
const PRINT_DENSITY_OPTIONS: Array<{ label: string; value: PrintDensityLevel }> = [
  { label: '第1档（更宽松）', value: 1 },
  { label: '第2档', value: 2 },
  { label: '第3档', value: 3 },
  { label: '第4档', value: 4 },
  { label: '第5档', value: 5 },
  { label: '第6档（默认）', value: 6 },
  { label: '第7档', value: 7 },
  { label: '第8档', value: 8 },
  { label: '第9档', value: 9 },
  { label: '第10档（更紧凑）', value: 10 }
]



export default function PurchaseOrdersList() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [data, setData] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const didInitRef = useRef(false);
  
  const inFlightRef = useRef(false);
  const [sourceFilter, setSourceFilter] = useState<'全部' | '工装信息' | '临时计划'>('全部');
  const [printDensityLevel, setPrintDensityLevel] = useState<PrintDensityLevel>(PRINT_DENSITY_LEVEL)
  // 日期编辑状态: { id_field: boolean } 如 "123_created_date": true
  const [editingDate, setEditingDate] = useState<Record<string, boolean>>({})
  const DEBUG = (import.meta as any)?.env?.DEV === true;

  // 材料单价索引 + 工装零件索引（用于实时计算采购单金额）
  const [materialUnitPriceMap, setMaterialUnitPriceMap] = useState<Record<string, number>>({})
  const [partInfoMap, setPartInfoMap] = useState<Record<string, { materialId: string; unitWeight: number }>>({})
  useEffect(() => {
    (async () => {
      try {
        // 拉取材料单价表
        const mResp = await fetchWithFallback('/api/materials?pageSize=10000')
        const mJson = await mResp.json().catch(() => ({}))
        const mMap: Record<string, number> = {}
        const list = Array.isArray(mJson?.items) ? mJson.items : Array.isArray(mJson?.data) ? mJson.data : []
        list.forEach((m: any) => {
          const id = String(m?.id || m?.material_id || '')
          const p = Number(m?.unit_price ?? m?.price ?? 0)
          if (id) mMap[id] = p
        })
        setMaterialUnitPriceMap(mMap)
      } catch {}
      try {
        // 拉取工装零件：建立 inventory_no -> { materialId, unitWeight }
        const pResp = await fetchWithFallback('/api/tooling/parts?pageSize=10000')
        const pJson = await pResp.json().catch(() => ({}))
        const pMap: Record<string, { materialId: string; unitWeight: number }> = {}
        const plist = Array.isArray(pJson?.items) ? pJson.items : Array.isArray(pJson?.data) ? pJson.data : []
        plist.forEach((p: any) => {
          const inv = String(p?.part_inventory_number || p?.inventory_number || '').trim()
          if (!inv) return
          pMap[inv] = {
            materialId: String(p?.material_id || ''),
            unitWeight: Number(p?.weight || 0)
          }
        })
        setPartInfoMap(pMap)
      } catch {}
    })()
  }, [])

  // 实时计算金额：与工装信息子表逻辑一致 = 件数 × 单件重 × 材料单价
  const computeAmount = useCallback((item: PurchaseOrder): number | null => {
    const qty = Number(item.part_quantity || 0)
    const inv = String(item.inventory_number || '').trim()
    const partInfo = partInfoMap[inv]
    const unitWeight = partInfo?.unitWeight && partInfo.unitWeight > 0
      ? partInfo.unitWeight
      : Number(item.weight || 0)
    const totalWeight = qty > 0 && unitWeight > 0 ? Math.round(unitWeight * qty * 1000) / 1000 : 0
    let materialId = partInfo?.materialId || ''
    // 回退：根据名称/型号查 part 表（兼容未拉到的数据）
    if (!materialId) {
      const match = Object.values(partInfoMap).find((p) => p.materialId)
      if (match) materialId = match.materialId
    }
    const unitPrice = Number(materialUnitPriceMap[materialId] || 0)
    if (totalWeight > 0 && unitPrice > 0) {
      return Math.round(totalWeight * unitPrice * 100) / 100
    }
    // 无法计算则回退到后端值
    const stored = typeof item.total_price === 'number' ? item.total_price : parseFloat(String(item.total_price ?? ''))
    return isNaN(stored) ? null : stored
  }, [materialUnitPriceMap, partInfoMap])

  const totals = useMemo(() => {
    const set = new Set<string>(selectedRowKeys.map(String))
    let weight = 0
    let price = 0
    for (const item of data) {
      if (!set.has(String(item.id))) continue
      const w = typeof item.weight === 'number' ? item.weight : parseFloat(String(item.weight ?? ''))
      const p = computeAmount(item)
      if (!isNaN(w)) weight += w
      if (p !== null) price += p
    }
    return { weight, price }
  }, [data, selectedRowKeys, computeAmount])


  const fetchPurchaseOrders = async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setLoading(true);
    if (DEBUG) console.log(`=== 开始获取采购单数据 ===`);
    
    try {
      // 并发保护：不再主动中止上一请求，直接忽略新的并发触发
      const params = new URLSearchParams();
      // 获取所有数据，不设置分页
      params.append('page', '1');
      params.append('pageSize', '10000'); // 设置一个大数字来获取所有数据

      // 获取当前会话并设置 Authorization 头
      const { data: { session } } = await supabase.auth.getSession();
      const headers: HeadersInit = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const response = await fetchWithFallback(`/api/purchase-orders?${params.toString()}`, {
        headers
      });
      
      if (!response) {
        if (DEBUG) console.error('fetchWithFallback returned null for /api/purchase-orders');
        setData([]);
        return;
      }
      
      // 检查响应状态和内容类型（500 且 fetch failed 时进行容错）
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        if (response.status === 500 && /fetch failed/i.test(text)) {
          message.warning('采购单数据暂不可用（网络波动），稍后重试');
          setData([]);
          return;
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        if (DEBUG) console.error('非JSON响应:', text);
        throw new Error('服务器返回了非JSON格式的数据');
      }
      
      let result;
      try {
        result = await response.json();
      } catch (jsonError) {
        if (DEBUG) console.error('JSON解析错误:', jsonError);
        const text = await response.text();
        if (DEBUG) console.error('响应内容:', text);
        throw new Error('无法解析服务器返回的JSON数据');
      }
      
      if (DEBUG) console.log('采购单数据获取成功:', result);
      
      // 支持两种数据格式：data 或 items
      let ordersData = [];
      if (result && result.data && Array.isArray(result.data)) {
        ordersData = result.data;
      } else if (result && result.items && Array.isArray(result.items)) {
        ordersData = result.items;
      } else {
        if (DEBUG) console.error('数据格式错误:', result);
        ordersData = [];
      }
      
      setData(ordersData);
    } catch (error) {
      if (DEBUG) console.error('获取采购单数据失败:', error);
      message.destroy();
      message.error('获取采购单数据失败: ' + (error as Error).message);
      setData([]);
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  };

  // 批量更新日期：同提交人+同项目一起改
  const handleDateChange = async (recordId: string, field: 'created_date' | 'demand_date', dateValue: dayjs.Dayjs | null) => {
    if (!dateValue) return
    const isoStr = dateValue.format('YYYY-MM-DD')
    const record = data.find(d => d.id === recordId)
    if (!record) return

    // 找出所有同提交人+同项目的记录
    const matchedIds = data
      .filter(d => d.applicant === record.applicant && d.project_name === record.project_name)
      .map(d => d.id)

    setEditingDate(prev => ({ ...prev, [`${recordId}_${field}`]: false }))

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers: HeadersInit = {}
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`

      // 并发更新所有匹配的记录
      const results = await Promise.all(
        matchedIds.map(id =>
          fetchWithFallback(`/api/purchase-orders/${id}`, {
            method: 'PUT',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ [field]: isoStr })
          })
        )
      )

      const failedCount = results.filter(r => !r || !r.ok).length
      if (failedCount > 0) {
        message.error(`部分更新失败（${failedCount}/${matchedIds.length}）`)
      } else {
        message.success(`已同步更新 ${matchedIds.length} 条记录的${field === 'created_date' ? '申请日期' : '需求日期'}`)
      }

      // 刷新数据
      fetchPurchaseOrders()
    } catch (err) {
      message.error('更新失败: ' + (err as Error).message)
    }
  }

  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请选择要删除的采购单');
      return;
    }

    try {
      const response = await fetchWithFallback('/api/purchase-orders/batch-delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ids: selectedRowKeys }),
      });

      if (!response) {
        throw new Error('网络请求未响应');
      }

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success) {
        message.success(`成功删除 ${selectedRowKeys.length} 个采购单`);
        setSelectedRowKeys([]);
        fetchPurchaseOrders();
      } else {
        message.error(result.error || '删除失败');
      }
    } catch (error) {
      console.error('批量删除失败:', error);
      message.error('批量删除失败: ' + (error as Error).message);
    }
  };



  const rowSelection = useMemo(() => ({
    selectedRowKeys,
    onChange: (newSelectedRowKeys: React.Key[]) => {
      setSelectedRowKeys(newSelectedRowKeys);
    },
    columnWidth: 40,
  }), [selectedRowKeys]);

  const [tempPlanOrderIds, setTempPlanOrderIds] = useState<string[]>([])
  const [approvalHiddenIds, setApprovalHiddenIds] = useState<string[]>([])
  useEffect(() => {
    const loadTempPlanOrderIds = async () => {
      try {
        const resp = await fetchWithFallback('/api/temporary-plan-groups', { method: 'GET' })
        const json = await resp.json().catch(() => ({}))
        const groups = Array.isArray(json?.data) ? json.data : []
        const ids = groups.flatMap((group: any) =>
          Array.isArray(group?.items) ? group.items.map((item: any) => String(item?.id || '').trim()).filter(Boolean) : []
        )
        setTempPlanOrderIds(Array.from(new Set(ids)))
      } catch {
        setTempPlanOrderIds([])
      }
    }
    const loadApprovalHidden = () => {
      try {
        const arr = JSON.parse(localStorage.getItem('approval_hidden_ids') || '[]')
        setApprovalHiddenIds(Array.isArray(arr) ? arr : [])
      } catch { setApprovalHiddenIds([]) }
    }
    loadTempPlanOrderIds()
    loadApprovalHidden()
    const handler = () => { void loadTempPlanOrderIds() }
    const handler2 = () => loadApprovalHidden()
    window.addEventListener('temporary_plans_updated', handler)
    window.addEventListener('approval_updated', handler2)
    
    // 监听状态更新事件（如生成采购单后）
    const statusHandler = () => {
      fetchPurchaseOrders()
    }
    window.addEventListener('status_updated', statusHandler)

    return () => {
      window.removeEventListener('temporary_plans_updated', handler)
      window.removeEventListener('approval_updated', handler2)
      window.removeEventListener('status_updated', statusHandler)
    }
  }, [])

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
        ;(js.items || []).forEach((u: any) => { map[String(u.real_name || '')] = String(u.team || '') })
        setUserTeamsMap(map)
        setTeamsLoaded(true)
      } catch {}
    })()
  }, [])

  const filteredData = useMemo(() => {
    if (isTechnician && !teamsLoaded) return []
    let arr = data
      .filter(item => !tempPlanOrderIds.includes(String(item.id)) && !approvalHiddenIds.includes(item.id))
      .filter(item => sourceFilter === '全部' ? true : item.source === sourceFilter)
    if (isTechnician && myTeamName) {
      arr = arr.filter((item: any) => {
        const applicant = String(item.applicant || '')
        const team = userTeamsMap[applicant] || ''
        return team && team === myTeamName
      })
    }
    return arr
  }, [data, tempPlanOrderIds, approvalHiddenIds, sourceFilter, isTechnician, myTeamName, userTeamsMap, teamsLoaded])

  const columns: ColumnsType<PurchaseOrder> = useMemo(() => ([
    {
      title: '序号',
      dataIndex: 'index',
      width: 50,
      align: 'center',
      render: (_, __, index) => index + 1
    },
    {
      title: '名称',
      dataIndex: 'part_name',
      width: 200
    },
    {
      title: '型号',
      dataIndex: 'model',
      width: 150,
      render: (text) => text || '-'
    },
    {
      title: '数量',
      dataIndex: 'part_quantity',
      width: 110,
      align: 'center',
      render: (quantity, record) => `${quantity || 0}${record.unit ? ' ' + record.unit : ''}`
    },
    {
      title: '项目名称',
      dataIndex: 'project_name',
      width: 200
    },
    {
      title: '投产单位',
      dataIndex: 'production_unit',
      width: 140,
      render: (text) => text || '-'
    },
    {
      title: '申请日期',
      dataIndex: 'created_date',
      width: 140,
      render: (date, record) => {
        const key = `${record.id}_created_date`
        if (editingDate[key]) {
          return (
            <DatePicker
              size="small"
              defaultValue={dayjs(date)}
              onChange={(val) => handleDateChange(record.id, 'created_date', val)}
              onBlur={() => setEditingDate(prev => ({ ...prev, [key]: false }))}
              style={{ width: '100%' }}
            />
          )
        }
        return (
          <span
            onClick={() => setEditingDate(prev => ({ ...prev, [key]: true }))}
            style={{ cursor: 'pointer', color: '#1677ff', padding: '2px 4px', borderRadius: 3 }}
          >
            {dayjs(date).format('YYYY-MM-DD')}
          </span>
        )
      }
    },
    {
      title: '需求日期',
      dataIndex: 'demand_date',
      width: 140,
      render: (date, record) => {
        const key = `${record.id}_demand_date`
        if (editingDate[key]) {
          return (
            <DatePicker
              size="small"
              defaultValue={date ? dayjs(date) : null}
              onChange={(val) => handleDateChange(record.id, 'demand_date', val)}
              onBlur={() => setEditingDate(prev => ({ ...prev, [key]: false }))}
              style={{ width: '100%' }}
              placeholder="选择需求日期"
            />
          )
        }
        return (
          <span
            onClick={() => setEditingDate(prev => ({ ...prev, [key]: true }))}
            style={{ cursor: 'pointer', color: date ? '#1677ff' : '#999', padding: '2px 4px', borderRadius: 3 }}
          >
            {date ? dayjs(date).format('YYYY-MM-DD') : '-'}
          </span>
        )
      }
    },
    {
      title: '提交人',
      dataIndex: 'applicant',
      width: 120
    },
    {
      title: '重量(kg)',
      dataIndex: 'weight',
      width: 110,
      align: 'center',
      render: (val: number | string | undefined) => {
        const n = typeof val === 'number' ? val : parseFloat(String(val ?? ''));
        const show = !isNaN(n) ? n : null;
        return <span style={{ color: show !== null ? '#333' : '#999' }}>{show !== null ? `${show.toFixed(3)}` : '-'}</span>;
      }
    },
    {
      title: '金额(元)',
      dataIndex: 'total_price',
      width: 120,
      align: 'center',
      render: (val: number | string | undefined, record: PurchaseOrder) => {
        const n = computeAmount(record)
        const show = n !== null ? n : null
        return <span style={{ color: show !== null ? '#333' : '#999' }}>{show !== null ? `¥${show.toFixed(2)}` : '-'}</span>;
      }
    }
  ]), [editingDate, handleDateChange, computeAmount]);

  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    fetchPurchaseOrders();
    return () => {};
  }, []);

  type ApprovalPrintRow = {
    item: PurchaseOrder
    cdate: string
    ddate: string
  }

  const buildApprovalQtyText = (item: PurchaseOrder) => `${item.part_quantity || 0}${item.unit ? ' ' + item.unit : ''}`

  const compareApprovalRows = (a: ApprovalPrintRow, b: ApprovalPrintRow) => {
    const compare = (x: string, y: string) => x.localeCompare(y, 'zh-CN')
    const keysA = [
      String(a.item.project_name || '').trim(),
      String(a.item.production_unit || '').trim(),
      String(a.cdate || '').trim(),
      String(a.ddate || '').trim(),
      String(a.item.applicant || '').trim(),
      String(a.item.part_name || '').trim(),
      String(a.item.model || '').trim(),
      String(buildApprovalQtyText(a.item)).trim()
    ]
    const keysB = [
      String(b.item.project_name || '').trim(),
      String(b.item.production_unit || '').trim(),
      String(b.cdate || '').trim(),
      String(b.ddate || '').trim(),
      String(b.item.applicant || '').trim(),
      String(b.item.part_name || '').trim(),
      String(b.item.model || '').trim(),
      String(buildApprovalQtyText(b.item)).trim()
    ]
    for (let i = 0; i < keysA.length; i += 1) {
      const diff = compare(keysA[i], keysB[i])
      if (diff !== 0) return diff
    }
    return 0
  }

  const buildApprovalPrintRows = (rows: PurchaseOrder[]) => rows
    .map((item) => ({
      item,
      cdate: dayjs(item.created_date).format('YYYY-MM-DD'),
      ddate: item.demand_date ? dayjs(item.demand_date).format('YYYY-MM-DD') : ''
    }))
    .sort(compareApprovalRows)
    .reduce<ApprovalPrintRow[]>((acc, row, index) => {
      if (index === 0) {
        acc.push(row)
        return acc
      }
      const prev = acc[index - 1]
      const currentItem = row.item
      const prevItem = prev.item
      acc.push({
        ...row,
        item: {
          ...currentItem,
          project_name: String(currentItem.project_name || '').trim() || String(prevItem.project_name || '').trim(),
          production_unit: String(currentItem.production_unit || '').trim() || String(prevItem.production_unit || '').trim(),
          applicant: String(currentItem.applicant || '').trim() || String(prevItem.applicant || '').trim()
        },
        cdate: String(row.cdate || '').trim() || String(prev.cdate || '').trim(),
        ddate: String(row.ddate || '').trim() || String(prev.ddate || '').trim()
      })
      return acc
    }, [])

  const getApprovalGroupValues = (row: ApprovalPrintRow) => ([
    String(row.item.project_name || '').trim(),
    String(row.item.production_unit || '').trim(),
    String(row.cdate || '').trim(),
    String(row.ddate || '').trim(),
    String(row.item.applicant || '').trim()
  ])

  const calcApprovalGroupSpans = (rows: ApprovalPrintRow[]) => {
    const spans = Array(rows.length).fill(1)
    let i = 0
    while (i < rows.length) {
      const currentValues = getApprovalGroupValues(rows[i])
      if (!currentValues.some(Boolean)) {
        i += 1
        continue
      }
      let j = i + 1
      while (
        j < rows.length &&
        getApprovalGroupValues(rows[j]).every((value, idx) => value === currentValues[idx])
      ) {
        j += 1
      }
      spans[i] = j - i
      for (let k = i + 1; k < j; k += 1) spans[k] = 0
      i = j
    }
    return spans
  }

  const isSameApprovalGroup = (prevRow: ApprovalPrintRow | undefined, nextRow: ApprovalPrintRow | undefined) => {
    if (!prevRow || !nextRow) return false
    const prevValues = getApprovalGroupValues(prevRow)
    const nextValues = getApprovalGroupValues(nextRow)
    return prevValues.every((value, idx) => value === nextValues[idx])
  }

  // 导出审批清单电子版Excel（与打印格式完全一致，通过HTML表格+Excel XML命名空间实现样式）
  const exportApprovalExcel = () => {
    if (selectedRowKeys.length === 0) { message.warning('请选择需要导出的审批清单'); return; }
    const rows = filteredData.filter(item => selectedRowKeys.includes(item.id))
    if (rows.length === 0) { message.warning('没有可导出的审批清单'); return }

    const escapeHtml = (value: any) => {
      const text = String(value ?? '')
      return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
    }
    const exportRows = buildApprovalPrintRows(rows)

    // 打印密度映射：与print完全一致
    const DENSITY_ROWS_MAP: Record<number, number> = {
      1: 24, 2: 26, 3: 27, 4: 28, 5: 29,
      6: 30, 7: 31, 8: 32, 9: 34, 10: 36
    }
    const rowsPerPage = DENSITY_ROWS_MAP[printDensityLevel] || 28

    // 分页逻辑：rowspan组不跨页（与print完全一致）
    const pages: Array<typeof exportRows> = []
    let pageStart = 0
    while (pageStart < exportRows.length) {
      let pageEnd = Math.min(pageStart + rowsPerPage, exportRows.length)
      if (pageEnd < exportRows.length) {
        while (
          pageEnd > pageStart + 1 &&
          isSameApprovalGroup(exportRows[pageEnd - 1], exportRows[pageEnd])
        ) {
          pageEnd = Math.max(pageStart + 1, pageEnd - 1)
        }
      }
      pages.push(exportRows.slice(pageStart, pageEnd))
      pageStart = pageEnd
    }

    // 构建单页HTML表格（与printApprovalList的HTML/CSS 100%一致）
    const buildPageHtml = (pageRows: typeof exportRows, pageIndex: number, totalPages: number, startSerialNo: number): string => {
      const groupSpans = calcApprovalGroupSpans(pageRows)

      let serialNo = startSerialNo
      const rowsHtml = pageRows.map(({ item, cdate, ddate }, idx) => {
        const rowHtml = `
          <tr>
          <td class="cell-no">${serialNo}</td>
          <td class="cell-name">${escapeHtml(item.part_name || '')}</td>
          <td class="cell-model">${escapeHtml(item.model || '')}</td>
          <td class="cell-qty">${escapeHtml(buildApprovalQtyText(item))}</td>
          ${groupSpans[idx] > 0 ? `<td class="cell-project" rowspan="${groupSpans[idx]}">${escapeHtml(item.project_name || '')}</td>` : ''}
          ${groupSpans[idx] > 0 ? `<td class="cell-unit" rowspan="${groupSpans[idx]}">${escapeHtml(item.production_unit || '')}</td>` : ''}
          ${groupSpans[idx] > 0 ? `<td class="cell-date" rowspan="${groupSpans[idx]}">${escapeHtml(cdate)}</td>` : ''}
          ${groupSpans[idx] > 0 ? `<td class="cell-date" rowspan="${groupSpans[idx]}">${escapeHtml(ddate)}</td>` : ''}
          ${groupSpans[idx] > 0 ? `<td class="cell-applicant" rowspan="${groupSpans[idx]}">${escapeHtml(item.applicant || '')}</td>` : ''}
          </tr>`
        serialNo += 1
        return rowHtml
      }).join('')

      return `
        <table class="sheet">
          <colgroup>
            <col style="width:40px">
            <col style="width:90px">
            <col style="width:170px">
            <col style="width:55px">
            <col style="width:90px">
            <col style="width:70px">
            <col style="width:85px">
            <col style="width:80px">
            <col style="width:60px">
          </colgroup>
          <thead>
            <tr>
              <th colspan="9" class="header-line">吉林省通用机械（集团）有限责任公司 临时物资采购清单</th>
            </tr>
            <tr>
              <th>序号</th>
              <th>名称</th>
              <th>型号</th>
              <th>数量</th>
              <th>项目名称</th>
              <th>投产单位</th>
              <th>申请日期</th>
              <th>需求日期</th>
              <th>提交人</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="5">生产单位领导审批：</td>
              <td colspan="4">计划部门审批：</td>
            </tr>
            <tr>
              <td colspan="5">公司副总审批：</td>
              <td colspan="4">公司总经理审批：</td>
            </tr>
          </tfoot>
        </table>
        <div class="page-number">第 ${pageIndex + 1} 页 / 共 ${totalPages} 页</div>
        ${pageIndex < totalPages - 1 ? '<br style="page-break-after:always">' : ''}`
    }

    // 构建所有页的HTML
    let serialNo = 1
    const tablesHtml = pages.map((pageRows, pageIndex) => {
      const html = buildPageHtml(pageRows, pageIndex, pages.length, serialNo)
      serialNo += pageRows.length
      return html
    }).join('')

    // 与printApprovalList完全一致的CSS样式（针对Excel渲染优化）
    const cssStyles = `
      * { box-sizing: border-box; }
      html, body {
        margin: 0 !important;
        padding: 10px !important;
      }
      body {
        font-family: "Microsoft YaHei", "PingFang SC", SimSun, sans-serif;
        font-size: 10pt;
        line-height: 1.4;
        color: #000;
        background: #fff;
      }
      table.sheet {
        width: 740px;
        border-collapse: collapse;
        table-layout: fixed;
        border: 2px solid #000;
      }
      th, td {
        border: 1px solid #333;
        padding: 4px 6px;
        text-align: center;
        vertical-align: middle;
        line-height: 1.5;
        font-size: 9.5pt;
      }
      .header-line {
        font-size: 14pt;
        font-weight: bold;
        text-align: center;
        padding: 6px 4px;
        letter-spacing: 1px;
      }
      th {
        background: #f0f0f0;
        font-weight: bold;
        padding: 5px 4px;
      }
      tbody tr {
        height: 26px;
      }
      td.cell-no { font-size: 9pt; text-align: center; }
      td.cell-name {
        text-align: left;
        word-break: break-all;
      }
      td.cell-model {
        text-align: left;
        word-break: break-all;
      }
      td.cell-qty { white-space: nowrap; }
      td.cell-project {
        text-align: left;
        word-break: break-all;
      }
      td.cell-unit { word-break: break-all; }
      td.cell-date { white-space: nowrap; }
      tfoot td {
        height: 52px;
        vertical-align: middle;
        font-weight: normal;
        text-align: left;
        padding-left: 8px;
        font-size: 10pt;
      }
      .page-number {
        text-align: right;
        font-size: 8pt;
        color: #999;
        margin-top: 4px;
      }`

    // 组装完整HTML，添加Excel XML命名空间使Excel识别为电子表格
    const html = `
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:x="urn:schemas-microsoft-com:office:excel"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="UTF-8">
<style>${cssStyles}</style>
<!--[if gte mso 9]>
<xml>
  <x:ExcelWorkbook>
    <x:ExcelWorksheets>
      <x:ExcelWorksheet>
        <x:Name>采购审批清单</x:Name>
        <x:WorksheetOptions>
          <x:DisplayGridlines/>
        </x:WorksheetOptions>
      </x:ExcelWorksheet>
    </x:ExcelWorksheets>
  </x:ExcelWorkbook>
</xml>
<![endif]-->
</head>
<body>
${tablesHtml}
</body>
</html>`

    // 通过Blob下载为.xls文件
    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `采购审批清单_${dayjs().format('YYYYMMDD_HHmmss')}.xls`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    message.success(`已导出 ${rows.length} 条记录，共 ${pages.length} 页`)
  }

  const printApprovalList = () => {
    if (selectedRowKeys.length === 0) { message.warning('请选择需要打印的审批清单'); return; }
    const rows = filteredData.filter(item => selectedRowKeys.includes(item.id))
    if (rows.length === 0) { message.warning('没有可打印的审批清单'); return }
    const escapeHtml = (value: any) => {
      const text = String(value ?? '')
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
    }
    const printRows = buildApprovalPrintRows(rows)

    const estimateWrappedLines = (value: string, charsPerLine: number) => {
      const text = String(value || '').trim()
      if (!text) return 1
      const logicalLines = text.split(/\r?\n/)
      return logicalLines.reduce((sum, line) => {
        const length = Array.from(line).length
        return sum + Math.max(1, Math.ceil(length / charsPerLine))
      }, 0)
    }

    const estimateRowUnits = (row: typeof printRows[number]) => {
      const item = row.item
      const lineCount = Math.max(
        estimateWrappedLines(String(item.part_name || ''), 9),
        estimateWrappedLines(String(item.model || ''), 16),
        estimateWrappedLines(String(item.project_name || ''), 10),
        estimateWrappedLines(String(item.production_unit || ''), 6),
        1
      )
      if (lineCount >= 4) return 2.2
      if (lineCount === 3) return 1.6
      if (lineCount === 2) return 1.25
      return 1
    }

    // 固定为 A4 竖版打印，优先把当前页尽量铺满，再在页内做合并，避免大面积留白
    const pages: Array<typeof printRows> = []
    let cursor = 0
    while (cursor < printRows.length) {
      let usedUnits = 0
      let nextCursor = cursor

      // 第一步：按页面容量预算填充行（确保内容先布满页面）
      while (nextCursor < printRows.length) {
        const rowUnits = estimateRowUnits(printRows[nextCursor])
        if (nextCursor > cursor && usedUnits + rowUnits > PRINT_PORTRAIT_PAGE_UNIT_BUDGET) break
        usedUnits += rowUnits
        nextCursor += 1
      }

      // 第二步：如果剩余内容太少，尝试拉回一行以避免最后一页过小
      const remainingRows = printRows.length - nextCursor
      if (remainingRows > 0) {
        const remainingUnits = printRows
          .slice(nextCursor)
          .reduce((sum, row) => sum + estimateRowUnits(row), 0)
        if (remainingUnits < PRINT_PORTRAIT_MIN_LAST_PAGE_UNITS && nextCursor - cursor > 1) {
          nextCursor -= 1
        }
      }

      // 第三步：【关键修复】检查下一页首行是否属于当前页开始的组合
      // 如果是，必须将整个组合保留在当前页，否则下一页首行的 rowspan=0 会导致单元格为空
      if (nextCursor < printRows.length && nextCursor > cursor) {
        const nextPageFirstRow = printRows[nextCursor]
        const currentPageLastRow = printRows[nextCursor - 1]

        // 检查下一页首行是否与当前页最后一行同组
        if (isSameApprovalGroup(currentPageLastRow, nextPageFirstRow)) {
          // 找到当前页该组合的起始位置
          let groupStart = nextCursor - 1
          while (groupStart > cursor && isSameApprovalGroup(printRows[groupStart - 1], printRows[groupStart])) {
            groupStart -= 1
          }
          // 将整个组合保留在当前页（从组合起始位置截断）
          nextCursor = groupStart
        }
      }

      // 第四步：兜底检查 - 避免将同一 rowspan 组拆分到两页
      while (
        nextCursor < printRows.length &&
        nextCursor > cursor + 1 &&
        isSameApprovalGroup(printRows[nextCursor - 1], printRows[nextCursor])
      ) {
        nextCursor -= 1
      }

      pages.push(printRows.slice(cursor, nextCursor))
      cursor = nextCursor
    }

    const buildPageTableHtml = (
      pageRows: typeof printRows,
      pageIndex: number,
      totalPages: number,
      startSerialNo: number
    ) => {
      let serialNo = startSerialNo
      const groupSpans = calcApprovalGroupSpans(pageRows)

      const rowsHtml = pageRows.map(({ item, cdate, ddate }, idx) => {
        const rowHtml = `
          <tr>
            <td class="cell-no">${serialNo}</td>
            <td class="cell-name">${escapeHtml(item.part_name || '')}</td>
            <td class="cell-model">${escapeHtml(item.model || '')}</td>
            <td class="cell-qty">${escapeHtml(buildApprovalQtyText(item))}</td>
            ${groupSpans[idx] > 0 ? `<td class="cell-project" rowspan="${groupSpans[idx]}">${escapeHtml(item.project_name || '')}</td>` : ''}
            ${groupSpans[idx] > 0 ? `<td class="cell-unit" rowspan="${groupSpans[idx]}">${escapeHtml(item.production_unit || '')}</td>` : ''}
            ${groupSpans[idx] > 0 ? `<td class="cell-date" rowspan="${groupSpans[idx]}">${escapeHtml(cdate)}</td>` : ''}
            ${groupSpans[idx] > 0 ? `<td class="cell-date" rowspan="${groupSpans[idx]}">${escapeHtml(ddate)}</td>` : ''}
            ${groupSpans[idx] > 0 ? `<td class="cell-applicant" rowspan="${groupSpans[idx]}">${escapeHtml(item.applicant || '')}</td>` : ''}
          </tr>
        `
        serialNo += 1
        return rowHtml
      }).join('')

      return `
      <section class="print-page">
        <div class="print-wrap">
        <table class="sheet">
        <colgroup>
          <col style="width:6%">
          <col style="width:14%">
          <col style="width:18%">
          <col style="width:9%">
          <col style="width:16%">
          <col style="width:9%">
          <col style="width:10%">
          <col style="width:10%">
          <col style="width:8%">
        </colgroup>
        <thead>
          <tr>
            <th colspan="9" class="header-line">吉林省通用机械（集团）有限责任公司 临时物资采购清单</th>
          </tr>
          <tr>
            <th>序号</th>
            <th>名称</th>
            <th>型号</th>
            <th>数量</th>
            <th>项目名称</th>
            <th>投产单位</th>
            <th>申请日期</th>
            <th>需求日期</th>
            <th>提交人</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="5">生产单位领导审批：</td>
            <td colspan="4">计划部门审批：</td>
          </tr>
          <tr>
            <td colspan="5">公司副总审批：</td>
            <td colspan="4">公司总经理审批：</td>
          </tr>
        </tfoot>
      </table>
        </div>
        <div class="page-number">第 ${pageIndex + 1} 页 / 共 ${totalPages} 页</div>
      </section>
      ${pageIndex < totalPages - 1 ? '<div class="page-break"></div>' : ''}`
    }

    let nextSerialNo = 1
    const tableHtml = pages.map((pageRows, pageIndex) => {
      const html = buildPageTableHtml(pageRows, pageIndex, pages.length, nextSerialNo)
      nextSerialNo += pageRows.length
      return html
    }).join('')

    const html = `
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            @page {
              size: A4 portrait;
              margin: 8mm 7mm 6mm 7mm;
            }
            * { box-sizing: border-box; }
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              width: auto;
            }
            body {
              font-family: "Microsoft YaHei", "PingFang SC", SimSun, sans-serif;
              font-size: 8.5pt;
              line-height: 1.25;
              color: #000;
              background: #fff;
            }
            .print-wrap {
              width: 100%;
            }
            .print-page {
              width: 100%;
            }
            .page-break {
              break-after: page;
              page-break-after: always;
            }
            table.sheet {
              width: 100%;
              border-collapse: collapse;
              table-layout: fixed;
              border: 2px solid #000;
            }
            th, td {
              border: 1px solid #333;
              padding: 3px 4px;
              text-align: center;
              vertical-align: middle;
              line-height: 1.25;
              font-size: 8.5pt;
            }
            .header-line {
              font-size: 12pt;
              font-weight: bold;
              text-align: center;
              padding: 4px 4px;
              letter-spacing: 0.5px;
            }
            thead { display: table-header-group; }
            tfoot { display: table-footer-group; }
            tbody tr { page-break-inside: avoid; }
            th {
              background: #f0f0f0;
              font-weight: bold;
              padding: 4px 3px;
            }
            td.cell-no {
              font-size: 8pt;
              text-align: center;
            }
            td.cell-name {
              text-align: left;
              word-break: break-all;
            }
            td.cell-model {
              text-align: left;
              word-break: break-all;
            }
            td.cell-qty { white-space: nowrap; }
            td.cell-project {
              text-align: left;
              word-break: break-all;
            }
            td.cell-unit { word-break: break-all; }
            td.cell-date { white-space: nowrap; }
            tfoot td {
              height: 34px;
              vertical-align: middle;
              font-weight: normal;
              text-align: left;
              padding-left: 6px;
              font-size: 8.5pt;
            }
            .page-number {
              margin-top: 4px;
              text-align: right;
              font-size: 8pt;
              color: #666;
            }
            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
          </style>
        </head>
        <body>
          ${tableHtml}
        </body>
      </html>
    `

    const w = window.open('', '_blank')
    if (!w) { message.error('无法打开打印窗口，请检查浏览器弹窗设置'); return }
    w.document.open()
    w.document.write(html)
    w.document.close()
    w.document.title = '临时物资采购清单'
    w.focus()
    // 延迟打印确保样式完全加载
    setTimeout(() => { w.print() }, 250)
  }

  return (
    <div style={{ padding: '16px 0', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <StyleInjector />

      {/* 操作按钮区域 - 移除筛选功能，保留复选框和批量删除 */}
      <Row gutter={16} style={{ marginBottom: 16, flexShrink: 0 }}>
        <Col span={24} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Segmented
            options={[ '全部', '工装信息', '临时计划' ]}
            value={sourceFilter}
            onChange={(val) => setSourceFilter(val as any)}
          />
          <Space>
            <Button onClick={async () => {
              if (DEBUG) console.log('[PurchaseOrdersList] Rollback button clicked');
              if (selectedRowKeys.length === 0) { message.warning('请选择要回退的采购单'); return }
              try {
                const selectedSet = new Set<string>(selectedRowKeys.map(String))
                const selectedItems = data.filter(d => selectedSet.has(String(d.id)))

                if (DEBUG) console.log('[PurchaseOrdersList] Calling rollbackPurchaseOrders with items:', selectedItems.length);
                if (typeof rollbackPurchaseOrders !== 'function') {
                  throw new Error('回退服务未正确加载，请尝试刷新页面');
                }

                // 调用回退服务（恢复数据并删除采购单）
                await rollbackPurchaseOrders(selectedItems)

                // 1. 清理隐藏列表逻辑 (manual/backup)
                const hmArr = (() => { try { return JSON.parse(localStorage.getItem('temporary_hidden_manual_ids') || '[]') } catch { return [] } })()
                const hbArr = (() => { try { return JSON.parse(localStorage.getItem('temporary_hidden_backup_ids') || '[]') } catch { return [] } })()
                const hm = new Set<string>(Array.isArray(hmArr) ? hmArr : [])
                const hb = new Set<string>(Array.isArray(hbArr) ? hbArr : [])

                if (DEBUG) console.log('[PurchaseOrdersList] Rollback: Before cleanup', {
                  manualHidden: Array.from(hm),
                  backupHidden: Array.from(hb),
                  rollingBack: selectedItems.map(it => it.inventory_number)
                });

                selectedItems.forEach(item => {
                  const inv = String(item.inventory_number || '').trim()
                  if (inv.startsWith('MANUAL-')) {
                    const originalId = inv.slice(7).trim()
                    if (hm.has(originalId)) {
                      hm.delete(originalId)
                      if (DEBUG) console.log('[PurchaseOrdersList] Cleaned up manual ID:', originalId);
                    }
                  }
                  if (inv.startsWith('BACKUP-')) {
                    const originalId = inv.slice(7).trim()
                    if (hb.has(originalId)) {
                      hb.delete(originalId)
                      if (DEBUG) console.log('[PurchaseOrdersList] Cleaned up backup ID:', originalId);
                    }
                  }
                })

                localStorage.setItem('temporary_hidden_manual_ids', JSON.stringify(Array.from(hm)))
                localStorage.setItem('temporary_hidden_backup_ids', JSON.stringify(Array.from(hb)))

                if (DEBUG) console.log('[PurchaseOrdersList] Rollback: After cleanup', {
                  manualHidden: Array.from(hm),
                  backupHidden: Array.from(hb)
                });

                // 2. 保持工装信息的状态更新逻辑
                selectedItems.forEach(item => {
                  const pid = (item as any).part_id
                  const cid = (item as any).child_item_id
                  if (pid) updatePartPurchaseStatus(String(pid), '就绪')
                  if (cid) updateChildPurchaseStatus(String(cid), '就绪')
                })

                const apprHidden = new Set<string>(approvalHiddenIds)
                selectedRowKeys.forEach(id => apprHidden.add(String(id)))
                const apprArr = Array.from(apprHidden)
                localStorage.setItem('approval_hidden_ids', JSON.stringify(apprArr))

                // 通知其他页面刷新
                window.dispatchEvent(new Event('approval_updated'))

                // 增加一个小延迟，确保数据库写入完成后再通知其他页面刷新
                setTimeout(() => {
                  if (DEBUG) console.log('[PurchaseOrdersList] Dispatching status_updated event');
                window.dispatchEvent(new Event('status_updated'))
                }, 200);

                message.success('已回退所选采购单')
                setSelectedRowKeys([])
                setApprovalHiddenIds(apprArr)
                // 重新获取数据以反映删除
                fetchPurchaseOrders()
              } catch (e) {
                message.error('回退失败: ' + (e as Error).message)
              }
            }}>回退</Button>
            <Space size={6}>
              <span style={{ color: '#555' }}>导出密度</span>
              <Select
                size="small"
                style={{ width: 140 }}
                options={PRINT_DENSITY_OPTIONS}
                value={printDensityLevel}
                onChange={(value) => setPrintDensityLevel(value)}
              />
            </Space>
            <Button onClick={printApprovalList}>打印审批清单</Button>
            <Button type="primary" ghost onClick={exportApprovalExcel}>导出电子版</Button>
            <Button onClick={() => {
              if (selectedRowKeys.length === 0) { message.warning('请选择需要导出的审批计划');
                return;
              }
              const rows = filteredData.filter(item => selectedRowKeys.includes(item.id))
              const headers = ['序号','名称','型号','数量','项目名称','投产单位','申请日期','需求日期','提交人','重量(kg)','金额(元)']
              const aoa: any[][] = [headers]
              rows.forEach((item, idx) => {
                const qty = `${item.part_quantity || 0}${item.unit ? ' ' + item.unit : ''}`
                const cdate = dayjs(item.created_date).format('YYYY-MM-DD')
                const ddate = item.demand_date ? dayjs(item.demand_date).format('YYYY-MM-DD') : '-'
                const w = (() => { const n = typeof item.weight === 'number' ? item.weight : parseFloat(String(item.weight ?? '')); return isNaN(n) ? '-' : Number(n.toFixed(3)) })()
                const p = (() => { const n = typeof item.total_price === 'number' ? item.total_price : parseFloat(String(item.total_price ?? '')); return isNaN(n) ? '-' : Number(n.toFixed(2)) })()
                aoa.push([
                  idx + 1,
                  item.part_name,
                  item.model || '-',
                  qty,
                  item.project_name,
                  item.production_unit || '-',
                  cdate,
                  ddate,
                  item.applicant,
                  w,
                  p
                ])
              })
              const ws = XLSX.utils.aoa_to_sheet(aoa)
              const wb = XLSX.utils.book_new()
              XLSX.utils.book_append_sheet(wb, ws, '采购审批')
              XLSX.writeFile(wb, `采购审批_${dayjs().format('YYYYMMDD_HHmmss')}.xlsx`)
            }}>导出审批计划</Button>
            <Button
              type="primary"
              onClick={async () => {
                if (selectedRowKeys.length === 0) {
                  message.warning('请选择要生成临时计划的采购单')
                  return
                }
                const selected = data.filter(d => selectedRowKeys.includes(d.id))
                const monthGroups: Record<string, PurchaseOrder[]> = {}
                selected.forEach(item => {
                  const dateStr = item.demand_date || item.created_date
                  const dt = dayjs(dateStr)
                  const yy = String(dt.year() % 100).padStart(2, '0')
                  const mm = String(dt.month() + 1).padStart(2, '0')
                  const key = yy + mm
                  monthGroups[key] = monthGroups[key] || []
                  monthGroups[key].push(item)
                })
                // 从数据库获取已有分组，计算序号
                let existingGroups: any[] = []
                try {
                  const res = await fetchWithFallback('/api/temporary-plan-groups', { method: 'GET' })
                  if (res.ok) {
                    const json = await res.json()
                    existingGroups = json.data || []
                  }
                } catch (e) {}

                const newGroupCodes: string[] = []
                for (const key of Object.keys(monthGroups)) {
                  const seq = existingGroups.filter((g: any) => g.month_key === key).length + 1
                  const code = key + String(seq).padStart(2, '0')
                  const items = monthGroups[key].map(it => ({
                    id: it.id,
                    inventory_number: it.inventory_number,
                    project_name: it.project_name,
                    part_name: it.part_name,
                    part_quantity: it.part_quantity,
                    unit: it.unit,
                    model: it.model,
                    supplier: it.supplier,
                    required_date: (it.demand_date || it.created_date),
                    production_unit: it.production_unit,
                    applicant: it.applicant,
                    part_id: (it as any).part_id,
                    child_item_id: (it as any).child_item_id
                  }))
                  // 写入数据库
                  try {
                    const resp = await fetchWithFallback('/api/temporary-plan-groups', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        code,
                        month_key: key,
                        items,
                        created_by: user?.real_name || user?.username || ''
                      })
                    })
                    const json = await resp.json().catch(() => ({}))
                    if (!resp.ok || json?.success === false) {
                      throw new Error(String(json?.error || '写入临时计划失败'))
                    }
                  } catch (e) {
                    console.error('写入临时计划失败:', e)
                    throw e
                  }
                  newGroupCodes.push(code)
                }
                const hmArr = (() => { try { return JSON.parse(localStorage.getItem('temporary_hidden_manual_ids') || '[]') } catch { return [] } })()
                const hbArr = (() => { try { return JSON.parse(localStorage.getItem('temporary_hidden_backup_ids') || '[]') } catch { return [] } })()
                const hm = new Set<string>(Array.isArray(hmArr) ? hmArr : [])
                const hb = new Set<string>(Array.isArray(hbArr) ? hbArr : [])
                selected.forEach(item => {
                  const inv = String(item.inventory_number || '')
                  if (inv.startsWith('MANUAL-')) hm.add(inv.slice(7))
                  if (inv.startsWith('BACKUP-')) hb.add(inv.slice(7))
                })
                localStorage.setItem('temporary_hidden_manual_ids', JSON.stringify(Array.from(hm)))
                localStorage.setItem('temporary_hidden_backup_ids', JSON.stringify(Array.from(hb)))

                window.dispatchEvent(new Event('temporary_plans_updated'))
                window.dispatchEvent(new Event('status_updated'))
                selected.forEach(item => {
                  const pid = (item as any).part_id
                  const cid = (item as any).child_item_id
                  if (pid) updatePartPurchaseStatus(String(pid), '审批中')
                  if (cid) updateChildPurchaseStatus(String(cid), '审批中')
                })
                message.success(`已生成临时计划：${newGroupCodes.join(', ')}`)
                setSelectedRowKeys([])
                setTimeout(() => setData(prev => [...prev]), 0)
                navigate('/purchase-management?tab=temp')
              }}
            >
              生成临时计划
            </Button>
          </Space>
        </Col>
      </Row>
      <Row style={{ marginBottom: 8, flexShrink: 0 }}>
        <Col span={24}>
          <Space size={24}>
            <span style={{ fontWeight: 600 }}>总重量: {totals.weight ? totals.weight.toFixed(3) : '0.000'} kg</span>
            <span style={{ fontWeight: 600 }}>总金额: {totals.price ? `¥${totals.price.toFixed(2)}` : '¥0.00'}</span>
          </Space>
        </Col>
      </Row>

      {/* 采购单表格 - 使用flex布局自适应高度 */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <Table
          rowKey="id"
          rowSelection={rowSelection}
          columns={columns}
          dataSource={filteredData}
          loading={loading}
          pagination={false}
          scroll={{ x: 'max-content', y: 'calc(100% - 10px)' }}
          size="small"
          bordered={false}
          locale={{ emptyText: '' }}
          className="excel-table"
          expandIconColumnIndex={-1}
        />
      </div>
    </div>
  );
}
