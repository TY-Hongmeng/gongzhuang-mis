import React from 'react'
import { Button, Card, Input, Space, Table, Typography, message } from 'antd'
import { LeftOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { fetchWithFallback } from '../utils/api'

const { Title } = Typography

interface ProgramManagementItem {
  key: string
  part_inventory_number: string
  project_name: string
  part_name: string
  part_drawing_number: string
  process_name: string
  total_quantity: number
  completed_quantity: number
  completion_status: string
  program_count: number
  program_total_hours: number
  average_program_hours: number
  program_runtime_hours: number
  average_runtime_hours: number
  program_runtime_display: string
  program_start_end_display: string
  device_no_display: string
}

const ProgramManagement: React.FC = () => {
  const navigate = useNavigate()
  const [loading, setLoading] = React.useState(false)
  const [items, setItems] = React.useState<ProgramManagementItem[]>([])
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(50)
  const [total, setTotal] = React.useState(0)
  const [searchText, setSearchText] = React.useState('')
  const [searchInput, setSearchInput] = React.useState('')

  const formatQuantity = React.useCallback((value: number) => {
    const num = Number(value || 0)
    if (!Number.isFinite(num) || num <= 0) return '0'
    if (Math.abs(num - Math.round(num)) < 0.000001) return String(Math.round(num))
    return num.toFixed(2)
  }, [])

  const loadData = React.useCallback(async (nextPage = page, nextPageSize = pageSize, nextSearch = searchText) => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      params.set('page', String(nextPage))
      params.set('pageSize', String(nextPageSize))
      if (String(nextSearch || '').trim()) params.set('search', String(nextSearch || '').trim())
      const resp = await fetchWithFallback(`/api/tooling/program-management?${params.toString()}`)
      const json = await resp.json()
      if (!resp.ok || !json?.success) {
        throw new Error(String(json?.error || `加载失败: ${resp.status}`))
      }
      setItems(Array.isArray(json?.items) ? json.items : [])
      setTotal(Number(json?.total || 0))
    } catch (error: any) {
      message.error(error?.message || '加载程序管理数据失败')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, searchText])

  React.useEffect(() => {
    loadData(page, pageSize, searchText)
  }, [loadData, page, pageSize, searchText])

  const columns = React.useMemo(() => [
    {
      title: '序号',
      key: 'row_index',
      align: 'center' as const,
      width: 80,
      render: (_: any, __: ProgramManagementItem, index: number) => ((page - 1) * pageSize) + index + 1
    },
    {
      title: '盘存编号',
      dataIndex: 'part_inventory_number',
      align: 'center' as const,
      width: 180
    },
    {
      title: '项目名称',
      dataIndex: 'project_name',
      align: 'center' as const,
      width: 180,
      render: (value: string) => value || '-'
    },
    {
      title: '零件名称',
      dataIndex: 'part_name',
      align: 'center' as const,
      width: 180,
      render: (value: string) => value || '-'
    },
    {
      title: '零件编号',
      dataIndex: 'part_drawing_number',
      align: 'center' as const,
      width: 180
    },
    {
      title: '工艺工序',
      dataIndex: 'process_name',
      align: 'center' as const,
      width: 160
    },
    {
      title: '总数量',
      dataIndex: 'total_quantity',
      align: 'center' as const,
      width: 90,
      render: (value: number) => formatQuantity(value)
    },
    {
      title: '完成数量',
      dataIndex: 'completed_quantity',
      align: 'center' as const,
      width: 90,
      render: (value: number) => formatQuantity(value)
    },
    {
      title: '状态',
      dataIndex: 'completion_status',
      align: 'center' as const,
      width: 150,
      render: (value: string) => value || '-'
    },
    {
      title: '程序数量',
      dataIndex: 'program_count',
      align: 'center' as const,
      width: 100
    },
    {
      title: '程序总时长(小时)',
      dataIndex: 'program_total_hours',
      align: 'center' as const,
      width: 140,
      render: (value: number) => Number(value || 0).toFixed(2)
    },
    {
      title: '单件程序时长(小时)',
      dataIndex: 'average_program_hours',
      align: 'center' as const,
      width: 150,
      render: (value: number) => Number(value || 0).toFixed(2)
    },
    {
      title: '程序运行时间',
      dataIndex: 'program_runtime_display',
      align: 'center' as const,
      width: 280,
      render: (value: string) => <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{value || '-'}</div>
    },
    {
      title: '单件运行时长(小时)',
      dataIndex: 'average_runtime_hours',
      align: 'center' as const,
      width: 150,
      render: (value: number) => Number(value || 0).toFixed(2)
    },
    {
      title: '程序起止',
      dataIndex: 'program_start_end_display',
      align: 'center' as const,
      width: 260,
      render: (value: string) => <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{value || '-'}</div>
    },
    {
      title: '设备编号',
      dataIndex: 'device_no_display',
      align: 'center' as const,
      width: 180,
      render: (value: string) => <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{value || '-'}</div>
    }
  ], [formatQuantity, page, pageSize])

  return (
    <div style={{ padding: 16 }}>
      <Card bordered={false}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12, padding: '12px 16px', background: '#f5f5f5', borderRadius: 4 }}>
          <Title level={4} style={{ margin: 0 }}>程序管理</Title>
          <Space wrap>
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="搜索盘存编号、项目名称、零件名称、零件编号、工序"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onPressEnter={() => {
                setPage(1)
                setSearchText(searchInput.trim())
              }}
              style={{ width: 260 }}
            />
            <Button
              type="primary"
              onClick={() => {
                setPage(1)
                setSearchText(searchInput.trim())
              }}
            >
              查询
            </Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => loadData(page, pageSize, searchText)}
            >
              刷新
            </Button>
            <Button icon={<LeftOutlined />} onClick={() => navigate('/dashboard')}>
              返回
            </Button>
          </Space>
        </div>

        <Table
          rowKey="key"
          bordered={false}
          size="small"
          loading={loading}
          dataSource={items}
          columns={columns as any}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (count) => `共 ${count} 条`,
            onChange: (nextPage, nextPageSize) => {
              setPage(nextPage)
              setPageSize(nextPageSize)
            }
          }}
          scroll={{ x: 'max-content' }}
        />
      </Card>
    </div>
  )
}

export default ProgramManagement
