import { useState, useCallback, useMemo } from 'react'

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
  const [filteredData, setFilteredData] = useState<T[]>(data)

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

  const applyFilters = useCallback((newFilters: SearchFilters) => {
    setFilters(newFilters)

    let result = [...data]

    if (newFilters.keyword) {
      const keyword = newFilters.keyword.toLowerCase()
      result = result.filter(item => {
        const inventoryNumber = (item.inventory_number || '').toLowerCase()
        const projectName = (item.project_name || '').toLowerCase()
        return inventoryNumber.includes(keyword) || projectName.includes(keyword)
      })
    }

    if (newFilters.productionUnit) {
      result = result.filter(item => item.production_unit === newFilters.productionUnit)
    }

    if (newFilters.category) {
      result = result.filter(item => item.category === newFilters.category)
    }

    if (newFilters.dateRange && newFilters.dateRange.length === 2) {
      const [startDate, endDate] = newFilters.dateRange
      result = result.filter(item => {
        const receivedDate = item.received_date
        if (!receivedDate) return false
        return receivedDate >= startDate && receivedDate <= endDate
      })
    }

    if (newFilters.status && newFilters.status !== 'all') {
      result = result.filter(item => getToolingStatus(item) === newFilters.status)
    }

    if (newFilters.projectName) {
      const projectName = newFilters.projectName.toLowerCase()
      result = result.filter(item => {
        const name = (item.project_name || '').toLowerCase()
        return name.includes(projectName)
      })
    }

    setFilteredData(result)
  }, [data, getToolingStatus])

  const resetFilters = useCallback(() => {
    setFilters({})
    setFilteredData(data)
  }, [data])

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
