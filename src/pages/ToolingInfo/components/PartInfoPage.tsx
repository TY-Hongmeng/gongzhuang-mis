import React, { useState, useCallback, useMemo } from 'react'
import { Card, Space, Button, message, Modal, Input, Select, Tag, Tooltip } from 'antd'
import { SearchOutlined, PlusOutlined, DeleteOutlined, CalculatorOutlined, CopyOutlined, DownloadOutlined } from '@ant-design/icons'
import { PartTable } from './components/PartTable'
import { usePartOperations } from '../hooks/usePartOperations'
import { useToolingData } from '../hooks/useToolingData'
import { useToolingMeta } from '../hooks/useToolingMeta'
import * as XLSX from 'xlsx'

interface PartItem {
  id: string
  tooling_id: string
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

interface PartInfoPageProps {
  toolingId: string
  projectName?: string
  onBack?: () => void
}

export const PartInfoPage: React.FC<PartInfoPageProps> = ({
  toolingId,
  projectName,
  onBack
}) => {
  const [searchText, setSearchText] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'complete' | 'warning' | 'incomplete'>('all')
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([])
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [newPart, setNewPart] = useState<Partial<PartItem>>({})

  const {
    data,
    partsMap,
    setPartsMap,
    fetchPartsData,
    createPart
  } = useToolingData()

  const { materials, partTypes, materialSources } = useToolingMeta()

  const {
    validatePartData,
    createNewPart,
    updatePart,
    calculateWeightForPart,
    batchUpdateWeights,
    deletePart,
    batchDeleteParts,
    duplicatePart
  } = usePartOperations()

  const parts = useMemo(() => partsMap[toolingId] || [], [partsMap, toolingId])

  const filteredParts = useMemo(() => {
    let result = parts

    if (searchText.trim()) {
      const keyword = searchText.toLowerCase()
      result = result.filter(p => 
        (p.part_inventory_number || '').toLowerCase().includes(keyword) ||
        (p.part_drawing_number || '').toLowerCase().includes(keyword) ||
        (p.part_name || '').toLowerCase().includes(keyword)
      )
    }

    if (filterStatus !== 'all') {
      result = result.filter(p => {
        const hasInventoryNumber = !!p.part_inventory_number && p.part_inventory_number.trim() !== ''
        const hasDrawingNumber = !!p.part_drawing_number && p.part_drawing_number.trim() !== ''
        const hasName = !!p.part_name && p.part_name.trim() !== ''
        const hasQuantity = p.part_quantity !== undefined && p.part_quantity !== null && Number(p.part_quantity) > 0
        const hasMaterial = !!p.material_id
        const hasCategory = !!p.part_category && p.part_category.trim() !== ''

        if (filterStatus === 'complete') {
          return hasInventoryNumber && hasDrawingNumber && hasName && hasQuantity && hasMaterial && hasCategory
        }
        if (filterStatus === 'warning') {
          return !p.id.startsWith('blank-') && !(
            hasInventoryNumber && hasDrawingNumber && hasName && hasQuantity && hasMaterial && hasCategory
          )
        }
        if (filterStatus === 'incomplete') {
          return p.id.startsWith('blank-')
        }
        return true
      })
    }

    return result
  }, [parts, searchText, filterStatus])

  const statistics = useMemo(() => {
    const total = parts.length
    const complete = parts.filter(p => {
      const hasInventoryNumber = !!p.part_inventory_number && p.part_inventory_number.trim() !== ''
      const hasDrawingNumber = !!p.part_drawing_number && p.part_drawing_number.trim() !== ''
      const hasName = !!p.part_name && p.part_name.trim() !== ''
      const hasQuantity = p.part_quantity !== undefined && p.part_quantity !== null && Number(p.part_quantity) > 0
      const hasMaterial = !!p.material_id
      const hasCategory = !!p.part_category && p.part_category.trim() !== ''
      return hasInventoryNumber && hasDrawingNumber && hasName && hasQuantity && hasMaterial && hasCategory
    }).length
    const warning = total - complete - parts.filter(p => p.id.startsWith('blank-')).length
    const incomplete = parts.filter(p => p.id.startsWith('blank-')).length
    
    return { total, complete, warning, incomplete }
  }, [parts])

  const handleEdit = useCallback((id: string, key: string, value: any) => {
    setPartsMap(prev => ({
      ...prev,
      [toolingId]: (prev[toolingId] || []).map(p => 
        p.id === id ? { ...p, [key]: value } : p
      )
    }))

    if (!id.startsWith('blank-')) {
      updatePart(id, { [key]: value })
    }
  }, [toolingId, setPartsMap, updatePart])

  const handleDelete = useCallback(async (id: string) => {
    const success = await deletePart(id)
    if (success) {
      setPartsMap(prev => ({
        ...prev,
        [toolingId]: (prev[toolingId] || []).filter(p => p.id !== id)
      }))
      setSelectedRowKeys(prev => prev.filter(k => k !== id))
    }
  }, [toolingId, setPartsMap, deletePart])

  const handleBatchDelete = useCallback(async () => {
    const success = await batchDeleteParts(selectedRowKeys)
    if (success) {
      setPartsMap(prev => ({
        ...prev,
        [toolingId]: (prev[toolingId] || []).filter(p => !selectedRowKeys.includes(p.id))
      }))
      setSelectedRowKeys([])
    }
  }, [toolingId, selectedRowKeys, setPartsMap, batchDeleteParts])

  const handleCreate = useCallback(() => {
    setCreateModalVisible(true)
    setNewPart({
      tooling_id: toolingId,
      part_drawing_number: '',
      part_name: '',
      part_quantity: 1,
      material_id: materials[0]?.id,
      part_category: partTypes[0]?.name,
      specifications: {},
      remarks: ''
    })
  }, [toolingId, materials, partTypes])

  const handleCreateSubmit = useCallback(async () => {
    const result = await createNewPart(toolingId, newPart)
    if (result) {
      setCreateModalVisible(false)
      setNewPart({})
      fetchPartsData(toolingId)
    }
  }, [toolingId, newPart, createNewPart, fetchPartsData])

  const handleCalculateWeight = useCallback(async (id: string) => {
    const part = parts.find(p => p.id === id)
    if (!part) return

    const weight = calculateWeightForPart(part)
    if (weight > 0) {
      const success = await updatePart(id, { weight })
      if (success) {
        setPartsMap(prev => ({
          ...prev,
          [toolingId]: (prev[toolingId] || []).map(p => 
            p.id === id ? { ...p, weight } : p
          )
        }))
        message.success('重量计算成功')
      }
    } else {
      message.warning('无法计算重量，请检查规格和材质')
    }
  }, [parts, toolingId, calculateWeightForPart, updatePart, setPartsMap])

  const handleBatchCalculateWeight = useCallback(async () => {
    const partsToCalculate = filteredParts.filter(p => !p.id.startsWith('blank-'))
    if (partsToCalculate.length === 0) {
      message.warning('请选择要计算重量的零件')
      return
    }

    await batchUpdateWeights(partsToCalculate)
    fetchPartsData(toolingId)
  }, [filteredParts, batchUpdateWeights, fetchPartsData, toolingId])

  const handleDuplicate = useCallback(async (id: string) => {
    const result = await duplicatePart(id)
    if (result) {
      fetchPartsData(toolingId)
      message.success('复制成功')
    }
  }, [duplicatePart, fetchPartsData, toolingId])

  const handleExport = useCallback(() => {
    try {
      const selectedParts = filteredParts.filter(p => selectedRowKeys.includes(p.id))
      if (selectedParts.length === 0) {
        message.warning('请先选择要导出的零件')
        return
      }

      const exportData = selectedParts.map(p => ({
        盘存编号: p.part_inventory_number || '',
        零件图号: p.part_drawing_number || '',
        零件名称: p.part_name || '',
        数量: p.part_quantity || 0,
        材质: materials.find(m => m.id === p.material_id)?.name || '',
        材料来源: materialSources.find(s => s.id === p.material_source_id)?.name || '',
        类别: p.part_category || '',
        规格: Object.entries(p.specifications || {}).map(([k, v]) => `${k}:${v}`).join(','),
        重量: p.weight || 0,
        备注: p.remarks || ''
      }))

      const ws = XLSX.utils.json_to_sheet(exportData)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, '零件信息')
      XLSX.writeFile(wb, `零件信息_${new Date().toISOString().slice(0, 10)}.xlsx`)
      message.success('导出成功')
    } catch (error) {
      message.error('导出失败')
    }
  }, [filteredParts, selectedRowKeys, materials, materialSources])

  const handleRefresh = useCallback(() => {
    fetchPartsData(toolingId)
  }, [toolingId, fetchPartsData])

  return (
    <div style={{ padding: 24 }}>
      <Card>
        <div style={{ marginBottom: 16 }}>
          <Space size="middle" wrap>
            <Input
              placeholder="搜索盘存编号、零件图号、零件名称"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              style={{ width: 300 }}
              prefix={<SearchOutlined />}
              allowClear
            />
            <Select
              value={filterStatus}
              onChange={setFilterStatus}
              style={{ width: 150 }}
              options={[
                { value: 'all', label: '全部' },
                { value: 'complete', label: '完整' },
                { value: 'warning', label: '缺失' },
                { value: 'incomplete', label: '空白' }
              ]}
            />
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleCreate}
            >
              添加零件
            </Button>
            <Button
              icon={<CalculatorOutlined />}
              onClick={handleBatchCalculateWeight}
              disabled={selectedRowKeys.length === 0}
            >
              批量计算重量
            </Button>
            <Button
              icon={<DownloadOutlined />}
              onClick={handleExport}
              disabled={selectedRowKeys.length === 0}
            >
              导出
            </Button>
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={handleBatchDelete}
              disabled={selectedRowKeys.length === 0}
            >
              批量删除
            </Button>
            <Button
              icon={<SearchOutlined />}
              onClick={handleRefresh}
            >
              刷新
            </Button>
          </Space>
        </div>

        <div style={{ marginBottom: 16, padding: '12px 16px', background: '#f5f5f5', borderRadius: 4 }}>
          <Space size="large">
            <span>项目名称：<strong>{projectName || '未知'}</strong></span>
            <span>总计：<Tag color="blue">{statistics.total}</Tag></span>
            <span>完整：<Tag color="green">{statistics.complete}</Tag></span>
            <span>缺失：<Tag color="orange">{statistics.warning}</Tag></span>
            <span>空白：<Tag color="default">{statistics.incomplete}</Tag></span>
          </Space>
        </div>

        <PartTable
          toolingId={toolingId}
          parts={filteredParts}
          selectedRowKeys={selectedRowKeys}
          onEdit={handleEdit}
          onSelectChange={setSelectedRowKeys}
          onDelete={handleDelete}
          onCreate={handleCreate}
          onCalculateWeight={handleCalculateWeight}
        />
      </Card>

      <Modal
        title="添加零件"
        open={createModalVisible}
        onOk={handleCreateSubmit}
        onCancel={() => setCreateModalVisible(false)}
        width={600}
        okText="创建"
        cancelText="取消"
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <label style={{ display: 'block', marginBottom: 8 }}>零件图号 *</label>
            <Input
              value={newPart.part_drawing_number || ''}
              onChange={e => setNewPart({ ...newPart, part_drawing_number: e.target.value })}
              placeholder="请输入零件图号"
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 8 }}>零件名称 *</label>
            <Input
              value={newPart.part_name || ''}
              onChange={e => setNewPart({ ...newPart, part_name: e.target.value })}
              placeholder="请输入零件名称"
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 8 }}>数量 *</label>
            <Input
              type="number"
              value={newPart.part_quantity || ''}
              onChange={e => setNewPart({ ...newPart, part_quantity: Number(e.target.value) })}
              placeholder="请输入数量"
              min={1}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 8 }}>材质 *</label>
            <Select
              value={newPart.material_id}
              onChange={value => setNewPart({ ...newPart, material_id: value })}
              style={{ width: '100%' }}
              placeholder="请选择材质"
              options={materials.map(m => ({ value: m.id, label: m.name }))}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 8 }}>类别 *</label>
            <Select
              value={newPart.part_category}
              onChange={value => setNewPart({ ...newPart, part_category: value })}
              style={{ width: '100%' }}
              placeholder="请选择类别"
              options={partTypes.map(pt => ({ value: pt.name, label: pt.name }))}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 8 }}>备注</label>
            <Input.TextArea
              value={newPart.remarks || ''}
              onChange={e => setNewPart({ ...newPart, remarks: e.target.value })}
              placeholder="请输入备注"
              rows={3}
            />
          </div>
        </Space>
      </Modal>
    </div>
  )
}
