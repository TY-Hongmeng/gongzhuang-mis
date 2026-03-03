import React, { useMemo, useCallback } from 'react'
import { Tag, Tooltip } from 'antd'
import { CheckCircleOutlined, WarningOutlined, ClockCircleOutlined } from '@ant-design/icons'
import { useToolingMeta } from '../useToolingMeta'

interface ToolingTableProps {
  onEdit: (id: string, key: string, value: any) => void
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

export const useToolingTable = ({ onEdit }: ToolingTableProps) => {
  const { productionUnits, toolingCategories } = useToolingMeta()

  const productionUnitOptions = useMemo(() => 
    productionUnits.map(u => ({ value: u, label: u }))
  , [productionUnits])

  const categoryOptions = useMemo(() => 
    toolingCategories.map(c => ({ value: c, label: c }))
  , [toolingCategories])

  const validateInventoryNumber = useCallback((value: any): boolean => {
    if (!value || value.trim() === '') return true
    const trimmed = String(value).trim().toUpperCase()
    const regex = /^[A-Z]{2}\d{6}$/
    return regex.test(trimmed)
  }, [])

  const validateSetsCount = useCallback((value: any): boolean => {
    if (value === '' || value === null || value === undefined) return true
    const num = Number(value)
    return !isNaN(num) && num >= 1
  }, [])

  const getToolingStatus = useCallback((item: ToolingItem): { status: 'complete' | 'incomplete' | 'warning', icon: React.ReactNode } => {
    // 只要有完成日期，就是完成状态
    const hasCompletedDate = !!item.completed_date && item.completed_date.trim() !== ''

    if (hasCompletedDate) {
      return {
        status: 'complete',
        icon: <CheckCircleOutlined style={{ color: '#52c41a' }} />
      }
    }

    if (item.id.startsWith('blank-')) {
      return {
        status: 'incomplete',
        icon: null
      }
    }

    return {
      status: 'warning',
      icon: <WarningOutlined style={{ color: '#faad14' }} />
    }
  }, [])

  const columns = useMemo(() => [
    {
      title: '状态',
      dataIndex: 'status',
      width: 60,
      fixed: 'left',
      render: (_: any, record: ToolingItem) => {
        const { icon } = getToolingStatus(record)
        return icon ? <Tooltip title={getToolingStatus(record).status}>{icon}</Tooltip> : null
      }
    },
    {
      title: '盘存编号',
      dataIndex: 'inventory_number',
      width: 160,
      editable: true,
      render: (text: string, record: ToolingItem) => {
        if (!text || text.trim() === '') {
          return <span style={{ color: '#999' }}>待生成</span>
        }
        if (!validateInventoryNumber(text)) {
          return <span style={{ color: '#ff4d4f' }}>{text}</span>
        }
        return text
      }
    },
    {
      title: '投产单位',
      dataIndex: 'production_unit',
      width: 120,
      editable: true,
      render: (text: string) => {
        if (!text || text.trim() === '') {
          return <span style={{ color: '#999' }}>未选择</span>
        }
        return <Tag color="blue">{text}</Tag>
      }
    },
    {
      title: '类别',
      dataIndex: 'category',
      width: 120,
      editable: true,
      render: (text: string) => {
        if (!text || text.trim() === '') {
          return <span style={{ color: '#999' }}>未选择</span>
        }
        return <Tag color="purple">{text}</Tag>
      }
    },
    {
      title: '接收日期',
      dataIndex: 'received_date',
      width: 120,
      editable: true,
      render: (text: string) => {
        if (!text || text.trim() === '') {
          return <span style={{ color: '#999' }}>待填写</span>
        }
        return text
      }
    },
    {
      title: '需求日期',
      dataIndex: 'demand_date',
      width: 120,
      editable: true,
      render: (text: string) => {
        if (!text || text.trim() === '') {
          return <span style={{ color: '#999' }}>待填写</span>
        }
        return text
      }
    },
    {
      title: '完成日期',
      dataIndex: 'completed_date',
      width: 120,
      editable: true,
      render: (text: string) => {
        if (!text || text.trim() === '') {
          return <span style={{ color: '#999' }}>未完成</span>
        }
        return <Tag color="green">{text}</Tag>
      }
    },
    {
      title: '项目名称',
      dataIndex: 'project_name',
      width: 200,
      editable: true,
      render: (text: string) => {
        if (!text || text.trim() === '') {
          return <span style={{ color: '#999' }}>未填写</span>
        }
        return <Tooltip title={text}>
          <span style={{ 
            display: 'inline-block',
            maxWidth: 180,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>{text}</span>
        </Tooltip>
      }
    },
    {
      title: '投产日期',
      dataIndex: 'production_date',
      width: 120,
      editable: true,
      render: (text: string) => {
        if (!text || text.trim() === '') {
          return <span style={{ color: '#999' }}>待填写</span>
        }
        return text
      }
    },
    {
      title: '套数',
      dataIndex: 'sets_count',
      width: 80,
      editable: true,
      render: (text: number, record: ToolingItem) => {
        if (!validateSetsCount(text)) {
          return <span style={{ color: '#ff4d4f' }}>{text || 1}</span>
        }
        return text || 1
      }
    },
    {
      title: '录入人',
      dataIndex: 'recorder',
      width: 100,
      editable: true,
      render: (text: string) => {
        if (!text || text.trim() === '') {
          return <span style={{ color: '#999' }}>待填写</span>
        }
        return <Tag color="cyan">{text}</Tag>
      }
    }
  ], [
    productionUnits,
    toolingCategories,
    validateInventoryNumber,
    validateSetsCount,
    getToolingStatus
  ])

  return {
    columns,
    productionUnitOptions,
    categoryOptions,
    validateInventoryNumber,
    validateSetsCount,
    getToolingStatus
  }
}
