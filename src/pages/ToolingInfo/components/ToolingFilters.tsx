import React from 'react'
import { Card, Space, Button, Input, Select, DatePicker, AutoComplete } from 'antd'
import { ToolOutlined, ReloadOutlined, DeleteOutlined, UploadOutlined, DownloadOutlined } from '@ant-design/icons'
import { useToolingFilters } from '../../hooks/useToolingFilters'

const { RangePicker } = DatePicker

interface ToolingFiltersProps {
  onRefresh: () => void
  onBatchDelete: () => void
  onImport: () => void
  onExport: () => void
}

export const ToolingFilters: React.FC<ToolingFiltersProps> = ({
  onRefresh,
  onBatchDelete,
  onImport,
  onExport
}) => {
  const {
    filterSearch,
    setFilterSearch,
    filterUnit,
    setFilterUnit,
    filterCategory,
    setFilterCategory,
    unitOptions,
    categoryOptions
  } = useToolingFilters()

  return (
    <Card style={{ marginBottom: 16 }}>
      <Space size="middle" wrap>
        <Input
          placeholder="搜索盘存编号、项目名称、录入人"
          value={filterSearch}
          onChange={(e) => setFilterSearch(e.target.value)}
          style={{ width: 250 }}
          allowClear
        />
        <Select
          placeholder="投产单位"
          value={filterUnit}
          onChange={setFilterUnit}
          options={unitOptions}
          style={{ width: 150 }}
          allowClear
        />
        <Select
          placeholder="工装类别"
          value={filterCategory}
          onChange={setFilterCategory}
          options={categoryOptions}
          style={{ width: 150 }}
          allowClear
        />
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
        >
          批量删除
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
        >
          导出
        </Button>
      </Space>
    </Card>
  )
}
