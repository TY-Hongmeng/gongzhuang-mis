import React, { useState, useCallback, useMemo, useRef, useEffect, memo } from 'react'
import { Card, Space, Button, message, Modal, Tabs, Spin, Alert, Statistic, Row, Col, Dropdown } from 'antd'
import { LeftOutlined, ToolOutlined, DeleteOutlined, UploadOutlined, DownloadOutlined, CheckCircleOutlined, WarningOutlined, FileExcelOutlined, CloudDownloadOutlined, SaveOutlined, DatabaseOutlined, MoreOutlined } from '@ant-design/icons'
import { useAuthStore } from '../stores/authStore'
import { useToolingData } from '../hooks/useToolingData'
import { useToolingMeta } from '../hooks/useToolingMeta'
import { useToolingOperations } from '../hooks/useToolingOperations'
import { useDataBackup } from '../hooks/useDataBackup'
import { ToolingFilters } from './components/ToolingFilters'
import { ToolingTable } from './components/ToolingTable'
import { PartTable } from './components/PartTable'
import { ChildItemTable } from './components/ChildItemTable'
import { PartInfoPage } from './components/PartInfoPage'
import { RequestCleaner } from '../utils/dataSerializer'
import { fetchWithFallback } from '../utils/api'
import * as XLSX from 'xlsx'

interface ToolingInfoPageProps {
  onBack?: () => void
}

const StatisticsPanel = memo(({ data }: { data: any[] }) => {
  const statistics = useMemo(() => {
    let complete = 0
    let blank = 0
    for (const item of data) {
      if (String(item.id || '').startsWith('blank-')) {
        blank += 1
        continue
      }
      const hasInventoryNumber = !!item.inventory_number && item.inventory_number.trim() !== ''
      const hasProductionUnit = !!item.production_unit && item.production_unit.trim() !== ''
      const hasCategory = !!item.category && item.category.trim() !== ''
      const hasProjectName = !!item.project_name && item.project_name.trim() !== ''
      const hasReceivedDate = !!item.received_date && item.received_date.trim() !== ''
      const hasProductionDate = !!item.production_date && item.production_date.trim() !== ''
      if (hasInventoryNumber && hasProductionUnit && hasCategory && hasProjectName && hasReceivedDate && hasProductionDate) {
        complete += 1
      }
    }
    const total = data.length
    const incomplete = total - complete - blank
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
  const [selectedToolingId] = useState<string | null>(null)
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
      const previousRecord = data.find(r => r.id === id)
      setData(prev => prev.map(r => 
        r.id === id ? { ...r, [key]: value } : r
      ))

      if (!id.startsWith('blank-')) {
        const cleanedParams = RequestCleaner.cleanToolingParams({ [key]: value })
        const success = await saveToolingData(id, cleanedParams)
        if (!success) {
          if (previousRecord) {
            setData(prev => prev.map(r => r.id === id ? previousRecord : r))
          }
          message.error('保存失败，请重试')
        } else {
          message.success('保存成功')
        }
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : '保存失败')
      message.error('保存失败')
    }
  }, [data, saveToolingData, setData])

  const handlePartEdit = useCallback(async (toolingId: string, partId: string, key: string, value: any) => {
    try {
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
          setPartsMap(prev => {
            const list = prev[toolingId] || []
            const updated = list.map(p => p.id === partId ? { ...p, [key]: value } : p)
            return { ...prev, [toolingId]: updated }
          })
        } else {
          message.error('保存零件失败')
        }
      } else {
        setPartsMap(prev => {
          const list = prev[toolingId] || []
          const updated = list.map(p => p.id === partId ? { ...p, [key]: value } : p)
          return { ...prev, [toolingId]: updated }
        })
      }
    } catch (error) {
      message.error('保存零件失败')
    }
  }, [savePartData, setPartsMap])

  const handleChildItemEdit = useCallback(async (toolingId: string, id: string, key: string, value: any) => {
    try {
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
          setChildItemsMap(prev => {
            const list = prev[toolingId] || []
            const updated = list.map(item => item.id === id ? { ...item, [key]: key === 'quantity' ? (String(value).trim() === '' ? '' : Number(value)) : value } : item)
            return { ...prev, [toolingId]: updated }
          })
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
        } else {
          message.error('创建标准件失败')
        }
      }
    } catch (error) {
      message.error('保存标准件失败')
    }
  }, [createChildItem, setChildItemsMap])

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

      // 导出标准件到第二个sheet
      const childExportData: any[] = []
      for (const row of selectedData) {
        const childItems = childItemsMap[row.id] || []
        for (const child of childItems) {
          childExportData.push({
            盘存编号: row.inventory_number || '',
            名称: child.name || '',
            型号: child.model || '',
            数量: child.quantity ?? '',
            单位: child.unit || '',
            需求日期: child.required_date || '',
            备注: child.remark || '',
            采购状态: child.purchase_status || ''
          })
        }
      }
      if (childExportData.length > 0) {
        const childWs = XLSX.utils.json_to_sheet(childExportData)
        XLSX.utils.book_append_sheet(wb, childWs, '标准件')
      }

      XLSX.writeFile(wb, `工装信息_${new Date().toISOString().slice(0, 10)}.xlsx`)
      message.success(`导出成功（工装 ${selectedData.length} 条，标准件 ${childExportData.length} 条）`)
      setExportModalVisible(false)
    } catch (error) {
      setError(error instanceof Error ? error.message : '导出失败')
      message.error('导出失败')
    }
  }, [data, selectedRowKeys, childItemsMap])

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
      XLSX.utils.book_append_sheet(wb, ws, '工装信息')

      // 添加标准件模板sheet
      const childTemplateData = [{
        盘存编号: '示例：AB123456',
        名称: '示例：内六角螺栓',
        型号: '示例：M8*20',
        数量: 10,
        单位: '件',
        需求日期: '示例：2024-01-15',
        备注: '',
        采购状态: ''
      }]
      const childWs = XLSX.utils.json_to_sheet(childTemplateData)
      XLSX.utils.book_append_sheet(wb, childWs, '标准件')

      XLSX.writeFile(wb, '工装信息导入模板.xlsx')
      message.success('模板下载成功（包含工装信息和标准件两个sheet）')
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

    // 注入当前用户作为申请人，确保技术员能看到自己生成的订单
    const currentUser = user?.real_name || ''
    const itemsToProcess = [...selectedItems, ...selectedParts].map(item => ({
      ...item,
      applicant: item.applicant || currentUser
    }))

    try {
      const result = await generatePurchaseOrders(itemsToProcess, materials, materialSources, partTypes)
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
    
    if (row.接收日期 && !/^\d{4}-\d{2}-\d{2}$/.test(String(row.接收日期))) {
      errors.push('接收日期格式不正确，应为YYYY-MM-DD')
    }
    
    if (row.需求日期 && !/^\d{4}-\d{2}-\d{2}$/.test(String(row.需求日期))) {
      errors.push('需求日期格式不正确，应为YYYY-MM-DD')
    }
    
    if (row.投产日期 && !/^\d{4}-\d{2}-\d{2}$/.test(String(row.投产日期))) {
      errors.push('投产日期格式不正确，应为YYYY-MM-DD')
    }
    
    if (row.套数 !== undefined && (isNaN(Number(row.套数)) || Number(row.套数) < 1)) {
      errors.push('套数必须大于0')
    }
    
    return { valid: errors.length === 0, errors }
  }, [])

  // 辅助函数：将 Excel 日期数字转换为 YYYY-MM-DD 格式
  const excelDateToString = useCallback((value: any): string => {
    if (!value) return ''
    
    // 如果已经是字符串格式（YYYY-MM-DD），直接返回
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
      return value.trim()
    }
    
    // 如果是数字（Excel 日期序列号）
    if (typeof value === 'number') {
      try {
        // Excel 日期序列号转换为 JS Date
        const date = XLSX.SSF.parse_date_code(value)
        if (date && date.y && date.m && date.d) {
          const year = date.y
          const month = String(date.m).padStart(2, '0')
          const day = String(date.d).padStart(2, '0')
          return `${year}-${month}-${day}`
        }
      } catch (e) {
        console.error('日期转换失败:', value, e)
      }
    }
    
    // 尝试解析为 Date 对象
    if (value instanceof Date) {
      const year = value.getFullYear()
      const month = String(value.getMonth() + 1).padStart(2, '0')
      const day = String(value.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }
    
    // 尝试解析字符串
    const str = String(value).trim()
    if (str) {
      const date = new Date(str)
      if (!isNaN(date.getTime())) {
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
      }
    }
    
    return str
  }, [])

  // 中文字段名到英文字段名的映射
  const mapChineseToEnglishFields = useCallback((row: any): any => {
    const mapped: any = {
      inventory_number: String(row.盘存编号 || '').trim(),
      production_unit: String(row.投产单位 || '').trim(),
      category: String(row.类别 || '').trim(),
      project_name: String(row.项目名称 || '').trim(),
      recorder: String(row.录入人 || '').trim()
    }
    
    // 处理日期字段
    const receivedDate = excelDateToString(row.接收日期)
    if (receivedDate) mapped.received_date = receivedDate
    
    const demandDate = excelDateToString(row.需求日期)
    if (demandDate) mapped.demand_date = demandDate
    
    const completedDate = excelDateToString(row.完成日期)
    if (completedDate) mapped.completed_date = completedDate
    
    const productionDate = excelDateToString(row.投产日期)
    if (productionDate) mapped.production_date = productionDate
    
    // 处理套数
    if (row.套数 !== undefined && row.套数 !== null && row.套数 !== '') {
      const setsCount = Number(row.套数)
      if (!isNaN(setsCount) && setsCount > 0) {
        mapped.sets_count = setsCount
      } else {
        mapped.sets_count = 1
      }
    } else {
      mapped.sets_count = 1
    }
    
    return mapped
  }, [excelDateToString])

  const handleFileImport = useCallback(async (file: File) => {
    try {
      const arrayBuffer = await file.arrayBuffer()
      const workbook = XLSX.read(arrayBuffer)

      // 读取工装信息sheet
      const worksheet = workbook.Sheets[0]
      const jsonData = XLSX.utils.sheet_to_json(worksheet)

      if (!Array.isArray(jsonData) || jsonData.length === 0) {
        message.warning('文件为空或格式不正确')
        return
      }

      let successCount = 0
      let errorCount = 0
      const errorMessages: string[] = []
      const createdToolingMap = new Map<string, string>() // 盘存编号 -> tooling id

      // 先批量查询数据库中已存在的工装（使用精确匹配）
      const existingInvNumbers = new Set<string>()
      for (const row of jsonData) {
        const inv = String(row.盘存编号 || '').trim()
        if (inv) existingInvNumbers.add(inv)
      }

      console.log('[导入] 开始查询已有工装，共', existingInvNumbers.size, '个盘存编号:', Array.from(existingInvNumbers))

      if (existingInvNumbers.size > 0) {
        try {
          const invList = Array.from(existingInvNumbers)
          for (const inv of invList) {
            // 加时间戳避免缓存
            const params = new URLSearchParams()
            params.append('search', inv)
            params.append('pageSize', '0')
            params.append('_t', String(Date.now()))
            const response = await fetchWithFallback(`/api/tooling?${params.toString()}`)
            if (response.ok) {
              const result = await response.json().catch(() => ({}))
              console.log(`[导入] 查询工装 "${inv}" 返回:`, JSON.stringify(result).substring(0, 500))
              if (result?.success && Array.isArray(result?.items)) {
                for (const item of result.items) {
                  const invNum = String(item.inventory_number || '').trim()
                  if (invNum === inv || invNum.toLowerCase() === inv.toLowerCase()) {
                    createdToolingMap.set(inv, String(item.id || ''))
                    console.log(`[导入] ✅ 找到已有工装: "${inv}" -> ${item.id}`)
                    break
                  }
                }
              }
            }
          }
        } catch (err) {
          console.error('[导入]  查询已有工装失败:', err)
        }
      }

      console.log('[导入] 预查询完成，找到', createdToolingMap.size, '个已有工装')

      for (const [index, row] of jsonData.entries()) {
        console.log(`[导入] 第 ${index + 2} 行原始数据:`, row)
        
        // 先转换字段（包括日期格式转换）
        const englishRow = mapChineseToEnglishFields(row)
        console.log(`[导入] 第 ${index + 2} 行映射后:`, englishRow)
        
        // 验证转换后的数据
        const validation = validateImportData(englishRow)
        if (!validation.valid) {
          errorCount++
          errorMessages.push(`第 ${index + 2} 行: ${validation.errors.join(', ')}`)
          continue
        }

        const inv = String(englishRow.inventory_number || '').trim()

        // 如果已存在，跳过创建
        if (inv && createdToolingMap.has(inv)) {
          successCount++
          continue
        }
        
        const cleanedParams = RequestCleaner.cleanToolingParams(englishRow)
        console.log(`[导入] 第 ${index + 2} 行清理后参数:`, cleanedParams)
        
        const result = await createTooling(cleanedParams)
        console.log(`[导入] 第 ${index + 2} 行创建结果:`, result)
        if (result?.data) {
          successCount++
          if (inv) {
            createdToolingMap.set(inv, String(result.data.id || ''))
          }
        } else {
          // 创建失败时，再次尝试查询（可能是并发冲突）
          if (inv) {
            try {
              const params = new URLSearchParams()
              params.append('search', inv)
              params.append('pageSize', '0')
              const response = await fetchWithFallback(`/api/tooling?${params.toString()}`)
              if (response.ok) {
                const queryResult = await response.json().catch(() => ({}))
                if (queryResult?.success && Array.isArray(queryResult?.items)) {
                  const found = queryResult.items.find((item: any) => String(item.inventory_number || '').trim() === inv)
                  if (found) {
                    createdToolingMap.set(inv, String(found.id || ''))
                    successCount++
                    console.log(`[导入] 创建失败后找到已有工装: ${inv}`)
                    continue
                  }
                }
              }
            } catch (e) {
              console.error(`[导入] 二次查询工装 ${inv} 失败:`, e)
            }
          }
          errorCount++
          errorMessages.push(`第 ${index + 2} 行: 工装创建失败，盘存编号 ${inv} 可能已存在`)
        }
      }

      // 读取标准件sheet（如果有）
      let childSuccessCount = 0
      let childErrorCount = 0
      const childErrorMessages: string[] = []
      const childSheetName = workbook.SheetNames.find(name => name.includes('标准件'))
      if (childSheetName) {
        const childWorksheet = workbook.Sheets[childSheetName]
        const childJsonData = XLSX.utils.sheet_to_json(childWorksheet)
        if (Array.isArray(childJsonData) && childJsonData.length > 0) {
          // 收集所有需要的盘存编号
          const neededInvNumbers = new Set<string>()
          for (const childRow of childJsonData) {
            const inv = String(childRow.盘存编号 || '').trim()
            if (inv) neededInvNumbers.add(inv)
          }

          // 从数据库查询已存在的工装，补充到映射中
          if (neededInvNumbers.size > 0) {
            try {
              const invList = Array.from(neededInvNumbers)
              // 逐个查询工装信息
              for (const inv of invList) {
                if (createdToolingMap.has(inv)) continue
                const params = new URLSearchParams()
                params.append('search', inv)
                params.append('pageSize', '0')
                const response = await fetchWithFallback(`/api/tooling?${params.toString()}`)
                if (response.ok) {
                  const result = await response.json().catch(() => ({}))
                  if (result?.success && Array.isArray(result?.items)) {
                    for (const item of result.items) {
                      const invNum = String(item.inventory_number || '').trim()
                      if (invNum === inv && !createdToolingMap.has(invNum)) {
                        createdToolingMap.set(invNum, String(item.id || ''))
                      }
                    }
                  }
                }
              }
            } catch (err) {
              console.error('查询已有工装失败:', err)
            }
          }

          // 导入标准件
          for (const [childIndex, childRow] of childJsonData.entries()) {
            const inv = String(childRow.盘存编号 || '').trim()
            const toolingId = createdToolingMap.get(inv)
            if (!toolingId) {
              childErrorCount++
              childErrorMessages.push(`标准件第 ${childIndex + 2} 行: 未找到对应的工装（盘存编号：${inv}）`)
              continue
            }

            const childData: any = {}
            const name = String(childRow.名称 || '').trim()
            const model = String(childRow.型号 || '').trim()
            if (name) childData.name = name
            if (model) childData.model = model
            if (childRow.数量 !== undefined && childRow.数量 !== null && childRow.数量 !== '') {
              const qty = Number(childRow.数量)
              if (!isNaN(qty)) childData.quantity = qty
            }
            const unit = String(childRow.单位 || '').trim()
            if (unit) childData.unit = unit
            const reqDate = String(childRow.需求日期 || '').trim()
            if (reqDate) childData.required_date = reqDate
            const remark = String(childRow.备注 || '').trim()
            if (remark) childData.remark = remark
            const purchaseStatus = String(childRow.采购状态 || '').trim()
            if (purchaseStatus) childData.purchase_status = purchaseStatus

            try {
              const response = await fetchWithFallback(`/api/tooling/${toolingId}/child-items`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(childData)
              })
              if (response.ok) {
                const result = await response.json().catch(() => ({}))
                if (result?.success === false) {
                  childErrorCount++
                  childErrorMessages.push(`标准件第 ${childIndex + 2} 行: ${result?.message || '创建失败'}`)
                } else {
                  childSuccessCount++
                }
              } else {
                const errorText = await response.text().catch(() => '')
                childErrorCount++
                childErrorMessages.push(`标准件第 ${childIndex + 2} 行: HTTP ${response.status} - ${errorText}`)
              }
            } catch (err) {
              childErrorCount++
              childErrorMessages.push(`标准件第 ${childIndex + 2} 行: ${err instanceof Error ? err.message : String(err)}`)
            }
          }
        }
      }

      if (errorMessages.length > 0) {
        Modal.error({
          title: '导入完成，但有错误',
          content: (
            <div>
              <p>成功导入 {successCount} 条工装信息，失败 {errorCount} 条</p>
              {childSuccessCount > 0 && <p>成功导入 {childSuccessCount} 条标准件，失败 {childErrorCount} 条</p>}
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
        let msg = `成功导入 ${successCount} 条工装信息`
        if (childSuccessCount > 0) {
          msg += `，${childSuccessCount} 条标准件`
        }
        message.success(msg)
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

  const expandedContent = useCallback((record: any) => {
    const parts = partsMap[record.id] || []
    const childItems = childItemsMap[record.id] || []
    const partKeys = selectedRowKeys.filter(k => k.startsWith('part-'))
    const childKeys = selectedRowKeys.filter(k => k.startsWith('child-'))

    return (
      <div style={{ padding: '16px 24px', background: '#fafafa' }}>
        <style>{`
          .ant-table-expanded-row-fixed {
            position: relative !important;
            left: auto !important;
            overflow: visible !important;
          }
        `}</style>
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
