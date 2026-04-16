import React from 'react'
import {
  Button,
  Input,
  Popconfirm,
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
  unit_price: number
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
    unit_price: 0,
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
    const valid = selected.filter((r) =>
      String(r.name || '').trim()
      && String(r.spec_model || '').trim()
      && String(r.location || '').trim()
      && Number(r.quantity || 0) > 0
      && String(r.unit || '').trim()
    )
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
      setDraftInboundRows((prev) => ensureAtLeastTwoBlankRows(prev.map((r) => {
        if (!successKeySet.has(r.key)) return r
        return {
          ...r,
          status: '入库成功'
        }
      })))
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
                  <Table
                    rowKey={(r) => `${r.name}-${r.spec_model}-${r.location}-${r.unit}`}
                    loading={loading}
                    dataSource={stockItems}
                    scroll={{ x: 1600, y: tableY }}
                    pagination={false}
                    columns={[
                      { title: '名称', dataIndex: 'name', width: 180, fixed: 'left' },
                      { title: '规格型号', dataIndex: 'spec_model', width: 220 },
                      { title: '库位', dataIndex: 'location', width: 160, align: 'center' },
                      { title: '入库总数', dataIndex: 'inbound_total', width: 120, align: 'right', render: (v) => fmtIntPos(v) },
                      { title: '出库总数', dataIndex: 'outbound_total', width: 120, align: 'right', render: (v) => fmtIntPos(v) },
                      { title: '结余', dataIndex: 'balance', width: 120, align: 'right', render: (v) => fmtIntPos(v) },
                      { title: '单位', dataIndex: 'unit', width: 90, align: 'center' },
                      { title: '单价', dataIndex: 'unit_price', width: 130, align: 'right', render: (v) => fmtMoney(v) },
                      { title: '总额', dataIndex: 'total_amount', width: 130, align: 'right', render: (v) => fmtNum(v, 2) },
                      { title: '安全库存(月均)', dataIndex: 'safety_stock', width: 140, align: 'right', render: (v) => fmtIntPos(v) },
                      { title: '最大库存(3个月)', dataIndex: 'max_stock', width: 150, align: 'right', render: (v) => fmtIntPos(v) }
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
                    <Upload {...importUploadProps}>
                      <Button icon={<UploadOutlined />}>Excel导入</Button>
                    </Upload>
                    <Button icon={<DownloadOutlined />} onClick={downloadInboundTemplate}>下载导入模板</Button>
                  </Space>
                  <div className="border border-gray-200 rounded-lg p-2">
                    <Table
                      rowKey="key"
                      size="small"
                      rowSelection={{ selectedRowKeys: draftSelectedKeys, onChange: setDraftSelectedKeys }}
                      dataSource={draftInboundRows}
                      scroll={{ x: 1400, y: tableY }}
                      pagination={false}
                      columns={[
                        {
                          title: '名称',
                          dataIndex: 'name',
                          width: 180,
                          render: (_v, r: DraftInboundRow) => <Input value={r.name} onChange={(e) => patchDraftInboundRow(r.key, { name: e.target.value })} />
                        },
                        {
                          title: '规格型号',
                          dataIndex: 'spec_model',
                          width: 190,
                          render: (_v, r: DraftInboundRow) => <Input value={r.spec_model} onChange={(e) => patchDraftInboundRow(r.key, { spec_model: e.target.value })} />
                        },
                        {
                          title: '库位',
                          dataIndex: 'location',
                          width: 140,
                          render: (_v, r: DraftInboundRow) => <Input value={r.location} onChange={(e) => patchDraftInboundRow(r.key, { location: e.target.value })} />
                        },
                        {
                          title: '入库数量',
                          dataIndex: 'quantity',
                          width: 120,
                          render: (_v, r: DraftInboundRow) => <Input value={r.quantity ? String(r.quantity) : ''} onChange={(e) => patchDraftInboundRow(r.key, { quantity: normalizePositiveInt(e.target.value) })} />
                        },
                        {
                          title: '单位',
                          dataIndex: 'unit',
                          width: 90,
                          render: (_v, r: DraftInboundRow) => <Input value={r.unit} onChange={(e) => patchDraftInboundRow(r.key, { unit: e.target.value })} />
                        },
                        {
                          title: '单价',
                          dataIndex: 'unit_price',
                          width: 110,
                          render: (_v, r: DraftInboundRow) => <Input value={r.unit_price ? String(r.unit_price) : ''} onChange={(e) => patchDraftInboundRow(r.key, { unit_price: normalizePositiveMoney(e.target.value) })} />
                        },
                        {
                          title: '入库日期',
                          dataIndex: 'in_date',
                          width: 130,
                          render: (_v, r: DraftInboundRow) => <Input value={r.in_date} onChange={(e) => patchDraftInboundRow(r.key, { in_date: e.target.value })} />
                        },
                        {
                          title: '操作人',
                          dataIndex: 'operator',
                          width: 120,
                          render: (_v, r: DraftInboundRow) => <Input value={r.operator} onChange={(e) => patchDraftInboundRow(r.key, { operator: e.target.value })} />
                        },
                        { title: '状态', dataIndex: 'status', width: 120, align: 'center' as const }
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
                    <Popconfirm title="确认删除选中的入库记录？" onConfirm={() => handleBatchAction('inbound', 'delete')}>
                      <Button danger icon={<DeleteOutlined />}>删除</Button>
                    </Popconfirm>
                  </Space>
                  <div className="border border-gray-200 rounded-lg p-2">
                    <Table
                      rowKey="id"
                      loading={loading}
                      rowSelection={{ selectedRowKeys: inboundSelectedKeys, onChange: setInboundSelectedKeys }}
                      dataSource={inboundItems}
                      scroll={{ x: 1400, y: tableY }}
                      pagination={false}
                      columns={[
                        { title: '名称', dataIndex: 'name', width: 180, fixed: 'left' },
                        { title: '规格型号', dataIndex: 'spec_model', width: 190 },
                        { title: '库位', dataIndex: 'location', width: 140, align: 'center' },
                        { title: '入库数量', dataIndex: 'quantity', width: 120, align: 'right', render: (v) => fmtIntPos(v) },
                        { title: '单位', dataIndex: 'unit', width: 90, align: 'center' },
                        { title: '单价', dataIndex: 'unit_price', width: 110, align: 'right', render: (v) => fmtMoney(v) },
                        { title: '入库日期', dataIndex: 'in_date', width: 120, align: 'center' },
                        { title: '操作人', dataIndex: 'operator', width: 120, align: 'center' },
                        { title: '状态', dataIndex: 'status', width: 100, align: 'center' }
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
                    <Popconfirm title="确认删除选中的出库记录？" onConfirm={() => handleBatchAction('outbound', 'delete')}>
                      <Button danger icon={<DeleteOutlined />}>删除</Button>
                    </Popconfirm>
                  </Space>
                  <div className="border border-gray-200 rounded-lg p-2">
                    <Table
                      rowKey="id"
                      loading={loading}
                      rowSelection={{ selectedRowKeys: outboundSelectedKeys, onChange: setOutboundSelectedKeys }}
                      dataSource={outboundItems}
                      scroll={{ x: 1400, y: tableY }}
                      pagination={false}
                      columns={[
                        { title: '名称', dataIndex: 'name', width: 180, fixed: 'left' },
                        { title: '规格型号', dataIndex: 'spec_model', width: 190 },
                        { title: '库位', dataIndex: 'location', width: 140, align: 'center' },
                        { title: '出库数量', dataIndex: 'quantity', width: 120, align: 'right', render: (v) => fmtIntPos(v) },
                        { title: '单位', dataIndex: 'unit', width: 90, align: 'center' },
                        { title: '单价', dataIndex: 'unit_price', width: 110, align: 'right', render: (v) => fmtMoney(v) },
                        { title: '出库日期', dataIndex: 'out_date', width: 120, align: 'center' },
                        { title: '操作人', dataIndex: 'operator', width: 120, align: 'center' },
                        { title: '状态', dataIndex: 'status', width: 100, align: 'center' }
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
