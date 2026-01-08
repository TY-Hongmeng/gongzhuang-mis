import { useState, useCallback } from 'react'
import { message } from 'antd'

// 元数据管理Hook
export const useToolingMeta = () => {
  const [productionUnits, setProductionUnits] = useState<string[]>([])
  const [toolingCategories, setToolingCategories] = useState<string[]>([])
  const [materials, setMaterials] = useState<any[]>([])
  const [partTypes, setPartTypes] = useState<any[]>([])
  const [materialSources, setMaterialSources] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  // 获取所有元数据
  const fetchAllMeta = useCallback(async () => {
    setLoading(true)
    try {
      const [
        unitsRes, 
        catsRes, 
        materialsRes, 
        partTypesRes, 
        materialSourcesRes
      ] = await Promise.all([
        fetch('/api/options/production-units').then(r => r.json()),
        fetch('/api/options/tooling-categories').then(r => r.json()),
        fetch('/api/materials', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/part-types', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/options/material-sources', { cache: 'no-store' }).then(r => r.json())
      ])
      
      // 兼容 data 和 items 两种格式
      const getItems = (res: any) => Array.isArray(res?.data) ? res.data : (Array.isArray(res?.items) ? res.items : [])
      
      const unitNames = getItems(unitsRes).map((x: any) => x.name).filter(Boolean)
      const categoryNames = getItems(catsRes).map((x: any) => x.name).filter(Boolean)
      setProductionUnits(unitNames)
      setToolingCategories(categoryNames)
      
      const mats = getItems(materialsRes)
        .map((x: any) => ({id: x.id, name: x.name, density: x.density}))
        .filter((x: any) => x.name)
      setMaterials(mats)
      
      const pts = getItems(partTypesRes)
        .map((x: any) => ({id: x.id, name: x.name, volume_formula: x.volume_formula, input_format: x.input_format}))
        .filter((x: any) => x.name)
      setPartTypes(pts)
      
      const sources = getItems(materialSourcesRes)
        .map((x: any) => ({id: x.id, name: x.name}))
        .filter((x: any) => x.name)
      setMaterialSources(sources)
      
      return {
        productionUnits: unitNames,
        toolingCategories: categoryNames,
        materials: mats,
        partTypes: pts,
        materialSources: sources
      }
    } catch (error) {
      message.error('获取基础数据失败')
      return {
        productionUnits: [],
        toolingCategories: [],
        materials: [],
        partTypes: [],
        materialSources: []
      }
    } finally {
      setLoading(false)
    }
  }, [])

  return {
    productionUnits,
    toolingCategories,
    materials,
    partTypes,
    materialSources,
    loading,
    fetchAllMeta
  }
}
