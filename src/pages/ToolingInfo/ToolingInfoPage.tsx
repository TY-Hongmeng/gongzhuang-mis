import React, { useState, useCallback, useMemo, useRef, useEffect, memo } from 'react'
import { Card, Space, Button, message, Modal, Input, DatePicker, Tabs, Spin, Alert, Statistic, Row, Col, Dropdown } from 'antd'
import { LeftOutlined, ToolOutlined, ReloadOutlined, DeleteOutlined, UploadOutlined, DownloadOutlined, PlusOutlined, CheckCircleOutlined, WarningOutlined, FileExcelOutlined, CloudDownloadOutlined, SaveOutlined, DatabaseOutlined, MoreOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { useToolingData } from '../hooks/useToolingData'
import { useToolingMeta } from '../hooks/useToolingMeta'
import { useToolingOperations } from '../hooks/useToolingOperations'
import { useDataBackup } from '../hooks/useDataBackup'
import { DataBackupManager } from '../utils/dataBackup'
import { ToolingFilters } from './components/ToolingFilters'
import { ToolingTable } from './components/ToolingTable'
import { PartTable } from './components/PartTable'
import { ChildItemTable } from './components/ChildItemTable'
import { PartInfoPage } from './components/PartInfoPage'
import { RequestCleaner } from '../utils/dataSerializer'
import * as XLSX from 'xlsx'
import { debounce } from 'lodash-es'

const { RangePicker } = DatePicker

interface ToolingInfoPageProps {
  onBack?: () => void
}

const StatisticsPanel = memo(({ data }: { data: any[] }) => {
  const statistics = useMemo(() => {
    const total = data.length
    const complete = data.filter(item => {
      const hasInventoryNumber = !!item.inventory_number && item.inventory_number.trim() !== ''
      const hasProductionUnit = !!item.production_unit && item.production_unit.trim() !== ''
      const hasCategory = !!item.category && item.category.trim() !== ''
      const hasProjectName = !!item.project_name && item.project_name.trim() !== ''
      const hasReceivedDate = !!item.received_date && item.received_date.trim() !== ''
      const hasProductionDate = !!item.production_date && item.production_date.trim() !== ''
      return hasInventoryNumber && hasProductionUnit && hasCategory && hasProjectName && hasReceivedDate && hasProductionDate
    }).length
    const incomplete = total - complete - data.filter(item => item.id.startsWith('blank-')).length
    
    return { total, complete, incomplete }
  }, [data])

  return (
    <Row gutter={16} style={{ marginBottom: 16 }}>
      <Col span={6}>
        <Statistic 
          title="总工装数" 
          value={statistics.total} 
          valueStyle={{ color: '#1890ff' }}
          prefix={<ToolOutlined />}
        />
      </Col>
      <Col span={6}>
        <Statistic 
          title="完整工装" 
          value={statistics.complete} 
          valueStyle={{ color: '#52c41a' }}
          prefix={<CheckCircleOutlined />}
        />
      </Col>
      <Col span={6}>
        <Statistic 
          title="缺失信息" 
          value={statistics.incomplete} 
          valueStyle={{ color: '#faad14' }}
          prefix={<WarningOutlined />}
        />
      </Col>
      <Col span={6}>
        <Statistic 
          title="完成率" 
          value={statistics.total > 0 ? ((statistics.complete / statistics.total) * 100).toFixed(1) : 0} 
          suffix="%" 
          valueStyle={{ color: '#1890ff' }}
        />
      </Col>
    </Row>
  )
})

StatisticsPanel.displayName = 'StatisticsPanel'

const ActionButtons = memo(({ 
  onRefresh, 
  onBatchDelete, 
  onImport, 
  onExport, 
  onDownloadTemplate,
  onBackup,
  onRestore,
  selectedCount,
  backupLoading
}: { 
  onRefresh: () => void
  onBatchDelete: () => void
  onImport: () => void
  onExport: () => void
  onDownloadTemplate: () => void
  onBackup: () => void
  onRestore: () => void
  selectedCount: number
  backupLoading: boolean
}) => (
  <Space size="middle" wrap>
    <Button
      type="primary"
      icon={<ToolOutlined />}
      onClick={onRefresh}
    >
      刷新
    </Button>
    <Button
      danger
      icon={<DeleteOutlined />}
      onClick={onBatchDelete}
      disabled={selectedCount === 0}
    >
      批量删除 ({selectedCount})
    </Button>
    <Button
      icon={<CloudDownloadOutlined />}
      onClick={onDownloadTemplate}
    >
      下载模板
    </Button>
    <Button
      icon={<UploadOutlined />}
      onClick={onImport}
    >
      导入
    </Button>
    <Button
      icon={<DownloadOutlined />}
      onClick={onExport}
      disabled={selectedCount === 0}
    >
      导出 ({selectedCount})
    </Button>
    <Dropdown
      menu={{
        items: [
          {
            key: 'backup',
            label: '备份数据',
            icon: <DatabaseOutlined />,
            onClick: onBackup
          },
          {
            key: 'restore',
            label: '恢复数据',
            icon: <SaveOutlined />,
            onClick: onRestore
          }
        ]
      }}
    >
      <Button loading={backupLoading}>
        <MoreOutlined />
      </Button>
    </Dropdown>
  </Space>
))

ActionButtons.displayName = 'ActionButtons'

export const ToolingInfoPage: React.FC<ToolingInfoPageProps> = ({ onBack }) => {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  
  const {
    data,
    loading,
    selectedRowKeys,
    partsMap,
    childItemsMap,
    expandedRowKeys,
    setData,
    setSelectedRowKeys,
    setPartsMap,
    setChildItemsMap,
    setExpandedRowKeys,
    fetchToolingData,
    fetchPartsData,
    fetchChildItemsData,
    saveToolingData,
    savePartData,
    createChildItem,
    createTooling,
    batchDelete
  } = useToolingData()

  const {
    productionUnits,
    toolingCategories,
    materials,
    partTypes,
    materialSources,
    fetchAllMeta
  } = useToolingMeta()

  const {
    generateCuttingOrders,
    generatePurchaseOrders
  } = useToolingOperations()

  const {
    createAndExportBackup,
    importBackup,
    importExcelBackup,
    loading: backupLoading
  } = useDataBackup()

  const [importModalVisible, setImportModalVisible] = useState(false)
  const [exportModalVisible, setExportModalVisible] = useState(false)
  const [backupModalVisible, setBackupModalVisible] = useState(false)
  const [restoreModalVisible, setRestoreModalVisible] = useState(false)
  const [selectedToolingId, setSelectedToolingId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'tooling' | 'parts' | 'childItems'>('tooling')
  const [error, setError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const expandRequestRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    fetchAllMeta()
    fetchToolingData()
  }, [fetchAllMeta, fetchToolingData])

  const handleToolingEdit = useCallback(async (id: string, key: string, value: any) => {
    try {
      setData(prev => prev.map(r => 
        r.id === id ? { ...r, [key]: value } : r
      ))

      if (!id.startsWith('blank-')) {
        const cleanedParams = RequestCleaner.cleanToolingParams({ [key]: value })
        const success = await saveToolingData(id, cleanedParams)
        if (!success) {
          setData(prev => prev.map(r => r.id === id ? r : { ...r, [key]: value }))
          message.error('保存失败，请重试')
        } else {
          message.success('保存成功')
        }
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : '保存失败')
      message.error('保存失败')
    }
  }, [saveToolingData, setData])

  const handlePartEdit = useCallback(async (toolingId: string, partId: string, key: string, value: any) => {
    try {
      setPartsMap(prev => {
        const list = prev[toolingId] || []
        const updated = list.map(p => p.id === partId ? { ...p, [key]: value } : p)
        return { ...prev, [toolingId]: updated }
      })

      if (!String(partId || '').startsWith('blank-')) {
        const payload: any = {}
        if (key === 'part_quantity') {
          const num = typeof value === 'number' ? value : Number(value)
          payload.part_quantity = (value === '' || value === null || isNaN(Number(num)) || Number(num) <= 0) ? null : Number(num)
        } else {
          const txt = String(value ?? '').trim()
          payload[key] = txt !== '' ? txt : null
        }

        const success = await savePartData(partId, payload)
        if (success) {
          setTimeout(() => { fetchPartsData(toolingId) }, 200)
        } else {
          message.error('保存零件失败')
        }
      }
    } catch (error) {
      message.error('保存零件失败')
    }
  }, [savePartData, fetchPartsData, setPartsMap])

  const handleChildItemEdit = useCallback(async (toolingId: string, id: string, key: string, value: any) => {
    try {
      setChildItemsMap(prev => {
        const list = prev[toolingId] || []
        const updated = list.map(item => item.id === id ? { ...item, [key]: key === 'quantity' ? (String(value).trim() === '' ? '' : Number(value)) : value } : item)
        return { ...prev, [toolingId]: updated }
      })

      if (!String(id || '').startsWith('blank-')) {
        const updateData: any = {}
        if (key === 'quantity') {
          const num = typeof value === 'number' ? value : Number(value)
          updateData.quantity = (value === '' || value === null || isNaN(Number(num)) || Number(num) <= 0) ? null : Number(num)
        } else if (key === 'name' || key === 'model' || key === 'unit' || key === 'required_date' || key === 'remark' || key === 'type') {
          const txt = String(value ?? '').trim()
          updateData[key] = txt !== '' ? txt : null
        }

        const response = await fetch(`/api/tooling/child-items/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateData)
        })
        if (response.ok) {
          setTimeout(() => { fetchChildItemsData(toolingId) }, 200)
        } else {
          message.error('保存标准件失败')
        }
      } else {
        const postData: any = { tooling_id: toolingId }
        if (key === 'name') {
          const txt = String(value ?? '').trim()
          if (txt) postData.name = txt
        }
        if (key === 'model') {
          const txt = String(value ?? '').trim()
          if (txt) postData.model = txt
        }
        if (key === 'quantity') {
          const num = typeof value === 'number' ? value : Number(value)
          if (!isNaN(Number(num)) && Number(num) > 0) postData.quantity = Number(num)
        }
        if (key === 'unit') {
          const txt = String(value ?? '').trim()
          if (txt) postData.unit = txt
        }
        if (key === 'required_date') {
          const txt = String(value ?? '').trim()
          if (txt) postData.required_date = txt
        }
        if (key === 'remark') {
          const txt = String(value ?? '').trim()
          if (txt) postData.remark = txt
        }

        const created = await createChildItem(toolingId, postData)
        if (created) {
          setChildItemsMap(prev => {
            const list = prev[toolingId] || []
            const updated = list.map(item => item.id === id ? { ...item, ...created, id: created.id } : item)
            return { ...prev, [toolingId]: updated }
          })
          setTimeout(() => { fetchChildItemsData(toolingId) }, 200)
        } else {
          message.error('创建标准件失败')
        }
      }
    } catch (error) {
      message.error('保存标准件失败')
    }
  }, [createChildItem, fetchChildItemsData, setChildItemsMap])

  const handleToolingDelete = useCallback(async (id: string) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除该工装吗？删除后将无法恢复。',
      okText: '确认',
      cancelText: '取消',
      onOk: async () => {
        try {
          const success = await batchDelete([id], [], [])
          if (success) {
            setData(prev => prev.filter(r => r.id !== id))
            setPartsMap(prev => {
              const next = { ...prev }
              delete next[id]
              return next
            })
            setChildItemsMap(prev => {
              const next = { ...prev }
              delete next[id]
              return next
            })
            setSelectedRowKeys(prev => prev.filter(k => k !== id))
            message.success('删除成功')
          } else {
            message.error('删除失败')
          }
        } catch (error) {
          setError(error instanceof Error ? error.message : '删除失败')
          message.error('删除失败')
        }
      }
    })
  }, [batchDelete, setData, setSelectedRowKeys])

  const handleToolingBatchDelete = useCallback(() => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先选择要删除的工装')
      return
    }

    Modal.confirm({
      title: '确认批量删除',
      content: `确定要删除选中的 ${selectedRowKeys.length} 个工装吗？删除后将无法恢复。`,
      okText: '确认',
      cancelText: '取消',
      onOk: async () => {
        try {
          const success = await batchDelete(selectedRowKeys, [], [])
          if (success) {
            setData(prev => prev.filter(r => !selectedRowKeys.includes(r.id)))
            setPartsMap(prev => {
              const next = { ...prev }
              selectedRowKeys.forEach(id => { delete next[id] })
              return next
            })
            setChildItemsMap(prev => {
              const next = { ...prev }
              selectedRowKeys.forEach(id => { delete next[id] })
              return next
            })
            setSelectedRowKeys([])
            message.success(`已删除 ${selectedRowKeys.length} 个工装`)
          } else {
            message.error('批量删除失败')
          }
        } catch (error) {
          setError(error instanceof Error ? error.message : '批量删除失败')
          message.error('批量删除失败')
        }
      }
    })
  }, [selectedRowKeys, batchDelete, setData, setSelectedRowKeys])

  const handleExpand = useCallback(async (keys: string[]) => {
    setExpandedRowKeys(keys)
    
    const newKeys = keys.filter(k => !expandedRowKeys.includes(k))
    for (const toolingId of newKeys) {
      if (!expandRequestRef.current.has(toolingId)) {
        expandRequestRef.current.add(toolingId)
        try {
          await Promise.all([
            fetchPartsData(toolingId),
            fetchChildItemsData(toolingId)
          ])
        } catch (error) {
          setError(error instanceof Error ? error.message : '加载数据失败')
          message.error('加载数据失败')
        } finally {
          expandRequestRef.current.delete(toolingId)
        }
      }
    }
  }, [expandedRowKeys, fetchPartsData, fetchChildItemsData])

  const handleRefresh = useCallback(async () => {
    try {
      await fetchToolingData()
      message.success('刷新成功')
    } catch (error) {
      setError(error instanceof Error ? error.message : '刷新失败')
      message.error('刷新失败')
    }
  }, [fetchToolingData])

  const handleImport = useCallback(() => {
    setImportModalVisible(true)
  }, [])

  const handleExport = useCallback(async () => {
    try {
      const selectedData = data.filter(row => selectedRowKeys.includes(row.id))
      if (selectedData.length === 0) {
        message.warning('请先选择要导出的工装')
        return
      }

      const exportData = selectedData.map(row => ({
        盘存编号: row.inventory_number || '',
        投产单位: row.production_unit || '',
        类别: row.category || '',
        接收日期: row.received_date || '',
        需求日期: row.demand_date || '',
        完成日期: row.completed_date || '',
        项目名称: row.project_name || '',
        投产日期: row.production_date || '',
        套数: row.sets_count || 1,
        录入人: row.recorder || ''
      }))

      const ws = XLSX.utils.json_to_sheet(exportData)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, '工装信息')
      XLSX.writeFile(wb, `工装信息_${new Date().toISOString().slice(0, 10)}.xlsx`)
      message.success('导出成功')
      setExportModalVisible(false)
    } catch (error) {
      setError(error instanceof Error ? error.message : '导出失败')
      message.error('导出失败')
    }
  }, [data, selectedRowKeys])

  const handleDownloadTemplate = useCallback(() => {
    try {
      const templateData = [{
        盘存编号: '示例：AB123456',
        投产单位: '示例：一车间',
        类别: '示例：冲压模',
        接收日期: '示例：2024-01-01',
        需求日期: '示例：2024-01-15',
        完成日期: '示例：2024-01-20',
        项目名称: '示例：汽车零部件项目',
        投产日期: '示例：2024-01-10',
        套数: 1,
        录入人: user?.real_name || ''
      }]

      const ws = XLSX.utils.json_to_sheet(templateData)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, '工装信息模板')
      XLSX.writeFile(wb, '工装信息导入模板.xlsx')
      message.success('模板下载成功')
    } catch (error) {
      setError(error instanceof Error ? error.message : '模板下载失败')
      message.error('模板下载失败')
    }
  }, [user])

  const handleGenerateCuttingOrders = useCallback(async () => {
    const selectedParts = selectedRowKeys
      .filter(k => k.startsWith('part-'))
      .map(k => {
        const toolingId = k.split('-')[1]
        return partsMap[toolingId]?.find(p => p.id === k)
      })
      .filter(Boolean)

    if (selectedParts.length === 0) {
      message.warning('请先选择要生成下料单的零件')
      return
    }

    try {
      const result = await generateCuttingOrders(selectedParts, materials, materialSources, partTypes)
      if (result) {
        message.success('下料单生成成功')
      } else {
        message.error('下料单生成失败')
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : '下料单生成失败')
      message.error('下料单生成失败')
    }
  }, [selectedRowKeys, partsMap, materials, materialSources, partTypes, generateCuttingOrders])

  const handleGeneratePurchaseOrders = useCallback(async () => {
    const selectedItems = selectedRowKeys
      .filter(k => k.startsWith('child-'))
      .map(k => {
        const toolingId = k.split('-')[1]
        return childItemsMap[toolingId]?.find(c => c.id === k)
      })
      .filter(Boolean)

    const selectedParts = selectedRowKeys
      .filter(k => k.startsWith('part-'))
      .map(k => {
        const toolingId = k.split('-')[1]
        return partsMap[toolingId]?.find(p => p.id === k)
      })
      .filter(Boolean)

    if (selectedItems.length === 0 && selectedParts.length === 0) {
      message.warning('请先选择要生成采购单的零件或标准件')
      return
    }

    try {
      const result = await generatePurchaseOrders([...selectedItems, ...selectedParts], materials, materialSources, partTypes)
      if (result) {
        message.success('采购单生成成功')
      } else {
        message.error('采购单生成失败')
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : '采购单生成失败')
      message.error('采购单生成失败')
    }
  }, [selectedRowKeys, partsMap, childItemsMap, materials, materialSources, partTypes, generatePurchaseOrders])

  const validateImportData = useCallback((row: any): { valid: boolean, errors: string[] } => {
    const errors: string[] = []
    
    if (!row.投产单位 || typeof row.投产单位 !== 'string' || row.投产单位.trim() === '') {
      errors.push('投产单位不能为空')
    }
    
    if (!row.类别 || typeof row.类别 !== 'string' || row.类别.trim() === '') {
      errors.push('类别不能为空')
    }
    
    if (row.接收日期 && !/^\d{4}-\d{2}-\d{2}$/.test(row.接收日期)) {
      errors.push('接收日期格式不正确，应为YYYY-MM-DD')
    }
    
    if (row.需求日期 && !/^\d{4}-\d{2}-\d{2}$/.test(row.需求日期)) {
      errors.push('需求日期格式不正确，应为YYYY-MM-DD')
    }
    
    if (row.投产日期 && !/^\d{4}-\d{2}-\d{2}$/.test(row.投产日期)) {
      errors.push('投产日期格式不正确，应为YYYY-MM-DD')
    }
    
    if (row.套数 !== undefined && (isNaN(Number(row.套数)) || Number(row.套数) < 1)) {
      errors.push('套数必须大于0')
    }
    
    return { valid: errors.length === 0, errors }
  }, [])

  const handleFileImport = useCallback(async (file: File) => {
    try {
      const arrayBuffer = await file.arrayBuffer()
      const workbook = XLSX.read(arrayBuffer)
      const worksheet = workbook.Sheets[0]
      const jsonData = XLSX.utils.sheet_to_json(worksheet)

      if (!Array.isArray(jsonData) || jsonData.length === 0) {
        message.warning('文件为空或格式不正确')
        return
      }

      let successCount = 0
      let errorCount = 0
      const errorMessages: string[] = []

      for (const [index, row] of jsonData.entries()) {
        const validation = validateImportData(row)
        if (!validation.valid) {
          errorCount++
          errorMessages.push(`第 ${index + 2} 行: ${validation.errors.join(', ')}`)
          continue
        }

        const cleanedParams = RequestCleaner.cleanToolingParams(row)
        const result = await createTooling(cleanedParams)
        if (result) {
          successCount++
        } else {
          errorCount++
        }
      }

      if (errorMessages.length > 0) {
        Modal.error({
          title: '导入完成，但有错误',
          content: (
            <div>
              <p>成功导入 {successCount} 条数据，失败 {errorCount} 条</p>
              <details>
                <summary style={{ cursor: 'pointer', color: '#1890ff' }}>查看错误详情</summary>
                <ul style={{ maxHeight: 300, overflowY: 'auto', marginTop: 10 }}>
                  {errorMessages.slice(0, 10).map((msg, idx) => (
                    <li key={idx}>{msg}</li>
                  ))}
                  {errorMessages.length > 10 && <li>...还有 {errorMessages.length - 10} 条错误</li>}
                </ul>
              </details>
            </div>
          )
        })
      } else {
        message.success(`成功导入 ${successCount} 条工装信息`)
      }
      
      setImportModalVisible(false)
      await fetchToolingData()
    } catch (error) {
      setError(error instanceof Error ? error.message : '导入失败')
      message.error('导入失败：' + (error instanceof Error ? error.message : String(error)))
    }
  }, [createTooling, fetchToolingData, validateImportData])

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleBackup = useCallback(async (format: 'json' | 'excel') => {
    try {
      const allParts = Object.values(partsMap).flat()
      const allChildItems = Object.values(childItemsMap).flat()
      await createAndExportBackup(data, allParts, allChildItems, format)
      setBackupModalVisible(false)
    } catch (error) {
      setError(error instanceof Error ? error.message : '备份失败')
      message.error('备份失败')
    }
  }, [data, partsMap, childItemsMap, createAndExportBackup])

  const handleRestore = useCallback(async (file: File) => {
    try {
      const backupData = await importBackup(file)
      if (backupData) {
        setRestoreModalVisible(false)
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : '恢复失败')
      message.error('恢复失败')
    }
  }, [importBackup])

  const handleExcelRestore = useCallback(async (file: File) => {
    try {
      const backupData = await importExcelBackup(file)
      if (backupData) {
        setRestoreModalVisible(false)
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : '恢复失败')
      message.error('恢复失败')
    }
  }, [importExcelBackup])

  const backupMenuItems = [
    {
      key: 'json',
      label: 'JSON格式备份',
      icon: <SaveOutlined />,
      onClick: () => handleBackup('json')
    },
    {
      key: 'excel',
      label: 'Excel格式备份',
      icon: <FileExcelOutlined />,
      onClick: () => handleBackup('excel')
    }
  ]

  const restoreMenuItems = [
    {
      key: 'json',
      label: '从JSON备份恢复',
      onClick: () => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.json'
        input.onchange = (e) => {
          const file = (e.target as HTMLInputElement).files?.[0]
          if (file) {
            handleRestore(file)
          }
        }
        input.click()
      }
    },
    {
      key: 'excel',
      label: '从Excel备份恢复',
      onClick: () => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.xlsx,.xls'
        input.onchange = (e) => {
          const file = (e.target as HTMLInputElement).files?.[0]
          if (file) {
            handleExcelRestore(file)
          }
        }
        input.click()
      }
    }
  ]

  const expandedContent = useCallback((record: any) => {
    const parts = partsMap[record.id] || []
    const childItems = childItemsMap[record.id] || []
    const partKeys = selectedRowKeys.filter(k => k.startsWith('part-'))
    const childKeys = selectedRowKeys.filter(k => k.startsWith('child-'))

    return (
      <div style={{ padding: '16px 24px', background: '#fafafa' }}>
        <PartTable
          toolingId={record.id}
          parts={parts}
          selectedRowKeys={partKeys}
          onEdit={(id, key, value) => handlePartEdit(record.id, id, key, value)}
          onSelectChange={(keys) => {
            const otherKeys = selectedRowKeys.filter(k => !k.startsWith('part-'))
            setSelectedRowKeys([...otherKeys, ...keys.map(k => 'part-' + k)])
          }}
        />
        <ChildItemTable
          toolingId={record.id}
          childItems={childItems}
          selectedRowKeys={childKeys}
          onEdit={(id, key, value) => handleChildItemEdit(record.id, id, key, value)}
          onSelectChange={(keys) => {
            const otherKeys = selectedRowKeys.filter(k => !k.startsWith('child-'))
            setSelectedRowKeys([...otherKeys, ...keys.map(k => 'child-' + k)])
          }}
        />
      </div>
    )
  }, [partsMap, childItemsMap, selectedRowKeys, handlePartEdit, handleChildItemEdit, setSelectedRowKeys])

  const selectedToolingCount = useMemo(() => 
    selectedRowKeys.filter(k => !k.startsWith('part-') && !k.startsWith('child-')).length
  , [selectedRowKeys])

  return (
    <div style={{ padding: 24 }}>
      <Card>
        {error && (
          <Alert
            message="发生错误"
            description={error}
            type="error"
            closable
            onClose={() => setError(null)}
            style={{ marginBottom: 16 }}
          />
        )}
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <ActionButtons
            onRefresh={handleRefresh}
            onBatchDelete={handleToolingBatchDelete}
            onImport={handleImport}
            onExport={handleExport}
            onDownloadTemplate={handleDownloadTemplate}
            onBackup={() => setBackupModalVisible(true)}
            onRestore={() => setRestoreModalVisible(true)}
            selectedCount={selectedToolingCount}
            backupLoading={backupLoading}
          />
          <Button icon={<LeftOutlined />} onClick={onBack}>
            返回
          </Button>
        </div>

        <StatisticsPanel data={data} />

        <ToolingFilters
          onRefresh={handleRefresh}
          onBatchDelete={handleToolingBatchDelete}
          onImport={handleImportClick}
          onExport={handleExport}
        />

        <Card>
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            items={[
              {
                key: 'tooling',
                label: `工装列表 (${data.length})`
              },
              {
                key: 'parts',
                label: `零件管理`
              },
              {
                key: 'childItems',
                label: `标准件管理`
              }
            ]}
          />
          
          {activeTab === 'tooling' && (
            <Spin spinning={loading}>
              <ToolingTable
                data={data}
                loading={loading}
                selectedRowKeys={selectedRowKeys}
                expandedRowKeys={expandedRowKeys}
                onEdit={handleToolingEdit}
                onSelectChange={setSelectedRowKeys}
                onExpand={handleExpand}
                onCreate={() => {
                  const newTooling = {
                    inventory_number: '',
                    production_unit: '',
                    category: '',
                    received_date: '',
                    demand_date: '',
                    completed_date: '',
                    project_name: '',
                    production_date: '',
                    sets_count: 1,
                    recorder: user?.real_name || ''
                  }
                  createTooling(newTooling)
                }}
                onDelete={handleToolingDelete}
                onGenerateInventoryNumber={(id) => {
                  const tooling = data.find(t => t.id === id)
                  if (!tooling) return
                  handleToolingEdit(id, 'inventory_number', tooling.inventory_number || '')
                }}
              />
            </Spin>
          )}

          {activeTab === 'parts' && selectedToolingId && (
            <PartInfoPage
              toolingId={selectedToolingId}
              projectName={data.find(t => t.id === selectedToolingId)?.project_name}
            />
          )}

          {activeTab === 'childItems' && selectedToolingId && (
            <div style={{ padding: 24, textAlign: 'center', color: '#999' }}>
              <p>请先在"工装列表"标签页中选择一个工装</p>
            </div>
          )}
        </Card>
      </Card>

      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept=".xlsx,.xls"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          if (file) {
            await handleFileImport(file)
          }
        }}
      />

      <Modal
        title="导入工装信息"
        open={importModalVisible}
        onCancel={() => setImportModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setImportModalVisible(false)}>
            取消
          </Button>,
          <Button key="upload" type="primary" onClick={handleImportClick}>
            选择文件
          </Button>
        ]}
      >
        <p>请选择Excel文件（.xlsx或.xls格式）</p>
        <p>文件应包含以下字段：</p>
        <ul style={{ marginLeft: 20 }}>
          <li>盘存编号（可选，系统会自动生成）</li>
          <li>投产单位（必填）</li>
          <li>类别（必填）</li>
          <li>接收日期（格式：YYYY-MM-DD）</li>
          <li>需求日期（格式：YYYY-MM-DD）</li>
          <li>完成日期（格式：YYYY-MM-DD）</li>
          <li>项目名称</li>
          <li>投产日期（格式：YYYY-MM-DD）</li>
          <li>套数（必须大于0）</li>
        </ul>
      </Modal>

      <Modal
        title="导出工装信息"
        open={exportModalVisible}
        onCancel={() => setExportModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setExportModalVisible(false)}>
            取消
          </Button>,
          <Button key="confirm" type="primary" onClick={handleExport}>
            确认导出
          </Button>
        ]}
      >
        <p>确定要导出选中的 {selectedToolingCount} 个工装信息吗？</p>
      </Modal>

      <Modal
        title="备份数据"
        open={backupModalVisible}
        onCancel={() => setBackupModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setBackupModalVisible(false)}>
            取消
          </Button>
        ]}
      >
        <p>请选择备份格式：</p>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Button 
            block 
            icon={<SaveOutlined />}
            onClick={() => handleBackup('json')}
            loading={backupLoading}
          >
            JSON格式备份（推荐）
          </Button>
          <Button 
            block 
            icon={<FileExcelOutlined />}
            onClick={() => handleBackup('excel')}
            loading={backupLoading}
          >
            Excel格式备份
          </Button>
        </Space>
        <p style={{ marginTop: 16, color: '#666', fontSize: 12 }}>
          JSON格式备份包含完整的数据结构，适合完整的数据恢复。<br />
          Excel格式备份适合查看和手动编辑，但恢复时可能需要额外的数据转换。
        </p>
      </Modal>

      <Modal
        title="恢复数据"
        open={restoreModalVisible}
        onCancel={() => setRestoreModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setRestoreModalVisible(false)}>
            取消
          </Button>
        ]}
      >
        <p>请选择要恢复的备份文件：</p>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Button 
            block 
            icon={<SaveOutlined />}
            onClick={() => {
              const input = document.createElement('input')
              input.type = 'file'
              input.accept = '.json'
              input.onchange = (e) => {
                const file = (e.target as HTMLInputElement).files?.[0]
                if (file) {
                  handleRestore(file)
                }
              }
              input.click()
            }}
            loading={backupLoading}
          >
            从JSON备份恢复
          </Button>
          <Button 
            block 
            icon={<FileExcelOutlined />}
            onClick={() => {
              const input = document.createElement('input')
              input.type = 'file'
              input.accept = '.xlsx,.xls'
              input.onchange = (e) => {
                const file = (e.target as HTMLInputElement).files?.[0]
                if (file) {
                  handleExcelRestore(file)
                }
              }
              input.click()
            }}
            loading={backupLoading}
          >
            从Excel备份恢复
          </Button>
        </Space>
        <Alert
          message="警告"
          description="恢复操作将覆盖当前所有数据，请确保已做好当前数据的备份！此操作不可撤销。"
          type="warning"
          showIcon
          style={{ marginTop: 16 }}
        />
      </Modal>
    </div>
  )
}
