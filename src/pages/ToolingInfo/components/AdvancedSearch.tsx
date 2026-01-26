import React, { useState, useCallback, useMemo } from 'react'
import { Card, Form, Input, Select, DatePicker, Button, Space, Row, Col, Divider, Tag } from 'antd'
import { SearchOutlined, ClearOutlined, FilterOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'

const { RangePicker } = DatePicker
const { Option } = Select

export interface SearchFilters {
  keyword?: string
  productionUnit?: string
  category?: string
  dateRange?: [string, string]
  status?: 'all' | 'complete' | 'incomplete' | 'warning'
  projectName?: string
}

interface AdvancedSearchProps {
  onSearch: (filters: SearchFilters) => void
  onReset: () => void
  productionUnits?: string[]
  categories?: string[]
  loading?: boolean
}

export const AdvancedSearch: React.FC<AdvancedSearchProps> = ({
  onSearch,
  onReset,
  productionUnits = [],
  categories = [],
  loading = false
}) => {
  const [form] = Form.useForm()
  const [expanded, setExpanded] = useState(false)

  const handleSearch = useCallback(() => {
    const values = form.getFieldsValue()
    const filters: SearchFilters = {}

    if (values.keyword) {
      filters.keyword = values.keyword.trim()
    }

    if (values.productionUnit) {
      filters.productionUnit = values.productionUnit
    }

    if (values.category) {
      filters.category = values.category
    }

    if (values.dateRange && values.dateRange.length === 2) {
      filters.dateRange = [
        values.dateRange[0].format('YYYY-MM-DD'),
        values.dateRange[1].format('YYYY-MM-DD')
      ]
    }

    if (values.status && values.status !== 'all') {
      filters.status = values.status
    }

    if (values.projectName) {
      filters.projectName = values.projectName.trim()
    }

    onSearch(filters)
  }, [form, onSearch])

  const handleReset = useCallback(() => {
    form.resetFields()
    onReset()
  }, [form, onReset])

  const activeFiltersCount = useMemo(() => {
    const values = form.getFieldsValue()
    let count = 0
    if (values.keyword) count++
    if (values.productionUnit) count++
    if (values.category) count++
    if (values.dateRange) count++
    if (values.status && values.status !== 'all') count++
    if (values.projectName) count++
    return count
  }, [form])

  return (
    <Card 
      size="small" 
      style={{ marginBottom: 16 }}
      title={
        <Space>
          <FilterOutlined />
          <span>高级搜索</span>
          {activeFiltersCount > 0 && (
            <Tag color="blue">{activeFiltersCount} 个筛选条件</Tag>
          )}
        </Space>
      }
      extra={
        <Button 
          type="link" 
          size="small" 
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? '收起' : '展开'}
        </Button>
      }
    >
      <Form form={form} layout="vertical">
        <Row gutter={16}>
          <Col span={6}>
            <Form.Item label="关键词搜索" name="keyword">
              <Input 
                placeholder="盘存编号/项目名称" 
                prefix={<SearchOutlined />}
                allowClear
              />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item label="投产单位" name="productionUnit">
              <Select placeholder="请选择投产单位" allowClear>
                {productionUnits.map(unit => (
                  <Option key={unit} value={unit}>{unit}</Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item label="类别" name="category">
              <Select placeholder="请选择类别" allowClear>
                {categories.map(cat => (
                  <Option key={cat} value={cat}>{cat}</Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item label="状态" name="status" initialValue="all">
              <Select>
                <Option value="all">全部</Option>
                <Option value="complete">完整</Option>
                <Option value="incomplete">缺失信息</Option>
                <Option value="warning">警告</Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>

        {expanded && (
          <>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item label="日期范围" name="dateRange">
                  <RangePicker 
                    style={{ width: '100%' }}
                    placeholder={['开始日期', '结束日期']}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="项目名称" name="projectName">
                  <Input placeholder="请输入项目名称" allowClear />
                </Form.Item>
              </Col>
            </Row>
          </>
        )}

        <Divider style={{ margin: '12px 0' }} />

        <Row>
          <Col span={24}>
            <Space>
              <Button 
                type="primary" 
                icon={<SearchOutlined />}
                onClick={handleSearch}
                loading={loading}
              >
                搜索
              </Button>
              <Button 
                icon={<ClearOutlined />}
                onClick={handleReset}
              >
                重置
              </Button>
            </Space>
          </Col>
        </Row>
      </Form>
    </Card>
  )
}
