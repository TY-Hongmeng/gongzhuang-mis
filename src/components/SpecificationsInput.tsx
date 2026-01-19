import React, { useEffect, useRef, useState } from 'react'
import { formatSpecificationsForProduction, parseProductionSpecifications } from '../utils/productionFormat'
import { getProductionFormatHint } from '../utils/productionHint'
import { parseVolumeFormula } from '../utils/toolingCalculations'

interface SpecificationsInputProps {
  specs: Record<string, any> | undefined
  partType: string | undefined
  partTypes: {id: string, name: string, volume_formula?: string, input_format?: string}[]
  onSave: (specs: Record<string, any>) => void
  modelText?: string
}

const SpecificationsInput: React.FC<SpecificationsInputProps> = ({ 
  specs, 
  partType, 
  partTypes, 
  onSave,
  modelText
}) => {
  const [editValue, setEditValue] = useState(formatSpecificationsForProduction(specs, partType))
  const [isEditing, setIsEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  
  const currentPartType = partTypes.find(pt => pt.name === partType)
  const formula = currentPartType?.volume_formula || ''
  const requiredVars = parseVolumeFormula(formula)
  // 使用基础数据中的input_format，如果没有则使用默认提示
  const inputFormat = currentPartType?.input_format || ''
  
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])
  
  const handleStartEdit = () => {
    setIsEditing(true)
    let currentValue = formatSpecificationsForProduction(specs, partType)
    if (!currentValue && modelText) {
      currentValue = modelText
    }
    
    // 对于圆料类型，提取φ后面的内容作为编辑值
    if (partType === '圆料' || partType === '圆环' || partType === '板料割圆') {
      if (currentValue.startsWith('φ')) {
        setEditValue(currentValue.substring(1)) // 去掉φ符号后的内容
      } else {
        setEditValue(currentValue) // 如果没有φ符号，显示原值
      }
    } else {
      setEditValue(currentValue)
    }
  }
  
  const handleSave = () => {
    // 对于圆料类型，在保存时自动添加φ前缀到编辑值
    let finalEditValue = editValue
    if (isRoundType && editValue && !editValue.startsWith('φ')) {
      finalEditValue = 'φ' + editValue
    }
    
    const newSpecs = parseProductionSpecifications(finalEditValue, partType)
    onSave(newSpecs)
    setIsEditing(false)
  }
  
  const handleCancel = () => {
    const currentValue = formatSpecificationsForProduction(specs, partType)
    
    // 对于圆料类型，提取φ后面的内容作为编辑值
    if (isRoundType && currentValue.startsWith('φ')) {
      setEditValue(currentValue.substring(1))
    } else {
      setEditValue(currentValue)
    }
    setIsEditing(false)
  }
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handleCancel()
    }
  }
  
  if (!isEditing) {
    return (
      <div 
        onClick={handleStartEdit}
        style={{ 
          width: '100%', 
          height: '100%', 
          padding: '8px',
          cursor: 'pointer',
          minHeight: '32px',
          display: 'flex',
          alignItems: 'center'
        }}
      >
        {formatSpecificationsForProduction(specs, partType) || modelText || ''}
      </div>
    )
  }
  
  // 判断是否为圆料类型
  const isRoundType = partType === '圆料' || partType === '圆环' || partType === '板料割圆'
  
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      {isRoundType && (
        <span style={{
          position: 'absolute',
          left: '8px',
          zIndex: 1,
          color: '#666',
          fontSize: '14px',
          pointerEvents: 'none'
        }}>
          φ
        </span>
      )}
      <input
        ref={inputRef}
        value={editValue}
        onChange={(e) => {
          setEditValue(e.target.value)
        }}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        placeholder={isRoundType ? 
          (inputFormat || getProductionFormatHint(partType || '')).substring(1) : 
          (inputFormat || getProductionFormatHint(partType || ''))
        }
        style={{
          width: '100%',
          height: '32px',
          border: '1px solid #1890ff',
          borderRadius: '4px',
          padding: isRoundType ? '4px 4px 4px 20px' : '4px',
          fontSize: '14px',
          color: '#333'
        }}
      />
    </div>
  )
}

export default SpecificationsInput
