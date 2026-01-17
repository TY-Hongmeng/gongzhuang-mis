import React, { useEffect, useRef, useState, useMemo } from 'react'
import { Input, InputRef, Select } from 'antd'

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
  const selectRef = useRef<any>(null)
  const didSaveRef = useRef(false)
  const saveTriggeredRef = useRef(false)

  const selectOptions = useMemo(() => {
    return options ? options.map(opt => ({ label: opt, value: opt })) : []
  }, [options])

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
    setEditValue(String(value ?? ''))
    setIsEditing(true)
    didSaveRef.current = false
  }

  const handleSave = () => {
    // 对于 select 类型，如果已经触发了保存（在 onChange 中），则不再保存
    // 甚至更严格：如果 options 存在，onBlur 仅仅是关闭编辑模式，不应触发保存
    // 除非我们支持“输入筛选”的 Select，但目前看是原生 Select
    if (saveTriggeredRef.current) {
      saveTriggeredRef.current = false
      return
    }
    // 针对 Select 的额外保护：如果 options 存在，禁止 onBlur 触发保存
    // 因为 Select 的值变更必须通过 onChange
    if (options && options.length > 0) {
      setIsEditing(false)
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
        // 延迟打开下拉框，避免立即渲染导致性能问题
        setTimeout(() => {
          selectRef.current?.focus()
        }, 0)
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
        onClick={(e) => { e.stopPropagation(); if (!isEditing) handleStartEdit() }}
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
      <Select
        ref={selectRef}
        value={editValue}
        onChange={(newValue) => {
          setEditValue(newValue)
          // 选择后立即保存，使用事件中的新值避免状态未更新问题
          saveTriggeredRef.current = true
          onSave(record.id, dataIndex, newValue)
          // 使用 setTimeout 将 setIsEditing(false) 推迟到下一个事件循环
          // 这样可以确保当前的 onChange 事件处理完毕，且避免立即 unmount 导致的潜在冲突
          setTimeout(() => {
              if (saveTriggeredRef.current) {
                  setIsEditing(false)
              }
          }, 0)
        }}
        onBlur={() => {
          // Select onBlur behavior: just close edit mode, don't save if not changed via onChange
          setIsEditing(false)
        }}
        onKeyDown={(e) => {
           if (e.key === 'Escape') {
             e.preventDefault()
             handleCancel()
           }
        }}
        style={{
          width: '100%',
          ...customStyle
        }}
        showSearch
        options={selectOptions}
        optionFilterProp="label"
      />
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
