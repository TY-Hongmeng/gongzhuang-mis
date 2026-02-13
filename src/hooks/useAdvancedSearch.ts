import { useState, useCallback, useMemo, useEffect } from 'react'

export interface SearchFilters {
  keyword?: string
  productionUnit?: string
  category?: string
  dateRange?: [string, string]
  status?: 'all' | 'complete' | 'incomplete' | 'warning'
  projectName?: string
}

export const useAdvancedSearch = <T extends Record<string, any>>(data: T[]) => {
  const [filters, setFilters] = useState<SearchFilters>({})

  const getToolingStatus = useCallback((item: T): 'complete' | 'incomplete' | 'warning' => {
    const hasInventoryNumber = !!item.inventory_number && item.inventory_number.trim() !== ''
    const hasProductionUnit = !!item.production_unit && item.production_unit.trim() !== ''
    const hasCategory = !!item.category && item.category.trim() !== ''
    const hasProjectName = !!item.project_name && item.project_name.trim() !== ''
    const hasReceivedDate = !!item.received_date && item.received_date.trim() !== ''
    const hasProductionDate = !!item.production_date && item.production_date.trim() !== ''

    if (hasInventoryNumber && hasProductionUnit && hasCategory && hasProjectName && hasReceivedDate && hasProductionDate) {
      return 'complete'
    }
    return 'warning'
  }, [])

  const filteredData = useMemo(() => {
    if (Object.keys(filters).length === 0) {
      return data
    }

    let result = [...data]

    if (filters.keyword) {
      const keyword = filters.keyword.toLowerCase()
      result = result.filter(item => {
        const inventoryNumber = (item.inventory_number || '').toLowerCase()
        const projectName = (item.project_name || '').toLowerCase()
        return inventoryNumber.includes(keyword) || projectName.includes(keyword)
      })
    }

    if (filters.productionUnit) {
      result = result.filter(item => item.production_unit === filters.productionUnit)
    }

    if (filters.category) {
      result = result.filter(item => item.category === filters.category)
    }

    if (filters.dateRange && filters.dateRange.length === 2) {
      const [startDate, endDate] = filters.dateRange
      result = result.filter(item => {
        const receivedDate = item.received_date
        if (!receivedDate) return false
        return receivedDate >= startDate && receivedDate <= endDate
      })
    }

    if (filters.status && filters.status !== 'all') {
      result = result.filter(item => getToolingStatus(item) === filters.status)
    }

    if (filters.projectName) {
      const projectName = filters.projectName.toLowerCase()
      result = result.filter(item => {
        const name = (item.project_name || '').toLowerCase()
        return name.includes(projectName)
      })
    }

    return result
  }, [data, filters, getToolingStatus])

  const applyFilters = useCallback((newFilters: SearchFilters) => {
    setFilters(newFilters)
  }, [])

  const resetFilters = useCallback(() => {
    setFilters({})
  }, [])

  const activeFiltersCount = useMemo(() => {
    let count = 0
    if (filters.keyword) count++
    if (filters.productionUnit) count++
    if (filters.category) count++
    if (filters.dateRange) count++
    if (filters.status && filters.status !== 'all') count++
    if (filters.projectName) count++
    return count
  }, [filters])

  const hasActiveFilters = useMemo(() => activeFiltersCount > 0, [activeFiltersCount])

  return {
    filters,
    filteredData,
    activeFiltersCount,
    hasActiveFilters,
    applyFilters,
    resetFilters
  }
}
