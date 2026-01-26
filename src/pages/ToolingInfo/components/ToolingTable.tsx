import React, { useMemo, useCallback, useRef, memo } from 'react'
import { Table, Button, Space, message, Modal, Tag, Tooltip, Badge } from 'antd'
import { PlusOutlined, DeleteOutlined, EditOutlined, CopyOutlined, DownloadOutlined, SearchOutlined, FilterOutlined } from '@ant-design/icons'
import { useToolingTable } from '../../hooks/useToolingTable'
import { useAdvancedSearch } from '../../hooks/useAdvancedSearch'
import EditableCell from '../../components/EditableCell'
import { useToolingOperations } from '../../hooks/useToolingOperations'

interface ToolingTableProps {
  data: any[]
  loading: boolean
  selectedRowKeys: string[]
  expandedRowKeys: string[]
  onEdit: (id: string, key: string, value: any) => void
  onSelectChange: (keys: string[]) => void
  onExpand: (keys: string[]) => void
  onCreate?: () => void
  onDelete?: (id: string) => void
  onBatchDelete?: (ids: string[]) => void
  onExport?: () => void
  onGenerateInventoryNumber?: (id: string) => void
}

interface ToolingItem {
  id: string
  inventory_number?: string
  production_unit?: string
  category?: string
  received_date?: string
  demand_date?: string
  completed_date?: string
  project_name?: string
  production_date?: string
  sets_count?: number
  recorder?: string
}

const StatusBadge = memo(({ status }: { status: 'complete' | 'incomplete' | 'warning' }) => {
  const config = {
    complete: { color: 'success', text: '完整' },
    incomplete: { color: 'default', text: '空白' },
    warning: { color: 'warning', text: '缺失' }
  }
  const { color, text } = config[status]
  return <Badge status={color as any} text={text} />
})

StatusBadge.displayName = 'StatusBadge'

export const ToolingTable: React.FC<ToolingTableProps> = memo(({
  data,
  loading,
  selectedRowKeys,
  expandedRowKeys,
  onEdit,
  onSelectChange,
  onExpand,
  onCreate,
  onDelete,
  onBatchDelete,
  onExport,
  onGenerateInventoryNumber
}) => {
  const { 
    columns, 
    productionUnitOptions, 
    categoryOptions,
    validateInventoryNumber,
    validateSetsCount,
    getToolingStatus
  } = useToolingTable(onEdit)

  const {
    filteredData,
    activeFiltersCount,
    hasActiveFilters,
    applyFilters,
    resetFilters
  } = useAdvancedSearch(data)

  const tableRef = useRef<any>(null)

  const handleDelete = useCallback((record: ToolingItem) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除工装"${record.project_name || record.inventory_number || '未命名'}"吗？`,
      okText: '确认',
      cancelText: '取消',
      onOk: () => {
        if (onDelete) {
          onDelete(record.id)
        }
      }
    })
  }, [onDelete])

  const handleBatchDelete = useCallback(() => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先选择要删除的工装')
      return
    }

    Modal.confirm({
      title: '确认批量删除',
      content: `确定要删除选中的 ${selectedRowKeys.length} 个工装吗？`,
      okText: '确认',
      cancelText: '取消',
      onOk: () => {
        if (onBatchDelete) {
          onBatchDelete(selectedRowKeys)
        }
      }
    })
  }, [selectedRowKeys, onBatchDelete])

  const handleExport = useCallback(() => {
    if (onExport) {
      onExport()
    }
  }, [onExport])

  const handleGenerateInventoryNumber = useCallback((record: ToolingItem) => {
    if (onGenerateInventoryNumber) {
      onGenerateInventoryNumber(record.id)
    }
  }, [onGenerateInventoryNumber])

  const getRowClassName = useCallback((record: ToolingItem) => {
    const { status } = getToolingStatus(record)
    if (status === 'complete') return 'tooling-row-complete'
    if (status === 'warning') return 'tooling-row-warning'
    return ''
  }, [getToolingStatus])

  const actionColumn = useMemo(() => ({
    title: '操作',
    key: 'actions',
    width: 200,
    fixed: 'right',
    render: (_: any, record: ToolingItem) => (
      <Space size="small">
        <Tooltip title="编辑">
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => onEdit(record.id, 'inventory_number', record.inventory_number)}
          />
        </Tooltip>
        <Tooltip title="复制项目名称">
          <Button
            type="link"
            size="small"
            icon={<CopyOutlined />}
            onClick={() => onEdit(record.id, 'project_name', record.project_name)}
          />
        </Tooltip>
        <Tooltip title="删除">
          <Button
            type="link"
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(record)}
          />
        </Tooltip>
      </Space>
    )
  }), [onEdit, handleDelete])

  const statusColumn = useMemo(() => ({
    title: '状态',
    key: 'status',
    width: 100,
    render: (_: any, record: ToolingItem) => {
      const { status } = getToolingStatus(record)
      return <StatusBadge status={status} />
    }
  }), [getToolingStatus])

  const fullColumns = useMemo(() => [statusColumn, ...columns, actionColumn], [statusColumn, columns, actionColumn])

  const statistics = useMemo(() => {
    const total = filteredData.length
    const complete = filteredData.filter(item => getToolingStatus(item).status === 'complete').length
    const warning = filteredData.filter(item => getToolingStatus(item).status === 'warning').length
    const incomplete = filteredData.filter(item => item.id.startsWith('blank-')).length
    
    return { total, complete, warning, incomplete }
  }, [filteredData, getToolingStatus])

  return (
    <div>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: 12,
        padding: '12px 16px',
        background: '#f5f5f5',
        borderRadius: 4
      }}>
        <div style={{ fontWeight: 600, color: '#1890ff' }}>
          工装信息
          {hasActiveFilters && (
            <Tag color="blue" style={{ marginLeft: 8 }}>
              <FilterOutlined /> 已筛选 {activeFiltersCount} 项
            </Tag>
          )}
          <span style={{ marginLeft: 12, fontSize: 12, color: '#666' }}>
            显示 {statistics.total} 项 | 
            <span style={{ color: '#52c41a' }}> 完整 {statistics.complete}</span> | 
            <span style={{ color: '#faad14' }}> 缺失 {statistics.warning}</span> | 
            <span style={{ color: '#999' }}> 空白 {statistics.incomplete}</span>
          </span>
        </div>
        <Space>
          <Button
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            onClick={onCreate}
          >
            添加工装
          </Button>
          <Button
            size="small"
            icon={<DownloadOutlined />}
            onClick={handleExport}
            disabled={selectedRowKeys.length === 0}
          >
            导出
          </Button>
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={handleBatchDelete}
            disabled={selectedRowKeys.length === 0}
          >
            批量删除
          </Button>
          {hasActiveFilters && (
            <Button
              size="small"
              onClick={resetFilters}
            >
              清除筛选
            </Button>
          )}
        </Space>
      </div>
      
      <Table
        ref={tableRef}
        rowKey="id"
        columns={fullColumns}
        dataSource={filteredData}
        loading={loading}
        pagination={{
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条，共 ${total} 条`,
          pageSizeOptions: ['10', '20', '50', '100'],
          defaultPageSize: 20
        }}
        bordered={false}
        size="small"
        scroll={{ x: 1500, y: 500 }}
        expandable={{
          expandedRowKeys,
          onExpand: (expanded, record) => {
            const keys = expanded
              ? [...expandedRowKeys, record.id]
              : expandedRowKeys.filter(k => k !== record.id)
            onExpand(keys)
          }
        }}
        rowClassName={getRowClassName}
        rowSelection={{
          selectedRowKeys,
          onChange: onSelectChange,
          getCheckboxProps: (record: any) => ({
            disabled: String(record.id || '').startsWith('blank-')
          })
        }}
        components={{
          body: {
            cell: (props: any) => (
              <EditableCell
                {...props}
                onSave={onEdit}
                productionUnitOptions={productionUnitOptions}
                categoryOptions={categoryOptions}
              />
            )
          }
        }}
      />
      
      <style jsx>{`
        .tooling-row-complete {
          background-color: #f6ffed;
        }
        
        .tooling-row-warning {
          background-color: #fffbe6;
        }
        
        .ant-table-tbody > tr:hover > td {
          background-color: #e6f7ff !important;
        }
      `}</style>
    </div>
  )
})

ToolingTable.displayName = 'ToolingTable'
