import React, { useState, useEffect } from 'react'
import { Table, Input, InputNumber, Select, Form, Button, Space, Popconfirm, message } from 'antd'
import { PlusOutlined, DeleteOutlined, EditOutlined, SaveOutlined, CloseOutlined } from '@ant-design/icons'
import type { TableProps, ColumnType } from 'antd/es/table'

const { Option } = Select

export interface EditableCellProps<T> {
  editing: boolean
  dataIndex: string
  title: string
  inputType: 'text' | 'number' | 'select' | 'date' | 'textarea'
  record: T
  index: number
  children: React.ReactNode
  selectOptions?: { label: string; value: string | number }[]
  rules?: any[]
  onSave: (record: T) => void
  onCancel: () => void
}

export function EditableCell<T>({
  editing,
  dataIndex,
  title,
  inputType,
  record,
  index,
  children,
  selectOptions = [],
  rules = [],
  onSave,
  onCancel,
  ...restProps
}: EditableCellProps<T>) {
  const [editingValue, setEditingValue] = useState(record[dataIndex as keyof T])
  const [inputValue, setInputValue] = useState(record[dataIndex as keyof T])

  React.useEffect(() => {
    if (editing) {
      setEditingValue(record[dataIndex as keyof T])
      setInputValue(record[dataIndex as keyof T])
    }
  }, [editing, record, dataIndex])

  const handleSave = () => {
    // 直接使用当前输入值，不再通过form.validateFields()获取
    const newRecord = { ...record, [dataIndex]: inputValue }
    onSave(newRecord)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave()
    } else if (e.key === 'Escape') {
      onCancel()
    }
  }

  const renderInput = () => {
    // 为不同的inputType提供不同的value类型处理
    const baseProps = {
      onChange: (e: any) => setInputValue(e.target?.value || e),
      onKeyDown: handleKeyDown,
      onPressEnter: handleSave,
      style: { width: '100%' }
    }

    switch (inputType) {
      case 'number':
        return (
          <InputNumber
            {...baseProps}
            value={Number(inputValue)}
            placeholder={`请输入${title}`}
            precision={2}
          />
        )
      case 'select':
        return (
          <Select
            {...baseProps}
            value={inputValue}
            placeholder={`请选择${title}`}
            showSearch
            filterOption={(input, option) =>
              option?.children?.toString().toLowerCase().includes(input.toLowerCase())
            }
          >
            {selectOptions.map(option => (
              <Option key={option.value} value={option.value}>
                {option.label}
              </Option>
            ))}
          </Select>
        )
      case 'textarea':
        return (
          <Input.TextArea
            {...baseProps}
            value={String(inputValue)}
            placeholder={`请输入${title}`}
            rows={2}
            autoSize={{ minRows: 2, maxRows: 4 }}
          />
        )
      default:
        return (
          <Input
            {...baseProps}
            value={String(inputValue)}
            placeholder={`请输入${title}`}
          />
        )
    }
  }

  return (
    <td {...restProps}>
      {editing ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {renderInput()}
          <Space>
            <Button
              type="text"
              icon={<SaveOutlined />}
              onClick={handleSave}
              size="small"
              style={{ color: '#52c41a' }}
            />
            <Button
              type="text"
              icon={<CloseOutlined />}
              onClick={onCancel}
              size="small"
              style={{ color: '#ff4d4f' }}
            />
          </Space>
        </div>
      ) : (
        children
      )}
    </td>
  )
}

// Custom column type with editable properties
export interface EditableColumnType<T> extends ColumnType<T> {
  editable?: boolean
  inputType?: 'text' | 'number' | 'select' | 'date' | 'textarea'
  selectOptions?: { label: string; value: string | number }[]
  rules?: any[]
}

export interface EditableTableProps<T> extends Omit<TableProps<T>, 'columns'> {
  dataSource: T[]
  setDataSource: (data: T[]) => void
  editingKey: string
  setEditingKey: (key: string) => void
  onAdd?: () => T
  onDelete?: (record: T) => void
  onSave?: (record: T) => void
  rowKey?: string
  showActions?: boolean
  actionWidth?: number
  columns: EditableColumnType<T>[]
}

export function EditableTable<T extends { id?: string; key?: string }>({
  dataSource,
  setDataSource,
  editingKey,
  setEditingKey,
  onAdd,
  onDelete,
  onSave,
  rowKey = 'id',
  showActions = true,
  actionWidth = 120,
  columns = [],
  ...tableProps
}: EditableTableProps<T>) {
  const isEditing = (record: T) => {
    const key = record[rowKey as keyof T] as string
    return key === editingKey
  }

  const edit = (record: T) => {
    const key = record[rowKey as keyof T] as string
    setEditingKey(key)
  }

  const cancel = () => {
    setEditingKey('')
  }

  const save = async (record: T) => {
    try {
      const newData = [...dataSource]
      const index = newData.findIndex(item => {
        const key = item[rowKey as keyof T] as string
        const recordKey = record[rowKey as keyof T] as string
        return key === recordKey
      })

      if (index > -1) {
        const item = newData[index]
        // 使用传入的 record 直接更新，不再通过 form.validateFields() 获取
        newData.splice(index, 1, { ...item, ...record })
        setDataSource(newData)
        setEditingKey('')
        if (onSave) {
          onSave({ ...item, ...record })
        }
        message.success('保存成功')
      }
    } catch (errInfo) {
      console.log('Save Failed:', errInfo)
      message.error('保存失败，请检查输入')
    }
  }

  const handleDelete = async (record: T) => {
    const key = record[rowKey as keyof T] as string
    const newData = dataSource.filter(item => {
      const itemKey = item[rowKey as keyof T] as string
      return itemKey !== key
    })
    setDataSource(newData)
    if (onDelete) {
      onDelete(record)
    }
    message.success('删除成功')
  }

  const handleAdd = () => {
    if (onAdd) {
      const newRecord = onAdd()
      setDataSource([...dataSource, newRecord])
      edit(newRecord)
    }
  }

  const actionColumns = showActions ? [
    {
      title: '操作',
      dataIndex: 'operation',
      width: actionWidth,
      fixed: 'right' as const,
      render: (_: any, record: T) => {
        const editable = isEditing(record)
        return editable ? (
          <Space>
            <Button
              type="text"
              icon={<SaveOutlined />}
              onClick={() => save(record)}
              style={{ color: '#52c41a' }}
            />
            <Button
              type="text"
              icon={<CloseOutlined />}
              onClick={cancel}
              style={{ color: '#ff4d4f' }}
            />
          </Space>
        ) : (
          <Space>
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => edit(record)}
              style={{ color: '#1890ff' }}
            />
            <Popconfirm
              title="确定要删除吗？"
              onConfirm={() => handleDelete(record)}
              okText="确定"
              cancelText="取消"
            >
              <Button
                type="text"
                icon={<DeleteOutlined />}
                style={{ color: '#ff4d4f' }}
              />
            </Popconfirm>
          </Space>
        )
      }
    }
  ] : []

  const enhancedColumns = columns.map(col => {
    if (!col.editable) {
      return col
    }
    return {
      ...col,
      onCell: (record: T) => ({
        record,
        inputType: col.inputType || 'text',
        dataIndex: col.dataIndex,
        title: col.title as string,
        editing: isEditing(record),
        selectOptions: col.selectOptions,
        rules: col.rules,
        onSave: save,
        onCancel: cancel
      }) as any
    }
  })

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        {onAdd && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleAdd}
          >
            新增
          </Button>
        )}
      </div>
      <Table
        {...tableProps}
        components={{
          body: {
            cell: EditableCell
          }
        }}
        columns={[...enhancedColumns, ...actionColumns]}
        dataSource={dataSource}
        rowKey={rowKey}
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条/共 ${total} 条`
        }}
        scroll={{ x: 'max-content' }}
      />
    </>
  )
}

export default EditableTable