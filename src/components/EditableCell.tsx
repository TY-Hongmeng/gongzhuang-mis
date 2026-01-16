import React, { useEffect, useRef, useState } from 'react'
import { Input, InputRef } from 'antd'

interface EditableCellProps {
  value: string | undefined
  record: any
  dataIndex: string
  options?: string[]
  onSave: (id: string, key: string, value: string) => void
  customStyle?: React.CSSProperties
  renderDisplay?: (value: string | undefined, record: any, dataIndex: string) => React.ReactNode
}

const EditableCell: React.FC<EditableCellProps> = ({ 
  value, 
  record, 
  dataIndex, 
  options, 
  onSave,
  customStyle,
  renderDisplay
}) => {
  const [editValue, setEditValue] = useState(String(value ?? ''))
  const [isEditing, setIsEditing] = useState(false)
  const inputRef = useRef<InputRef>(null)
  const selectRef = useRef<HTMLSelectElement>(null)
  const didSaveRef = useRef(false)
  const saveTriggeredRef = useRef(false)

  // 当外部value变化时，更新内部状态（但仅在非编辑状态下）
  useEffect(() => {
    // 当从编辑状态切换到非编辑状态时，不立即更新editValue
    // 这样可以确保保存后立即显示最新值，而不是等待外部value更新
    if (!isEditing && !didSaveRef.current) {
      setEditValue(String(value ?? ''))
    }
    // 重置保存标记
    if (!isEditing) {
      didSaveRef.current = false
    }
  }, [value, isEditing])

  const handleStartEdit = () => {
    setIsEditing(true)
    // 使用当前显示的值作为初始值，而不是value prop
    // 这样可以确保用户再次编辑时，看到的是最新保存的值
    setEditValue(editValue)
    didSaveRef.current = false
  }

  const handleSave = () => {
    if (saveTriggeredRef.current) {
      saveTriggeredRef.current = false
      return
    }
    if (editValue !== String(value ?? '')) {
      onSave(record.id, dataIndex, editValue)
      didSaveRef.current = true
    }
    setIsEditing(false)
  }

  const handleCancel = () => {
    setEditValue(String(value || ''))
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

  useEffect(() => {
    if (isEditing) {
      if (options) {
        selectRef.current?.focus()
      } else {
        inputRef.current?.focus()
        inputRef.current?.select?.()
      }
    }
  }, [isEditing, options])

  if (!isEditing) {
    // 优化显示逻辑：当刚保存完数据时，优先使用editValue，确保立即显示最新值
    // 这样可以解决盘存编号列保存后不显示的问题
    const displayValue = String(editValue ?? '')
    const content = renderDisplay ? renderDisplay(displayValue, record, dataIndex) : (displayValue || '\u00A0')
    return (
      <div 
        className="cell-content"
        onClick={(e) => { e.stopPropagation(); handleStartEdit() }}
        onMouseDown={(e) => { e.stopPropagation() }}
        onDoubleClick={(e) => { e.stopPropagation(); handleStartEdit() }}
        style={{ 
          width: '100%', 
          height: '100%', 
          padding: '8px',
          cursor: 'pointer',
          minHeight: '32px',
          display: 'flex',
          alignItems: 'center',
          ...customStyle
        }}
      >
        {content}
      </div>
    )
  }

  if (options) {
    return (
      <select
        ref={selectRef}
        value={editValue}
        onChange={(e) => {
          const newValue = e.target.value
          setEditValue(newValue)
          // 选择后立即保存，使用事件中的新值避免状态未更新问题
          saveTriggeredRef.current = true
          onSave(record.id, dataIndex, newValue)
          setIsEditing(false)
        }}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        style={{
          width: '100%',
          height: '32px',
          border: '1px solid #1890ff',
          borderRadius: '4px',
          padding: '4px',
          backgroundColor: '#fff'
        }}
      >
        <option value="" hidden></option>
        {options.map(option => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    )
  }

  return (
    <Input
      ref={inputRef}
      value={editValue}
      onChange={(e) => {
        const newVal = e.target.value
        setEditValue(newVal)
      }}
      onBlur={handleSave}
      onKeyDown={handleKeyDown}
      style={{
        width: '100%',
        height: '32px',
        border: '1px solid #1890ff'
      }}
    />
  )
}

export default EditableCell
