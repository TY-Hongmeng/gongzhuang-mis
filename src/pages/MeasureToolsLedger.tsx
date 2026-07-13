import React from 'react'
import {
  Alert,
  AutoComplete,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  Upload,
  message
} from 'antd'
import type { UploadProps } from 'antd'
import { DownloadOutlined, EditOutlined, HistoryOutlined, LeftOutlined, PlusOutlined, ReloadOutlined, SearchOutlined, UploadOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import * as XLSX from 'xlsx'
import { useNavigate } from 'react-router-dom'
import { fetchWithFallback } from '../utils/api'
import { useAuthStore } from '../stores/authStore'
import type { MaterialAssetHistoryItem, MaterialAssetItem, MaterialAssetUserOption } from '../types/materialAssets'

const { Title, Text } = Typography

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = React.useState(false)
  React.useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return isMobile
}

const certificateTagColorMap: Record<string, string> = {
  未维护: 'orange',
  有效: 'green',
  临期: 'gold',
  过期: 'red'
}

const isManagerRole = (roleName: string) => {
  const normalized = String(roleName || '').trim()
  return normalized.includes('超级管理员')
    || normalized.includes('库管')
    || normalized.includes('仓管')
    || normalized.includes('库房')
}

interface EditableRemarkCellProps {
  record: MaterialAssetItem
  onSaved?: () => void
}

const EditableRemarkCell: React.FC<EditableRemarkCellProps> = ({ record, onSaved }) => {
  const { user } = useAuthStore()
  const [editing, setEditing] = React.useState(false)
  const [value, setValue] = React.useState<string>(String(record.remark || ''))
  const [saving, setSaving] = React.useState(false)
  const inputRef = React.useRef<any>(null)

  React.useEffect(() => {
    if (!editing) setValue(String(record.remark || ''))
  }, [record.remark, editing])

  React.useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus?.()
      inputRef.current.select?.()
    }
  }, [editing])

  const save = async () => {
    const next = String(value || '').trim()
    const prev = String(record.remark || '').trim()
    if (next === prev) {
      setEditing(false)
      return
    }
    try {
      setSaving(true)
      const res = await fetchWithFallback(`/api/material-assets/${encodeURIComponent(record.id)}/remark`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          remark: next,
          userId: String((user as any)?.id || ''),
          operator: String(user?.real_name || '')
        })
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.success === false) {
        throw new Error(String(json?.error || '保存备注失败'))
      }
      message.success('备注已保存')
      setEditing(false)
      onSaved?.()
    } catch (err: any) {
      message.error(err?.message || '保存备注失败')
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <Input.TextArea
        ref={inputRef as any}
        value={value}
        autoSize={{ minRows: 1, maxRows: 4 }}
        disabled={saving}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onPressEnter={(e) => {
          if (!e.shiftKey) {
            e.preventDefault()
            ;(e.target as any).blur()
          }
        }}
        placeholder="请输入备注"
      />
    )
  }

  const display = String(record.remark || '').trim()
  return (
    <div
      onClick={() => setEditing(true)}
      style={{
        cursor: 'text',
        minHeight: 22,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word'
      }}
      title="点击修改备注"
    >
      {display || '-'}
    </div>
  )
}

const statusColorMap: Record<string, string> = {
  在用: 'green',
  报废: 'red',
  待确认: 'orange',
  已确认: 'blue',
  待转移确认: 'gold',
  借用中: 'cyan',
  待归还确认: 'purple',
  无: 'default',
  待报废: 'volcano',
  已报废: 'red'
}

const MeasureToolsLedger: React.FC = () => {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const isMobile = useIsMobile()
  const [form] = Form.useForm()
  const [editForm] = Form.useForm()
  const [rejectScrapForm] = Form.useForm()
  const [items, setItems] = React.useState<MaterialAssetItem[]>([])
  const [users, setUsers] = React.useState<MaterialAssetUserOption[]>([])
  const [loading, setLoading] = React.useState(false)
  const [submitLoading, setSubmitLoading] = React.useState(false)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editOpen, setEditOpen] = React.useState(false)
  const [rejectScrapOpen, setRejectScrapOpen] = React.useState(false)
  const [historyOpen, setHistoryOpen] = React.useState(false)
  const [historyLoading, setHistoryLoading] = React.useState(false)
  const [historyRows, setHistoryRows] = React.useState<MaterialAssetHistoryItem[]>([])
  const [historyAssetTitle, setHistoryAssetTitle] = React.useState('')
  const [currentItem, setCurrentItem] = React.useState<MaterialAssetItem | null>(null)
  const [search, setSearch] = React.useState('')

  const roleName = String((user as any)?.roles?.name || '')
  const isManager = isManagerRole(roleName)

  const loadItems = React.useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page: '1',
        pageSize: '500'
      })
      if (search.trim()) params.set('search', search.trim())
      const res = await fetchWithFallback(`/api/material-assets/ledger?${params.toString()}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.success === false) {
        throw new Error(String(json?.error || '加载量具台账失败'))
      }
      setItems(Array.isArray(json?.items) ? json.items : [])
    } catch (error: any) {
      message.error(error?.message || '加载量具台账失败')
    } finally {
      setLoading(false)
    }
  }, [search])

  const loadUsers = React.useCallback(async () => {
    try {
      const res = await fetchWithFallback('/api/users')
      const json = await res.json().catch(() => ({}))
      const list = Array.isArray(json?.items)
        ? json.items
        : (Array.isArray(json?.users) ? json.users : [])
      setUsers(
        list
          .filter((item: any) => String(item?.status || '') === 'active' && String(item?.real_name || '').trim())
          .map((item: any) => ({
            id: String(item.id || ''),
            real_name: String(item.real_name || '').trim(),
            status: String(item.status || '')
          }))
      )
    } catch {}
  }, [])

  React.useEffect(() => {
    loadItems()
  }, [loadItems])

  React.useEffect(() => {
    loadUsers()
  }, [loadUsers])

  const openHistory = async (asset: MaterialAssetItem) => {
    try {
      setHistoryOpen(true)
      setHistoryLoading(true)
      setHistoryAssetTitle(`${asset.name} / ${asset.code}`)
      const res = await fetchWithFallback(`/api/material-assets/${encodeURIComponent(asset.id)}/history`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.success === false) {
        throw new Error(String(json?.error || '加载历史记录失败'))
      }
      setHistoryRows(Array.isArray(json?.items) ? json.items : [])
    } catch (error: any) {
      setHistoryRows([])
      message.error(error?.message || '加载历史记录失败')
    } finally {
      setHistoryLoading(false)
    }
  }

  const handleCreate = async (values: any) => {
    try {
      setSubmitLoading(true)
      const responsiblePerson = String(values.responsible_person || '').trim()
      const selectedUser = users.find((item) =>
        item.id === String(values.responsible_user_id || '')
        || item.real_name === responsiblePerson
      )
      const payload = {
        name: String(values.name || '').trim(),
        code: String(values.code || '').trim(),
        model_spec: String(values.model_spec || '').trim(),
        certificate_expire_date: values.certificate_expire_date ? dayjs(values.certificate_expire_date).format('YYYY-MM-DD') : '',
        certificate_remind_days: Number(values.certificate_remind_days ?? 30),
        responsible_person: String(selectedUser?.real_name || responsiblePerson).trim(),
        responsible_user_id: String(selectedUser?.id || values.responsible_user_id || ''),
        asset_status: String(values.asset_status || '在用'),
        remark: String(values.remark || '').trim(),
        scrap_reason: String(values.scrap_reason || '').trim(),
        userId: String((user as any)?.id || ''),
        operator: String(user?.real_name || '')
      }
      const res = await fetchWithFallback('/api/material-assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.success === false) {
        throw new Error(String(json?.error || '新增量具失败'))
      }
      message.success('新增量具成功')
      setCreateOpen(false)
      form.resetFields()
      loadItems()
    } catch (error: any) {
      message.error(error?.message || '新增量具失败')
    } finally {
      setSubmitLoading(false)
    }
  }

  const handleCreateFailed = ({ errorFields }: any) => {
    if (Array.isArray(errorFields) && errorFields.length > 0) {
      message.warning(String(errorFields[0]?.errors?.[0] || '请先完善必填项'))
    }
  }

  const downloadTemplate = () => {
    const header = ['名称', '编号', '型号规格', '有效日期', '提醒天数', '责任人', '状态', '备注']
    const sample = ['游标卡尺', 'LJ-001', '0-150mm', '2027-07-01', '30', '张三', '在用', '初始导入需责任人本人确认']
    const ws = XLSX.utils.aoa_to_sheet([header, sample])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '量具台账导入模板')
    XLSX.writeFile(wb, '量具台账导入模板.xlsx')
  }

  const importUploadProps: UploadProps = {
    accept: '.xlsx,.xls,.xlsm',
    maxCount: 1,
    showUploadList: false,
    beforeUpload: async (file) => {
      try {
        const buffer = await file.arrayBuffer()
        const workbook = XLSX.read(buffer, { type: 'array' })
        const worksheet = workbook.Sheets[workbook.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json<any>(worksheet, { defval: '' })
        const items = rows.map((row: any) => ({
          name: String(row['名称'] || row['name'] || '').trim(),
          code: String(row['编号'] || row['code'] || '').trim(),
          model_spec: String(row['型号规格'] || row['model_spec'] || '').trim(),
          certificate_expire_date: String(row['有效日期'] || row['certificate_expire_date'] || '').trim(),
          certificate_remind_days: String(row['提醒天数'] || row['certificate_remind_days'] || '30').trim(),
          responsible_person: String(row['责任人'] || row['responsible_person'] || '').trim(),
          asset_status: String(row['状态'] || row['asset_status'] || '在用').trim() || '在用',
          remark: String(row['备注'] || row['remark'] || '').trim()
        })).filter((item) => item.name || item.code || item.responsible_person)

        if (items.length === 0) {
          throw new Error('Excel 中没有可导入的数据')
        }

        const res = await fetchWithFallback('/api/material-assets/batch-import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items,
            userId: String((user as any)?.id || ''),
            operator: String(user?.real_name || '')
          })
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok || json?.success === false) {
          throw new Error(String(json?.error || '导入量具失败'))
        }
        message.success(`已成功导入 ${Number(json?.count || items.length)} 条量具数据`)
        loadItems()
      } catch (error: any) {
        message.error(error?.message || '导入量具失败')
      }
      return false
    }
  }

  const approveScrap = async (asset: MaterialAssetItem) => {
    try {
      const res = await fetchWithFallback(`/api/material-assets/${encodeURIComponent(asset.id)}/approve-scrap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: String((user as any)?.id || ''),
          operator: String(user?.real_name || '')
        })
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.success === false) {
        throw new Error(String(json?.error || '确认报废失败'))
      }
      message.success('已确认报废')
      loadItems()
    } catch (error: any) {
      message.error(error?.message || '确认报废失败')
    }
  }

  const submitEdit = async (values: any) => {
    if (!currentItem) return
    try {
      setSubmitLoading(true)
      const res = await fetchWithFallback(`/api/material-assets/${encodeURIComponent(currentItem.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: String(values.name || '').trim(),
          code: String(values.code || '').trim(),
          model_spec: String(values.model_spec || '').trim(),
          certificate_expire_date: values.certificate_expire_date ? dayjs(values.certificate_expire_date).format('YYYY-MM-DD') : '',
          certificate_remind_days: Number(values.certificate_remind_days ?? 30),
          remark: String(values.remark || '').trim(),
          userId: String((user as any)?.id || ''),
          operator: String(user?.real_name || '')
        })
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.success === false) {
        throw new Error(String(json?.error || '编辑量具基础信息失败'))
      }
      message.success('量具基础信息已更新')
      setEditOpen(false)
      setCurrentItem(null)
      editForm.resetFields()
      loadItems()
    } catch (error: any) {
      message.error(error?.message || '编辑量具基础信息失败')
    } finally {
      setSubmitLoading(false)
    }
  }

  const rejectScrap = async (values: any) => {
    if (!currentItem) return
    try {
      setSubmitLoading(true)
      const res = await fetchWithFallback(`/api/material-assets/${encodeURIComponent(currentItem.id)}/reject-scrap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: String((user as any)?.id || ''),
          operator: String(user?.real_name || ''),
          reason: String(values.reason || '').trim()
        })
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.success === false) {
        throw new Error(String(json?.error || '驳回报废申请失败'))
      }
      message.success('已驳回报废申请')
      setRejectScrapOpen(false)
      setCurrentItem(null)
      rejectScrapForm.resetFields()
      loadItems()
    } catch (error: any) {
      message.error(error?.message || '驳回报废申请失败')
    } finally {
      setSubmitLoading(false)
    }
  }

  const removeAsset = async (asset: MaterialAssetItem) => {
    try {
      setSubmitLoading(true)
      const res = await fetchWithFallback(`/api/material-assets/${encodeURIComponent(asset.id)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: String((user as any)?.id || ''),
          operator: String(user?.real_name || '')
        })
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.success === false) {
        throw new Error(String(json?.error || '删除量具失败'))
      }
      message.success('量具已删除')
      loadItems()
    } catch (error: any) {
      message.error(error?.message || '删除量具失败')
    } finally {
      setSubmitLoading(false)
    }
  }

  const columns = [
    {
      title: '序号',
      width: 80,
      align: 'center' as const,
      render: (_: any, __: MaterialAssetItem, index: number) => index + 1
    },
    {
      title: '名称',
      dataIndex: 'name',
      width: 150,
      filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }) => (
        <div style={{ padding: 8 }} onKeyDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
          <Input
            placeholder="搜索名称"
            value={selectedKeys[0] || ''}
            onChange={e => setSelectedKeys(e.target.value ? [e.target.value] : [])}
            onPressEnter={confirm}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            style={{ marginBottom: 8, display: 'block' }}
          />
          <Space>
            <Button type="primary" onClick={confirm} icon={<SearchOutlined />} size="small" style={{ width: 90 }}>
              搜索
            </Button>
            <Button onClick={clearFilters} size="small" style={{ width: 90 }}>
              重置
            </Button>
          </Space>
        </div>
      ),
      filterIcon: filtered => <SearchOutlined style={{ color: filtered ? '#1890ff' : undefined }} />,
      onFilter: (value, record) => record.name?.toString().toLowerCase().includes((value as string).toLowerCase())
    },
    {
      title: '编号',
      dataIndex: 'code',
      width: 150,
      filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }) => (
        <div style={{ padding: 8 }} onKeyDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
          <Input
            placeholder="搜索编号"
            value={selectedKeys[0] || ''}
            onChange={e => setSelectedKeys(e.target.value ? [e.target.value] : [])}
            onPressEnter={confirm}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            style={{ marginBottom: 8, display: 'block' }}
          />
          <Space>
            <Button type="primary" onClick={confirm} icon={<SearchOutlined />} size="small" style={{ width: 90 }}>
              搜索
            </Button>
            <Button onClick={clearFilters} size="small" style={{ width: 90 }}>
              重置
            </Button>
          </Space>
        </div>
      ),
      filterIcon: filtered => <SearchOutlined style={{ color: filtered ? '#1890ff' : undefined }} />,
      onFilter: (value, record) => record.code?.toString().toLowerCase().includes((value as string).toLowerCase())
    },
    {
      title: '型号规格',
      dataIndex: 'model_spec',
      width: 180,
      filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }) => (
        <div style={{ padding: 8 }} onKeyDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          <Input
            placeholder="搜索型号规格"
            value={selectedKeys[0] || ''}
            onChange={e => setSelectedKeys(e.target.value ? [e.target.value] : [])}
            onPressEnter={confirm}
            onClick={(e) => e.stopPropagation()}
            autoFocus
            style={{ marginBottom: 8, display: 'block' }}
          />
          <Space>
            <Button type="primary" onClick={confirm} icon={<SearchOutlined />} size="small" style={{ width: 90 }}>
              搜索
            </Button>
            <Button onClick={clearFilters} size="small" style={{ width: 90 }}>
              重置
            </Button>
          </Space>
        </div>
      ),
      filterIcon: filtered => <SearchOutlined style={{ color: filtered ? '#1890ff' : undefined }} />,
      onFilter: (value, record) => record.model_spec?.toString().toLowerCase().includes((value as string).toLowerCase()),
      render: (value: string) => value || '-'
    },
    {
      title: '合格证',
      width: 220,
      filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }) => (
        <div style={{ padding: 8 }} onKeyDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          <Input
            placeholder="搜索合格证状态"
            value={selectedKeys[0] || ''}
            onChange={e => setSelectedKeys(e.target.value ? [e.target.value] : [])}
            onPressEnter={confirm}
            onClick={(e) => e.stopPropagation()}
            style={{ marginBottom: 8, display: 'block' }}
          />
          <Space>
            <Button type="primary" onClick={confirm} icon={<SearchOutlined />} size="small" style={{ width: 90 }}>
              搜索
            </Button>
            <Button onClick={clearFilters} size="small" style={{ width: 90 }}>
              重置
            </Button>
          </Space>
        </div>
      ),
      filterIcon: filtered => <SearchOutlined style={{ color: filtered ? '#1890ff' : undefined }} />,
      onFilter: (value, record) => (record.certificate_status || '未维护')?.toString().toLowerCase().includes((value as string).toLowerCase()),
      render: (_: any, record: MaterialAssetItem) => (
        <div>
          <Tag color={certificateTagColorMap[record.certificate_status] || 'default'} style={{ marginRight: 6 }}>
            {record.certificate_status || '未维护'}
          </Tag>
          <Text type={record.certificate_status === '过期' ? 'danger' : 'secondary'}>
            {record.certificate_expire_date || '未维护有效期'}
          </Text>
        </div>
      )
    },
    {
      title: '到期提醒',
      width: 160,
      render: (_: any, record: MaterialAssetItem) => {
        if (!record.certificate_expire_date) return <Text type="secondary">请维护</Text>
        if (record.certificate_status === '过期') {
          return <Text type="danger">已过期 {Math.abs(Number(record.certificate_remaining_days || 0))} 天</Text>
        }
        if (record.certificate_status === '临期') {
          return <Text type="warning">{record.certificate_remaining_days} 天后到期</Text>
        }
        return <Text type="secondary">剩余 {record.certificate_remaining_days} 天</Text>
      }
    },
    {
      title: '责任人',
      width: 260,
      filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }) => (
        <div style={{ padding: 8 }} onKeyDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          <Input
            placeholder="搜索责任人"
            value={selectedKeys[0] || ''}
            onChange={e => setSelectedKeys(e.target.value ? [e.target.value] : [])}
            onPressEnter={confirm}
            onClick={(e) => e.stopPropagation()}
            style={{ marginBottom: 8, display: 'block' }}
          />
          <Space>
            <Button type="primary" onClick={confirm} icon={<SearchOutlined />} size="small" style={{ width: 90 }}>
              搜索
            </Button>
            <Button onClick={clearFilters} size="small" style={{ width: 90 }}>
              重置
            </Button>
          </Space>
        </div>
      ),
      filterIcon: filtered => <SearchOutlined style={{ color: filtered ? '#1890ff' : undefined }} />,
      onFilter: (value, record) => (record.responsible_person || '')?.toString().toLowerCase().includes((value as string).toLowerCase()),
      render: (_: any, record: MaterialAssetItem) => (
        <Space wrap size={[4, 4]}>
          {record.responsible_person
            ? <Tag color="blue">{record.responsible_person}</Tag>
            : <Tag color="default">未确认</Tag>}
          {record.pending_responsible_person
            ? <Tag color="gold">{record.pending_responsible_person}</Tag>
            : null}
        </Space>
      )
    },
    {
      title: '资产状态',
      dataIndex: 'asset_status',
      width: 100,
      filters: [
        { text: '在用', value: '在用' },
        { text: '报废', value: '报废' }
      ],
      onFilter: (value, record) => record.asset_status === value,
      render: (value: string) => (
        <Tag color={statusColorMap[value] || 'default'}>{value}</Tag>
      )
    },
    {
      title: '借用状态',
      dataIndex: 'borrow_status',
      width: 100,
      filters: [
        { text: '无', value: '无' },
        { text: '借用中', value: '借用中' },
        { text: '待归还确认', value: '待归还确认' }
      ],
      onFilter: (value, record) => record.borrow_status === value,
      render: (value: string) => (
        value !== '无' ? <Tag color={statusColorMap[value] || 'default'}>{value}</Tag> : null
      )
    },
    {
      title: '报废状态',
      dataIndex: 'scrap_status',
      width: 100,
      filters: [
        { text: '无', value: '无' },
        { text: '待报废', value: '待报废' },
        { text: '已报废', value: '已报废' }
      ],
      onFilter: (value, record) => record.scrap_status === value,
      render: (value: string) => (
        value !== '无' ? <Tag color={statusColorMap[value] || 'default'}>{value}</Tag> : null
      )
    },
    {
      title: '备注',
      width: 190,
      filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }) => (
        <div style={{ padding: 8 }} onKeyDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          <Input
            placeholder="搜索备注"
            value={selectedKeys[0] || ''}
            onChange={e => setSelectedKeys(e.target.value ? [e.target.value] : [])}
            onPressEnter={confirm}
            onClick={(e) => e.stopPropagation()}
            style={{ marginBottom: 8, display: 'block' }}
          />
          <Space>
            <Button type="primary" onClick={confirm} icon={<SearchOutlined />} size="small" style={{ width: 90 }}>
              搜索
            </Button>
            <Button onClick={clearFilters} size="small" style={{ width: 90 }}>
              重置
            </Button>
          </Space>
        </div>
      ),
      filterIcon: filtered => <SearchOutlined style={{ color: filtered ? '#1890ff' : undefined }} />,
      onFilter: (value, record) => record.remark?.toString().toLowerCase().includes((value as string).toLowerCase()),
      render: (_: any, record: MaterialAssetItem) => (
        <EditableRemarkCell record={record} onSaved={loadItems} />
      )
    },
    {
      title: '历史记录',
      width: 110,
      align: 'center' as const,
      render: (_: any, record: MaterialAssetItem) => (
        <Button type="link" icon={<HistoryOutlined />} onClick={() => openHistory(record)}>
          {record.history_count || 0} 条
        </Button>
      )
    }
  ]

  if (isManager) {
    columns.push({
      title: '操作',
      width: 240,
      align: 'center' as const,
      render: (_: any, record: MaterialAssetItem) => (
        <Space wrap>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => {
              setCurrentItem(record)
              editForm.setFieldsValue({
                name: record.name,
                code: record.code,
                model_spec: record.model_spec,
                certificate_expire_date: record.certificate_expire_date ? dayjs(record.certificate_expire_date) : null,
                certificate_remind_days: record.certificate_remind_days ?? 30,
                remark: record.remark
              })
              setEditOpen(true)
            }}
          >
            编辑
          </Button>
          {record.scrap_status === '待报废' ? (
            <>
              <Button type="link" danger onClick={() => approveScrap(record)}>
                确认报废
              </Button>
              <Button
                type="link"
                onClick={() => {
                  setCurrentItem(record)
                  rejectScrapForm.resetFields()
                  setRejectScrapOpen(true)
                }}
              >
                驳回报废
              </Button>
            </>
          ) : null}
          <Button
            type="link"
            danger
            disabled={submitLoading || ['借用中', '待归还确认'].includes(record.borrow_status)}
            onClick={() => {
              Modal.confirm({
                title: `确认删除量具“${record.name}”吗？`,
                content: '删除后台账记录及历史记录将一并移除，且无法恢复。',
                okText: '确认删除',
                okButtonProps: { danger: true },
                cancelText: '取消',
                onOk: () => removeAsset(record)
              })
            }}
          >
            删除
          </Button>
        </Space>
      )
    } as never)
  }

  const summary = React.useMemo(() => {
    const pending = items.filter((item) => item.responsibility_status === '待确认').length
    const expired = items.filter((item) => item.certificate_status === '过期').length
    const missing = items.filter((item) => item.certificate_status === '未维护').length
    return { pending, expired, missing }
  }, [items])

  return (
    <div style={{ padding: 16 }}>
      <Card bordered={false}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <div>
            <Title level={4} style={{ margin: 0 }}>量具台账</Title>
            <Text type="secondary">初始导入数据默认进入待责任人确认状态，转移后由接收人确认才生效。</Text>
          </div>
          <Space wrap>
            <Button icon={<ReloadOutlined />} onClick={loadItems}>刷新</Button>
            {isManager ? (
              <>
                <Upload {...importUploadProps}>
                  <Button icon={<UploadOutlined />}>Excel导入</Button>
                </Upload>
                <Button icon={<DownloadOutlined />} onClick={downloadTemplate}>下载模板</Button>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>新增量具</Button>
              </>
            ) : null}
            <Button icon={<LeftOutlined />} onClick={() => navigate('/dashboard')}>返回</Button>
          </Space>
        </div>

        {(summary.pending > 0 || summary.expired > 0 || summary.missing > 0) ? (
          <Alert
            type={summary.expired > 0 || summary.missing > 0 ? 'error' : 'warning'}
            showIcon
            style={{ marginBottom: 16 }}
            message={`量具提醒：待确认 ${summary.pending} 项，过期 ${summary.expired} 项，未维护 ${summary.missing} 项`}
            description="提醒范围统一为待确认、过期和未维护，请优先确认归属并补全有效日期。"
          />
        ) : null}

        <Input
          allowClear
          placeholder="搜索名称/编号/责任人/借用人/备注"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 260, marginBottom: 16 }}
        />

        <Table
          rowKey="id"
          loading={loading}
          dataSource={items}
          columns={columns as any}
          scroll={{ x: 'max-content' }}
          pagination={false}
        />
      </Card>

      <Modal
        title="新增量具"
        open={createOpen}
        onCancel={() => {
          setCreateOpen(false)
          form.resetFields()
        }}
        footer={null}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreate}
          onFinishFailed={handleCreateFailed}
          initialValues={{ asset_status: '在用' }}
        >
          <Form.Item label="名称" name="name" rules={[{ required: true, message: '请输入名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item label="编号" name="code" rules={[{ required: true, message: '请输入编号' }]}>
            <Input />
          </Form.Item>
          <Form.Item label="型号规格" name="model_spec">
            <Input />
          </Form.Item>
          <Form.Item label="有效日期" name="certificate_expire_date">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="提醒提前天数" name="certificate_remind_days" initialValue={30}>
            <Input type="number" min={0} />
          </Form.Item>
          <Form.Item label="责任人" name="responsible_person" rules={[{ required: true, message: '请输入或选择责任人' }]}>
            <AutoComplete
              allowClear
              placeholder="可输入姓名，或从联想列表中选择"
              options={users.map((item) => ({
                value: item.real_name,
                label: item.real_name,
                userId: item.id
              }))}
              filterOption={(inputValue, option) =>
                String(option?.value || '').toLowerCase().includes(String(inputValue || '').toLowerCase())
              }
              onSelect={(_value, option: any) => {
                form.setFieldValue('responsible_user_id', String(option?.userId || ''))
              }}
              onChange={(value) => {
                const normalized = String(value || '').trim()
                const matchedUser = users.find((item) => item.real_name === normalized)
                form.setFieldValue('responsible_user_id', String(matchedUser?.id || ''))
              }}
            />
          </Form.Item>
          <Form.Item name="responsible_user_id" hidden>
            <Input />
          </Form.Item>
          <Form.Item label="状态" name="asset_status">
            <Select
              options={[
                { value: '在用', label: '在用' },
                { value: '报废', label: '报废' }
              ]}
            />
          </Form.Item>
          <Form.Item label="备注" name="remark">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item shouldUpdate noStyle>
            {({ getFieldValue }) => getFieldValue('asset_status') === '报废' ? (
              <Form.Item label="报废原因" name="scrap_reason" rules={[{ required: true, message: '状态为报废时请填写原因' }]}>
                <Input.TextArea rows={3} />
              </Form.Item>
            ) : null}
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => {
                setCreateOpen(false)
                form.resetFields()
              }}>
                取消
              </Button>
              <Button type="primary" htmlType="submit" loading={submitLoading}>
                保存
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={currentItem ? `编辑量具 - ${currentItem.name}` : '编辑量具'}
        open={editOpen}
        onCancel={() => {
          setEditOpen(false)
          setCurrentItem(null)
          editForm.resetFields()
        }}
        footer={null}
        destroyOnClose
      >
        <Descriptions size="small" column={1} style={{ marginBottom: 12 }}>
          <Descriptions.Item label="责任人">{currentItem?.responsible_person || '未确认'}</Descriptions.Item>
          <Descriptions.Item label="待确认责任人">{currentItem?.pending_responsible_person || '-'}</Descriptions.Item>
          <Descriptions.Item label="责任状态">{currentItem?.responsibility_status || '-'}</Descriptions.Item>
        </Descriptions>
        <Form form={editForm} layout="vertical" onFinish={submitEdit}>
          <Form.Item label="名称" name="name" rules={[{ required: true, message: '请输入名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item label="编号" name="code" rules={[{ required: true, message: '请输入编号' }]}>
            <Input />
          </Form.Item>
          <Form.Item label="型号规格" name="model_spec">
            <Input />
          </Form.Item>
          <Form.Item label="有效日期" name="certificate_expire_date">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="提醒提前天数" name="certificate_remind_days">
            <Input type="number" min={0} />
          </Form.Item>
          <Form.Item label="备注" name="remark">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Text type="secondary">责任人相关变更请在“我的量具”中走确认/转移流程。</Text>
          <Form.Item style={{ marginBottom: 0, marginTop: 12 }}>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => {
                setEditOpen(false)
                setCurrentItem(null)
                editForm.resetFields()
              }}>
                取消
              </Button>
              <Button type="primary" htmlType="submit" loading={submitLoading}>
                保存
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`历史记录 - ${historyAssetTitle}`}
        open={historyOpen}
        onCancel={() => setHistoryOpen(false)}
        footer={null}
        width={isMobile ? '100%' : 900}
      >
        <Table
          rowKey="id"
          loading={historyLoading}
          dataSource={historyRows}
          pagination={{ pageSize: 10, showSizeChanger: true }}
          columns={[
            {
              title: '时间',
              dataIndex: 'created_at',
              width: 180,
              render: (value: string) => value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-'
            },
            {
              title: '操作',
              dataIndex: 'action_label',
              width: 140
            },
            {
              title: '人员',
              dataIndex: 'operator_name',
              width: 120,
              render: (value: string) => value || '-'
            },
            {
              title: '目标',
              dataIndex: 'target_name',
              width: 120,
              render: (value: string) => value || '-'
            },
            {
              title: '备注',
              dataIndex: 'remark',
              render: (value: string) => value || '-'
            }
          ]}
        />
      </Modal>

      <Modal
        title={currentItem ? `驳回报废申请 - ${currentItem.name}` : '驳回报废申请'}
        open={rejectScrapOpen}
        onCancel={() => {
          setRejectScrapOpen(false)
          setCurrentItem(null)
          rejectScrapForm.resetFields()
        }}
        footer={null}
        destroyOnClose
      >
        <Form form={rejectScrapForm} layout="vertical" onFinish={rejectScrap}>
          <Form.Item label="驳回原因" name="reason" rules={[{ required: true, message: '请填写驳回原因' }]}>
            <Input.TextArea rows={4} placeholder="请明确填写驳回原因，例如仍可修复、信息不完整等" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => {
                setRejectScrapOpen(false)
                setCurrentItem(null)
                rejectScrapForm.resetFields()
              }}>
                取消
              </Button>
              <Button htmlType="submit" type="primary" loading={submitLoading}>
                确认驳回
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default MeasureToolsLedger
