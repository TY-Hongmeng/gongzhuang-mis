import React, { useMemo, useCallback, useRef, memo } from 'react'
import { Table, Button, Space, message, Modal, Tag, Tooltip, Badge } from 'antd'
import { PlusOutlined, DeleteOutlined, CopyOutlined, FilterOutlined } from '@ant-design/icons'
import { useChildItemTable } from '../../hooks/useChildItemTable'
import { useAdvancedSearch } from '../../hooks/useAdvancedSearch'
import EditableCell from '../../components/EditableCell'

interface ChildItemTableProps {
  toolingId: string
  childItems: any[]
  selectedRowKeys: string[]
  onEdit: (id: string, key: string, value: any) => void
  onSelectChange: (keys: string[]) => void
  onDelete?: (id: string) => void
  onCreate?: () => void
  onBatchDelete?: (ids: string[]) => void
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

export const ChildItemTable: React.FC<ChildItemTableProps> = memo(({
  toolingId,
  childItems,
  selectedRowKeys,
  onEdit,
  onSelectChange,
  onDelete,
  onCreate,
  onBatchDelete
}) => {
  const { 
    columns, 
    unitOptions,
    validateQuantity,
    validateRequiredDate,
    getChildItemStatus
  } = useChildItemTable({ toolingId, onEdit })

  const {
    filteredData,
    activeFiltersCount,
    hasActiveFilters,
    resetFilters
  } = useAdvancedSearch(childItems)

  const tableRef = useRef<any>(null)

  const handleCellEdit = useCallback((record: any, dataIndex: string, value: any) => {
    if (dataIndex === 'quantity' && !validateQuantity(value)) {
      message.error('请输入有效的数量（大于等于0的数字）')
      return
    }
    
    if (dataIndex === 'required_date' && !validateRequiredDate(value)) {
      message.error('请输入有效的日期（格式：YYYY-MM-DD）')
      return
    }

    onEdit(record.id, dataIndex, value)
  }, [onEdit, validateQuantity, validateRequiredDate])

  const handleDelete = useCallback((record: any) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除标准件"${record.name || record.model || '未命名'}"吗？`,
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
      message.warning('请先选择要删除的标准件')
      return
    }

    Modal.confirm({
      title: '确认批量删除',
      content: `确定要删除选中的 ${selectedRowKeys.length} 个标准件吗？`,
      okText: '确认',
      cancelText: '取消',
      onOk: () => {
        if (onBatchDelete) {
          onBatchDelete(selectedRowKeys)
        }
      }
    })
  }, [selectedRowKeys, onBatchDelete])

  const getRowClassName = useCallback((record: any) => {
    const { status } = getChildItemStatus(record)
    if (status === 'complete') return 'child-row-complete'
    if (status === 'warning') return 'child-row-warning'
    return ''
  }, [getChildItemStatus])

  const actionColumn = useMemo(() => ({
    title: '操作',
    key: 'actions',
    width: 120,
    fixed: 'right',
    render: (_: any, record: any) => (
      <Space size="small">
        <Tooltip title="复制名称">
          <Button
            type="link"
            size="small"
            icon={<CopyOutlined />}
            onClick={() => onEdit(record.id, 'name', record.name)}
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
    render: (_: any, record: any) => {
      const { status } = getChildItemStatus(record)
      return <StatusBadge status={status} />
    }
  }), [getChildItemStatus])

  const fullColumns = useMemo(() => [statusColumn, ...columns, actionColumn], [statusColumn, columns, actionColumn])

  const statistics = useMemo(() => {
    const total = filteredData.length
    const complete = filteredData.filter(item => getChildItemStatus(item).status === 'complete').length
    const warning = filteredData.filter(item => getChildItemStatus(item).status === 'warning').length
    const incomplete = filteredData.filter(item => item.id.startsWith('blank-')).length
    
    return { total, complete, warning, incomplete }
  }, [filteredData, getChildItemStatus])

  return (
    <div>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: 12,
        padding: '8px 12px',
        background: '#f5f5f5',
        borderRadius: 4
      }}>
        <div style={{ fontWeight: 600, color: '#52c41a' }}>
          标准件信息
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
            添加标准件
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
        pagination={{
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条，共 ${total} 条`,
          pageSizeOptions: ['10', '20', '50', '100'],
          defaultPageSize: 20
        }}
        bordered={false}
        size="small"
        scroll={{ x: 1100, y: 400 }}
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
                onSave={handleCellEdit}
                options={props?.dataIndex === 'unit' ? unitOptions.map((u: any) => u.value) : undefined}
              />
            )
          }
        }}
      />
      
      <style jsx>{`
        .child-row-complete {
          background-color: #f6ffed;
        }
        
        .child-row-warning {
          background-color: #fffbe6;
        }
        
        .ant-table-tbody > tr:hover > td {
          background-color: #e6f7ff !important;
        }
      `}</style>
    </div>
  )
})

ChildItemTable.displayName = 'ChildItemTable'
