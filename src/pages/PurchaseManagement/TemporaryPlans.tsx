import React, { useEffect, useMemo, useState } from 'react'
import { Table, Space, Button, Checkbox, DatePicker, message, Segmented, Input, Card } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import EditableCell from '../../components/EditableCell'
import { updateChildPurchaseStatus, updatePartPurchaseStatus } from '../../services/toolingService'
import { fetchWithFallback } from '../../utils/api'
import { useAuthStore } from '../../stores/authStore'

interface TempItem {
  id: string
  inventory_number: string
  project_name: string
  part_name: string
  part_quantity: number
  unit: string
  model?: string
  tech_group?: string
  supplier?: string
  required_date?: string
  production_unit?: string
  applicant?: string
  purchaser?: string
  arrival_date?: string
  standard_inbound_done?: boolean
  standard_inbound_at?: string
  standard_inbound_ref_id?: string
  standard_inbound_ref_sig?: string
}

interface TempGroup {
  code: string
  monthKey: string
  month_key?: string
  id?: string
  createdAt: string
  created_at?: string
  items: TempItem[]
}

// 从数据库读取临时计划
const fetchPlansFromDB = async (): Promise<TempGroup[]> => {
  try {
    const res = await fetchWithFallback('/api/temporary-plan-groups', { method: 'GET' })
    if (res.ok) {
      const json = await res.json()
      const dbData = json.data || []
      // 将数据库字段映射为前端格式
      return dbData.map((g: any) => ({
        code: g.code || '',
        monthKey: g.month_key || g.monthKey || '',
        month_key: g.month_key || '',
        id: g.id,
        createdAt: g.created_at || g.createdAt || '',
        items: (g.items || []).map((it: any) => ({
          ...it,
          purchaser: it.purchaser || '',
          arrival_date: it.arrival_date || '',
          standard_inbound_done: it.standard_inbound_done || false
        }))
      }))
    }
  } catch (e) {
    console.error('从数据库读取临时计划失败:', e)
  }
  return []
}

const resolveInboundLocationByGroup = (rawGroup: string) => {
  const g = String(rawGroup || '').trim()
  if (!g) return ''
  const base = g.includes('技术组') ? g.replace(/技术组/g, '').trim() : g
  if (!base) return ''
  if (base.endsWith('库')) return base
  return `${base}库`
}

const buildInboundRefSig = (raw: {
  name: any
  spec_model: any
  location: any
  quantity: any
  unit: any
  in_date: any
  operator: any
}) => {
  const norm = (v: any) => String(v || '').trim()
  const qty = Number(raw.quantity || 0)
  return [
    norm(raw.name),
    norm(raw.spec_model),
    norm(raw.location),
    Number.isFinite(qty) ? String(qty) : '0',
    norm(raw.unit),
    norm(raw.in_date),
    norm(raw.operator)
  ].join('|')
}

export default function TemporaryPlans() {
  const { user } = useAuthStore()
  const [groups, setGroups] = useState<TempGroup[]>([])
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [inboundSubmittingKeys, setInboundSubmittingKeys] = useState<string[]>([])
  const [arrivalFilter, setArrivalFilter] = useState<'全部' | '已到' | '未到'>('未到')
  const [filterName, setFilterName] = useState('')
  const [filterModel, setFilterModel] = useState('')
  const [filterProject, setFilterProject] = useState('')
  const [filterApplicant, setFilterApplicant] = useState('')

  const syncGroupItems = async (groupId: string | undefined, items: TempItem[]) => {
    if (!groupId) return
    const res = await fetchWithFallback(`/api/temporary-plan-groups/${groupId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items })
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      throw new Error(String(json?.error || '同步临时计划失败'))
    }
    window.dispatchEvent(new Event('temporary_plans_updated'))
  }

  // 初始化和刷新时从数据库读取
  useEffect(() => {
    fetchPlansFromDB().then(data => {
      setGroups(data)
    })
    const handler = () => fetchPlansFromDB().then(data => setGroups(data))
    window.addEventListener('temporary_plans_updated', handler as any)
    return () => {
      window.removeEventListener('temporary_plans_updated', handler as any)
    }
  }, [])

  const flatData = useMemo(() => {
    const allData = groups.flatMap(g => g.items.map(it => ({ ...it, group_code: g.code, id: `${g.code}:${it.id}` })))
    let filtered = allData
    if (arrivalFilter === '全部') {
      filtered = allData
    } else if (arrivalFilter === '已到') {
      filtered = allData.filter(r => !!r.arrival_date)
    } else {
      filtered = allData.filter(r => !r.arrival_date)
    }
    if (filterName.trim()) {
      const keyword = filterName.trim().toLowerCase()
      filtered = filtered.filter(r => (r.part_name || '').toLowerCase().includes(keyword))
    }
    if (filterModel.trim()) {
      const keyword = filterModel.trim().toLowerCase()
      filtered = filtered.filter(r => (r.model || '').toLowerCase().includes(keyword))
    }
    if (filterProject.trim()) {
      const keyword = filterProject.trim().toLowerCase()
      filtered = filtered.filter(r => (r.project_name || '').toLowerCase().includes(keyword))
    }
    if (filterApplicant.trim()) {
      const keyword = filterApplicant.trim().toLowerCase()
      filtered = filtered.filter(r => (r.applicant || '').toLowerCase().includes(keyword))
    }
    return filtered
  }, [groups, arrivalFilter, filterName, filterModel, filterProject, filterApplicant])

  const handleSavePurchaser = (rowId: string, _key: string, value: string) => {
    const [code, origId] = String(rowId).split(':')
    setGroups(prev => {
      const next = prev.map(g => {
        if (g.code !== code) return g
        const items = g.items.map(it => it.id === origId ? { ...it, purchaser: value } : it)
        if (g.id) {
          syncGroupItems(g.id, items).catch(e => {
            console.error('同步采购员失败:', e)
            message.error('同步采购员失败')
          })
        }
        return { ...g, items }
      })
      const group = next.find(g => g.code === code)
      const item = group?.items.find(it => it.id === origId)
      const pid = (item as any)?.part_id
      const cid = (item as any)?.child_item_id
      const nextStatus = value && value.trim() ? '采购中' : '审批中'
      if (pid) updatePartPurchaseStatus(String(pid), nextStatus)
      if (cid) updateChildPurchaseStatus(String(cid), nextStatus)
      return next
    })
  }

  const handleToggleArrived = (rowId: string, checked: boolean) => {
    const [code, origId] = String(rowId).split(':')
    setGroups(prev => {
      const next = prev.map(g => {
        if (g.code !== code) return g
        const items = g.items.map(it => it.id === origId ? { ...it, arrival_date: checked ? dayjs().format('YYYY-MM-DD') : '' } : it)
        if (g.id) {
          syncGroupItems(g.id, items).catch(e => {
            console.error('同步到货状态失败:', e)
            message.error('同步到货状态失败')
          })
        }
        return { ...g, items }
      })
      // 状态：已到货/审批中
      const group = next.find(g => g.code === code)
      const item = group?.items.find(it => it.id === origId)
      const pid = (item as any)?.part_id
      const cid = (item as any)?.child_item_id
      const newStatus = checked ? '已到货' : ((item as any)?.purchaser ? '采购中' : '审批中')
      if (pid) updatePartPurchaseStatus(String(pid), newStatus)
      if (cid) updateChildPurchaseStatus(String(cid), newStatus)
      return next
    })
  }

  const handleChangeArrivalDate = (rowId: string, value: any) => {
    const [code, origId] = String(rowId).split(':')
    const str = value ? dayjs(value).format('YYYY-MM-DD') : ''
    setGroups(prev => {
      const next = prev.map(g => {
        if (g.code !== code) return g
        const items = g.items.map(it => it.id === origId ? { ...it, arrival_date: str } : it)
        if (g.id) {
          syncGroupItems(g.id, items).catch(e => {
            console.error('同步到货日期失败:', e)
            message.error('同步到货日期失败')
          })
        }
        return { ...g, items }
      })
      // 状态更新：有日期则已到货，无日期则根据是否有采购员决定
      const group = next.find(g => g.code === code)
      const item = group?.items.find(it => it.id === origId)
      const pid = (item as any)?.part_id
      const cid = (item as any)?.child_item_id
      const newStatus = str ? '已到货' : ((item as any)?.purchaser ? '采购中' : '审批中')
      if (pid) updatePartPurchaseStatus(String(pid), newStatus)
      if (cid) updateChildPurchaseStatus(String(cid), newStatus)
      return next
    })
  }

  const handleToggleInbound = async (rowId: string, checked: boolean) => {
    if (!checked) {
      message.info('已入库数据不支持取消勾选')
      return
    }
    const key = String(rowId || '')
    const [code, origId] = key.split(':')
    const group = groups.find((g) => g.code === code)
    const item = group?.items.find((it) => it.id === origId)
    if (!item) {
      message.error('未找到对应数据')
      return
    }
    if (item.standard_inbound_done) return
    if (inboundSubmittingKeys.includes(key)) return

    const name = String(item.part_name || '').trim()
    const specModel = String(item.model || '').trim()
    const qty = Number(item.part_quantity || 0)
    const unit = String(item.unit || '').trim() || '件'
    const techGroup = String((item as any).tech_group || item.production_unit || '').trim()
    const location = resolveInboundLocationByGroup(techGroup) || '临时计划库'
    const operator = String((user as any)?.real_name || '').trim()
    const userId = String((user as any)?.id || '').trim()
    const inDate = String(item.arrival_date || dayjs().format('YYYY-MM-DD'))

    if (!name || !specModel || !unit || !location || qty <= 0) {
      message.error('入库失败：名称/型号/数量/单位/库位需完整且数量大于0')
      return
    }
    if (!operator) {
      message.error('入库失败：缺少当前登录用户信息')
      return
    }

    setInboundSubmittingKeys((prev) => [...prev, key])
    try {
      const resp = await fetchWithFallback('/api/standard-parts/inbound/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operator,
          userId,
          items: [{
            name,
            spec_model: specModel,
            location,
            quantity: qty,
            unit,
            unit_price: 0,
            in_date: inDate,
            operator,
            status: '正常'
          }]
        })
      })
      const json = await resp.json().catch(() => ({} as any))
      if (!resp.ok || !json?.success) {
        message.error(String(json?.error || '入库失败'))
        return
      }
      const inserted = Array.isArray(json?.items) ? json.items[0] : null
      const inboundRefId = String((inserted as any)?.id || '').trim()
      const inboundRefSig = buildInboundRefSig({
        name,
        spec_model: specModel,
        location,
        quantity: qty,
        unit,
        in_date: inDate,
        operator
      })
      setGroups((prev) => {
        const next = prev.map((g) => {
          if (g.code !== code) return g
          const items = g.items.map((it) => {
            if (it.id !== origId) return it
            return {
              ...it,
              standard_inbound_done: true,
              standard_inbound_at: dayjs().format('YYYY-MM-DD HH:mm:ss'),
              standard_inbound_ref_id: inboundRefId,
              standard_inbound_ref_sig: inboundRefSig
            }
          })
          if (g.id) {
            syncGroupItems(g.id, items).catch(e => {
              console.error('同步入库状态失败:', e)
              message.error('同步入库状态失败')
            })
          }
          return { ...g, items }
        })
        return next
      })
      message.success('已入库并同步到标准件入库台账')
    } catch (e: any) {
      message.error(String(e?.message || '入库失败'))
    } finally {
      setInboundSubmittingKeys((prev) => prev.filter((k) => k !== key))
    }
  }

  // 动态生成项目名称和提交人选项
  const projectNameOptions = useMemo(() => {
    const set = new Set<string>()
    groups.forEach(g => g.items.forEach(it => {
      const v = String(it.project_name || '').trim()
      if (v) set.add(v)
    }))
    return Array.from(set).map(v => ({ value: v, label: v }))
  }, [groups])

  const applicantOptions = useMemo(() => {
    const set = new Set<string>()
    groups.forEach(g => g.items.forEach(it => {
      const v = String(it.applicant || '').trim()
      if (v) set.add(v)
    }))
    return Array.from(set).map(v => ({ value: v, label: v }))
  }, [groups])

  return (
    <div style={{ padding: '16px 0', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Card style={{ marginBottom: 16, flexShrink: 0 }}>
        <Space size="middle" wrap>
          <Input
            placeholder="名称"
            value={filterName}
            onChange={(e) => setFilterName(e.target.value ?? '')}
            style={{ width: 140 }}
            allowClear
          />
          <Input
            placeholder="型号"
            value={filterModel}
            onChange={(e) => setFilterModel(e.target.value ?? '')}
            style={{ width: 140 }}
            allowClear
          />
          <Select
            placeholder="项目名称"
            value={filterProject || undefined}
            onChange={(v) => setFilterProject(v ?? '')}
            options={projectNameOptions}
            style={{ width: 150 }}
            allowClear
            showSearch
          />
          <Select
            placeholder="提交人"
            value={filterApplicant || undefined}
            onChange={(v) => setFilterApplicant(v ?? '')}
            options={applicantOptions}
            style={{ width: 120 }}
            allowClear
            showSearch
          />
          <Segmented
            value={arrivalFilter}
            onChange={(v) => setArrivalFilter(v as any)}
            options={['全部', '已到', '未到']}
          />
          <Button
            type="primary"
            icon={<ReloadOutlined />}
            onClick={() => {
              fetchPlansFromDB().then(data => setGroups(data))
              message.success('刷新成功')
            }}
          >
            刷新
          </Button>
        </Space>
      </Card>
      <div className="flex items-center justify-between mb-4" style={{ flexShrink: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 16 }}>临时计划</div>
        <Space>
          <Button onClick={async () => {
            if (selectedRowKeys.length === 0) { message.warning('请选择需要回退的项'); return }
            const keys = selectedRowKeys.map(k => String(k))
            const groupsToDelete: string[] = []
            const next = groups.map(g => ({
              ...g,
              items: g.items.filter(it => !keys.includes(`${g.code}:${it.id}`))
            })).filter(g => {
              if (g.items.length === 0) {
                if (g.id) groupsToDelete.push(g.id)
                return false
              }
              return true
            })
            try {
              const updatePromises = next
                .filter(g => g.id && groups.some(old => old.id === g.id && old.items.length !== g.items.length))
                .map(g => syncGroupItems(g.id, g.items))
              await Promise.all(updatePromises)
              if (groupsToDelete.length > 0) {
                const resp = await fetchWithFallback('/api/temporary-plan-groups/batch-delete', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ ids: groupsToDelete })
                })
                const json = await resp.json().catch(() => ({}))
                if (!resp.ok || json?.success === false) {
                  throw new Error(String(json?.error || '删除临时计划分组失败'))
                }
              }
              groups.forEach(g => g.items.forEach(it => {
                const rowKey = `${g.code}:${it.id}`
                if (keys.includes(rowKey)) {
                  const pid = (it as any).part_id
                  const cid = (it as any).child_item_id
                  if (pid) updatePartPurchaseStatus(String(pid), '提计划')
                  if (cid) updateChildPurchaseStatus(String(cid), '提计划')
                }
              }))
              setGroups(next)
              window.dispatchEvent(new Event('temporary_plans_updated'))
              window.dispatchEvent(new Event('status_updated'))
              message.success('已回退选中项')
            } catch (e: any) {
              message.error(String(e?.message || '回退失败'))
            }
            setSelectedRowKeys([])
          }}>回退</Button>
        </Space>
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>
      <Table
        rowKey={(r: any) => r.id}
        rowSelection={{ selectedRowKeys, onChange: (keys) => setSelectedRowKeys(keys) }}
        dataSource={flatData}
        pagination={false}
        bordered={false}
        scroll={{ y: 'calc(100% - 10px)' }}
        columns={[
          { title: '分组编码', dataIndex: 'group_code', width: 100 },
          { title: '名称', dataIndex: 'part_name', width: 180 },
          { title: '型号', dataIndex: 'model', width: 140, render: (t) => t || '-' },
          {
            title: '数量',
            dataIndex: 'part_quantity',
            width: 140,
            render: (_: any, rec: any) => `${rec.part_quantity ?? 0}${rec.unit ? ' ' + rec.unit : ' 件'}`
          },
          { title: '项目名称', dataIndex: 'project_name', width: 180 },
          { title: '投产单位', dataIndex: 'production_unit', width: 140, render: (t) => t || '-' },
          { title: '需求日期', dataIndex: 'required_date', width: 120, render: (t) => t || '-' },
          { title: '提交人', dataIndex: 'applicant', width: 120, render: (t) => t || '-' },
          {
            title: '采购员',
            dataIndex: 'purchaser',
            width: 140,
            render: (text: string, record: any) => (
              <EditableCell value={text} record={record} dataIndex={'purchaser' as any} onSave={handleSavePurchaser} />
            )
          },
          {
            title: '到货日期',
            dataIndex: 'arrival_date',
            width: 220,
            render: (_text: string, record: any) => (
              <Space>
                <Checkbox checked={!!record.arrival_date} onChange={(e) => handleToggleArrived(record.id, e.target.checked)} />
                <DatePicker
                  value={record.arrival_date ? dayjs(record.arrival_date) : undefined}
                  onChange={(v) => handleChangeArrivalDate(record.id, v)}
                  format="YYYY-MM-DD"
                  allowClear={false}
                  suffixIcon={null}
                />
              </Space>
            )
          },
          {
            title: '入库',
            dataIndex: 'standard_inbound_done',
            width: 100,
            render: (_text: any, record: any) => {
              const key = String(record.id || '')
              const done = !!record.standard_inbound_done
              const loading = inboundSubmittingKeys.includes(key)
              return (
                <Checkbox
                  checked={done}
                  disabled={done || loading}
                  onChange={(e) => handleToggleInbound(record.id, e.target.checked)}
                />
              )
            }
          }
        ]}
      />
      </div>
    </div>
  )
}
