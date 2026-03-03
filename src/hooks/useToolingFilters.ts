import React, { useRef, useCallback } from 'react'
import { message } from 'antd'
import { useToolingData } from '../../hooks/useToolingData'

export const useToolingFilters = () => {
  const { data } = useToolingData()
  const [filterSearch, setFilterSearch] = React.useState('')
  const [filterUnit, setFilterUnit] = React.useState<string | undefined>(undefined)
  const [filterCategory, setFilterCategory] = React.useState<string | undefined>(undefined)
  const [filterStatus, setFilterStatus] = React.useState<string | undefined>(undefined)

  const unitOptions = React.useMemo(() => {
    const set = new Set<string>()
    data.forEach(d => { const v = String(d.production_unit || '').trim(); if (v) set.add(v) })
    return Array.from(set).map(v => ({ value: v, label: v }))
  }, [data])

  const categoryOptions = React.useMemo(() => {
    const set = new Set<string>()
    data.forEach(d => { const v = String(d.category || '').trim(); if (v) set.add(v) })
    return Array.from(set).map(v => ({ value: v, label: v }))
  }, [data])

  const statusOptions = [
    { value: 'completed', label: '已完成' },
    { value: 'incomplete', label: '未完成' }
  ]

  return {
    filterSearch,
    setFilterSearch,
    filterUnit,
    setFilterUnit,
    filterCategory,
    setFilterCategory,
    filterStatus,
    setFilterStatus,
    unitOptions,
    categoryOptions,
    statusOptions
  }
}
