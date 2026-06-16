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
  message
} from 'antd'
import { LeftOutlined, ReloadOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { fetchWithFallback } from '../utils/api'
import { useAuthStore } from '../stores/authStore'
import type { MaterialAssetItem, MaterialAssetUserOption } from '../types/materialAssets'

const { Title, Text } = Typography

const tagColorMap: Record<string, string> = {
  在用: 'green',
  报废: 'red',
  待确认: 'orange',
  已确认: 'blue',
  待转移确认: 'gold',
  待报废: 'volcano',
  已报废: 'red'
}

const MyMeasureTools: React.FC = () => {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [transferForm] = Form.useForm()
  const [scrapForm] = Form.useForm()
  const [ownedItems, setOwnedItems] = React.useState<MaterialAssetItem[]>([])
  const [pendingItems, setPendingItems] = React.useState<MaterialAssetItem[]>([])
  const [users, setUsers] = React.useState<MaterialAssetUserOption[]>([])
  const [loading, setLoading] = React.useState(false)
  const [transferOpen, setTransferOpen] = React.useState(false)
  const [scrapOpen, setScrapOpen] = React.useState(false)
  const [acting, setActing] = React.useState(false)
  const [currentItem, setCurrentItem] = React.useState<MaterialAssetItem | null>(null)

  const actorPayload = React.useMemo(() => ({
    userId: String((user as any)?.id || ''),
    operator: String(user?.real_name || '')
  }), [user])

  const loadMine = React.useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams(actorPayload)
      const res = await fetchWithFallback(`/api/material-assets/mine?${params.toString()}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.success === false) {
        throw new Error(String(json?.error || '加载我的量具失败'))
      }
      setOwnedItems(Array.isArray(json?.ownedItems) ? json.ownedItems : [])
      setPendingItems(Array.isArray(json?.pendingConfirmItems) ? json.pendingConfirmItems : [])
    } catch (error: any) {
      message.error(error?.message || '加载我的量具失败')
    } finally {
      setLoading(false)
    }
  }, [actorPayload])

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
          .filter((item) => item.real_name !== String(user?.real_name || ''))
      )
    } catch {}
  }, [user?.real_name])

  React.useEffect(() => {
    loadMine()
  }, [loadMine])

  React.useEffect(() => {
    loadUsers()
  }, [loadUsers])

  const postAction = async (url: string, body: Record<string, any>) => {
    const res = await fetchWithFallback(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...actorPayload,
        ...body
      })
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || json?.success === false) {
      throw new Error(String(json?.error || '操作失败'))
    }
  }

  const confirmResponsible = async (item: MaterialAssetItem) => {
    try {
      setActing(true)
      await postAction(`/api/material-assets/${encodeURIComponent(item.id)}/confirm-responsible`, {})
      message.success('责任人确认成功')
      loadMine()
    } catch (error: any) {
      message.error(error?.message || '责任人确认失败')
    } finally {
      setActing(false)
    }
  }

  const cancelTransfer = async (item: MaterialAssetItem) => {
    try {
      setActing(true)
      await postAction(`/api/material-assets/${encodeURIComponent(item.id)}/cancel-transfer`, {})
      message.success('已撤销责任人转移')
      loadMine()
    } catch (error: any) {
      message.error(error?.message || '撤销转移失败')
    } finally {
      setActing(false)
    }
  }

  const submitTransfer = async (values: any) => {
    if (!currentItem) return
    try {
      setActing(true)
      const target = users.find((item) => item.id === String(values.target_user_id || ''))
      await postAction(`/api/material-assets/${encodeURIComponent(currentItem.id)}/transfer`, {
        target_user_id: String(values.target_user_id || ''),
        target_name: String(target?.real_name || ''),
        remark: String(values.remark || '').trim()
      })
      message.success('已发起责任人转移，等待对方确认')
      setTransferOpen(false)
      transferForm.resetFields()
      setCurrentItem(null)
      loadMine()
    } catch (error: any) {
      message.error(error?.message || '转移责任人失败')
    } finally {
      setActing(false)
    }
  }

  const submitScrapRequest = async (values: any) => {
    if (!currentItem) return
    try {
      setActing(true)
      await postAction(`/api/material-assets/${encodeURIComponent(currentItem.id)}/scrap-request`, {
        reason: String(values.reason || '').trim()
      })
      message.success('报废申请已提交')
      setScrapOpen(false)
      scrapForm.resetFields()
      setCurrentItem(null)
      loadMine()
    } catch (error: any) {
      message.error(error?.message || '申请报废失败')
    } finally {
      setActing(false)
    }
  }

  const pendingColumns = [
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
      title: '待确认责任',
      width: 240,
      render: (_: any, record: MaterialAssetItem) => (
        <Space wrap size={[4, 4]}>
          {record.responsible_person ? <Tag color="blue">当前: {record.responsible_person}</Tag> : null}
          {record.pending_responsible_person ? <Tag color="gold">待确认: {record.pending_responsible_person}</Tag> : null}
          <Tag color={tagColorMap[record.responsibility_status] || 'default'}>{record.responsibility_status}</Tag>
        </Space>
      )
    },
    {
      title: '备注',
      dataIndex: 'remark',
      render: (value: string) => value || '-'
    },
    {
      title: '操作',
      width: 140,
      align: 'center' as const,
      render: (_: any, record: MaterialAssetItem) => (
        <Button type="link" onClick={() => confirmResponsible(record)} loading={acting}>
          确认责任人
        </Button>
      )
    }
  ]

  const ownedColumns = [
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
      title: '状态',
      width: 220,
      render: (_: any, record: MaterialAssetItem) => (
        <Space wrap size={[4, 4]}>
          <Tag color={tagColorMap[record.asset_status] || 'default'}>{record.asset_status}</Tag>
          <Tag color={tagColorMap[record.responsibility_status] || 'default'}>{record.responsibility_status}</Tag>
          {record.scrap_status !== '无' ? <Tag color={tagColorMap[record.scrap_status] || 'default'}>{record.scrap_status}</Tag> : null}
        </Space>
      )
    },
    {
      title: '转移状态',
      width: 180,
      render: (_: any, record: MaterialAssetItem) => (
        record.pending_responsible_person
          ? <Text type="warning">待 {record.pending_responsible_person} 确认</Text>
          : <Text type="secondary">-</Text>
      )
    },
    {
      title: '备注',
      width: 260,
      render: (_: any, record: MaterialAssetItem) => (
        <div>
          <div>{record.remark || '-'}</div>
          {record.scrap_reason ? <Text type="secondary">报废原因: {record.scrap_reason}</Text> : null}
        </div>
      )
    },
    {
      title: '操作',
      width: 260,
      align: 'center' as const,
      render: (_: any, record: MaterialAssetItem) => (
        <Space wrap>
          <Button
            type="link"
            disabled={record.asset_status === '报废'}
            onClick={() => {
              setCurrentItem(record)
              setTransferOpen(true)
            }}
          >
            转移责任人
          </Button>
          {record.responsibility_status === '待转移确认' && record.pending_responsible_person ? (
            <Button type="link" onClick={() => cancelTransfer(record)} loading={acting}>
              撤销转移
            </Button>
          ) : null}
          <Button
            type="link"
            danger
            disabled={record.asset_status === '报废' || record.scrap_status === '待报废'}
            onClick={() => {
              setCurrentItem(record)
              setScrapOpen(true)
            }}
          >
            报废申请
          </Button>
        </Space>
      )
    }
  ]

  return (
    <div style={{ padding: 16 }}>
      <Card bordered={false}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <div>
            <Title level={4} style={{ margin: 0 }}>我的量具</Title>
            <Text type="secondary">这里显示已确认归属你的量具，以及等待你确认接收责任的量具。</Text>
          </div>
          <Space wrap>
            <Button icon={<ReloadOutlined />} onClick={loadMine}>刷新</Button>
            <Button icon={<LeftOutlined />} onClick={() => navigate('/dashboard')}>返回</Button>
          </Space>
        </div>

        <Card size="small" title="待我确认" style={{ marginBottom: 16 }}>
          <Table
            rowKey="id"
            loading={loading}
            dataSource={pendingItems}
            columns={pendingColumns as any}
            locale={{ emptyText: '暂无待确认数据' }}
            pagination={{ pageSize: 10, showSizeChanger: true }}
            scroll={{ x: 'max-content' }}
          />
        </Card>

        <Card size="small" title="我负责的量具">
          <Table
            rowKey="id"
            loading={loading}
            dataSource={ownedItems}
            columns={ownedColumns as any}
            locale={{ emptyText: '暂无归属你的量具' }}
            pagination={{ pageSize: 10, showSizeChanger: true }}
            scroll={{ x: 'max-content' }}
          />
        </Card>
      </Card>

      <Modal
        title={currentItem ? `转移责任人 - ${currentItem.name}` : '转移责任人'}
        open={transferOpen}
        onCancel={() => {
          setTransferOpen(false)
          setCurrentItem(null)
          transferForm.resetFields()
        }}
        footer={null}
        destroyOnClose
      >
        <Form form={transferForm} layout="vertical" onFinish={submitTransfer}>
          <Form.Item label="接收责任人" name="target_user_id" rules={[{ required: true, message: '请选择接收责任人' }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={users.map((item) => ({
                value: item.id,
                label: item.real_name
              }))}
            />
          </Form.Item>
          <Form.Item label="转移说明" name="remark">
            <Input.TextArea rows={3} placeholder="可选，说明本次责任转移原因" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => {
                setTransferOpen(false)
                setCurrentItem(null)
                transferForm.resetFields()
              }}>
                取消
              </Button>
              <Button type="primary" htmlType="submit" loading={acting}>
                提交
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={currentItem ? `报废申请 - ${currentItem.name}` : '报废申请'}
        open={scrapOpen}
        onCancel={() => {
          setScrapOpen(false)
          setCurrentItem(null)
          scrapForm.resetFields()
        }}
        footer={null}
        destroyOnClose
      >
        <Form form={scrapForm} layout="vertical" onFinish={submitScrapRequest}>
          <Form.Item label="报废原因" name="reason" rules={[{ required: true, message: '请填写报废原因' }]}>
            <Input.TextArea rows={4} placeholder="请明确填写损坏、精度异常、无法修复等原因" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => {
                setScrapOpen(false)
                setCurrentItem(null)
                scrapForm.resetFields()
              }}>
                取消
              </Button>
              <Button type="primary" danger htmlType="submit" loading={acting}>
                提交申请
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default MyMeasureTools
