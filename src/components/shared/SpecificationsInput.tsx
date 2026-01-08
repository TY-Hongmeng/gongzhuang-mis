import React, { useState, useEffect } from 'react'
import { Input, Space, Select, Form } from 'antd'
import { NumberOutlined, RadiusUpleftOutlined, ExpandOutlined } from '@ant-design/icons'

const { Option } = Select

export interface SpecificationsInputProps {
  value?: string
  onChange?: (value: string) => void
  materialType?: string
  placeholder?: string
  style?: React.CSSProperties
}

interface SpecValue {
  length?: number | null
  width?: number | null
  height?: number | null
  diameter?: number | null
  thickness?: number | null
}

const materialTypes = [
  { value: 'plate', label: '板材', spec: '长×宽×厚', icon: <NumberOutlined /> },
  { value: 'bar', label: '棒材', spec: '直径×长度', icon: <RadiusUpleftOutlined /> },
  { value: 'profile', label: '型材', spec: '长×宽×高', icon: <ExpandOutlined /> },
  { value: 'other', label: '其他', spec: '自定义', icon: <NumberOutlined /> }
]

export function SpecificationsInput({
  value,
  onChange,
  materialType = 'plate',
  placeholder = '请输入规格',
  style
}: SpecificationsInputProps) {
  const [specValue, setSpecValue] = useState<SpecValue>({})
  const [customValue, setCustomValue] = useState('')

  useEffect(() => {
    if (value) {
      parseSpecifications(value, materialType)
    }
  }, [value, materialType])

  const parseSpecifications = (spec: string, type: string) => {
    if (!spec) {
      setSpecValue({})
      setCustomValue('')
      return
    }

    if (type === 'other') {
      setCustomValue(spec)
      return
    }

    const parts = spec.split(/[×xX*]/).map(p => parseFloat(p.trim()))
    const newSpec: SpecValue = {}

    switch (type) {
      case 'plate':
        if (parts.length >= 3) {
          newSpec.length = parts[0]
          newSpec.width = parts[1]
          newSpec.thickness = parts[2]
        }
        break
      case 'bar':
        if (parts.length >= 2) {
          newSpec.diameter = parts[0]
          newSpec.length = parts[1]
        }
        break
      case 'profile':
        if (parts.length >= 3) {
          newSpec.length = parts[0]
          newSpec.width = parts[1]
          newSpec.height = parts[2]
        }
        break
    }

    setSpecValue(newSpec)
  }

  const formatSpecifications = (spec: SpecValue, type: string): string => {
    switch (type) {
      case 'plate':
        if (spec.length && spec.width && spec.thickness) {
          return `${spec.length}×${spec.width}×${spec.thickness}`
        }
        break
      case 'bar':
        if (spec.diameter && spec.length) {
          return `${spec.diameter}×${spec.length}`
        }
        break
      case 'profile':
        if (spec.length && spec.width && spec.height) {
          return `${spec.length}×${spec.width}×${spec.height}`
        }
        break
      case 'other':
        return customValue
    }
    return ''
  }

  const handleSpecChange = (field: keyof SpecValue, value: number | null) => {
    const newSpec = { ...specValue, [field]: value }
    setSpecValue(newSpec)
    const formatted = formatSpecifications(newSpec, materialType)
    if (onChange) {
      onChange(formatted)
    }
  }

  const handleCustomChange = (value: string) => {
    setCustomValue(value)
    if (onChange) {
      onChange(value)
    }
  }

  const handleMaterialTypeChange = (type: string) => {
    const formatted = formatSpecifications(specValue, type)
    if (onChange) {
      onChange(formatted)
    }
  }

  const renderSpecInputs = () => {
    switch (materialType) {
      case 'plate':
        return (
          <Space.Compact>
            <Input
              type="number"
              placeholder="长度"
              value={specValue.length || ''}
              onChange={e => handleSpecChange('length', e.target.value ? parseFloat(e.target.value) : null)}
              style={{ width: 80 }}
              suffix="mm"
            />
            <span style={{ padding: '0 8px' }}>×</span>
            <Input
              type="number"
              placeholder="宽度"
              value={specValue.width || ''}
              onChange={e => handleSpecChange('width', e.target.value ? parseFloat(e.target.value) : null)}
              style={{ width: 80 }}
              suffix="mm"
            />
            <span style={{ padding: '0 8px' }}>×</span>
            <Input
              type="number"
              placeholder="厚度"
              value={specValue.thickness || ''}
              onChange={e => handleSpecChange('thickness', e.target.value ? parseFloat(e.target.value) : null)}
              style={{ width: 80 }}
              suffix="mm"
            />
          </Space.Compact>
        )
      case 'bar':
        return (
          <Space.Compact>
            <Input
              type="number"
              placeholder="直径"
              value={specValue.diameter || ''}
              onChange={e => handleSpecChange('diameter', e.target.value ? parseFloat(e.target.value) : null)}
              style={{ width: 100 }}
              suffix="mm"
            />
            <span style={{ padding: '0 8px' }}>×</span>
            <Input
              type="number"
              placeholder="长度"
              value={specValue.length || ''}
              onChange={e => handleSpecChange('length', e.target.value ? parseFloat(e.target.value) : null)}
              style={{ width: 100 }}
              suffix="mm"
            />
          </Space.Compact>
        )
      case 'profile':
        return (
          <Space.Compact>
            <Input
              type="number"
              placeholder="长度"
              value={specValue.length || ''}
              onChange={e => handleSpecChange('length', e.target.value ? parseFloat(e.target.value) : null)}
              style={{ width: 80 }}
              suffix="mm"
            />
            <span style={{ padding: '0 8px' }}>×</span>
            <Input
              type="number"
              placeholder="宽度"
              value={specValue.width || ''}
              onChange={e => handleSpecChange('width', e.target.value ? parseFloat(e.target.value) : null)}
              style={{ width: 80 }}
              suffix="mm"
            />
            <span style={{ padding: '0 8px' }}>×</span>
            <Input
              type="number"
              placeholder="高度"
              value={specValue.height || ''}
              onChange={e => handleSpecChange('height', e.target.value ? parseFloat(e.target.value) : null)}
              style={{ width: 80 }}
              suffix="mm"
            />
          </Space.Compact>
        )
      case 'other':
        return (
          <Input
            placeholder="请输入自定义规格"
            value={customValue}
            onChange={e => handleCustomChange(e.target.value)}
            style={{ width: 300 }}
          />
        )
      default:
        return null
    }
  }

  return (
    <div style={style}>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Space.Compact>
          <Select
            value={materialType}
            onChange={handleMaterialTypeChange}
            style={{ width: 120 }}
            placeholder="选择材料类型"
          >
            {materialTypes.map(type => (
              <Option key={type.value} value={type.value}>
                <Space>
                  {type.icon}
                  {type.label}
                </Space>
              </Option>
            ))}
          </Select>
          <span style={{ padding: '0 8px', color: '#666' }}>
            {materialTypes.find(t => t.value === materialType)?.spec}
          </span>
        </Space.Compact>
        {renderSpecInputs()}
      </Space>
    </div>
  )
}

export function createSpecificationsInput(form: any, fieldName: string, materialTypeField?: string) {
  return (
    <Form.Item
      name={fieldName}
      rules={[{ required: true, message: '请输入规格' }]}
    >
      <SpecificationsInput
        materialType={materialTypeField ? form.getFieldValue(materialTypeField) : 'plate'}
        placeholder="请输入规格"
      />
    </Form.Item>
  )
}

export default SpecificationsInput