import React from 'react'
import { Button, Card, InputNumber, Select, Space, Typography, Popconfirm, message } from 'antd'
import { LeftOutlined, PlusOutlined, ReloadOutlined, DeleteOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { fetchWithFallback } from '../utils/api'
import { useAuthStore } from '../stores/authStore'

const { Title, Text } = Typography

type StockRow = {
  name: string
  spec_model: string
  location: string
  balance: number
  unit: string
  unit_price: number
}

type IssueDraftRow = {
  key: string
  name?: string
  spec_model?: string
  location?: string
  quantity?: number
  unit?: string
  unit_price?: number
}

const fmtNum = (v: any, p = 2) => Number(v || 0).toFixed(p)

const StandardPartsIssue: React.FC = () => {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [loading, setLoading] = React.useState(false)
  const [stockItems, setStockItems] = React.useState<StockRow[]>([])
  const [issueRows, setIssueRows] = React.useState<IssueDraftRow[]>([{ key: `${Date.now()}` }])

  const loadStock = React.useCallback(async () => {
    setLoading(true)
    try {
      const resp = await fetchWithFallback('/api/standard-parts/stock-ledger')
      const json = await resp.json().catch(() => ({}))
      if (!resp.ok || json?.success === false) {
        throw new Error(String(json?.error || '加载库存失败'))
      }
      const items = (Array.isArray(json?.items) ? json.items : []).filter((x: any) => Number(x?.balance || 0) > 0)
      setStockItems(items)
    } catch (e: any) {
      message.error(e?.message || '加载库存失败')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    loadStock()
  }, [loadStock])

  const stockByName = React.useMemo(() => {
    const m = new Map<string, StockRow[]>()
    for (const row of stockItems) {
      if (!m.has(row.name)) m.set(row.name, [])
      m.get(row.name)!.push(row)
    }
    return m
  }, [stockItems])

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
        next.location = undefined
        next.unit = undefined
        next.unit_price = undefined
      }
      if (patch.spec_model !== undefined || patch.name !== undefined) {
        const matchedBySpec = listByName.filter((x) => x.spec_model === next.spec_model && x.balance > 0)
        if (matchedBySpec.length === 1) {
          next.location = matchedBySpec[0].location
          next.unit = matchedBySpec[0].unit
          next.unit_price = Number(matchedBySpec[0].unit_price || 0)
        }
      }
      if (patch.location !== undefined) {
        const found = listByName.find((x) => x.spec_model === next.spec_model && x.location === next.location)
        if (found) {
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
        tech_group: '',
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
      const resp = await fetchWithFallback('/api/standard-parts/outbound/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: payload })
      })
      const json = await resp.json().catch(() => ({}))
      if (!resp.ok || json?.success === false) {
        throw new Error(String(json?.error || '提交出库失败'))
      }
      message.success(`已完成 ${payload.length} 条标准件出库`)
      setIssueRows([{ key: `${Date.now()}` }])
      await loadStock()
    } catch (e: any) {
      message.error(e?.message || '提交出库失败')
    }
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="bg-white">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <Title level={2} className="mb-0">标准件出库模块</Title>
            <Space>
              <Button icon={<ReloadOutlined />} onClick={loadStock} loading={loading}>刷新</Button>
              <Button icon={<LeftOutlined />} onClick={() => navigate('/standard-parts')}>返回台账</Button>
            </Space>
          </div>
        </div>
        <div className="px-6 pb-6">
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            {issueRows.map((row, index) => {
              const byName = stockByName.get(String(row.name || '')) || []
              const specs = Array.from(new Set(byName.filter((x) => x.balance > 0).map((x) => x.spec_model)))
              const locations = byName
                .filter((x) => x.spec_model === row.spec_model && x.balance > 0)
                .map((x) => ({ value: x.location, label: `${x.location}（结余${fmtNum(x.balance, 2)}）` }))
              return (
                <Card
                  key={row.key}
                  size="small"
                  title={`出库项 ${index + 1}`}
                  extra={(
                    <Popconfirm title="确认删除该出库项？" onConfirm={() => removeIssueRow(row.key)}>
                      <Button danger icon={<DeleteOutlined />} disabled={issueRows.length <= 1}>删除该项</Button>
                    </Popconfirm>
                  )}
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <div className="mb-1 text-sm">名称</div>
                      <Select
                        showSearch
                        optionFilterProp="label"
                        style={{ width: '100%' }}
                        options={Array.from(new Set(stockItems.map((x) => x.name))).map((x) => ({ value: x, label: x }))}
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
                      <Space style={{ width: '100%' }} align="center">
                        <InputNumber
                          min={0}
                          style={{ width: '100%' }}
                          value={row.quantity}
                          onChange={(v) => patchIssueRow(row.key, { quantity: Number(v || 0) })}
                        />
                        <Text>{row.unit || ''}</Text>
                      </Space>
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
        </div>
      </div>
    </div>
  )
}

export default StandardPartsIssue
