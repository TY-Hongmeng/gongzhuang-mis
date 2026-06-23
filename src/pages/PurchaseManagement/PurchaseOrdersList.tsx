﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿import React, { useState, useEffect, useRef, useMemo } from 'react';
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

  const totals = useMemo(() => {
    const set = new Set<string>(selectedRowKeys.map(String))
    let weight = 0
    let price = 0
    for (const item of data) {
      if (!set.has(String(item.id))) continue
      const w = typeof item.weight === 'number' ? item.weight : parseFloat(String(item.weight ?? ''))
      const p = typeof item.total_price === 'number' ? item.total_price : parseFloat(String(item.total_price ?? ''))
      if (!isNaN(w)) weight += w
      if (!isNaN(p)) price += p
    }
    return { weight, price }
  }, [data, selectedRowKeys])


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
      render: (val: number | string | undefined) => {
        const n = typeof val === 'number' ? val : parseFloat(String(val ?? ''));
        const show = !isNaN(n) ? n : null;
        return <span style={{ color: show !== null ? '#333' : '#999' }}>{show !== null ? `¥${show.toFixed(2)}` : '-'}</span>;
      }
    }
  ]), [editingDate, handleDateChange]);

  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    fetchPurchaseOrders();
    return () => {};
  }, []);

  // 导出审批清单电子版Excel（与打印格式完全一致，支持分页多Sheet）
  const exportApprovalExcel = () => {
    if (selectedRowKeys.length === 0) { message.warning('请选择需要导出的审批清单'); return; }
    const rows = filteredData.filter(item => selectedRowKeys.includes(item.id))
    if (rows.length === 0) { message.warning('没有可导出的审批清单'); return }

    const escapeHtml = (value: any) => {
      const text = String(value ?? '')
      return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
    }
    const qtyText = (item: PurchaseOrder) => `${item.part_quantity || 0}${item.unit ? ' ' + item.unit : ''}`
    const exportRows = rows.map((item) => ({
      item,
      cdate: dayjs(item.created_date).format('YYYY-MM-DD'),
      ddate: item.demand_date ? dayjs(item.demand_date).format('YYYY-MM-DD') : ''
    })).sort((a, b) => {
      const compare = (x: string, y: string) => x.localeCompare(y, 'zh-CN')
      const keysA = [
        String(a.item.project_name || '').trim(), String(a.item.production_unit || '').trim(),
        String(a.cdate || '').trim(), String(a.ddate || '').trim(),
        String(a.item.applicant || '').trim(), String(a.item.part_name || '').trim(),
        String(a.item.model || '').trim(), String(qtyText(a.item)).trim()
      ]
      const keysB = [
        String(b.item.project_name || '').trim(), String(b.item.production_unit || '').trim(),
        String(b.cdate || '').trim(), String(b.ddate || '').trim(),
        String(b.item.applicant || '').trim(), String(b.item.part_name || '').trim(),
        String(b.item.model || '').trim(), String(qtyText(b.item)).trim()
      ]
      for (let i = 0; i < keysA.length; i += 1) {
        const diff = compare(keysA[i], keysB[i])
        if (diff !== 0) return diff
      }
      return 0
    })

    // 计算rowspan合并：相同值的连续单元格合并（与print完全一致）
    const calcRowSpans = (values: string[]) => {
      const spans = Array(values.length).fill(1)
      let i = 0
      while (i < values.length) {
        const current = values[i]
        if (!current) { i += 1; continue }
        let j = i + 1
        while (j < values.length && values[j] === current) j += 1
        spans[i] = j - i
        for (let k = i + 1; k < j; k += 1) spans[k] = 0
        i = j
      }
      return spans
    }

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
        const pageSlice = exportRows.slice(pageStart, pageEnd)
        const lastIdx = pageSlice.length - 1
        const projectSpansCheck = calcRowSpans(pageSlice.map(r => String(r.item.project_name || '').trim()))
        const productionSpansCheck = calcRowSpans(pageSlice.map(r => String(r.item.production_unit || '').trim()))
        const createdDateSpansCheck = calcRowSpans(pageSlice.map(r => String(r.cdate || '').trim()))
        const demandDateSpansCheck = calcRowSpans(pageSlice.map(r => String(r.ddate || '').trim()))
        const applicantSpansCheck = calcRowSpans(pageSlice.map(r => String(r.item.applicant || '').trim()))
        const spans = [projectSpansCheck, productionSpansCheck, createdDateSpansCheck, demandDateSpansCheck, applicantSpansCheck]
        const hasCrossPageSpan = spans.some(s => s[lastIdx] > 1)
        if (hasCrossPageSpan) {
          pageEnd = Math.max(pageStart + 1, pageEnd - 1)
        }
      }
      pages.push(exportRows.slice(pageStart, pageEnd))
      pageStart = pageEnd
    }

    const COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']
    const DATA_START_ROW = 2  // 行0标题, 行1列头, 行2起数据

    // 构建单个sheet：与print的HTML结构一一对应
    const buildSheet = (pageRows: typeof exportRows, pageIndex: number, totalPages: number, startSerialNo: number): XLSX.WorkSheet => {
      // === 与print一致：先计算每列的rowspan ===
      const projectSpans = calcRowSpans(pageRows.map(r => String(r.item.project_name || '').trim()))
      const productionSpans = calcRowSpans(pageRows.map(r => String(r.item.production_unit || '').trim()))
      const createdDateSpans = calcRowSpans(pageRows.map(r => String(r.cdate || '').trim()))
      const demandDateSpans = calcRowSpans(pageRows.map(r => String(r.ddate || '').trim()))
      const applicantSpans = calcRowSpans(pageRows.map(r => String(r.item.applicant || '').trim()))

      // === 构建AOA：模拟print中rowspan的行为，被合并的单元格留空 ===
      const aoa: any[][] = [
        ['吉林省通用机械（集团）有限责任公司 临时物资采购清单'],   // 行0: 标题
        ['序号', '名称', '型号', '数量', '项目名称', '投产单位', '申请日期', '需求日期', '提交人']  // 行1: 列头
      ]

      let serialNo = startSerialNo
      pageRows.forEach(({ item, cdate, ddate }, idx) => {
        // 与print的<tr>结构完全对应：
        // print中 rowSpan>0 时渲染<td>并带rowspan属性，rowSpan===0时不渲染<td>
        // Excel中 rowSpan>0 时写入值（作为合并起始格），rowSpan===0时写入空字符串（合并覆盖区）
        aoa.push([
          serialNo,
          item.part_name || '',
          item.model || '',
          qtyText(item),
          projectSpans[idx] > 0 ? (item.project_name || '') : '',       // E列: 项目名称
          productionSpans[idx] > 0 ? (item.production_unit || '') : '', // F列: 投产单位
          createdDateSpans[idx] > 0 ? cdate : '',                      // G列: 申请日期
          demandDateSpans[idx] > 0 ? ddate : '',                       // H列: 需求日期
          applicantSpans[idx] > 0 ? (item.applicant || '') : ''         // I列: 提交人
        ])
        serialNo += 1
      })

      const dataRowCount = pageRows.length
      const footerStart = DATA_START_ROW + dataRowCount

      // 审批行（与print tfoot完全一致）
      aoa.push(['生产单位领导审批：', '', '', '', '', '', '计划部门审批：', '', ''])
      aoa.push(['公司副总审批：', '', '', '', '', '', '公司总经理审批：', '', ''])

      // 页码行（与print .page-number 完全一致）
      aoa.push([`第 ${pageIndex + 1} 页 / 共 ${totalPages} 页`])

      const ws = XLSX.utils.aoa_to_sheet(aoa)

      // ===== 合并区域 =====

      // 标题行9列合并（对应print th[colspan="9"]）
      ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }]

      // 数据行rowspan合并（对应print中的rowspan属性）
      const mergeColConfigs = [
        { colIdx: 4, spans: projectSpans },
        { colIdx: 5, spans: productionSpans },
        { colIdx: 6, spans: createdDateSpans },
        { colIdx: 7, spans: demandDateSpans },
        { colIdx: 8, spans: applicantSpans },
      ]
      for (const { colIdx, spans } of mergeColConfigs) {
        for (let i = 0; i < spans.length; i++) {
          if (spans[i] > 1) {
            ws['!merges'].push({
              s: { r: DATA_START_ROW + i, c: colIdx },
              e: { r: DATA_START_ROW + i + spans[i] - 1, c: colIdx }
            })
          }
        }
      }

      // 审批区合并（对应print tfoot td[colspan="5"]和[colspan="4"]）
      ws['!merges'].push(
        { s: { r: footerStart, c: 0 }, e: { r: footerStart, c: 4 } },     // 生产单位领导审批： A-E
        { s: { r: footerStart, c: 6 }, e: { r: footerStart, c: 8 } },     // 计划部门审批： G-I
        { s: { r: footerStart + 1, c: 0 }, e: { r: footerStart + 1, c: 4 } }, // 公司副总审批： A-E
        { s: { r: footerStart + 1, c: 6 }, e: { r: footerStart + 1, c: 8 } }  // 公司总经理审批： G-I
      )

      // 页码行9列合并（对应print .page-number 独立div，Excel中用合并模拟整行）
      ws['!merges'].push({ s: { r: footerStart + 2, c: 0 }, e: { r: footerStart + 2, c: 8 } })

      // ===== 列宽：按A4打印尺寸精确换算为像素 =====
      // 打印 @page: A4 portrait, margin: 10mm 8mm 0mm 8mm → 可用宽度 194mm
      // 打印colgroup百分比: 5% 12% 22% 8% 12% 9% 12% 11% 9%
      // 换算: 194mm × 百分比 × 3.78(96dpi) = 像素值(wpx)
      ws['!cols'] = [
        { wpx: 37 },   // A 序号 5%  → 9.7mm  × 3.78 ≈ 37px
        { wpx: 88 },   // B 名称 12%  → 23.3mm × 3.78 ≈ 88px
        { wpx: 162 },  // C 型号 22%  → 42.7mm × 3.78 ≈ 161px (+1取整)
        { wpx: 59 },   // D 数量 8%   → 15.5mm × 3.78 ≈ 59px
        { wpx: 88 },   // E 项目名称 12% → 23.3mm × 3.78 ≈ 88px
        { wpx: 66 },   // F 投产单位 9%  → 17.5mm × 3.78 ≈ 66px
        { wpx: 88 },   // G 申请日期 12% → 23.3mm × 3.78 ≈ 88px
        { wpx: 81 },   // H 需求日期 11% → 21.3mm × 3.78 ≈ 81px
        { wpx: 66 },   // I 提交人 9%   → 17.5mm × 3.78 ≈ 66px
      ]

      // ===== 行高：与打印CSS像素值一一对应 =====
      // print .header-line: font-size:14pt + padding:5px → 约28px
      // print th: padding:4px + font-size:9.5pt → 约21px
      // print tbody tr: height:20px → 20px
      // print tfoot td: height:52px → 52px
      // print .page-number: font-size:8pt + margin-top:1mm → 约16px
      ws['!rows'] = [
        { hpx: 28 },   // 标题行（print header-line: 14pt + padding:5px ≈ 28px）
        { hpx: 21 },   // 列头行（print th: padding:4px + 9.5pt ≈ 21px）
        ...pageRows.map(() => ({ hpx: 20 })),  // 数据行（print tbody tr height:20px）
        { hpx: 52 },   // 审批行1（print tfoot td height:52px）
        { hpx: 52 },   // 审批行2
        { hpx: 16 },   // 页码行（print .page-number: 8pt + margin-top:1mm ≈ 16px）
      ]

      // ===== 单元格样式 =====

      // 统一边框样式（对应print table.sheet border:2px solid #000 + td/th border:1px solid #333）
      const thinBorder = {
        top: { style: 'thin' as const, color: { rgb: '000000' } },
        bottom: { style: 'thin' as const, color: { rgb: '000000' } },
        left: { style: 'thin' as const, color: { rgb: '000000' } },
        right: { style: 'thin' as const, color: { rgb: '000000' } }
      }

      // 标题行样式（对应print .header-line: font-size:14pt, font-weight:bold, text-align:center）
      ws['A1'].s = {
        font: { bold: true, sz: 14, name: '微软雅黑' },
        alignment: { vertical: 'center', horizontal: 'center' },
        border: thinBorder
      }

      // 列头行样式（对应print th: background:#f0f0f0, font-weight:bold, text-align:center, border:1px solid #333）
      for (let C = 0; C <= 8; C++) {
        ws[COLS[C] + '2'].s = {
          font: { bold: true, sz: 10, name: '微软雅黑' },
          fill: { fgColor: { rgb: 'F0F0F0' } },
          alignment: { vertical: 'center', horizontal: 'center' },
          border: thinBorder
        }
      }

      // 数据行样式（对应print td: font-size:9.5pt, border:1px solid #333, 对齐方式按列不同）
      for (let R = DATA_START_ROW; R < footerStart; R++) {
        for (let C = 0; C <= 8; C++) {
          const cellRef = COLS[C] + (R + 1)
          if (!ws[cellRef]) continue
          // 对齐规则与print一致：
          // cell-no(A): center, cell-name(B): left, cell-model(C): left, cell-qty(D): left(white-space:nowrap)
          // cell-project(E): left(word-break), cell-unit(F): left(word-break), cell-date(G/H): center(nowrap), cell-applicant(I): center
          ws[cellRef].s = {
            font: { sz: 10, name: '微软雅黑' },
            alignment: {
              vertical: 'center',
              horizontal:
                C === 0 ? 'center' :
                [1, 2, 3, 4, 5].includes(C) ? 'left' :
                'center'
            },
            border: thinBorder
          }
        }
      }

      // 审批区样式（对应print tfoot td: height:52px, font-size:10pt, text-align:left, padding-left:8px）
      for (let offset = 0; offset <= 1; offset++) {
        const row = footerStart + offset
        for (let C = 0; C <= 8; C++) {
          const cellRef = COLS[C] + (row + 1)
          if (!ws[cellRef]) continue
          ws[cellRef].s = {
            font: { sz: 10, name: '微软雅黑' },
            alignment: { vertical: 'center', horizontal: 'left', indent: 1 },
            border: thinBorder
          }
        }
      }

      // 页码行样式（对应print .page-number: font-size:8pt, color:#999, text-align:right）
      const pageCellRef = COLS[0] + (footerStart + 2 + 1)
      if (ws[pageCellRef]) {
        ws[pageCellRef].s = {
          font: { sz: 9, name: '微软雅黑', color: { rgb: '999999' } },
          alignment: { vertical: 'center', horizontal: 'right' }
        }
      }

      return ws
    }

    // 构建所有sheet
    const wb = XLSX.utils.book_new()
    let serialNo = 1
    pages.forEach((pageRows, pageIndex) => {
      const sheetName = pages.length > 1 ? `第${pageIndex + 1}页` : '采购审批清单'
      const ws = buildSheet(pageRows, pageIndex, pages.length, serialNo)
      XLSX.utils.book_append_sheet(wb, ws, sheetName)
      serialNo += pageRows.length
    })

    XLSX.writeFile(wb, `采购审批清单_${dayjs().format('YYYYMMDD_HHmmss')}.xlsx`)
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
    const qtyText = (item: PurchaseOrder) => `${item.part_quantity || 0}${item.unit ? ' ' + item.unit : ''}`
    const printRows = rows.map((item) => ({
      item,
      cdate: dayjs(item.created_date).format('YYYY-MM-DD'),
      ddate: item.demand_date ? dayjs(item.demand_date).format('YYYY-MM-DD') : ''
    })).sort((a, b) => {
      const compare = (x: string, y: string) => x.localeCompare(y, 'zh-CN')
      const keysA = [
        String(a.item.project_name || '').trim(),
        String(a.item.production_unit || '').trim(),
        String(a.cdate || '').trim(),
        String(a.ddate || '').trim(),
        String(a.item.applicant || '').trim(),
        String(a.item.part_name || '').trim(),
        String(a.item.model || '').trim(),
        String(qtyText(a.item)).trim()
      ]
      const keysB = [
        String(b.item.project_name || '').trim(),
        String(b.item.production_unit || '').trim(),
        String(b.cdate || '').trim(),
        String(b.ddate || '').trim(),
        String(b.item.applicant || '').trim(),
        String(b.item.part_name || '').trim(),
        String(b.item.model || '').trim(),
        String(qtyText(b.item)).trim()
      ]
      for (let i = 0; i < keysA.length; i += 1) {
        const diff = compare(keysA[i], keysB[i])
        if (diff !== 0) return diff
      }
      return 0
    })
    // 计算rowspan合并：相同值的连续单元格合并
    const calcRowSpans = (values: string[]) => {
      const spans = Array(values.length).fill(1)
      let i = 0
      while (i < values.length) {
        const current = values[i]
        if (!current) { i += 1; continue }
        let j = i + 1
        while (j < values.length && values[j] === current) j += 1
        spans[i] = j - i
        for (let k = i + 1; k < j; k += 1) spans[k] = 0
        i = j
      }
      return spans
    }

    // 打印密度映射：密度档位 -> 每页最大行数
    // A4高度297mm - 上下边距20mm = 277mm可用
    // 表头约30mm + 表尾(审批区)52mm = 82mm固定占用
    // 数据区约195mm，行高7.5mm，基准28行/页
    const DENSITY_ROWS_MAP: Record<number, number> = {
      1: 24, 2: 26, 3: 27, 4: 28, 5: 29,
      6: 30, 7: 31, 8: 32, 9: 34, 10: 36
    }
    const rowsPerPage = DENSITY_ROWS_MAP[printDensityLevel] || 28

    // 分页时需要考虑rowspan：同一组的行不能拆到两页
    const pages: Array<typeof printRows> = []
    let pageStart = 0
    while (pageStart < printRows.length) {
      let pageEnd = Math.min(pageStart + rowsPerPage, printRows.length)
      // 检查是否截断了rowspan组：如果当前页最后一行的rowspan延伸到了下一页，提前截断
      if (pageEnd < printRows.length) {
        // 计算当前页各列的rowspan边界
        const pageSlice = printRows.slice(pageStart, pageEnd)
        const lastIdx = pageSlice.length - 1
        // 如果最后一行有任何rowspan > 1（即它是某组的起始行且组未结束），则这行不能作为该页最后一行
        const projectSpansCheck = calcRowSpans(pageSlice.map(r => String(r.item.project_name || '').trim()))
        const productionSpansCheck = calcRowSpans(pageSlice.map(r => String(r.item.production_unit || '').trim()))
        const createdDateSpansCheck = calcRowSpans(pageSlice.map(r => String(r.cdate || '').trim()))
        const demandDateSpansCheck = calcRowSpans(pageSlice.map(r => String(r.ddate || '').trim()))
        const applicantSpansCheck = calcRowSpans(pageSlice.map(r => String(r.item.applicant || '').trim()))
        const spans = [projectSpansCheck, productionSpansCheck, createdDateSpansCheck, demandDateSpansCheck, applicantSpansCheck]
        const hasCrossPageSpan = spans.some(s => s[lastIdx] > 1)
        if (hasCrossPageSpan) {
          pageEnd = Math.max(pageStart + 1, pageEnd - 1) // 至少保留1行，回退1行
        }
      }
      pages.push(printRows.slice(pageStart, pageEnd))
      pageStart = pageEnd
    }

    let serialNo = 1
    const pagesHtml = pages.map((pageRows, pageIndex) => {
      const projectSpans = calcRowSpans(pageRows.map(r => String(r.item.project_name || '').trim()))
      const productionSpans = calcRowSpans(pageRows.map(r => String(r.item.production_unit || '').trim()))
      const createdDateSpans = calcRowSpans(pageRows.map(r => String(r.cdate || '').trim()))
      const demandDateSpans = calcRowSpans(pageRows.map(r => String(r.ddate || '').trim()))
      const applicantSpans = calcRowSpans(pageRows.map(r => String(r.item.applicant || '').trim()))
      const rowsHtml = pageRows.map(({ item, cdate, ddate }, idx) => {
        const rowHtml = `
          <tr>
          <td class="cell-no">${serialNo}</td>
          <td class="cell-name">${escapeHtml(item.part_name || '')}</td>
          <td class="cell-model">${escapeHtml(item.model || '')}</td>
          <td class="cell-qty">${escapeHtml(qtyText(item))}</td>
          ${projectSpans[idx] > 0 ? `<td class="cell-project" rowspan="${projectSpans[idx]}">${escapeHtml(item.project_name || '')}</td>` : ''}
          ${productionSpans[idx] > 0 ? `<td class="cell-unit" rowspan="${productionSpans[idx]}">${escapeHtml(item.production_unit || '')}</td>` : ''}
          ${createdDateSpans[idx] > 0 ? `<td class="cell-date" rowspan="${createdDateSpans[idx]}">${escapeHtml(cdate)}</td>` : ''}
          ${demandDateSpans[idx] > 0 ? `<td class="cell-date" rowspan="${demandDateSpans[idx]}">${escapeHtml(ddate)}</td>` : ''}
          ${applicantSpans[idx] > 0 ? `<td class="cell-applicant" rowspan="${applicantSpans[idx]}">${escapeHtml(item.applicant || '')}</td>` : ''}
          </tr>
        `
        serialNo += 1
        return rowHtml
      }).join('')
      return `
        <div class="print-page">
        <table class="sheet">
          <colgroup>
            <col style="width:5%">
            <col style="width:12%">
            <col style="width:22%">
            <col style="width:8%">
            <col style="width:12%">
            <col style="width:9%">
            <col style="width:12%">
            <col style="width:11%">
            <col style="width:9%">
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
        <div class="page-number">第 ${pageIndex + 1} 页 / 共 ${pages.length} 页</div>
        </div>
        ${pageIndex < pages.length - 1 ? '<div class="page-break"></div>' : ''}
      `
    }).join('')
    const html = `
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            @page {
              size: A4 portrait;
              margin: 10mm 8mm 0mm 8mm;
            }
            * { box-sizing: border-box; }
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              width: 210mm;
            }
            body {
              font-family: "Microsoft YaHei", "PingFang SC", SimSun, sans-serif;
              font-size: 10pt;
              line-height: 1.35;
              color: #000;
              background: #fff;
            }
            .print-page {
              width: 100%;
              page-break-after: always;
              page-break-inside: avoid;
              padding: 0 !important;
              margin: 0 !important;
            }
            .print-page:last-child {
              page-break-after: auto;
            }
            table.sheet {
              width: 100%;
              border-collapse: collapse;
              table-layout: fixed;
              border: 2px solid #000;
            }
            th, td {
              border: 1px solid #333;
              padding: 3px 5px;
              text-align: center;
              vertical-align: middle;
              line-height: 1.45;
              font-size: 9.5pt;
            }
            .header-line {
              font-size: 14pt;
              font-weight: bold;
              text-align: center;
              padding: 5px 4px;
              letter-spacing: 1px;
            }
            th {
              background: #f0f0f0;
              font-weight: bold;
              padding: 4px 3px;
            }
            tbody tr {
              height: 20px;
              min-height: 20px;
              page-break-inside: avoid;
            }
            td.cell-no { width: 5%; font-size: 9pt; }
            td.cell-name {
              width: 12%;
              text-align: left;
              word-break: break-all;
            }
            td.cell-model {
              width: 22%;
              text-align: left;
              word-break: break-all;
            }
            td.cell-qty { width: 8%; white-space: nowrap; }
            td.cell-project {
              width: 12%;
              text-align: left;
              word-break: break-all;
            }
            td.cell-unit { width: 9%; word-break: break-all; }
            td.cell-date { width: 12%; white-space: nowrap; }
            td.cell-applicant { width: 8%; }
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
              margin-top: 1mm;
            }
            .page-break { display: none; }
            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              .print-page {
                page-break-after: always;
                page-break-inside: avoid;
              }
              .print-page:last-child { page-break-after: auto; }
              tbody tr { page-break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          ${pagesHtml}
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
              <span style={{ color: '#555' }}>打印密度</span>
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
