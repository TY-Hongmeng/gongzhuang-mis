import React, { useRef, useCallback } from 'react'
import { message } from 'antd'
import { useToolingData } from '../../hooks/useToolingData'

export const useToolingFilters = () => {
  const { data } = useToolingData()
  const [filterSearch, setFilterSearch] = React.useState('')
  const [filterUnit, setFilterUnit] = React.useState<string | undefined>(undefined)
  const [filterCategory, setFilterCategory] = React.useState<string | undefined>(undefined)

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

  return {
    filterSearch,
    setFilterSearch,
    filterUnit,
    setFilterUnit,
    filterCategory,
    setFilterCategory,
    unitOptions,
    categoryOptions
  }
}
