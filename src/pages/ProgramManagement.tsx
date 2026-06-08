import React from 'react'
import { Button, Card, Input, Segmented, Space, Table, Typography, message } from 'antd'
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
  programmers: string
  total_quantity: number
  completed_quantity: number
  quantity_progress_display: string
  completion_status_key: 'all' | 'pending' | 'processing' | 'completed'
  program_count: number
  program_total_hours: number
  program_runtime_hours: number
  program_span_hours: number
  average_runtime_hours: number | null
  average_runtime_hours_display: string
  program_runtime_display: string
  program_start_end_display: string
  operator_display: string
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
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'pending' | 'processing' | 'completed'>('completed')
  const autoFallbackDoneRef = React.useRef(false)

  const formatQuantity = React.useCallback((value: number) => {
    const num = Number(value || 0)
    if (!Number.isFinite(num) || num <= 0) return '0'
    if (Math.abs(num - Math.round(num)) < 0.000001) return String(Math.round(num))
    return num.toFixed(2)
  }, [])

  const formatHours = React.useCallback((value: number | null | undefined) => {
    const num = Number(value)
    if (!Number.isFinite(num)) return '-'
    return num.toFixed(2)
  }, [])

  const formatPercent = React.useCallback((numerator: number | null | undefined, denominator: number | null | undefined) => {
    const num = Number(numerator)
    const den = Number(denominator)
    if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) return '-'
    return `${((num / den) * 100).toFixed(0)}%`
  }, [])

  const renderCompareCell = React.useCallback((left: string, right: string, percent: string) => (
    <div
      style={{
        display: 'inline-grid',
        gridTemplateColumns: 'max-content 12px max-content max-content',
        alignItems: 'center',
        columnGap: 4,
        whiteSpace: 'nowrap'
      }}
    >
      <span style={{ minWidth: 40, textAlign: 'right' }}>{left || '-'}</span>
      <span style={{ textAlign: 'center' }}>/</span>
      <span style={{ minWidth: 40, textAlign: 'left' }}>{right || '-'}</span>
      <span style={{ color: '#8c8c8c', marginLeft: 6 }}>{percent || '-'}</span>
    </div>
  ), [])

  const loadData = React.useCallback(async (
    nextPage = page,
    nextPageSize = pageSize,
    nextSearch = searchText,
    nextStatus = statusFilter
  ) => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      params.set('page', String(nextPage))
      params.set('pageSize', String(nextPageSize))
      if (String(nextSearch || '').trim()) params.set('search', String(nextSearch || '').trim())
      if (nextStatus && nextStatus !== 'all') params.set('status', nextStatus)
      const resp = await fetchWithFallback(`/api/tooling/program-management?${params.toString()}`)
      const json = await resp.json()
      if (!resp.ok || !json?.success) {
        throw new Error(String(json?.error || `加载失败: ${resp.status}`))
      }
      const trimmedSearch = String(nextSearch || '').trim()
      const totalCount = Number(json?.total || 0)
      if (
        nextStatus === 'completed' &&
        !trimmedSearch &&
        nextPage === 1 &&
        !autoFallbackDoneRef.current &&
        totalCount === 0
      ) {
        autoFallbackDoneRef.current = true
        message.info('完成状态暂无数据，已自动切换到全部')
        setStatusFilter('all')
        return
      }
      setItems(Array.isArray(json?.items) ? json.items : [])
      setTotal(totalCount)
    } catch (error: any) {
      message.error(error?.message || '加载程序管理数据失败')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, searchText, statusFilter])

  React.useEffect(() => {
    loadData(page, pageSize, searchText, statusFilter)
  }, [loadData, page, pageSize, searchText, statusFilter])

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
      width: 120
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
      width: 135,
      render: (value: string) => value || '-'
    },
    {
      title: '零件编号',
      dataIndex: 'part_drawing_number',
      align: 'center' as const,
      width: 240
    },
    {
      title: '工艺工序',
      dataIndex: 'process_name',
      align: 'center' as const,
      width: 110
    },
    {
      title: '编程人',
      key: 'programmer_summary',
      align: 'center' as const,
      width: 75,
      render: (_: any, record: ProgramManagementItem) => {
        const programmerText = String(record.programmers || '').trim()
        const countText = formatQuantity(record.program_count)
        if (!programmerText && !record.program_count) return '-'
        if (!programmerText) return `-(${countText})`
        return `${programmerText}(${countText})`
      }
    },
    {
      title: '完成/总数',
      dataIndex: 'quantity_progress_display',
      align: 'center' as const,
      width: 110,
      render: (value: string) => value || '-'
    },
    {
      title: '单件实际/理论(小时)',
      key: 'single_compare',
      align: 'center' as const,
      width: 170,
      render: (_: any, record: ProgramManagementItem) => {
        const actualText = record.average_runtime_hours_display || '-'
        const theoryText = record.program_total_hours > 0 ? formatHours(record.program_total_hours) : '-'
        const percentText = actualText === '-' || theoryText === '-' ? '-' : formatPercent(record.average_runtime_hours, record.program_total_hours)
        return renderCompareCell(actualText, theoryText, percentText)
      }
    },
    {
      title: '总加工/自然(小时)',
      key: 'runtime_compare',
      align: 'center' as const,
      width: 170,
      render: (_: any, record: ProgramManagementItem) => {
        const runtimeText = record.program_runtime_hours > 0 ? formatHours(record.program_runtime_hours) : '-'
        const spanText = record.program_start_end_display === '-' ? '-' : formatHours(record.program_span_hours)
        const percentText = runtimeText === '-' || spanText === '-' ? '-' : formatPercent(record.program_runtime_hours, record.program_span_hours)
        return renderCompareCell(runtimeText, spanText, percentText)
      }
    },
    {
      title: '操作者',
      dataIndex: 'operator_display',
      align: 'center' as const,
      width: 270,
      render: (value: string) => <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{value || '-'}</div>
    },
    {
      title: '加工起止时间',
      dataIndex: 'program_start_end_display',
      align: 'center' as const,
      width: 210,
      render: (value: string) => <div style={{ whiteSpace: 'nowrap' }}>{value || '-'}</div>
    },
    {
      title: '设备编号',
      dataIndex: 'device_no_display',
      align: 'center' as const,
      width: 72,
      render: (value: string) => <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{value || '-'}</div>
    }
  ], [formatHours, formatPercent, formatQuantity, page, pageSize, renderCompareCell])

  return (
    <div style={{ padding: 16 }}>
      <Card bordered={false}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12, padding: '12px 16px', background: '#f5f5f5', borderRadius: 4 }}>
          <Title level={4} style={{ margin: 0 }}>程序管理</Title>
          <Space wrap>
            <Segmented
              value={statusFilter}
              onChange={(value) => {
                setPage(1)
                setStatusFilter(value as 'all' | 'pending' | 'processing' | 'completed')
              }}
              options={[
                { label: '全部', value: 'all' },
                { label: '未加工', value: 'pending' },
                { label: '加工中', value: 'processing' },
                { label: '完成', value: 'completed' }
              ]}
            />
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
              onClick={() => loadData(page, pageSize, searchText, statusFilter)}
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
