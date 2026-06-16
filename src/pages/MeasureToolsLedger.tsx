import React from 'react'
import {
  Button,
  Card,
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
import { DownloadOutlined, HistoryOutlined, LeftOutlined, PlusOutlined, ReloadOutlined, UploadOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import * as XLSX from 'xlsx'
import { useNavigate } from 'react-router-dom'
import { fetchWithFallback } from '../utils/api'
import { useAuthStore } from '../stores/authStore'
import type { MaterialAssetHistoryItem, MaterialAssetItem, MaterialAssetUserOption } from '../types/materialAssets'

const { Title, Text } = Typography

const isManagerRole = (roleName: string) => {
  const normalized = String(roleName || '').trim()
  return normalized.includes('超级管理员')
    || normalized.includes('库管')
    || normalized.includes('仓管')
    || normalized.includes('库房')
}

const statusColorMap: Record<string, string> = {
  在用: 'green',
  报废: 'red',
  待确认: 'orange',
  已确认: 'blue',
  待转移确认: 'gold',
  无: 'default',
  待报废: 'volcano',
  已报废: 'red'
}

const MeasureToolsLedger: React.FC = () => {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [form] = Form.useForm()
  const [items, setItems] = React.useState<MaterialAssetItem[]>([])
  const [users, setUsers] = React.useState<MaterialAssetUserOption[]>([])
  const [loading, setLoading] = React.useState(false)
  const [submitLoading, setSubmitLoading] = React.useState(false)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [historyOpen, setHistoryOpen] = React.useState(false)
  const [historyLoading, setHistoryLoading] = React.useState(false)
  const [historyRows, setHistoryRows] = React.useState<MaterialAssetHistoryItem[]>([])
  const [historyAssetTitle, setHistoryAssetTitle] = React.useState('')
  const [search, setSearch] = React.useState('')
  const [assetStatusFilter, setAssetStatusFilter] = React.useState('')
  const [responsibilityStatusFilter, setResponsibilityStatusFilter] = React.useState('')
  const [scrapStatusFilter, setScrapStatusFilter] = React.useState('')

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
      if (assetStatusFilter) params.set('assetStatus', assetStatusFilter)
      if (responsibilityStatusFilter) params.set('responsibilityStatus', responsibilityStatusFilter)
      if (scrapStatusFilter) params.set('scrapStatus', scrapStatusFilter)
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
  }, [assetStatusFilter, responsibilityStatusFilter, scrapStatusFilter, search])

  const loadUsers = React.useCallback(async () => {
    try {
      const res = await fetchWithFallback('/api/users')
      const json = await res.json().catch(() => ({}))
      const list = Array.isArray(json?.items) ? json.items : []
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
      const selectedUser = users.find((item) => item.id === String(values.responsible_user_id || ''))
      const payload = {
        name: String(values.name || '').trim(),
        code: String(values.code || '').trim(),
        model_spec: String(values.model_spec || '').trim(),
        responsible_person: String(selectedUser?.real_name || values.responsible_person || '').trim(),
        responsible_user_id: String(values.responsible_user_id || ''),
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

  const downloadTemplate = () => {
    const header = ['名称', '编号', '型号规格', '责任人', '状态', '备注']
    const sample = ['游标卡尺', 'LJ-001', '0-150mm', '张三', '在用', '初始导入需责任人本人确认']
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

  const columns = [
    {
      title: '序号',
      width: 72,
      align: 'center' as const,
      render: (_: any, __: MaterialAssetItem, index: number) => index + 1
    },
    {
      title: '名称',
      dataIndex: 'name',
      width: 150
    },
    {
      title: '编号',
      dataIndex: 'code',
      width: 140
    },
    {
      title: '型号规格',
      dataIndex: 'model_spec',
      width: 180,
      render: (value: string) => value || '-'
    },
    {
      title: '责任人',
      width: 220,
      render: (_: any, record: MaterialAssetItem) => (
        <Space wrap size={[4, 4]}>
          {record.responsible_person ? <Tag color="blue">{record.responsible_person}</Tag> : <Tag>未确认</Tag>}
          {record.pending_responsible_person ? <Tag color="gold">待确认: {record.pending_responsible_person}</Tag> : null}
          <Tag color={statusColorMap[record.responsibility_status] || 'default'}>{record.responsibility_status}</Tag>
        </Space>
      )
    },
    {
      title: '状态',
      width: 160,
      render: (_: any, record: MaterialAssetItem) => (
        <Space wrap size={[4, 4]}>
          <Tag color={statusColorMap[record.asset_status] || 'default'}>{record.asset_status}</Tag>
          {record.scrap_status !== '无' ? <Tag color={statusColorMap[record.scrap_status] || 'default'}>{record.scrap_status}</Tag> : null}
        </Space>
      )
    },
    {
      title: '备注',
      width: 280,
      render: (_: any, record: MaterialAssetItem) => (
        <div>
          <div>{record.remark || '-'}</div>
          {record.scrap_reason ? <Text type="secondary">报废原因: {record.scrap_reason}</Text> : null}
        </div>
      )
    },
    {
      title: '历史记录',
      width: 120,
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
      width: 140,
      align: 'center' as const,
      render: (_: any, record: MaterialAssetItem) => (
        record.scrap_status === '待报废'
          ? (
            <Button type="link" danger onClick={() => approveScrap(record)}>
              确认报废
            </Button>
          )
          : <Text type="secondary">-</Text>
      )
    } as never)
  }

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

        <Space wrap style={{ marginBottom: 16 }}>
          <Input
            allowClear
            placeholder="搜索名称/编号/责任人/备注"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 260 }}
          />
          <Select
            allowClear
            placeholder="状态"
            value={assetStatusFilter || undefined}
            onChange={(value) => setAssetStatusFilter(String(value || ''))}
            style={{ width: 140 }}
            options={[
              { value: '在用', label: '在用' },
              { value: '报废', label: '报废' }
            ]}
          />
          <Select
            allowClear
            placeholder="责任确认"
            value={responsibilityStatusFilter || undefined}
            onChange={(value) => setResponsibilityStatusFilter(String(value || ''))}
            style={{ width: 160 }}
            options={[
              { value: '待确认', label: '待确认' },
              { value: '已确认', label: '已确认' },
              { value: '待转移确认', label: '待转移确认' }
            ]}
          />
          <Select
            allowClear
            placeholder="报废流程"
            value={scrapStatusFilter || undefined}
            onChange={(value) => setScrapStatusFilter(String(value || ''))}
            style={{ width: 160 }}
            options={[
              { value: '无', label: '无' },
              { value: '待报废', label: '待报废' },
              { value: '已报废', label: '已报废' }
            ]}
          />
          <Button type="primary" onClick={loadItems}>查询</Button>
        </Space>

        <Table
          rowKey="id"
          loading={loading}
          dataSource={items}
          columns={columns as any}
          scroll={{ x: 'max-content' }}
          pagination={{ pageSize: 20, showSizeChanger: true, showQuickJumper: true }}
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
          <Form.Item label="责任人" name="responsible_user_id" rules={[{ required: true, message: '请选择责任人' }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={users.map((item) => ({
                value: item.id,
                label: item.real_name
              }))}
            />
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
        title={`历史记录 - ${historyAssetTitle}`}
        open={historyOpen}
        onCancel={() => setHistoryOpen(false)}
        footer={null}
        width={900}
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
    </div>
  )
}

export default MeasureToolsLedger
