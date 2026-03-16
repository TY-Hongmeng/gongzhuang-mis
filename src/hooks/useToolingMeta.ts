import { useState, useCallback } from 'react'
import { message } from 'antd'

type ToolingMetaData = {
  productionUnits: string[]
  toolingCategories: string[]
  materials: any[]
  partTypes: any[]
  materialSources: any[]
}

const META_CACHE_TTL = 5 * 60 * 1000
let metaCache: { ts: number; data: ToolingMetaData } | null = null
let inflightMetaPromise: Promise<ToolingMetaData> | null = null

const EMPTY_META: ToolingMetaData = {
  productionUnits: [],
  toolingCategories: [],
  materials: [],
  partTypes: [],
  materialSources: []
}

const parseItems = (res: any) => Array.isArray(res?.data) ? res.data : (Array.isArray(res?.items) ? res.items : [])

const loadToolingMeta = async (force = false): Promise<ToolingMetaData> => {
  const now = Date.now()
  if (!force && metaCache && now - metaCache.ts < META_CACHE_TTL) {
    return metaCache.data
  }
  if (!force && inflightMetaPromise) {
    return inflightMetaPromise
  }

  inflightMetaPromise = (async () => {
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

    const unitNames = parseItems(unitsRes).map((x: any) => x.name).filter(Boolean)
    const categoryNames = parseItems(catsRes).map((x: any) => x.name).filter(Boolean)

    const mats = parseItems(materialsRes)
      .map((x: any) => ({ id: x.id, name: x.name, density: x.density, unit_price: x.unit_price ?? 0 }))
      .filter((x: any) => x.name)

    const pts = parseItems(partTypesRes)
      .map((x: any) => ({ id: x.id, name: x.name, volume_formula: x.volume_formula, input_format: x.input_format }))
      .filter((x: any) => x.name)

    const sources = parseItems(materialSourcesRes)
      .map((x: any) => ({ id: x.id, name: x.name }))
      .filter((x: any) => x.name)

    const data: ToolingMetaData = {
      productionUnits: unitNames,
      toolingCategories: categoryNames,
      materials: mats,
      partTypes: pts,
      materialSources: sources
    }
    metaCache = { ts: Date.now(), data }
    return data
  })()

  try {
    return await inflightMetaPromise
  } finally {
    inflightMetaPromise = null
  }
}

// 元数据管理Hook
export const useToolingMeta = () => {
  const [productionUnits, setProductionUnits] = useState<string[]>([])
  const [toolingCategories, setToolingCategories] = useState<string[]>([])
  const [materials, setMaterials] = useState<any[]>([])
  const [partTypes, setPartTypes] = useState<any[]>([])
  const [materialSources, setMaterialSources] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  // 获取所有元数据
  const fetchAllMeta = useCallback(async (force = false) => {
    setLoading(true)
    try {
      const meta = await loadToolingMeta(force)
      setProductionUnits(meta.productionUnits)
      setToolingCategories(meta.toolingCategories)
      setMaterials(meta.materials)
      setPartTypes(meta.partTypes)
      setMaterialSources(meta.materialSources)
      return meta
    } catch (error) {
      message.error('获取基础数据失败')
      return EMPTY_META
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
