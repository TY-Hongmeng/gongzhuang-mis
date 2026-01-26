import React, { useMemo, useCallback } from 'react'
import { Select, AutoComplete, Tag, Tooltip } from 'antd'
import { CheckCircleOutlined, CloseCircleOutlined, WarningOutlined } from '@ant-design/icons'
import { useToolingMeta } from '../useToolingMeta'

interface PartTableProps {
  toolingId: string
  onEdit: (id: string, key: string, value: any) => void
}

interface PartItem {
  id: string
  part_inventory_number?: string
  part_drawing_number?: string
  part_name?: string
  part_quantity?: number
  material_id?: string
  material_source_id?: string
  part_category?: string
  specifications?: Record<string, any>
  weight?: number
  remarks?: string
}

export const usePartTable = ({ toolingId, onEdit }: PartTableProps) => {
  const { materials, partTypes, materialSources } = useToolingMeta()

  const materialOptions = useMemo(() => 
    materials.map(m => ({ value: m.id, label: m.name }))
  , [materials])

  const materialSourceOptions = useMemo(() => 
    materialSources.map(s => ({ value: s.id, label: s.name }))
  , [materialSources])

  const partCategoryOptions = useMemo(() => 
    partTypes.map(pt => ({ value: pt.name, label: pt.name }))
  , [partTypes])

  const validatePartQuantity = useCallback((value: any): boolean => {
    if (value === '' || value === null || value === undefined) return true
    const num = Number(value)
    return !isNaN(num) && num >= 0
  }, [])

  const validateWeight = useCallback((value: any): boolean => {
    if (value === '' || value === null || value === undefined) return true
    const num = Number(value)
    return !isNaN(num) && num >= 0
  }, [])

  const getPartStatus = useCallback((part: PartItem): { status: 'complete' | 'incomplete' | 'warning', icon: React.ReactNode } => {
    const hasInventoryNumber = !!part.part_inventory_number && part.part_inventory_number.trim() !== ''
    const hasDrawingNumber = !!part.part_drawing_number && part.part_drawing_number.trim() !== ''
    const hasName = !!part.part_name && part.part_name.trim() !== ''
    const hasQuantity = part.part_quantity !== undefined && part.part_quantity !== null && Number(part.part_quantity) > 0
    const hasMaterial = !!part.material_id
    const hasCategory = !!part.part_category && part.part_category.trim() !== ''

    if (hasInventoryNumber && hasDrawingNumber && hasName && hasQuantity && hasMaterial && hasCategory) {
      return {
        status: 'complete',
        icon: <CheckCircleOutlined style={{ color: '#52c41a' }} />
      }
    }

    if (part.id.startsWith('blank-')) {
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

  const formatSpecifications = useCallback((specifications: any): string => {
    if (!specifications || typeof specifications !== 'object') return ''
    return Object.entries(specifications)
      .filter(([_, v]) => v !== null && v !== undefined && v !== '')
      .map(([k, v]) => `${k}:${v}`)
      .join(',')
  }, [])

  const columns = useMemo(() => [
    {
      title: '状态',
      dataIndex: 'status',
      width: 60,
      fixed: 'left',
      render: (_: any, record: PartItem) => {
        const { icon } = getPartStatus(record)
        return icon ? <Tooltip title={getPartStatus(record).status}>{icon}</Tooltip> : null
      }
    },
    {
      title: '盘存编号',
      dataIndex: 'part_inventory_number',
      width: 160,
      editable: true,
      render: (text: string, record: PartItem) => {
        if (!text || text.trim() === '') {
          return <span style={{ color: '#999' }}>待生成</span>
        }
        return text
      }
    },
    {
      title: '零件图号',
      dataIndex: 'part_drawing_number',
      width: 140,
      editable: true,
      render: (text: string) => text || ''
    },
    {
      title: '零件名称',
      dataIndex: 'part_name',
      width: 150,
      editable: true,
      render: (text: string) => text || ''
    },
    {
      title: '数量',
      dataIndex: 'part_quantity',
      width: 80,
      editable: true,
      render: (text: number, record: PartItem) => {
        if (!validatePartQuantity(text)) {
          return <span style={{ color: '#ff4d4f' }}>{text || ''}</span>
        }
        return text || ''
      }
    },
    {
      title: '材质',
      dataIndex: 'material_id',
      width: 120,
      editable: true,
      render: (text: string) => {
        const material = materials.find(m => m.id === text)
        if (!material) return <span style={{ color: '#999' }}>未选择</span>
        return <Tag color="blue">{material.name}</Tag>
      }
    },
    {
      title: '材料来源',
      dataIndex: 'material_source_id',
      width: 120,
      editable: true,
      render: (text: string) => {
        const source = materialSources.find(s => s.id === text)
        if (!source) return <span style={{ color: '#999' }}>未选择</span>
        return <Tag color="green">{source.name}</Tag>
      }
    },
    {
      title: '类别',
      dataIndex: 'part_category',
      width: 100,
      editable: true,
      render: (text: string) => {
        if (!text || text.trim() === '') {
          return <span style={{ color: '#999' }}>未选择</span>
        }
        return <Tag color="orange">{text}</Tag>
      }
    },
    {
      title: '规格',
      dataIndex: 'specifications',
      width: 200,
      editable: true,
      render: (text: any) => {
        const formatted = formatSpecifications(text)
        if (!formatted) return <span style={{ color: '#999' }}>未填写</span>
        return <Tooltip title={formatted}>
          <span style={{ cursor: 'pointer' }}>{formatted}</span>
        </Tooltip>
      }
    },
    {
      title: '重量(KG)',
      dataIndex: 'weight',
      width: 100,
      editable: false,
      render: (text: number, record: PartItem) => {
        if (!text || text === 0) {
          return <span style={{ color: '#999' }}>待计算</span>
        }
        return <span style={{ fontWeight: 600 }}>{text.toFixed(3)}</span>
      }
    },
    {
      title: '备注',
      dataIndex: 'remarks',
      width: 150,
      editable: true,
      render: (text: string) => {
        if (!text || text.trim() === '') return ''
        return <Tooltip title={text}>
          <span style={{ 
            display: 'inline-block',
            maxWidth: 130,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>{text}</span>
        </Tooltip>
      }
    }
  ], [
    materials, 
    partTypes, 
    materialSources, 
    validatePartQuantity, 
    validateWeight, 
    getPartStatus, 
    formatSpecifications
  ])

  return {
    columns,
    materialOptions,
    materialSourceOptions,
    partCategoryOptions,
    validatePartQuantity,
    validateWeight,
    getPartStatus,
    formatSpecifications
  }
}
