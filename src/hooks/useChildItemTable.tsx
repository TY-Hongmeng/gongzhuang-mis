import React, { useMemo, useCallback } from 'react'
import { Tag, Tooltip } from 'antd'
import { CheckCircleOutlined, WarningOutlined } from '@ant-design/icons'

interface ChildItemTableProps {
  toolingId: string
  onEdit: (id: string, key: string, value: any) => void
}

interface ChildItem {
  id: string
  tooling_id: string
  name: string
  model: string
  quantity: number | null
  unit: string | null
  required_date: string
  remark?: string
  type?: string
}

export const useChildItemTable = ({ toolingId, onEdit }: ChildItemTableProps) => {
  const unitOptions = useMemo(() => 
    ['件', '套', '个', 'kg', 'm', 'cm', 'mm'].map(u => ({ value: u, label: u }))
  , [])

  const validateQuantity = useCallback((value: any): boolean => {
    if (value === '' || value === null || value === undefined) return true
    const num = Number(value)
    return !isNaN(num) && num >= 0
  }, [])

  const validateRequiredDate = useCallback((value: any): boolean => {
    if (!value || value.trim() === '') return true
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    return dateRegex.test(value)
  }, [])

  const getChildItemStatus = useCallback((item: ChildItem): { status: 'complete' | 'incomplete' | 'warning', icon: React.ReactNode } => {
    const hasName = !!item.name && item.name.trim() !== ''
    const hasModel = !!item.model && item.model.trim() !== ''
    const hasQuantity = item.quantity !== null && item.quantity !== undefined && Number(item.quantity) > 0
    const hasUnit = !!item.unit && item.unit.trim() !== ''
    const hasRequiredDate = !!item.required_date && item.required_date.trim() !== ''

    if (hasName && hasModel && hasQuantity && hasUnit && hasRequiredDate) {
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
      render: (_: any, record: ChildItem) => {
        const { icon } = getChildItemStatus(record)
        return icon ? <Tooltip title={getChildItemStatus(record).status}>{icon}</Tooltip> : null
      }
    },
    {
      title: '名称',
      dataIndex: 'name',
      width: 150,
      editable: true,
      render: (text: string) => {
        if (!text || text.trim() === '') {
          return <span style={{ color: '#999' }}>待填写</span>
        }
        return text
      }
    },
    {
      title: '型号',
      dataIndex: 'model',
      width: 150,
      editable: true,
      render: (text: string) => {
        if (!text || text.trim() === '') {
          return <span style={{ color: '#999' }}>待填写</span>
        }
        return text
      }
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      width: 80,
      editable: true,
      render: (text: number, record: ChildItem) => {
        if (!validateQuantity(text)) {
          return <span style={{ color: '#ff4d4f' }}>{text || ''}</span>
        }
        return text || ''
      }
    },
    {
      title: '单位',
      dataIndex: 'unit',
      width: 80,
      editable: true,
      render: (text: string) => {
        if (!text || text.trim() === '') {
          return <span style={{ color: '#999' }}>未选择</span>
        }
        return <Tag color="blue">{text}</Tag>
      }
    },
    {
      title: '需求日期',
      dataIndex: 'required_date',
      width: 120,
      editable: true,
      render: (text: string, record: ChildItem) => {
        if (!text || text.trim() === '') {
          return <span style={{ color: '#999' }}>待填写</span>
        }
        if (!validateRequiredDate(text)) {
          return <span style={{ color: '#ff4d4f' }}>{text}</span>
        }
        return text
      }
    },
    {
      title: '备注',
      dataIndex: 'remark',
      width: 200,
      editable: true,
      render: (text: string) => {
        if (!text || text.trim() === '') return ''
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
    }
  ], [
    unitOptions,
    validateQuantity,
    validateRequiredDate,
    getChildItemStatus
  ])

  return {
    columns,
    unitOptions,
    validateQuantity,
    validateRequiredDate,
    getChildItemStatus
  }
}
