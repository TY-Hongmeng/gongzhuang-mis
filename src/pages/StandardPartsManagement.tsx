import React from 'react'
import {
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tabs,
  Typography,
  Upload,
  message
} from 'antd'
import { LeftOutlined, PlusOutlined, ReloadOutlined, UploadOutlined, DeleteOutlined } from '@ant-design/icons'
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
  tech_group: string
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
  tech_group: string
  location: string
  quantity: number
  unit: string
  unit_price: number
  in_date?: string
  out_date?: string
  operator: string
  status: string
}

type ImportRow = {
  key: string
  name: string
  spec_model: string
  tech_group: string
  location: string
  quantity: number
  unit: string
  unit_price: number
  in_date: string
  operator: string
  status: string
}

type IssueDraftRow = {
  key: string
  name?: string
  spec_model?: string
  tech_group?: string
  location?: string
  quantity?: number
  unit?: string
  unit_price?: number
}

const fmtNum = (v: any, p = 2) => Number(v || 0).toFixed(p)

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
  const [importOpen, setImportOpen] = React.useState(false)
  const [importRows, setImportRows] = React.useState<ImportRow[]>([])
  const [importSelectedKeys, setImportSelectedKeys] = React.useState<React.Key[]>([])
  const [issueRows, setIssueRows] = React.useState<IssueDraftRow[]>([{ key: `${Date.now()}` }])
  const [inboundForm] = Form.useForm()

  const loadAll = React.useCallback(async () => {
    setLoading(true)
    try {
      const [stockRes, inRes, outRes] = await Promise.all([
        fetchWithFallback('/api/standard-parts/stock-ledger'),
        fetchWithFallback('/api/standard-parts/inbound'),
        fetchWithFallback('/api/standard-parts/outbound')
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
  }, [])

  React.useEffect(() => {
    loadAll()
  }, [loadAll])

  const stockByName = React.useMemo(() => {
    const m = new Map<string, StockRow[]>()
    for (const row of stockItems) {
      if (!m.has(row.name)) m.set(row.name, [])
      m.get(row.name)!.push(row)
    }
    return m
  }, [stockItems])

  const autoFillInboundPrice = () => {
    const vals = inboundForm.getFieldsValue()
    const name = String(vals.name || '').trim()
    const spec = String(vals.spec_model || '').trim()
    const location = String(vals.location || '').trim()
    if (!name || !spec) return
    const matched = stockItems.find((s) =>
      s.name === name && s.spec_model === spec && (!location || s.location === location)
    )
    if (!matched) return
    if (!vals.unit && matched.unit) inboundForm.setFieldValue('unit', matched.unit)
    if ((!vals.unit_price || Number(vals.unit_price) <= 0) && Number(matched.unit_price) > 0) {
      inboundForm.setFieldValue('unit_price', Number(matched.unit_price))
    }
    if (!vals.tech_group && matched.tech_group) inboundForm.setFieldValue('tech_group', matched.tech_group)
    if (!vals.location && matched.location) inboundForm.setFieldValue('location', matched.location)
  }

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

  const handleInboundCreate = async (vals: any) => {
    try {
      const row = {
        ...vals,
        quantity: Number(vals.quantity || 0),
        unit_price: Number(vals.unit_price || 0),
        in_date: vals.in_date ? vals.in_date.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
        operator: String(vals.operator || user?.real_name || ''),
        status: String(vals.status || '正常')
      }
      await submitInbound([row])
      message.success('入库成功')
      inboundForm.resetFields()
      inboundForm.setFieldsValue({
        in_date: dayjs(),
        operator: user?.real_name || '',
        status: '正常'
      })
      await loadAll()
    } catch (e: any) {
      message.error(e?.message || '入库失败')
    }
  }

  const handleBatchAction = async (kind: 'inbound' | 'outbound', action: 'delete' | 'return') => {
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
      message.success(action === 'delete' ? '删除成功' : '退库成功')
      if (kind === 'inbound') setInboundSelectedKeys([])
      else setOutboundSelectedKeys([])
      await loadAll()
    } catch (e: any) {
      message.error(e?.message || '操作失败')
    }
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
          const techGroup = String(r['技术组'] || r['tech_group'] || '').trim()
          const locationRaw = String(r['库位'] || r['location'] || '').trim()
          const location = locationRaw || (techGroup ? `${techGroup}库` : '')
          return {
            key: `${Date.now()}-${i}`,
            name,
            spec_model: spec,
            tech_group: techGroup,
            location,
            quantity: Number(r['入库数量'] || r['quantity'] || 0),
            unit: String(r['单位'] || r['unit'] || '').trim(),
            unit_price: Number(r['单价'] || r['unit_price'] || 0),
            in_date: String(r['入库日期'] || r['in_date'] || dayjs().format('YYYY-MM-DD')).trim(),
            operator: String(r['操作人'] || r['operator'] || user?.real_name || '').trim(),
            status: String(r['状态'] || r['status'] || '正常').trim()
          } as ImportRow
        }).filter((x: ImportRow) => x.name && x.spec_model && x.location && x.unit && x.quantity > 0)
        setImportRows(parsed)
        setImportSelectedKeys(parsed.map((r: ImportRow) => r.key))
        setImportOpen(true)
      } catch (e: any) {
        message.error(e?.message || '解析Excel失败')
      }
      return false
    }
  }

  const handleImportInbound = async () => {
    const selected = importRows.filter((r) => importSelectedKeys.includes(r.key))
    if (selected.length === 0) {
      message.warning('请先勾选要入库的数据')
      return
    }
    try {
      await submitInbound(selected)
      message.success(`已入库 ${selected.length} 条`)
      setImportOpen(false)
      setImportRows([])
      setImportSelectedKeys([])
      await loadAll()
    } catch (e: any) {
      message.error(e?.message || '导入入库失败')
    }
  }

  const addIssueRow = () => {
    setIssueRows((prev) => [...prev, { key: `${Date.now()}-${Math.random()}` }])
  }

  const removeIssueRow = (key: string) => {
    setIssueRows((prev) => prev.filter((r) => r.key !== key))
  }

  const patchIssueRow = (key: string, patch: Partial<IssueDraftRow>) => {
    setIssueRows((prev) => prev.map((r) => {
      if (r.key !== key) return r
      const next = { ...r, ...patch }
      const listByName = stockByName.get(String(next.name || '')) || []
      if (patch.name !== undefined) {
        next.spec_model = undefined
        next.tech_group = undefined
        next.location = undefined
        next.unit = undefined
        next.unit_price = undefined
      }
      if (patch.spec_model !== undefined || patch.name !== undefined) {
        const matchedBySpec = listByName.filter((x) => x.spec_model === next.spec_model && x.balance > 0)
        if (matchedBySpec.length === 1) {
          next.tech_group = matchedBySpec[0].tech_group
          next.location = matchedBySpec[0].location
          next.unit = matchedBySpec[0].unit
          next.unit_price = Number(matchedBySpec[0].unit_price || 0)
        }
      }
      if (patch.location !== undefined) {
        const found = listByName.find((x) => x.spec_model === next.spec_model && x.location === next.location)
        if (found) {
          next.tech_group = found.tech_group
          next.unit = found.unit
          next.unit_price = Number(found.unit_price || 0)
        }
      }
      return next
    }))
  }

  const submitIssueBatch = async () => {
    try {
      const payload = issueRows.map((r) => ({
        name: String(r.name || '').trim(),
        spec_model: String(r.spec_model || '').trim(),
        tech_group: String(r.tech_group || '').trim(),
        location: String(r.location || '').trim(),
        quantity: Number(r.quantity || 0),
        unit: String(r.unit || '').trim(),
        unit_price: Number(r.unit_price || 0),
        out_date: dayjs().format('YYYY-MM-DD'),
        operator: user?.real_name || '',
        status: '正常'
      }))
      if (payload.some((r) => !r.name || !r.spec_model || !r.location || !r.unit || r.quantity <= 0)) {
        message.warning('请先完整填写所有出库信息')
        return
      }
      await submitOutbound(payload)
      message.success(`已完成 ${payload.length} 条标准件出库`)
      setIssueRows([{ key: `${Date.now()}` }])
      await loadAll()
      setActiveTab('outbound')
    } catch (e: any) {
      message.error(e?.message || '提交出库失败')
    }
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="bg-white">
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
                <Table
                  rowKey={(r) => `${r.name}-${r.spec_model}-${r.tech_group}-${r.location}-${r.unit}`}
                  loading={loading}
                  dataSource={stockItems}
                  scroll={{ x: 1700 }}
                  columns={[
                    { title: '名称', dataIndex: 'name', width: 160, fixed: 'left' },
                    { title: '规格型号', dataIndex: 'spec_model', width: 180 },
                    { title: '技术组', dataIndex: 'tech_group', width: 120, align: 'center' },
                    { title: '库位', dataIndex: 'location', width: 140, align: 'center' },
                    { title: '入库总数', dataIndex: 'inbound_total', width: 110, align: 'right', render: (v) => fmtNum(v, 2) },
                    { title: '出库总数', dataIndex: 'outbound_total', width: 110, align: 'right', render: (v) => fmtNum(v, 2) },
                    { title: '结余', dataIndex: 'balance', width: 110, align: 'right', render: (v) => fmtNum(v, 2) },
                    { title: '单位', dataIndex: 'unit', width: 80, align: 'center' },
                    { title: '单价', dataIndex: 'unit_price', width: 110, align: 'right', render: (v) => fmtNum(v, 4) },
                    { title: '总额', dataIndex: 'total_amount', width: 120, align: 'right', render: (v) => fmtNum(v, 2) },
                    { title: '安全库存(月均)', dataIndex: 'safety_stock', width: 130, align: 'right', render: (v) => fmtNum(v, 2) },
                    { title: '最大库存(3个月)', dataIndex: 'max_stock', width: 140, align: 'right', render: (v) => fmtNum(v, 2) }
                  ]}
                />
              )
            },
            {
              key: 'inbound',
              label: '入库台账',
              children: (
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <Card size="small" title="新增入库">
                    <Form
                      form={inboundForm}
                      layout="vertical"
                      initialValues={{ in_date: dayjs(), operator: user?.real_name || '', status: '正常' }}
                      onFinish={handleInboundCreate}
                    >
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
                          <Input onBlur={autoFillInboundPrice} />
                        </Form.Item>
                        <Form.Item name="spec_model" label="规格型号" rules={[{ required: true, message: '请输入规格型号' }]}>
                          <Input onBlur={autoFillInboundPrice} />
                        </Form.Item>
                        <Form.Item name="tech_group" label="技术组" rules={[{ required: true, message: '请输入技术组' }]}>
                          <Input placeholder="例如：铝铸技术组" />
                        </Form.Item>
                        <Form.Item name="location" label="库位" rules={[{ required: true, message: '请输入库位' }]}>
                          <Input placeholder="例如：铝铸库" onBlur={autoFillInboundPrice} />
                        </Form.Item>
                        <Form.Item name="quantity" label="入库数量" rules={[{ required: true, message: '请输入入库数量' }]}>
                          <InputNumber min={0} style={{ width: '100%' }} />
                        </Form.Item>
                        <Form.Item name="unit" label="单位" rules={[{ required: true, message: '请输入单位' }]}>
                          <Input onBlur={autoFillInboundPrice} />
                        </Form.Item>
                        <Form.Item name="unit_price" label="单价">
                          <InputNumber min={0} precision={4} style={{ width: '100%' }} />
                        </Form.Item>
                        <Form.Item name="in_date" label="入库日期">
                          <DatePicker style={{ width: '100%' }} />
                        </Form.Item>
                        <Form.Item name="operator" label="操作人">
                          <Input />
                        </Form.Item>
                        <Form.Item name="status" label="状态">
                          <Input />
                        </Form.Item>
                      </div>
                      <Space>
                        <Button type="primary" htmlType="submit">入库</Button>
                        <Upload {...importUploadProps}>
                          <Button icon={<UploadOutlined />}>Excel导入</Button>
                        </Upload>
                      </Space>
                    </Form>
                  </Card>
                  <Space>
                    <Button onClick={() => handleBatchAction('inbound', 'return')}>退库</Button>
                    <Popconfirm title="确认删除选中的入库记录？" onConfirm={() => handleBatchAction('inbound', 'delete')}>
                      <Button danger icon={<DeleteOutlined />}>删除</Button>
                    </Popconfirm>
                  </Space>
                  <Table
                    rowKey="id"
                    loading={loading}
                    rowSelection={{ selectedRowKeys: inboundSelectedKeys, onChange: setInboundSelectedKeys }}
                    dataSource={inboundItems}
                    scroll={{ x: 1500 }}
                    columns={[
                      { title: '名称', dataIndex: 'name', width: 160, fixed: 'left' },
                      { title: '规格型号', dataIndex: 'spec_model', width: 180 },
                      { title: '技术组', dataIndex: 'tech_group', width: 120, align: 'center' },
                      { title: '库位', dataIndex: 'location', width: 140, align: 'center' },
                      { title: '入库数量', dataIndex: 'quantity', width: 100, align: 'right', render: (v) => fmtNum(v, 2) },
                      { title: '单位', dataIndex: 'unit', width: 80, align: 'center' },
                      { title: '单价', dataIndex: 'unit_price', width: 100, align: 'right', render: (v) => fmtNum(v, 4) },
                      { title: '入库日期', dataIndex: 'in_date', width: 120, align: 'center' },
                      { title: '操作人', dataIndex: 'operator', width: 120, align: 'center' },
                      { title: '状态', dataIndex: 'status', width: 100, align: 'center' }
                    ]}
                  />
                </Space>
              )
            },
            {
              key: 'outbound',
              label: '出库台账',
              children: (
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <Space>
                    <Button onClick={() => handleBatchAction('outbound', 'return')}>退库</Button>
                    <Popconfirm title="确认删除选中的出库记录？" onConfirm={() => handleBatchAction('outbound', 'delete')}>
                      <Button danger icon={<DeleteOutlined />}>删除</Button>
                    </Popconfirm>
                  </Space>
                  <Table
                    rowKey="id"
                    loading={loading}
                    rowSelection={{ selectedRowKeys: outboundSelectedKeys, onChange: setOutboundSelectedKeys }}
                    dataSource={outboundItems}
                    scroll={{ x: 1500 }}
                    columns={[
                      { title: '名称', dataIndex: 'name', width: 160, fixed: 'left' },
                      { title: '规格型号', dataIndex: 'spec_model', width: 180 },
                      { title: '技术组', dataIndex: 'tech_group', width: 120, align: 'center' },
                      { title: '库位', dataIndex: 'location', width: 140, align: 'center' },
                      { title: '出库数量', dataIndex: 'quantity', width: 100, align: 'right', render: (v) => fmtNum(v, 2) },
                      { title: '单位', dataIndex: 'unit', width: 80, align: 'center' },
                      { title: '单价', dataIndex: 'unit_price', width: 100, align: 'right', render: (v) => fmtNum(v, 4) },
                      { title: '出库日期', dataIndex: 'out_date', width: 120, align: 'center' },
                      { title: '操作人', dataIndex: 'operator', width: 120, align: 'center' },
                      { title: '状态', dataIndex: 'status', width: 100, align: 'center' }
                    ]}
                  />
                </Space>
              )
            },
            {
              key: 'issue',
              label: '出库模块',
              children: (
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  {issueRows.map((row, index) => {
                    const byName = stockByName.get(String(row.name || '')) || []
                    const specs = Array.from(new Set(byName.filter((x) => x.balance > 0).map((x) => x.spec_model)))
                    const locations = byName
                      .filter((x) => x.spec_model === row.spec_model && x.balance > 0)
                      .map((x) => ({ value: x.location, label: `${x.location}（结余${fmtNum(x.balance, 2)}）` }))
                    return (
                      <Card key={row.key} size="small" title={`出库项 ${index + 1}`}>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                          <div>
                            <div className="mb-1 text-sm">名称</div>
                            <Select
                              showSearch
                              optionFilterProp="label"
                              style={{ width: '100%' }}
                              options={Array.from(new Set(stockItems.filter((x) => x.balance > 0).map((x) => x.name))).map((x) => ({ value: x, label: x }))}
                              value={row.name}
                              onChange={(v) => patchIssueRow(row.key, { name: v })}
                            />
                          </div>
                          <div>
                            <div className="mb-1 text-sm">型号规格</div>
                            <Select
                              showSearch
                              optionFilterProp="label"
                              style={{ width: '100%' }}
                              options={specs.map((x) => ({ value: x, label: x }))}
                              value={row.spec_model}
                              onChange={(v) => patchIssueRow(row.key, { spec_model: v })}
                            />
                          </div>
                          <div>
                            <div className="mb-1 text-sm">库位</div>
                            <Select
                              showSearch
                              optionFilterProp="label"
                              style={{ width: '100%' }}
                              options={locations}
                              value={row.location}
                              onChange={(v) => patchIssueRow(row.key, { location: v })}
                            />
                          </div>
                          <div>
                            <div className="mb-1 text-sm">出库数量</div>
                            <InputNumber
                              min={0}
                              style={{ width: '100%' }}
                              value={row.quantity}
                              onChange={(v) => patchIssueRow(row.key, { quantity: Number(v || 0) })}
                            />
                          </div>
                          <div>
                            <div className="mb-1 text-sm">技术组</div>
                            <Input value={row.tech_group} readOnly />
                          </div>
                          <div>
                            <div className="mb-1 text-sm">单位</div>
                            <Input value={row.unit} readOnly />
                          </div>
                          <div>
                            <div className="mb-1 text-sm">单价</div>
                            <Input value={row.unit_price ? fmtNum(row.unit_price, 4) : ''} readOnly />
                          </div>
                          <div className="flex items-end">
                            <Popconfirm title="确认删除该出库项？" onConfirm={() => removeIssueRow(row.key)}>
                              <Button danger icon={<DeleteOutlined />} disabled={issueRows.length <= 1}>删除该项</Button>
                            </Popconfirm>
                          </div>
                        </div>
                      </Card>
                    )
                  })}
                  <Space>
                    <Button icon={<PlusOutlined />} onClick={addIssueRow}>新增一项标准件</Button>
                    <Button type="primary" onClick={submitIssueBatch}>一次性提交出库</Button>
                  </Space>
                </Space>
              )
            }
          ]} />
        </div>
      </div>

      <Modal
        title="Excel导入预览（勾选后入库）"
        open={importOpen}
        onCancel={() => setImportOpen(false)}
        onOk={handleImportInbound}
        width={1200}
      >
        <Table
          rowKey="key"
          size="small"
          rowSelection={{ selectedRowKeys: importSelectedKeys, onChange: setImportSelectedKeys }}
          dataSource={importRows}
          scroll={{ x: 1200, y: 400 }}
          columns={[
            { title: '名称', dataIndex: 'name', width: 160 },
            { title: '规格型号', dataIndex: 'spec_model', width: 170 },
            { title: '技术组', dataIndex: 'tech_group', width: 120 },
            { title: '库位', dataIndex: 'location', width: 120 },
            { title: '入库数量', dataIndex: 'quantity', width: 100, align: 'right' },
            { title: '单位', dataIndex: 'unit', width: 80, align: 'center' },
            { title: '单价', dataIndex: 'unit_price', width: 100, align: 'right' },
            { title: '入库日期', dataIndex: 'in_date', width: 120, align: 'center' },
            { title: '操作人', dataIndex: 'operator', width: 120, align: 'center' },
            { title: '状态', dataIndex: 'status', width: 100, align: 'center' }
          ]}
          pagination={{ pageSize: 20 }}
        />
      </Modal>
    </div>
  )
}

export default StandardPartsManagement
