import React from 'react'
import {
  Button,
  Input,
  Popconfirm,
  Select,
  Space,
  Table,
  Tabs,
  Typography,
  Upload,
  message
} from 'antd'
import { LeftOutlined, ReloadOutlined, UploadOutlined, DeleteOutlined, DownloadOutlined, SendOutlined } from '@ant-design/icons'
import type { UploadProps } from 'antd'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import dayjs from 'dayjs'
import { fetchWithFallback } from '../utils/api'
import { useAuthStore } from '../stores/authStore'

const { Title } = Typography

type StockRow = {
  name: string
  spec_model: string
  location: string
  inbound_total: number
  outbound_total: number
  balance: number
  unit: string
  unit_price: number
  total_amount: number
  safety_stock: number
  max_stock: number
}

type LedgerRow = {
  id: string
  name: string
  spec_model: string
  location: string
  quantity: number
  unit: string
  unit_price: number
  in_date?: string
  out_date?: string
  operator: string
  status: string
}

type DraftInboundRow = {
  key: string
  name: string
  spec_model: string
  location: string
  quantity: number
  unit: string
  unit_price: number | string
  in_date: string
  operator: string
  status: string
}

const fmtNum = (v: any, p = 2) => Number(v || 0).toFixed(p)
const fmtMoney = (v: any) => Number(v || 0).toFixed(2)
const fmtIntPos = (v: any) => `${Math.max(0, Math.round(Number(v || 0)))}`
const normalizePositiveInt = (v: any) => {
  const n = Number(String(v ?? '').replace(/[^\d.-]/g, ''))
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.round(n)
}
const normalizePositiveMoney = (v: any) => {
  const n = Number(String(v ?? '').replace(/[^\d.-]/g, ''))
  if (!Number.isFinite(n) || n <= 0) return 0
  return Number(n.toFixed(2))
}
const sortByDateDesc = (a?: string, b?: string) => {
  const av = String(a || '')
  const bv = String(b || '')
  if (av === bv) return 0
  return bv.localeCompare(av)
}
const includesByKeyword = (val: any, keyword: string) => {
  const v = String(val || '').toLowerCase()
  const k = String(keyword || '').trim().toLowerCase()
  if (!k) return true
  return v.includes(k)
}

const StandardPartsManagement: React.FC = () => {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [activeTab, setActiveTab] = React.useState('stock')
  const [loading, setLoading] = React.useState(false)
  const [stockItems, setStockItems] = React.useState<StockRow[]>([])
  const [inboundItems, setInboundItems] = React.useState<LedgerRow[]>([])
  const [outboundItems, setOutboundItems] = React.useState<LedgerRow[]>([])
  const [inboundSelectedKeys, setInboundSelectedKeys] = React.useState<React.Key[]>([])
  const [outboundSelectedKeys, setOutboundSelectedKeys] = React.useState<React.Key[]>([])
  const [draftInboundRows, setDraftInboundRows] = React.useState<DraftInboundRow[]>([])
  const [draftSelectedKeys, setDraftSelectedKeys] = React.useState<React.Key[]>([])
  const [tableY, setTableY] = React.useState(Math.max(380, window.innerHeight - 320))
  const [stockFilter, setStockFilter] = React.useState({ name: '', spec: '', location: '', unit: '' })
  const [inboundOpFilter, setInboundOpFilter] = React.useState({ name: '', spec: '', location: '', unit: '', status: '' })
  const [inboundFilter, setInboundFilter] = React.useState({ name: '', spec: '', location: '', unit: '', operator: '', status: '' })
  const [outboundFilter, setOutboundFilter] = React.useState({ name: '', spec: '', location: '', unit: '', operator: '', status: '' })

  const autofillDraftDefaults = React.useCallback((row: DraftInboundRow): DraftInboundRow => {
    const hasAnyInput = Boolean(
      String(row.name || '').trim()
      || String(row.spec_model || '').trim()
      || String(row.location || '').trim()
      || Number(row.quantity || 0) > 0
      || String(row.unit || '').trim()
      || Number(row.unit_price || 0) > 0
    )
    if (!hasAnyInput) return row
    return {
      ...row,
      in_date: String(row.in_date || dayjs().format('YYYY-MM-DD')),
      operator: String(row.operator || user?.real_name || ''),
      status: String(row.status || '待入库')
    }
  }, [user?.real_name])

  const isDraftRowValid = React.useCallback((r: DraftInboundRow) => {
    return Boolean(
      String(r.name || '').trim()
      && String(r.spec_model || '').trim()
      && String(r.location || '').trim()
      && Number(r.quantity || 0) > 0
      && String(r.unit || '').trim()
    )
  }, [])

  const isDraftRowBlank = React.useCallback((r: DraftInboundRow) => {
    return !String(r.name || '').trim()
      && !String(r.spec_model || '').trim()
      && !String(r.location || '').trim()
      && Number(r.quantity || 0) <= 0
      && !String(r.unit || '').trim()
      && Number(r.unit_price || 0) <= 0
  }, [])

  const getDraftRowStatus = React.useCallback((r: DraftInboundRow) => {
    if (isDraftRowBlank(r)) return ''
    if (isDraftRowValid(r)) return '可入库'
    return '待补全'
  }, [isDraftRowBlank, isDraftRowValid])

  const loadAll = React.useCallback(async () => {
    setLoading(true)
    try {
      const op = encodeURIComponent(String(user?.real_name || ''))
      const [stockRes, inRes, outRes] = await Promise.all([
        fetchWithFallback(`/api/standard-parts/stock-ledger?operator=${op}`),
        fetchWithFallback(`/api/standard-parts/inbound?operator=${op}`),
        fetchWithFallback(`/api/standard-parts/outbound?operator=${op}`)
      ])
      const [stockJson, inJson, outJson] = await Promise.all([stockRes.json(), inRes.json(), outRes.json()])
      setStockItems(Array.isArray(stockJson?.items) ? stockJson.items : [])
      setInboundItems(Array.isArray(inJson?.items) ? inJson.items : [])
      setOutboundItems(Array.isArray(outJson?.items) ? outJson.items : [])
    } catch (e: any) {
      message.error(e?.message || '加载标准件数据失败')
    } finally {
      setLoading(false)
    }
  }, [user?.real_name])

  React.useEffect(() => {
    loadAll()
  }, [loadAll])

  React.useEffect(() => {
    const onResize = () => setTableY(Math.max(380, window.innerHeight - 320))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const createBlankInboundRow = React.useCallback((idx: number): DraftInboundRow => ({
    key: `manual-${Date.now()}-${idx}-${Math.random()}`,
    name: '',
    spec_model: '',
    location: '',
    quantity: 0,
    unit: '',
    unit_price: '',
    in_date: '',
    operator: '',
    status: ''
  }), [user?.real_name])

  React.useEffect(() => {
    if (draftInboundRows.length > 0) return
    setDraftInboundRows([createBlankInboundRow(1), createBlankInboundRow(2)])
  }, [createBlankInboundRow, draftInboundRows.length])

  const ensureAtLeastTwoBlankRows = React.useCallback((rows: DraftInboundRow[]) => {
    const blankCount = rows.filter((r) => !String(r.name || '').trim() && !String(r.spec_model || '').trim() && Number(r.quantity || 0) <= 0).length
    if (blankCount >= 2) return rows
    const next = [...rows]
    for (let i = 0; i < 2 - blankCount; i += 1) {
      next.push(createBlankInboundRow(i + 1))
    }
    return next
  }, [createBlankInboundRow])

  const stockFiltered = React.useMemo(() => {
    return stockItems.filter((r) =>
      includesByKeyword(r.name, stockFilter.name)
      && includesByKeyword(r.spec_model, stockFilter.spec)
      && includesByKeyword(r.location, stockFilter.location)
      && includesByKeyword(r.unit, stockFilter.unit)
    )
  }, [stockItems, stockFilter])

  const draftFiltered = React.useMemo(() => {
    return draftInboundRows.filter((r) => {
      const rowStatus = getDraftRowStatus(r)
      return includesByKeyword(r.name, inboundOpFilter.name)
        && includesByKeyword(r.spec_model, inboundOpFilter.spec)
        && includesByKeyword(r.location, inboundOpFilter.location)
        && includesByKeyword(r.unit, inboundOpFilter.unit)
        && includesByKeyword(rowStatus, inboundOpFilter.status)
    })
  }, [draftInboundRows, getDraftRowStatus, inboundOpFilter])

  const inboundFiltered = React.useMemo(() => {
    const base = inboundItems.filter((r) =>
      includesByKeyword(r.name, inboundFilter.name)
      && includesByKeyword(r.spec_model, inboundFilter.spec)
      && includesByKeyword(r.location, inboundFilter.location)
      && includesByKeyword(r.unit, inboundFilter.unit)
      && includesByKeyword(r.operator, inboundFilter.operator)
      && includesByKeyword(r.status, inboundFilter.status)
    )
    return [...base].sort((a, b) => sortByDateDesc(a.in_date, b.in_date))
  }, [inboundItems, inboundFilter])

  const outboundFiltered = React.useMemo(() => {
    const base = outboundItems.filter((r) =>
      includesByKeyword(r.name, outboundFilter.name)
      && includesByKeyword(r.spec_model, outboundFilter.spec)
      && includesByKeyword(r.location, outboundFilter.location)
      && includesByKeyword(r.unit, outboundFilter.unit)
      && includesByKeyword(r.operator, outboundFilter.operator)
      && includesByKeyword(r.status, outboundFilter.status)
    )
    return [...base].sort((a, b) => sortByDateDesc(a.out_date, b.out_date))
  }, [outboundItems, outboundFilter])

  const submitInbound = async (rows: any[]) => {
    const resp = await fetchWithFallback('/api/standard-parts/inbound/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: rows })
    })
    const json = await resp.json().catch(() => ({}))
    if (!resp.ok || json?.success === false) {
      throw new Error(String(json?.error || '入库失败'))
    }
  }

  const submitOutbound = async (rows: any[]) => {
    const resp = await fetchWithFallback('/api/standard-parts/outbound/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: rows })
    })
    const json = await resp.json().catch(() => ({}))
    if (!resp.ok || json?.success === false) {
      throw new Error(String(json?.error || '出库失败'))
    }
  }

  const handleBatchAction = async (kind: 'inbound' | 'outbound', action: 'delete') => {
    const ids = (kind === 'inbound' ? inboundSelectedKeys : outboundSelectedKeys).map(String)
    if (ids.length === 0) {
      message.warning('请先勾选数据')
      return
    }
    try {
      const resp = await fetchWithFallback(`/api/standard-parts/${kind}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, operator: user?.real_name || '' })
      })
      const json = await resp.json().catch(() => ({}))
      if (!resp.ok || json?.success === false) {
        throw new Error(String(json?.error || '操作失败'))
      }
      message.success('删除成功')
      if (kind === 'inbound') setInboundSelectedKeys([])
      else setOutboundSelectedKeys([])
      await loadAll()
    } catch (e: any) {
      message.error(e?.message || '操作失败')
    }
  }

  const patchDraftInboundRow = (key: string, patch: Partial<DraftInboundRow>) => {
    setDraftInboundRows((prev) => {
      const updated = prev.map((r) => {
        if (r.key !== key) return r
        const next = { ...r, ...patch }
        if ((patch.name !== undefined || patch.spec_model !== undefined || patch.location !== undefined) && (!patch.unit || !patch.unit_price)) {
          const matched = stockItems.find((s) =>
            s.name === String(next.name || '').trim()
            && s.spec_model === String(next.spec_model || '').trim()
            && s.location === String(next.location || '').trim()
          )
          if (matched) {
            if (!patch.unit) next.unit = matched.unit
            if (!patch.unit_price || Number(patch.unit_price) <= 0) next.unit_price = Number(matched.unit_price || 0)
          }
        }
        return autofillDraftDefaults(next)
      })
      return ensureAtLeastTwoBlankRows(updated)
    })
  }

  const handleDraftInboundSubmit = async () => {
    const selected = draftInboundRows.filter((r) => draftSelectedKeys.includes(r.key))
    const valid = selected.filter((r) => isDraftRowValid(r))
    if (valid.length === 0) {
      message.warning('请先勾选并填写有效的待入库数据')
      return
    }
    try {
      const payload = valid.map((r) => ({
        name: String(r.name || '').trim(),
        spec_model: String(r.spec_model || '').trim(),
        tech_group: '',
        location: String(r.location || '').trim(),
        quantity: normalizePositiveInt(r.quantity),
        unit: String(r.unit || '').trim(),
        unit_price: normalizePositiveMoney(r.unit_price),
        in_date: String(r.in_date || dayjs().format('YYYY-MM-DD')),
        operator: String(r.operator || user?.real_name || ''),
        status: '正常'
      }))
      await submitInbound(payload)
      const successKeySet = new Set(valid.map((x) => x.key))
      setDraftInboundRows((prev) => ensureAtLeastTwoBlankRows(prev.filter((r) => !successKeySet.has(r.key))))
      setDraftSelectedKeys([])
      message.success(`已完成 ${valid.length} 条入库`)
      await loadAll()
    } catch (e: any) {
      message.error(e?.message || '一键入库失败')
    }
  }

  const downloadInboundTemplate = () => {
    const header = ['名称', '规格型号', '库位', '入库数量', '单位', '单价', '入库日期', '操作人', '状态']
    const sample = ['示例标准件', 'M8*20', '铝铸库', 100, '个', 0.5, dayjs().format('YYYY-MM-DD'), user?.real_name || '', '待入库']
    const ws = XLSX.utils.aoa_to_sheet([header, sample])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '入库导入模板')
    XLSX.writeFile(wb, '标准件入库导入模板.xlsx')
  }

  const handleDeleteDraftRows = () => {
    if (draftSelectedKeys.length === 0) {
      message.warning('请先勾选待删除的入库操作数据')
      return
    }
    const keySet = new Set(draftSelectedKeys.map(String))
    setDraftInboundRows((prev) => ensureAtLeastTwoBlankRows(prev.filter((r) => !keySet.has(String(r.key)))))
    setDraftSelectedKeys([])
    message.success('已删除选中的入库操作数据')
  }

  const importUploadProps: UploadProps = {
    accept: '.xlsx,.xls',
    maxCount: 1,
    showUploadList: false,
    beforeUpload: async (file) => {
      try {
        const buf = await file.arrayBuffer()
        const wb = XLSX.read(buf)
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json<any>(ws, { defval: '' })
        const parsed = rows.map((r: any, i: number) => {
          const name = String(r['名称'] || r['name'] || '').trim()
          const spec = String(r['规格型号'] || r['spec_model'] || '').trim()
          const locationRaw = String(r['库位'] || r['location'] || '').trim()
          const location = locationRaw
          return autofillDraftDefaults({
            key: `import-${Date.now()}-${i}`,
            name,
            spec_model: spec,
            location,
            quantity: Number(r['入库数量'] || r['quantity'] || 0),
            unit: String(r['单位'] || r['unit'] || '').trim(),
            unit_price: normalizePositiveMoney(r['单价'] || r['unit_price'] || 0),
            in_date: String(r['入库日期'] || r['in_date'] || dayjs().format('YYYY-MM-DD')).trim(),
            operator: String(r['操作人'] || r['operator'] || user?.real_name || '').trim(),
            status: String(r['状态'] || r['status'] || '待入库').trim()
          } as DraftInboundRow)
        }).filter((x: DraftInboundRow) => x.name && x.spec_model && x.location && x.unit && x.quantity > 0)
        setDraftInboundRows((prev) => ensureAtLeastTwoBlankRows([...prev, ...parsed]))
        setDraftSelectedKeys((prev) => [...prev, ...parsed.map((r: DraftInboundRow) => r.key)])
        message.success(`已导入 ${parsed.length} 条待入库数据`)
      } catch (e: any) {
        message.error(e?.message || '解析Excel失败')
      }
      return false
    }
  }

  return (
    <div className="w-full px-2 md:px-4 py-4">
      <div className="bg-white min-h-[calc(100vh-100px)]">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <Title level={2} className="mb-0">标准件管理</Title>
            <Space>
              <Button icon={<ReloadOutlined />} onClick={loadAll}>刷新</Button>
              <Button icon={<LeftOutlined />} onClick={() => navigate('/dashboard')}>返回</Button>
            </Space>
          </div>
        </div>

        <div className="px-6 pb-6">
          <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
            {
              key: 'stock',
              label: '库存台账',
              children: (
                <div className="border border-gray-200 rounded-lg p-2">
                  <Space className="mb-2" style={{ width: '100%', justifyContent: 'space-between' }}>
                    <Space wrap>
                      <Input allowClear placeholder="名称" value={stockFilter.name} onChange={(e) => setStockFilter((p) => ({ ...p, name: e.target.value }))} style={{ width: 180 }} />
                      <Input allowClear placeholder="规格型号" value={stockFilter.spec} onChange={(e) => setStockFilter((p) => ({ ...p, spec: e.target.value }))} style={{ width: 180 }} />
                      <Input allowClear placeholder="库位" value={stockFilter.location} onChange={(e) => setStockFilter((p) => ({ ...p, location: e.target.value }))} style={{ width: 160 }} />
                      <Input allowClear placeholder="单位" value={stockFilter.unit} onChange={(e) => setStockFilter((p) => ({ ...p, unit: e.target.value }))} style={{ width: 120 }} />
                    </Space>
                  </Space>
                  <Table
                    rowKey={(r) => `${r.name}-${r.spec_model}-${r.location}-${r.unit}`}
                    loading={loading}
                    dataSource={stockFiltered}
                    scroll={{ y: tableY }}
                    pagination={false}
                    tableLayout="fixed"
                    columns={[
                      { title: '序号', width: 72, align: 'center', render: (_v, _r, i) => i + 1 },
                      { title: '名称', dataIndex: 'name', ellipsis: true },
                      { title: '规格型号', dataIndex: 'spec_model', ellipsis: true },
                      { title: '库位', dataIndex: 'location', align: 'center', ellipsis: true },
                      { title: '入库总数', dataIndex: 'inbound_total', align: 'right', render: (v) => fmtIntPos(v) },
                      { title: '出库总数', dataIndex: 'outbound_total', align: 'right', render: (v) => fmtIntPos(v) },
                      { title: '结余', dataIndex: 'balance', align: 'right', render: (v) => fmtIntPos(v) },
                      { title: '单位', dataIndex: 'unit', align: 'center', ellipsis: true },
                      { title: '单价', dataIndex: 'unit_price', align: 'right', render: (v) => fmtMoney(v) },
                      { title: '总额', dataIndex: 'total_amount', align: 'right', render: (v) => fmtNum(v, 2) },
                      { title: '安全库存(月均)', dataIndex: 'safety_stock', align: 'right', render: (v) => fmtIntPos(v) },
                      { title: '最大库存(3个月)', dataIndex: 'max_stock', align: 'right', render: (v) => fmtIntPos(v) }
                    ]}
                  />
                </div>
              )
            },
            {
              key: 'inbound-op',
              label: '入库操作',
              children: (
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <Space>
                    <Button type="primary" icon={<SendOutlined />} onClick={handleDraftInboundSubmit}>一键入库</Button>
                    <Popconfirm title="确认删除选中的入库操作数据？" onConfirm={handleDeleteDraftRows}>
                      <Button danger icon={<DeleteOutlined />}>删除</Button>
                    </Popconfirm>
                    <Upload {...importUploadProps}>
                      <Button icon={<UploadOutlined />}>Excel导入</Button>
                    </Upload>
                    <Button icon={<DownloadOutlined />} onClick={downloadInboundTemplate}>下载导入模板</Button>
                  </Space>
                  <div className="border border-gray-200 rounded-lg p-2">
                    <Space className="mb-2" style={{ width: '100%', justifyContent: 'space-between' }}>
                      <Space wrap>
                        <Input allowClear placeholder="名称" value={inboundOpFilter.name} onChange={(e) => setInboundOpFilter((p) => ({ ...p, name: e.target.value }))} style={{ width: 180 }} />
                        <Input allowClear placeholder="规格型号" value={inboundOpFilter.spec} onChange={(e) => setInboundOpFilter((p) => ({ ...p, spec: e.target.value }))} style={{ width: 180 }} />
                        <Input allowClear placeholder="库位" value={inboundOpFilter.location} onChange={(e) => setInboundOpFilter((p) => ({ ...p, location: e.target.value }))} style={{ width: 160 }} />
                        <Input allowClear placeholder="单位" value={inboundOpFilter.unit} onChange={(e) => setInboundOpFilter((p) => ({ ...p, unit: e.target.value }))} style={{ width: 120 }} />
                        <Select
                          allowClear
                          placeholder="状态"
                          value={inboundOpFilter.status || undefined}
                          onChange={(v) => setInboundOpFilter((p) => ({ ...p, status: String(v || '') }))}
                          options={[{ value: '可入库', label: '可入库' }, { value: '待补全', label: '待补全' }]}
                          style={{ width: 120 }}
                        />
                      </Space>
                    </Space>
                    <Table
                      rowKey="key"
                      size="small"
                      rowSelection={{ selectedRowKeys: draftSelectedKeys, onChange: setDraftSelectedKeys }}
                      dataSource={draftFiltered}
                      scroll={{ y: tableY }}
                      pagination={false}
                      tableLayout="fixed"
                      columns={[
                        {
                          title: '序号',
                          width: 72,
                          align: 'center',
                          render: (_v, _r, i) => i + 1
                        },
                        {
                          title: '名称',
                          dataIndex: 'name',
                          render: (_v, r: DraftInboundRow) => <Input value={r.name} onChange={(e) => patchDraftInboundRow(r.key, { name: e.target.value })} />
                        },
                        {
                          title: '规格型号',
                          dataIndex: 'spec_model',
                          render: (_v, r: DraftInboundRow) => <Input value={r.spec_model} onChange={(e) => patchDraftInboundRow(r.key, { spec_model: e.target.value })} />
                        },
                        {
                          title: '库位',
                          dataIndex: 'location',
                          render: (_v, r: DraftInboundRow) => <Input value={r.location} onChange={(e) => patchDraftInboundRow(r.key, { location: e.target.value })} />
                        },
                        {
                          title: '入库数量',
                          dataIndex: 'quantity',
                          render: (_v, r: DraftInboundRow) => <Input value={r.quantity ? String(r.quantity) : ''} onChange={(e) => patchDraftInboundRow(r.key, { quantity: normalizePositiveInt(e.target.value) })} />
                        },
                        {
                          title: '单位',
                          dataIndex: 'unit',
                          render: (_v, r: DraftInboundRow) => <Input value={r.unit} onChange={(e) => patchDraftInboundRow(r.key, { unit: e.target.value })} />
                        },
                        {
                          title: '单价',
                          dataIndex: 'unit_price',
                          render: (_v, r: DraftInboundRow) => (
                            <Input
                              inputMode="decimal"
                              value={String(r.unit_price ?? '')}
                              onChange={(e) => patchDraftInboundRow(r.key, { unit_price: e.target.value })}
                            />
                          )
                        },
                        {
                          title: '入库日期',
                          dataIndex: 'in_date',
                          render: (_v, r: DraftInboundRow) => <Input value={r.in_date} onChange={(e) => patchDraftInboundRow(r.key, { in_date: e.target.value })} />
                        },
                        {
                          title: '操作人',
                          dataIndex: 'operator',
                          render: (_v, r: DraftInboundRow) => <Input value={r.operator} onChange={(e) => patchDraftInboundRow(r.key, { operator: e.target.value })} />
                        },
                        { title: '状态', align: 'center' as const, render: (_v, r: DraftInboundRow) => getDraftRowStatus(r) }
                      ]}
                    />
                  </div>
                </Space>
              )
            },
            {
              key: 'inbound',
              label: '入库台账',
              children: (
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <Space>
                    <Space wrap>
                      <Input allowClear placeholder="名称" value={inboundFilter.name} onChange={(e) => setInboundFilter((p) => ({ ...p, name: e.target.value }))} style={{ width: 160 }} />
                      <Input allowClear placeholder="规格型号" value={inboundFilter.spec} onChange={(e) => setInboundFilter((p) => ({ ...p, spec: e.target.value }))} style={{ width: 170 }} />
                      <Input allowClear placeholder="库位" value={inboundFilter.location} onChange={(e) => setInboundFilter((p) => ({ ...p, location: e.target.value }))} style={{ width: 140 }} />
                      <Input allowClear placeholder="单位" value={inboundFilter.unit} onChange={(e) => setInboundFilter((p) => ({ ...p, unit: e.target.value }))} style={{ width: 100 }} />
                      <Input allowClear placeholder="操作人" value={inboundFilter.operator} onChange={(e) => setInboundFilter((p) => ({ ...p, operator: e.target.value }))} style={{ width: 130 }} />
                      <Input allowClear placeholder="状态" value={inboundFilter.status} onChange={(e) => setInboundFilter((p) => ({ ...p, status: e.target.value }))} style={{ width: 120 }} />
                    </Space>
                    <Popconfirm title="确认删除选中的入库记录？" onConfirm={() => handleBatchAction('inbound', 'delete')}>
                      <Button danger icon={<DeleteOutlined />}>删除</Button>
                    </Popconfirm>
                  </Space>
                  <div className="border border-gray-200 rounded-lg p-2">
                    <Table
                      rowKey="id"
                      loading={loading}
                      rowSelection={{ selectedRowKeys: inboundSelectedKeys, onChange: setInboundSelectedKeys }}
                      dataSource={inboundFiltered}
                      scroll={{ y: tableY }}
                      pagination={{ pageSize: 20, showSizeChanger: true, showQuickJumper: true }}
                      tableLayout="fixed"
                      columns={[
                        { title: '序号', width: 72, align: 'center', render: (_v, _r, i) => i + 1 },
                        { title: '名称', dataIndex: 'name', ellipsis: true },
                        { title: '规格型号', dataIndex: 'spec_model', ellipsis: true },
                        { title: '库位', dataIndex: 'location', align: 'center', ellipsis: true },
                        { title: '入库数量', dataIndex: 'quantity', align: 'right', render: (v) => fmtIntPos(v) },
                        { title: '单位', dataIndex: 'unit', align: 'center', ellipsis: true },
                        { title: '单价', dataIndex: 'unit_price', align: 'right', render: (v) => fmtMoney(v) },
                        { title: '入库日期', dataIndex: 'in_date', align: 'center' },
                        { title: '操作人', dataIndex: 'operator', align: 'center', ellipsis: true },
                        { title: '状态', dataIndex: 'status', align: 'center', ellipsis: true }
                      ]}
                    />
                  </div>
                </Space>
              )
            },
            {
              key: 'outbound',
              label: '出库台账',
              children: (
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <Space>
                    <Space wrap>
                      <Input allowClear placeholder="名称" value={outboundFilter.name} onChange={(e) => setOutboundFilter((p) => ({ ...p, name: e.target.value }))} style={{ width: 160 }} />
                      <Input allowClear placeholder="规格型号" value={outboundFilter.spec} onChange={(e) => setOutboundFilter((p) => ({ ...p, spec: e.target.value }))} style={{ width: 170 }} />
                      <Input allowClear placeholder="库位" value={outboundFilter.location} onChange={(e) => setOutboundFilter((p) => ({ ...p, location: e.target.value }))} style={{ width: 140 }} />
                      <Input allowClear placeholder="单位" value={outboundFilter.unit} onChange={(e) => setOutboundFilter((p) => ({ ...p, unit: e.target.value }))} style={{ width: 100 }} />
                      <Input allowClear placeholder="操作人" value={outboundFilter.operator} onChange={(e) => setOutboundFilter((p) => ({ ...p, operator: e.target.value }))} style={{ width: 130 }} />
                      <Input allowClear placeholder="状态" value={outboundFilter.status} onChange={(e) => setOutboundFilter((p) => ({ ...p, status: e.target.value }))} style={{ width: 120 }} />
                    </Space>
                    <Popconfirm title="确认删除选中的出库记录？" onConfirm={() => handleBatchAction('outbound', 'delete')}>
                      <Button danger icon={<DeleteOutlined />}>删除</Button>
                    </Popconfirm>
                  </Space>
                  <div className="border border-gray-200 rounded-lg p-2">
                    <Table
                      rowKey="id"
                      loading={loading}
                      rowSelection={{ selectedRowKeys: outboundSelectedKeys, onChange: setOutboundSelectedKeys }}
                      dataSource={outboundFiltered}
                      scroll={{ y: tableY }}
                      pagination={{ pageSize: 20, showSizeChanger: true, showQuickJumper: true }}
                      tableLayout="fixed"
                      columns={[
                        { title: '序号', width: 72, align: 'center', render: (_v, _r, i) => i + 1 },
                        { title: '名称', dataIndex: 'name', ellipsis: true },
                        { title: '规格型号', dataIndex: 'spec_model', ellipsis: true },
                        { title: '库位', dataIndex: 'location', align: 'center', ellipsis: true },
                        { title: '出库数量', dataIndex: 'quantity', align: 'right', render: (v) => fmtIntPos(v) },
                        { title: '单位', dataIndex: 'unit', align: 'center', ellipsis: true },
                        { title: '单价', dataIndex: 'unit_price', align: 'right', render: (v) => fmtMoney(v) },
                        { title: '出库日期', dataIndex: 'out_date', align: 'center' },
                        { title: '操作人', dataIndex: 'operator', align: 'center', ellipsis: true },
                        { title: '状态', dataIndex: 'status', align: 'center', ellipsis: true }
                      ]}
                    />
                  </div>
                </Space>
              )
            }
          ]} />
        </div>
      </div>
    </div>
  )
}

export default StandardPartsManagement
