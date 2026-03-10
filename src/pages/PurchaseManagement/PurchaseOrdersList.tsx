import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Button, message, Row, Col, Space, Segmented } from 'antd';
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



export default function PurchaseOrdersList() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [data, setData] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const didInitRef = useRef(false);
  
  const inFlightRef = useRef(false);
  const [sourceFilter, setSourceFilter] = useState<'全部' | '工装信息' | '临时计划'>('全部');
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

  const [hiddenIds, setHiddenIds] = useState<string[]>([])
  const [approvalHiddenIds, setApprovalHiddenIds] = useState<string[]>([])
  useEffect(() => {
    const loadHidden = () => {
      try {
        const arr = JSON.parse(localStorage.getItem('temporary_hidden_ids') || '[]')
        setHiddenIds(Array.isArray(arr) ? arr : [])
      } catch { setHiddenIds([]) }
    }
    const loadApprovalHidden = () => {
      try {
        const arr = JSON.parse(localStorage.getItem('approval_hidden_ids') || '[]')
        setApprovalHiddenIds(Array.isArray(arr) ? arr : [])
      } catch { setApprovalHiddenIds([]) }
    }
    loadHidden()
    loadApprovalHidden()
    const handler = () => loadHidden()
    const handler2 = () => loadApprovalHidden()
    const storageHandler = () => { loadHidden(); loadApprovalHidden() }
    window.addEventListener('temporary_plans_updated', handler)
    window.addEventListener('storage', storageHandler)
    window.addEventListener('approval_updated', handler2)
    
    // 监听状态更新事件（如生成采购单后）
    const statusHandler = () => {
      console.log('收到 status_updated 事件，刷新采购单列表')
      fetchPurchaseOrders()
    }
    window.addEventListener('status_updated', statusHandler)

    return () => {
      window.removeEventListener('temporary_plans_updated', handler)
      window.removeEventListener('storage', storageHandler)
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
      .filter(item => !hiddenIds.includes(item.id) && !approvalHiddenIds.includes(item.id))
      .filter(item => sourceFilter === '全部' ? true : item.source === sourceFilter)
    if (isTechnician && myTeamName) {
      arr = arr.filter((item: any) => {
        const applicant = String(item.applicant || '')
        const team = userTeamsMap[applicant] || ''
        return team && team === myTeamName
      })
    }
    return arr
  }, [data, hiddenIds, approvalHiddenIds, sourceFilter, isTechnician, myTeamName, userTeamsMap, teamsLoaded])

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
      width: 110,
      render: (date) => dayjs(date).format('YYYY-MM-DD')
    },
    {
      title: '需求日期',
      dataIndex: 'demand_date',
      width: 110,
      render: (date) => date ? dayjs(date).format('YYYY-MM-DD') : '-'
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
  ]), []);

  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    fetchPurchaseOrders();
    return () => {};
  }, []);

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
    const projectSpans = calcRowSpans(printRows.map(r => String(r.item.project_name || '').trim()))
    const productionSpans = calcRowSpans(printRows.map(r => String(r.item.production_unit || '').trim()))
    const createdDateSpans = calcRowSpans(printRows.map(r => String(r.cdate || '').trim()))
    const demandDateSpans = calcRowSpans(printRows.map(r => String(r.ddate || '').trim()))
    const applicantSpans = calcRowSpans(printRows.map(r => String(r.item.applicant || '').trim()))
    const rowsHtml = printRows.map(({ item, cdate, ddate }, idx) => {
      return `
        <tr>
          <td>${idx + 1}</td>
          <td>${escapeHtml(item.part_name)}</td>
          <td>${escapeHtml(item.model || '')}</td>
          <td>${escapeHtml(qtyText(item))}</td>
          ${projectSpans[idx] > 0 ? `<td rowspan="${projectSpans[idx]}">${escapeHtml(item.project_name || '')}</td>` : ''}
          ${productionSpans[idx] > 0 ? `<td rowspan="${productionSpans[idx]}">${escapeHtml(item.production_unit || '')}</td>` : ''}
          ${createdDateSpans[idx] > 0 ? `<td rowspan="${createdDateSpans[idx]}">${escapeHtml(cdate)}</td>` : ''}
          ${demandDateSpans[idx] > 0 ? `<td rowspan="${demandDateSpans[idx]}">${escapeHtml(ddate)}</td>` : ''}
          ${applicantSpans[idx] > 0 ? `<td rowspan="${applicantSpans[idx]}">${escapeHtml(item.applicant || '')}</td>` : ''}
        </tr>
      `
    }).join('')
    const targetRows = 34
    const emptyCount = Math.max(0, targetRows - rows.length)
    const emptyRowsHtml = Array.from({ length: emptyCount }).map(() => `
      <tr class="empty-row">
        <td>&nbsp;</td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
      </tr>
    `).join('')
    const html = `
      <html>
        <head>
          <title></title>
          <style>
            @page { size: A4 portrait; margin: 0; }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif; padding: 10mm; margin: 0; }
            .header-line { font-size: 16px; font-weight: 700; text-align: center; }
            table.sheet { width: 100%; height: calc(297mm - 20mm); border-collapse: collapse; font-size: 12px; table-layout: fixed; }
            th, td { border: 1px solid #333; padding: 4px 6px; text-align: center; }
            th { background: #f3f3f3; }
            thead th, tbody td { height: 7mm; }
            .empty-row td { height: 7mm; }
            tfoot td { height: 12mm; vertical-align: middle; font-weight: 600; text-align: left; padding-left: 2px; }
          </style>
        </head>
        <body>
          <table class="sheet">
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
              ${emptyRowsHtml}
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
        </body>
      </html>
    `

    const w = window.open('', '_blank')
    if (!w) { message.error('无法打开打印窗口，请检查浏览器弹窗设置'); return }
    w.document.open()
    w.document.write(html)
    w.document.close()
    w.focus()
    w.print()
  }

  return (
    <div style={{ padding: '16px 0', height: 'calc(100vh - 200px)' }}>
      <StyleInjector />
      
      {/* 操作按钮区域 - 移除筛选功能，保留复选框和批量删除 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
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
            <Button onClick={printApprovalList}>打印审批清单</Button>
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
              onClick={() => {
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
                const existing: any[] = (() => { try { return JSON.parse(localStorage.getItem('temporary_plans') || '[]') } catch { return [] } })()
                const newGroups: any[] = []
                Object.keys(monthGroups).forEach(key => {
                  const seq = existing.filter(g => g.monthKey === key).length + 1
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
                  newGroups.push({ code, monthKey: key, createdAt: new Date().toISOString(), items })
                })
                const allGroups = [...existing, ...newGroups]
                localStorage.setItem('temporary_plans', JSON.stringify(allGroups))
                const hidden = new Set<string>(hiddenIds)
                selected.forEach(s => hidden.add(s.id))
                localStorage.setItem('temporary_hidden_ids', JSON.stringify(Array.from(hidden)))
                // 同步隐藏采购申请页的来源行（manual/back-up）
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
                // 通知其他页面（同文档）刷新视图
                window.dispatchEvent(new Event('temporary_plans_updated'))
                window.dispatchEvent(new Event('status_updated'))
                // 标记审批中状态（覆盖提计划）
                selected.forEach(item => {
                  const pid = (item as any).part_id
                  const cid = (item as any).child_item_id
                  if (pid) updatePartPurchaseStatus(String(pid), '审批中')
                  if (cid) updateChildPurchaseStatus(String(cid), '审批中')
                })
                message.success(`已生成临时计划：${newGroups.map(g => g.code).join(', ')}`)
                setSelectedRowKeys([])
                // 触发UI刷新
                setTimeout(() => setData(prev => [...prev]), 0)
                // 跳转到临时计划页面
                navigate('/purchase-management?tab=temp')
              }}
            >
              生成临时计划
            </Button>
          </Space>
        </Col>
      </Row>
      <Row style={{ marginBottom: 8 }}>
        <Col span={24}>
          <Space size={24}>
            <span style={{ fontWeight: 600 }}>总重量: {totals.weight ? totals.weight.toFixed(3) : '0.000'} kg</span>
            <span style={{ fontWeight: 600 }}>总金额: {totals.price ? `¥${totals.price.toFixed(2)}` : '¥0.00'}</span>
          </Space>
        </Col>
      </Row>

      {/* 采购单表格 - 加长样式与工装信息一致 */}
      <div style={{ height: 'calc(100vh - 240px)', overflowY: 'hidden' }}>
        <Table
          rowKey="id"
          rowSelection={rowSelection}
          columns={columns}
          dataSource={filteredData}
          loading={loading}
          pagination={false}
          scroll={{ x: 'max-content', y: 'calc(100vh - 240px)' }}
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
