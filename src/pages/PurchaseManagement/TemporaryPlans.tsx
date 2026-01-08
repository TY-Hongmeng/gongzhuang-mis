import React, { useEffect, useMemo, useState } from 'react'
import { Table, Space, Button, Checkbox, DatePicker, message } from 'antd'
import dayjs from 'dayjs'
import EditableCell from '../../components/EditableCell'

interface TempItem {
  id: string
  inventory_number: string
  project_name: string
  part_name: string
  part_quantity: number
  unit: string
  model?: string
  supplier?: string
  required_date?: string
  production_unit?: string
  applicant?: string
  purchaser?: string
  arrival_date?: string
}

interface TempGroup {
  code: string
  monthKey: string
  createdAt: string
  items: TempItem[]
}

const readPlans = (): TempGroup[] => {
  try { return JSON.parse(localStorage.getItem('temporary_plans') || '[]') } catch { return [] }
}

export default function TemporaryPlans() {
  const [groups, setGroups] = useState<TempGroup[]>(readPlans())
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])

  useEffect(() => {
    const handler = () => setGroups(readPlans())
    window.addEventListener('storage', handler)
    window.addEventListener('temporary_plans_updated', handler as any)
    return () => {
      window.removeEventListener('storage', handler)
      window.removeEventListener('temporary_plans_updated', handler as any)
    }
  }, [])

  const flatData = useMemo(() => {
    return groups.flatMap(g => g.items.map(it => ({ ...it, group_code: g.code, id: `${g.code}:${it.id}` })))
  }, [groups])

  const handleSavePurchaser = (rowId: string, _key: string, value: string) => {
    const [code, origId] = String(rowId).split(':')
    setGroups(prev => {
      const next = prev.map(g => {
        if (g.code !== code) return g
        const items = g.items.map(it => it.id === origId ? { ...it, purchaser: value } : it)
        return { ...g, items }
      })
      localStorage.setItem('temporary_plans', JSON.stringify(next))
      // 状态：采购中
      const group = next.find(g => g.code === code)
      const item = group?.items.find(it => it.id === origId)
      const pid = (item as any)?.part_id
      const cid = (item as any)?.child_item_id
      if (pid) localStorage.setItem(`status_part_${pid}`, value && value.trim() ? '采购中' : '审批中')
      if (cid) localStorage.setItem(`status_child_${cid}`, value && value.trim() ? '采购中' : '审批中')
      return next
    })
  }

  const handleToggleArrived = (rowId: string, checked: boolean) => {
    const [code, origId] = String(rowId).split(':')
    setGroups(prev => {
      const next = prev.map(g => {
        if (g.code !== code) return g
        const items = g.items.map(it => it.id === origId ? { ...it, arrival_date: checked ? dayjs().format('YYYY-MM-DD') : '' } : it)
        return { ...g, items }
      })
      localStorage.setItem('temporary_plans', JSON.stringify(next))
      // 状态：已到货/审批中
      const group = next.find(g => g.code === code)
      const item = group?.items.find(it => it.id === origId)
      const pid = (item as any)?.part_id
      const cid = (item as any)?.child_item_id
      const newStatus = checked ? '已到货' : ((item as any)?.purchaser ? '采购中' : '审批中')
      if (pid) localStorage.setItem(`status_part_${pid}`, newStatus)
      if (cid) localStorage.setItem(`status_child_${cid}`, newStatus)
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
        return { ...g, items }
      })
      localStorage.setItem('temporary_plans', JSON.stringify(next))
      // 状态更新：有日期则已到货，无日期则根据是否有采购员决定
      const group = next.find(g => g.code === code)
      const item = group?.items.find(it => it.id === origId)
      const pid = (item as any)?.part_id
      const cid = (item as any)?.child_item_id
      const newStatus = str ? '已到货' : ((item as any)?.purchaser ? '采购中' : '审批中')
      if (pid) localStorage.setItem(`status_part_${pid}`, newStatus)
      if (cid) localStorage.setItem(`status_child_${cid}`, newStatus)
      return next
    })
  }

  return (
    <div style={{ padding: '16px 0', height: 'calc(100vh - 200px)' }}>
      <div className="flex items-center justify-between mb-4">
        <div style={{ fontWeight: 600, fontSize: 16 }}>临时计划</div>
        <Space>
          <Button onClick={() => {
            if (selectedRowKeys.length === 0) { message.warning('请选择需要回退的项'); return }
            setGroups(prev => {
              const keys = selectedRowKeys.map(k => String(k))
              const next = prev.map(g => ({
                ...g,
                items: g.items.filter(it => !keys.includes(`${g.code}:${it.id}`))
              })).filter(g => g.items.length > 0)
              localStorage.setItem('temporary_plans', JSON.stringify(next))
              // 取消隐藏并恢复状态
              const hiddenArr = (() => { try { return JSON.parse(localStorage.getItem('temporary_hidden_ids') || '[]') } catch { return [] } })()
              const hidden = new Set<string>(Array.isArray(hiddenArr) ? hiddenArr : [])
              // 同时处理手动/备份来源
              const hmArr = (() => { try { return JSON.parse(localStorage.getItem('temporary_hidden_manual_ids') || '[]') } catch { return [] } })()
              const hbArr = (() => { try { return JSON.parse(localStorage.getItem('temporary_hidden_backup_ids') || '[]') } catch { return [] } })()
              const hm = new Set<string>(Array.isArray(hmArr) ? hmArr : [])
              const hb = new Set<string>(Array.isArray(hbArr) ? hbArr : [])
              prev.forEach(g => g.items.forEach(it => {
                const rowKey = `${g.code}:${it.id}`
                if (keys.includes(rowKey)) {
                  hidden.delete(String(it.id))
                  const inv = String(it.inventory_number || '')
                  if (inv.startsWith('MANUAL-')) hm.delete(inv.slice(7))
                  if (inv.startsWith('BACKUP-')) hb.delete(inv.slice(7))
                  const pid = (it as any).part_id
                  const cid = (it as any).child_item_id
                  if (pid) localStorage.setItem(`status_part_${pid}`, '审批中')
                  if (cid) localStorage.setItem(`status_child_${cid}`, '审批中')
                }
              }))
              localStorage.setItem('temporary_hidden_ids', JSON.stringify(Array.from(hidden)))
              localStorage.setItem('temporary_hidden_manual_ids', JSON.stringify(Array.from(hm)))
              localStorage.setItem('temporary_hidden_backup_ids', JSON.stringify(Array.from(hb)))
              window.dispatchEvent(new Event('temporary_plans_updated'))
              window.dispatchEvent(new Event('status_updated'))
              message.success('已回退选中项')
              return next
            })
            setSelectedRowKeys([])
          }}>回退</Button>
        </Space>
      </div>
      <Table
        rowKey={(r: any) => r.id}
        rowSelection={{ selectedRowKeys, onChange: (keys) => setSelectedRowKeys(keys) }}
        dataSource={flatData}
        pagination={false}
        bordered={false}
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
        ]}
      />
    </div>
  )
}
