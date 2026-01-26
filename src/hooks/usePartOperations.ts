import React, { useCallback, useMemo } from 'react'
import { message } from 'antd'
import { useToolingData } from './useToolingData'
import { useToolingMeta } from './useToolingMeta'
import { useToolingOperations } from './useToolingOperations'
import { RequestCleaner } from '../utils/dataSerializer'

interface PartItem {
  id: string
  tooling_id: string
  part_inventory_number?: string
  part_drawing_number?: string
  part_name?: string
  part_quantity?: number
  material_id?: string
  material_source_id?: string
  part_category?: string
  specifications?: Record<string, any>
  weight?: number
  remarks?: string
}

export const usePartOperations = () => {
  const { createPart, savePartData } = useToolingData()
  const { materials, partTypes } = useToolingMeta()
  const { calculatePartWeight } = useToolingOperations()

  const validatePartData = useCallback((part: Partial<PartItem>): { valid: boolean; errors: string[] } => {
    const errors: string[] = []

    if (!part.part_drawing_number || part.part_drawing_number.trim() === '') {
      errors.push('零件图号不能为空')
    }

    if (!part.part_name || part.part_name.trim() === '') {
      errors.push('零件名称不能为空')
    }

    if (part.part_quantity !== undefined && part.part_quantity !== null) {
      const qty = Number(part.part_quantity)
      if (isNaN(qty) || qty < 0) {
        errors.push('数量必须是大于等于0的数字')
      }
    }

    if (!part.material_id) {
      errors.push('请选择材质')
    }

    if (!part.part_category || part.part_category.trim() === '') {
      errors.push('请选择类别')
    }

    if (!part.specifications || Object.keys(part.specifications).length === 0) {
      errors.push('请填写规格信息')
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }, [])

  const createNewPart = useCallback(async (toolingId: string, partData: Partial<PartItem>) => {
    const { valid, errors } = validatePartData(partData)
    
    if (!valid) {
      message.error(errors.join('；'))
      return null
    }

    try {
      const cleanedParams = RequestCleaner.cleanPartParams(partData)
      const result = await createPart(toolingId, cleanedParams)
      
      if (result) {
        message.success('零件创建成功')
        return result
      }
      
      return null
    } catch (error) {
      message.error('创建零件失败：' + (error instanceof Error ? error.message : String(error)))
      return null
    }
  }, [validatePartData, createPart])

  const updatePart = useCallback(async (partId: string, partData: Partial<PartItem>) => {
    try {
      const cleanedParams = RequestCleaner.cleanPartParams(partData)
      const success = await savePartData(partId, cleanedParams)
      
      if (success) {
        return true
      }
      
      return false
    } catch (error) {
      message.error('更新零件失败：' + (error instanceof Error ? error.message : String(error)))
      return false
    }
  }, [savePartData])

  const calculateWeightForPart = useCallback((part: PartItem): number => {
    if (!part.specifications || !part.material_id || !part.part_category) {
      return 0
    }

    return calculatePartWeight(
      part.specifications,
      part.material_id,
      part.part_category,
      partTypes,
      materials
    )
  }, [calculatePartWeight, partTypes, materials])

  const batchUpdateWeights = useCallback(async (parts: PartItem[]): Promise<void> => {
    const updatePromises = parts.map(async (part) => {
      const weight = calculateWeightForPart(part)
      
      if (weight > 0 && weight !== part.weight) {
        return updatePart(part.id, { weight })
      }
      
      return Promise.resolve()
    })

    await Promise.all(updatePromises)
    message.success(`已更新 ${parts.length} 个零件的重量`)
  }, [calculateWeightForPart, updatePart])

  const deletePart = useCallback(async (partId: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/tooling/parts/${partId}`, { method: 'DELETE' })
      
      if (response.ok) {
        message.success('删除成功')
        return true
      }
      
      message.error('删除失败')
      return false
    } catch (error) {
      message.error('删除失败：' + (error instanceof Error ? error.message : String(error)))
      return false
    }
  }, [])

  const batchDeleteParts = useCallback(async (partIds: string[]): Promise<boolean> => {
    try {
      const response = await fetch('/api/tooling/parts/batch-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: partIds })
      })
      
      if (response.ok) {
        message.success(`已删除 ${partIds.length} 个零件`)
        return true
      }
      
      message.error('批量删除失败')
      return false
    } catch (error) {
      message.error('批量删除失败：' + (error instanceof Error ? error.message : String(error)))
      return false
    }
  }, [])

  const duplicatePart = useCallback(async (partId: string): Promise<PartItem | null> => {
    try {
      const response = await fetch(`/api/tooling/parts/${partId}`)
      
      if (!response.ok) {
        message.error('获取零件信息失败')
        return null
      }
      
      const result = await response.json()
      const part = result.data || result.items?.[0]
      
      if (!part) {
        message.error('零件不存在')
        return null
      }

      const newPart = {
        ...part,
        id: undefined,
        part_inventory_number: `${part.part_inventory_number}-copy`
      }

      return await createNewPart(part.tooling_id, newPart)
    } catch (error) {
      message.error('复制零件失败：' + (error instanceof Error ? error.message : String(error)))
      return null
    }
  }, [createNewPart])

  return {
    validatePartData,
    createNewPart,
    updatePart,
    calculateWeightForPart,
    batchUpdateWeights,
    deletePart,
    batchDeleteParts,
    duplicatePart
  }
}
