import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { Input, InputRef, Select } from 'antd'

interface SelectOption {
  value: string
  label: string
}

interface EditableCellProps {
  value: string | undefined
  record: any
  dataIndex: string
  options?: string[]
  materialOptions?: SelectOption[]
  materialSourceOptions?: SelectOption[]
  partCategoryOptions?: SelectOption[]
  productionUnitOptions?: SelectOption[]
  categoryOptions?: SelectOption[]
  onSave: (id: string, key: string, value: string) => void
  customStyle?: React.CSSProperties
  renderDisplay?: (value: string | undefined, record: any, dataIndex: string) => React.ReactNode
}

const EditableCell: React.FC<EditableCellProps> = React.memo(({ 
  value, 
  record, 
  dataIndex, 
  options, 
  materialOptions,
  materialSourceOptions,
  partCategoryOptions,
  productionUnitOptions,
  categoryOptions,
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
  const isSavingRef = useRef(false)
  const lastValueRef = useRef(String(value ?? ''))
  const compositionRef = useRef(false)

  const getSelectOptions = useCallback(() => {
    if (dataIndex === 'material_id' && materialOptions) {
      return materialOptions
    }
    if (dataIndex === 'material_source_id' && materialSourceOptions) {
      return materialSourceOptions
    }
    if (dataIndex === 'part_category' && partCategoryOptions) {
      return partCategoryOptions
    }
    if (dataIndex === 'production_unit' && productionUnitOptions) {
      return productionUnitOptions
    }
    if (dataIndex === 'category' && categoryOptions) {
      return categoryOptions
    }
    if (options) {
      return options.map(opt => ({ label: opt, value: opt }))
    }
    return []
  }, [dataIndex, materialOptions, materialSourceOptions, partCategoryOptions, productionUnitOptions, categoryOptions, options])

  const selectOptions = useMemo(() => getSelectOptions(), [getSelectOptions])

  useEffect(() => {
    if (!isEditing && String(value ?? '') !== lastValueRef.current) {
      lastValueRef.current = String(value ?? '')
      setEditValue(String(value ?? ''))
    }
  }, [value, isEditing])

  const handleStartEdit = () => {
    setEditValue(String(value ?? ''))
    setIsEditing(true)
    didSaveRef.current = false
  }

  const handleSave = async () => {
    if (saveTriggeredRef.current || isSavingRef.current) {
      return
    }
    if (selectOptions.length > 0) {
      setIsEditing(false)
      return
    }

    if (editValue !== String(value ?? '')) {
      isSavingRef.current = true
      try {
        await onSave(record.id, dataIndex, editValue)
        didSaveRef.current = true
        lastValueRef.current = editValue
      } finally {
        isSavingRef.current = false
      }
    }
    setIsEditing(false)
  }

  const handleCancel = () => {
    setEditValue(String(value || ''))
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !compositionRef.current) {
      e.preventDefault()
      handleSave()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handleCancel()
    }
  }

  useEffect(() => {
    if (isEditing) {
      if (selectOptions.length > 0) {
        setTimeout(() => {
          selectRef.current?.focus()
        }, 0)
      } else {
        inputRef.current?.focus()
        inputRef.current?.select?.()
      }
    }
  }, [isEditing, selectOptions])

  if (!isEditing) {
    const displayValue = String(editValue ?? '')
    const content = renderDisplay ? renderDisplay(displayValue, record, dataIndex) : (displayValue || '\u00A0')
    return (
      <div 
        className="cell-content"
        onClick={(e) => { 
          e.stopPropagation(); 
          if (!isEditing) handleStartEdit() 
        }}
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

  if (selectOptions.length > 0) {
    return (
      <Select
        ref={selectRef}
        value={editValue}
        onChange={async (newValue) => {
          if (isSavingRef.current) return
          setEditValue(newValue)
          saveTriggeredRef.current = true
          isSavingRef.current = true
          try {
            await onSave(record.id, dataIndex, newValue)
            lastValueRef.current = newValue
          } finally {
            isSavingRef.current = false
          }
          setTimeout(() => {
              if (saveTriggeredRef.current) {
                  setIsEditing(false)
              }
          }, 0)
        }}
        onBlur={() => {
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
      onCompositionStart={() => { compositionRef.current = true }}
      onCompositionEnd={() => { compositionRef.current = false }}
      onBlur={handleSave}
      onKeyDown={handleKeyDown}
      style={{
        width: '100%',
        height: '32px',
        border: '1px solid #1890ff'
      }}
    />
  )
}, (prev, next) => {
  return prev.value === next.value &&
         prev.record === next.record &&
         prev.dataIndex === next.dataIndex &&
         prev.options === next.options &&
         prev.materialOptions === next.materialOptions &&
         prev.materialSourceOptions === next.materialSourceOptions &&
         prev.partCategoryOptions === next.partCategoryOptions &&
         prev.productionUnitOptions === next.productionUnitOptions &&
         prev.categoryOptions === next.categoryOptions
})

export default EditableCell
