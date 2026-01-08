import React, { useState, useEffect } from 'react'
import { InputNumber, Space, Form, Typography, Divider } from 'antd'
import { CalculatorOutlined } from '@ant-design/icons'

const { Text, Title } = Typography

export interface MaterialDensity {
  [key: string]: number // g/cm³
}

export const materialDensities: MaterialDensity = {
  '45#': 7.85,
  'Q235': 7.85,
  'Q345': 7.85,
  '铝合金': 2.7,
  '铜': 8.9,
  '不锈钢': 7.93,
  '铸铁': 7.2,
  '黄铜': 8.5
}

export interface PriceCalculatorProps {
  material?: string
  specifications?: string
  quantity?: number
  unitPrice?: number
  materialType?: string
  onWeightChange?: (weight: number) => void
  onTotalPriceChange?: (totalPrice: number) => void
  showDetails?: boolean
  style?: React.CSSProperties
}

export function PriceCalculator({
  material = '',
  specifications = '',
  quantity = 1,
  unitPrice = 0,
  materialType = 'plate',
  onWeightChange,
  onTotalPriceChange,
  showDetails = true,
  style
}: PriceCalculatorProps) {
  const [weight, setWeight] = useState(0)
  const [totalPrice, setTotalPrice] = useState(0)
  const [volume, setVolume] = useState(0)

  const parseSpecifications = (spec: string, type: string): number[] => {
    if (!spec) return []
    
    const parts = spec.split(/[×xX*]/).map(p => parseFloat(p.trim()))
    return parts.filter(p => !isNaN(p) && p > 0)
  }

  const calculateVolume = (specs: number[], type: string): number => {
    if (specs.length === 0) return 0

    // Convert mm to cm for volume calculation
    const specsInCm = specs.map(s => s / 10)

    switch (type) {
      case 'plate':
        if (specsInCm.length >= 3) {
          return specsInCm[0] * specsInCm[1] * specsInCm[2] // 长×宽×厚
        }
        break
      case 'bar':
        if (specsInCm.length >= 2) {
          const radius = specsInCm[0] / 2
          return Math.PI * radius * radius * specsInCm[1] // πr²×长度
        }
        break
      case 'profile':
        if (specsInCm.length >= 3) {
          return specsInCm[0] * specsInCm[1] * specsInCm[2] // 长×宽×高
        }
        break
      default:
        if (specsInCm.length >= 1) {
          // For other types, use first dimension as volume approximation
          return specsInCm[0] * specsInCm[0] * specsInCm[0]
        }
    }
    return 0
  }

  useEffect(() => {
    const specs = parseSpecifications(specifications, materialType)
    const calculatedVolume = calculateVolume(specs, materialType)
    const density = materialDensities[material] || 7.85 // Default to steel density
    const calculatedWeight = calculatedVolume * density // grams
    const calculatedWeightKg = calculatedWeight / 1000 // kg
    const calculatedTotalPrice = calculatedWeightKg * unitPrice * quantity

    setVolume(calculatedVolume)
    setWeight(calculatedWeightKg)
    setTotalPrice(calculatedTotalPrice)

    if (onWeightChange) {
      onWeightChange(calculatedWeightKg)
    }
    if (onTotalPriceChange) {
      onTotalPriceChange(calculatedTotalPrice)
    }
  }, [material, specifications, quantity, unitPrice, materialType, onWeightChange, onTotalPriceChange])

  const formatNumber = (num: number, decimals: number = 2): string => {
    return num.toFixed(decimals)
  }

  if (!showDetails) {
    return (
      <div style={style}>
        <Space>
          <Text type="secondary">重量:</Text>
          <Text strong>{formatNumber(weight)} kg</Text>
          <Text type="secondary">总价:</Text>
          <Text strong type="danger">¥{formatNumber(totalPrice)}</Text>
        </Space>
      </div>
    )
  }

  return (
    <div style={{ padding: '16px', backgroundColor: '#f5f5f5', borderRadius: '8px', ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
        <CalculatorOutlined style={{ marginRight: '8px', color: '#1890ff' }} />
        <Title level={5} style={{ margin: 0 }}>价格计算器</Title>
      </div>
      
      <Space direction="vertical" style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Text type="secondary">材料密度:</Text>
          <Text>{materialDensities[material] || 7.85} g/cm³</Text>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Text type="secondary">计算体积:</Text>
          <Text>{formatNumber(volume * 1000)} cm³</Text>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Text type="secondary">单件重量:</Text>
          <Text>{formatNumber(weight)} kg</Text>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Text type="secondary">数量:</Text>
          <Text>{quantity}</Text>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Text type="secondary">单价:</Text>
          <Text>¥{formatNumber(unitPrice)}/kg</Text>
        </div>
        
        <Divider style={{ margin: '8px 0' }} />
        
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: 'bold' }}>
          <Text>总价:</Text>
          <Text type="danger">¥{formatNumber(totalPrice)}</Text>
        </div>
      </Space>
    </div>
  )
}

export function PriceInput({
  value,
  onChange,
  placeholder = "请输入单价",
  style
}: {
  value?: number
  onChange?: (value: number) => void
  placeholder?: string
  style?: React.CSSProperties
}) {
  return (
    <InputNumber
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      min={0}
      precision={2}
      style={{ width: '100%', ...style }}
      formatter={value => `¥ ${value}`}
      parser={value => value!.replace(/¥\s?/g, '') as any}
    />
  )
}

export function QuantityInput({
  value,
  onChange,
  placeholder = "请输入数量",
  style
}: {
  value?: number
  onChange?: (value: number) => void
  placeholder?: string
  style?: React.CSSProperties
}) {
  return (
    <InputNumber
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      min={1}
      precision={0}
      style={{ width: '100%', ...style }}
    />
  )
}

export default PriceCalculator