import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Edit2, Trash2, Save, X, GripVertical } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Popconfirm, Modal, Button, Typography, Space, message, Table } from 'antd';
import { DatabaseOutlined, ReloadOutlined, LeftOutlined, UploadOutlined, DownloadOutlined, ExportOutlined } from '@ant-design/icons';
import { PartType } from '../types/tooling';
import { fetchWithFallback } from '../utils/api'
import * as XLSX from 'xlsx'

interface ProductionUnit {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface ToolingCategory {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface MaterialSource {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface DeviceItem {
  id: string;
  device_no: string;
  device_name: string;
  max_aux_minutes?: number | null;
  process_unit_price?: number | null;
}

interface FixedOptionItem {
  id: string;
  option_value: string;
  option_label: string;
  is_active: boolean;
}

interface EditableItem {
  id: string | null;
  name: string;
  description: string;
  is_active: boolean;
}

export default function OptionsManagement() {
  const navigate = useNavigate();
  const getToolingApiUrl = useCallback((path: string) => {
    const host = typeof window !== 'undefined' ? String(window.location?.host || '') : ''
    const isGhPages = /github\.io/i.test(host)
    const isLocal = /localhost|127\.0\.0\.1|::1/i.test(host)
      || /^192\.168\./.test(host)
      || /^10\./.test(host)
      || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    if (!isGhPages && isLocal) {
      return `http://localhost:3003${path}`
    }
    return path
  }, [])
  const [productionUnits, setProductionUnits] = useState<ProductionUnit[]>([]);
  const [toolingCategories, setToolingCategories] = useState<ToolingCategory[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  
  const [partTypes, setPartTypes] = useState<PartType[]>([]);
  const [materialSources, setMaterialSources] = useState<MaterialSource[]>([]);
  const [activeTab, setActiveTab] = useState<'units' | 'categories' | 'materials' | 'partTypes' | 'materialSources' | 'devices' | 'fixedOptions'>('units');
  const [editingUnit, setEditingUnit] = useState<EditableItem | null>(null);
  const [editingCategory, setEditingCategory] = useState<EditableItem | null>(null);
  const [editingMaterial, setEditingMaterial] = useState<any | null>(null);
  
  
  const [editingPartType, setEditingPartType] = useState<PartType | null>(null);
  const [editingMaterialSource, setEditingMaterialSource] = useState<MaterialSource | null>(null);
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [editingDevice, setEditingDevice] = useState<DeviceItem | null>(null);
  const [fixedOptions, setFixedOptions] = useState<FixedOptionItem[]>([]);
  const [editingFixedOption, setEditingFixedOption] = useState<FixedOptionItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [materialImportVisible, setMaterialImportVisible] = useState(false);
  const [materialImporting, setMaterialImporting] = useState(false);
  const materialFileInputRef = useRef<HTMLInputElement>(null);
  const [deviceImportVisible, setDeviceImportVisible] = useState(false);
  const [deviceImporting, setDeviceImporting] = useState(false);
  const deviceFileInputRef = useRef<HTMLInputElement>(null);
  

  

  // 获取单个页面的数据
  const fetchTabData = async (tab: string) => {
    setLoading(true);
    setError(null);
    console.log(`fetchTabData called for tab: ${tab}`);
    try {
      // 超时控制：每个请求最多等待30秒，确保有足够时间获取数据
      const TIMEOUT = 30000;

      // 创建带超时的fetch请求
      const createTimedFetch = (url: string, name: string): Promise<any> => {
        return new Promise((resolve) => {
          const timeoutId = setTimeout(() => {
            console.warn(`Request to ${url} timed out after ${TIMEOUT}ms`);
            resolve(null);
          }, TIMEOUT);

          fetchWithFallback(url)
            .then(async (response) => {
              console.log(`${name} response status:`, response.status);
              try {
                const data = await response.json();
                console.log(`${name} data:`, data);
                resolve(data);
              } catch (e) {
                console.error(`${name} json parse error:`, e);
                resolve(null);
              } finally {
                clearTimeout(timeoutId);
              }
            })
            .catch((e) => {
              console.error(`${name} request error:`, e);
              resolve(null);
              clearTimeout(timeoutId);
            });
        });
      };

      const getArr = (obj: any) => {
        if (Array.isArray(obj)) return obj;
        if (obj && typeof obj === 'object') {
          const d = (obj as any).data;
          if (Array.isArray(d)) return d;
          if (d && typeof d === 'object' && Array.isArray((d as any).data)) return (d as any).data;
          const items = (obj as any).items;
          if (Array.isArray(items)) return items;
        }
        return [];
      };

      // 根据当前标签页加载对应的数据
      switch (tab) {
        case 'units':
          const unitsData = await createTimedFetch('/api/options/production-units', 'production_units');
          const normUnits = getArr(unitsData).map((x: any) => ({ id: String(x.id ?? x.uuid ?? Math.random().toString(36).slice(2)), name: String(x.name ?? x.unit_name ?? ''), is_active: Boolean(x.is_active ?? true) }));
          setProductionUnits(normUnits);
          break;
        case 'categories':
          const categoriesData = await createTimedFetch('/api/options/tooling-categories', 'tooling_categories');
          const normCats = getArr(categoriesData).map((x: any) => ({ id: String(x.id ?? x.uuid ?? Math.random().toString(36).slice(2)), name: String(x.name ?? x.category_name ?? ''), is_active: Boolean(x.is_active ?? true) }));
          setToolingCategories(normCats);
          break;
        case 'materialSources':
          const materialSourcesData = await createTimedFetch('/api/options/material-sources', 'material_sources');
          const normSources = getArr(materialSourcesData).map((x: any) => ({ id: String(x.id ?? Math.random().toString(36).slice(2)), name: String(x.name ?? ''), description: String(x.description ?? ''), is_active: Boolean(x.is_active ?? true) }));
          setMaterialSources(normSources);
          break;
        case 'partTypes':
          const partTypesData = await createTimedFetch('/api/part-types', 'part_types');
          const normPartTypes = getArr(partTypesData).map((x: any) => ({ id: String(x.id ?? x.uuid ?? Math.random().toString(36).slice(2)), name: String(x.name ?? x.part_type_name ?? ''), description: x.description ?? '', volume_formula: x.volume_formula ?? '', is_active: Boolean(x.is_active ?? true) }));
          setPartTypes(normPartTypes);
          break;
        case 'devices':
          const devicesData = await createTimedFetch(getToolingApiUrl('/api/tooling/devices'), 'devices');
          const devicesResult = getArr(devicesData);
          const normDevices = devicesResult.map((x: any) => ({ id: String(x.id ?? x.uuid ?? Math.random().toString(36).slice(2)), device_no: String(x.device_no ?? ''), device_name: String(x.device_name ?? ''), name: String(x.device_name ?? ''), is_active: Boolean(x.is_active ?? true), max_aux_minutes: x.max_aux_minutes ?? null, process_unit_price: x.process_unit_price ?? null }));
          console.log('normDevices:', normDevices);
          setDevices(normDevices);
          break;
        case 'fixedOptions':
          const fixedOptionsData = await createTimedFetch('/api/tooling/fixed-inventory-options', 'fixed_inventory_options');
          const fixedOptionsResult = getArr(fixedOptionsData);
          const normFixedOptions = fixedOptionsResult.map((x: any) => ({ id: String(x.id ?? x.uuid ?? Math.random().toString(36).slice(2)), option_value: String(x.option_value ?? ''), option_label: String(x.option_label ?? ''), name: String(x.option_label ?? ''), is_active: Boolean(x.is_active ?? true) }));
          console.log('normFixedOptions:', normFixedOptions);
          setFixedOptions(normFixedOptions);
          break;
        case 'materials':
          const matsJson = await createTimedFetch('/api/materials?order=created_at.desc', 'materials');
          const materialsArr = getArr(matsJson);
          setMaterials(materialsArr);
          console.log('materials:', matsJson);
          break;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取数据失败');
      console.error('获取数据失败:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTabData(activeTab);
  }, [activeTab]);

  // 基础操作函数
  const handleCreateUnit = () => setEditingUnit({ id: null, name: '', description: '', is_active: true });
  const handleCreateCategory = () => setEditingCategory({ id: null, name: '', description: '', is_active: true });
  const handleCreateMaterial = () => setEditingMaterial({ id: null, name: '', density: 7.850, unit_price: '' });
  const handleEditMaterial = (material: any) => setEditingMaterial({ ...material });
  const handleCreatePartType = () => setEditingPartType({ id: '', name: '', description: '', volume_formula: '', created_at: '', updated_at: '' });
  const handleCreateMaterialSource = () => setEditingMaterialSource({ id: null, name: '', description: '', is_active: true, created_at: '', updated_at: '' });
  const handleCreateDevice = () => setEditingDevice({ id: null as any, device_no: '', device_name: '', max_aux_minutes: null, process_unit_price: null } as any);
  const handleCreateFixedOption = () => setEditingFixedOption({ id: null as any, option_value: '', option_label: '', is_active: true } as any);

  const handleEditPartType = (partType: any) => setEditingPartType({ ...partType });

  const handleDownloadMaterialTemplate = () => {
    const templateData = [{
      材料名称: '示例：45#钢',
      密度: 7.85,
      单价: 5.5
    }]
    const ws = XLSX.utils.json_to_sheet(templateData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '材料库')
    XLSX.writeFile(wb, `材料库导入模板_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const normalizeMaterialName = (name: string) => String(name || '').trim().toLowerCase()

  const handleMaterialFileSelect = async (file: File) => {
    setMaterialImporting(true)
    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array' })
      const sheetName = workbook.SheetNames[0]
      if (!sheetName) {
        message.error('未找到工作表')
        return
      }
      const sheet = workbook.Sheets[sheetName]
      const rows = XLSX.utils.sheet_to_json<any>(sheet, { defval: '' })
      if (!rows.length) {
        message.error('导入文件为空')
        return
      }
      const materialMap = new Map<string, any>()
      materials.forEach((m) => {
        const key = normalizeMaterialName(m.name)
        if (key) materialMap.set(key, m)
      })
      let created = 0
      let updated = 0
      let skipped = 0
      const errors: string[] = []
      for (const row of rows) {
        const name = String(row['材料名称'] || row['name'] || '').trim()
        const densityRaw = row['密度'] ?? row['density'] ?? ''
        const priceRaw = row['单价'] ?? row['unit_price'] ?? ''
        if (!name) {
          skipped++
          continue
        }
        const density = Number(densityRaw)
        const unit_price = priceRaw === '' || priceRaw === null || priceRaw === undefined ? null : Number(priceRaw)
        if (Number.isNaN(density) || density <= 0) {
          errors.push(`${name} 密度无效`)
          continue
        }
        if (unit_price !== null && Number.isNaN(unit_price)) {
          errors.push(`${name} 单价无效`)
          continue
        }
        const existing = materialMap.get(normalizeMaterialName(name))
        const url = existing ? `/api/materials/${existing.id}` : '/api/materials'
        const method = existing ? 'PUT' : 'POST'
        const response = await fetchWithFallback(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, density, unit_price })
        })
        if (!response.ok) {
          const err = await response.json().catch(() => ({}))
          errors.push(`${name} 导入失败${err?.error ? `：${err.error}` : ''}`)
          continue
        }
        if (existing) updated++
        else created++
      }
      await fetchTabData('materials')
      const msg = `导入完成：新增 ${created}，更新 ${updated}，跳过 ${skipped}`
      if (errors.length) {
        message.warning(`${msg}，失败 ${errors.length}`)
      } else {
        message.success(msg)
      }
      setMaterialImportVisible(false)
    } catch (err) {
      message.error(err instanceof Error ? err.message : '导入失败')
    } finally {
      setMaterialImporting(false)
      if (materialFileInputRef.current) materialFileInputRef.current.value = ''
    }
  }

  const handleDownloadDeviceTemplate = () => {
    const templateData = [{
      设备编号: 'CNC-001',
      设备名称: '数控加工中心',
      '最大辅助时间(分钟)': 30,
      工序单价: 1.5
    }]
    const ws = XLSX.utils.json_to_sheet(templateData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '设备')
    XLSX.writeFile(wb, `设备导入模板_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const handleExportDevices = () => {
    const exportRows = (devices || []).map((d: any) => ({
      设备编号: String(d?.device_no ?? ''),
      设备名称: String(d?.device_name ?? ''),
      '最大辅助时间(分钟)': d?.max_aux_minutes ?? '',
      工序单价: d?.process_unit_price ?? ''
    }))
    const ws = XLSX.utils.json_to_sheet(exportRows)
    ;(ws as any)['!cols'] = [
      { wch: 14 },
      { wch: 18 },
      { wch: 18 },
      { wch: 10 }
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '设备管理')
    XLSX.writeFile(wb, `设备管理导出_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const normalizeDeviceNo = (deviceNo: string) => String(deviceNo || '').trim().toLowerCase()

  const handleDeviceFileSelect = async (file: File) => {
    setDeviceImporting(true)
    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array' })
      const sheetName = workbook.SheetNames[0]
      if (!sheetName) {
        message.error('未找到工作表')
        return
      }
      const sheet = workbook.Sheets[sheetName]
      const rows = XLSX.utils.sheet_to_json<any>(sheet, { defval: '' })
      if (!rows.length) {
        message.error('导入文件为空')
        return
      }

      const deviceMap = new Map<string, DeviceItem>()
      devices.forEach((d) => {
        const key = normalizeDeviceNo(d.device_no)
        if (key) deviceMap.set(key, d)
      })

      let created = 0
      let updated = 0
      let skipped = 0
      const errors: string[] = []
      const candidates: Array<{
        device_no: string
        device_name: string
        max_aux_minutes: number | null
        process_unit_price: number | null
        existing?: DeviceItem
      }> = []

      for (const row of rows) {
        const device_no = String(
          row['设备编号'] ?? row['设备号'] ?? row['device_no'] ?? row['deviceNo'] ?? ''
        ).trim()
        const device_name = String(
          row['设备名称'] ?? row['name'] ?? row['device_name'] ?? row['deviceName'] ?? ''
        ).trim()
        const maxRaw = row['最大辅助时间(分钟)'] ?? row['最大辅助时间'] ?? row['max_aux_minutes'] ?? row['maxAuxMinutes'] ?? ''
        const processPriceRaw = row['工序单价'] ?? row['process_unit_price'] ?? row['processUnitPrice'] ?? ''

        if (!device_no) {
          skipped++
          continue
        }
        if (!device_name) {
          errors.push(`${device_no} 设备名称不能为空`)
          continue
        }
        const max_aux_minutes = (maxRaw === '' || maxRaw === null || maxRaw === undefined)
          ? null
          : Number(maxRaw)
        if (max_aux_minutes !== null && (Number.isNaN(max_aux_minutes) || max_aux_minutes < 0)) {
          errors.push(`${device_no} 最大辅助时间无效`)
          continue
        }
        const process_unit_price = (processPriceRaw === '' || processPriceRaw === null || processPriceRaw === undefined)
          ? null
          : Number(processPriceRaw)
        if (process_unit_price !== null && (Number.isNaN(process_unit_price) || process_unit_price < 0)) {
          errors.push(`${device_no} 工序单价无效`)
          continue
        }

        const existing = deviceMap.get(normalizeDeviceNo(device_no))
        candidates.push({ device_no, device_name, max_aux_minutes, process_unit_price, existing })
      }

      const chunkSize = 6
      for (let i = 0; i < candidates.length; i += chunkSize) {
        const batch = candidates.slice(i, i + chunkSize)
        const results = await Promise.all(batch.map(async (item) => {
          const url = getToolingApiUrl(item.existing ? '/api/tooling/devices/update' : '/api/tooling/devices')
          const response = await fetchWithFallback(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: item.existing ? String(item.existing.id) : undefined,
              device_no: item.device_no,
              device_name: item.device_name,
              max_aux_minutes: item.max_aux_minutes,
              process_unit_price: item.process_unit_price
            })
          })
          if (!response.ok) {
            const err = await response.json().catch(() => ({}))
            return { ok: false, error: `${item.device_no} 导入失败${err?.error ? `：${err.error}` : ''}` }
          }
          return { ok: true, updated: Boolean(item.existing) }
        }))

        results.forEach((r) => {
          if (!r.ok) {
            errors.push(r.error)
            return
          }
          if (r.updated) updated++
          else created++
        })
        await new Promise((resolve) => setTimeout(resolve, 0))
      }

      await fetchTabData('devices')
      const msg = `导入完成：新增 ${created}，更新 ${updated}，跳过 ${skipped}`
      if (errors.length) {
        message.warning(`${msg}，失败 ${errors.length}`)
      } else {
        message.success(msg)
      }
      setDeviceImportVisible(false)
    } catch (err) {
      message.error(err instanceof Error ? err.message : '导入失败')
    } finally {
      setDeviceImporting(false)
      if (deviceFileInputRef.current) deviceFileInputRef.current.value = ''
    }
  }

  const handleSaveUnit = async () => {
    if (!editingUnit?.name.trim()) {
      setError('单位名称不能为空');
      return;
    }
    setLoading(true);
    try {
      const url = editingUnit.id ? `/api/options/production-units/${editingUnit.id}` : '/api/options/production-units';
      const method = editingUnit.id ? 'PUT' : 'POST';
      const response = await fetchWithFallback(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingUnit.name.trim(), is_active: editingUnit.is_active })
      });
      if (!response.ok) throw new Error('保存失败');
      const resJson = await response.json();
      const created = resJson?.item || resJson?.data || null;
      if (created) {
        setProductionUnits((prev) => [...prev, { id: String(created.id), name: String(created.name), description: String(created.description || ''), is_active: Boolean(created.is_active), created_at: String(created.created_at || ''), updated_at: String(created.updated_at || '') }]);
      } else {
        await fetchTabData('units');
      }
      setEditingUnit(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCategory = async () => {
    if (!editingCategory?.name.trim()) {
      setError('类别名称不能为空');
      return;
    }
    setLoading(true);
    try {
      const url = editingCategory.id ? `/api/options/tooling-categories/${editingCategory.id}` : '/api/options/tooling-categories';
      const method = editingCategory.id ? 'PUT' : 'POST';
      const response = await fetchWithFallback(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingCategory.name.trim(), is_active: editingCategory.is_active })
      });
      if (!response.ok) throw new Error('保存失败');
      const resJson = await response.json();
      const created = resJson?.item || resJson?.data || null;
      if (created) {
        setToolingCategories((prev) => [...prev, { id: String(created.id), name: String(created.name), description: String(created.description || ''), is_active: Boolean(created.is_active), created_at: String(created.created_at || ''), updated_at: String(created.updated_at || '') }]);
      } else {
        await fetchTabData('categories');
      }
      setEditingCategory(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveMaterial = async () => {
    if (!editingMaterial?.name?.trim()) {
      setError('材料名称不能为空');
      return;
    }
    if (typeof editingMaterial.density !== 'number' || editingMaterial.density <= 0) {
      setError('请填写有效的密度');
      return;
    }
    setLoading(true);
    try {
      const url = editingMaterial.id ? `/api/materials/${editingMaterial.id}` : '/api/materials';
      const method = editingMaterial.id ? 'PUT' : 'POST';
      const response = await fetchWithFallback(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ name: editingMaterial.name.trim(), density: Number(editingMaterial.density), unit_price: (editingMaterial as any)?.unit_price ?? null })
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || '保存失败');
      }
      const resJson = await response.json();
      const created = resJson?.item || resJson?.data || null;
      if (created) {
        setMaterials((prev) => [...prev, { id: String(created.id), name: String(created.name), density: Number(created.density), unit_price: Number(created.unit_price ?? ((editingMaterial as any)?.unit_price ?? 0)) }]);
      }
      await fetchTabData('materials');
      setEditingMaterial(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSavePartType = async () => {
    if (!editingPartType?.name.trim()) {
      setError('料型名称不能为空');
      return;
    }
    setLoading(true);
    try {
      const url = editingPartType.id ? `/api/part-types/${editingPartType.id}` : '/api/part-types';
      const method = editingPartType.id ? 'PUT' : 'POST';
      const response = await fetchWithFallback(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingPartType.name.trim(), description: editingPartType.description?.trim() || null, volume_formula: editingPartType.volume_formula?.trim() || null })
      });
      if (!response.ok) throw new Error('保存失败');
      const resJson = await response.json();
      const created = resJson?.item || resJson?.data || null;
      if (created) {
        setPartTypes((prev) => [...prev, { id: String(created.id), name: String(created.name), description: String(created.description || ''), volume_formula: String(created.volume_formula || ''), created_at: String(created.created_at || ''), updated_at: String(created.updated_at || '') } as any]);
      } else {
        await fetchTabData('partTypes');
      }
      setEditingPartType(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveMaterialSource = async () => {
    if (!editingMaterialSource?.name.trim()) {
      setError('材料来源名称不能为空');
      return;
    }
    setLoading(true);
    try {
      const url = editingMaterialSource.id ? `/api/options/material-sources/${editingMaterialSource.id}` : '/api/options/material-sources';
      const method = editingMaterialSource.id ? 'PUT' : 'POST';
      const response = await fetchWithFallback(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingMaterialSource.name.trim(), description: editingMaterialSource.description?.trim() || '', is_active: editingMaterialSource.is_active })
      });
      if (!response.ok) throw new Error('保存失败');
      const resJson = await response.json();
      const created = resJson?.item || resJson?.data || null;
      if (created) {
        setMaterialSources((prev) => [...prev, { id: String(created.id), name: String(created.name), description: String(created.description || ''), is_active: Boolean(created.is_active), created_at: String(created.created_at || ''), updated_at: String(created.updated_at || '') }]);
      } else {
        await fetchTabData('materialSources');
      }
      setEditingMaterialSource(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDevice = async () => {
    if (!editingDevice?.device_no.trim() || !editingDevice?.device_name.trim()) {
      setError('设备编号和设备名称不能为空');
      return;
    }
    setLoading(true);
    try {
      const isUpdate = Boolean(editingDevice.id)
      const url = getToolingApiUrl(isUpdate ? '/api/tooling/devices/update' : '/api/tooling/devices')
      const response = await fetchWithFallback(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: isUpdate ? String(editingDevice.id) : undefined,
          device_no: editingDevice.device_no.trim(),
          device_name: editingDevice.device_name.trim(),
          max_aux_minutes: editingDevice.max_aux_minutes == null ? null : Number(editingDevice.max_aux_minutes),
          process_unit_price: editingDevice.process_unit_price == null ? null : Number(editingDevice.process_unit_price)
        })
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({} as any))
        throw new Error(detail?.error ? `保存失败：${detail.error}` : '保存失败')
      }
      await response.json();
      await fetchTabData('devices');
      setEditingDevice(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDevice = async (id: string) => {
    setLoading(true);
    try {
      const response = await fetchWithFallback(getToolingApiUrl('/api/tooling/devices/delete'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({} as any))
        throw new Error(detail?.error ? `删除失败：${detail.error}` : '删除失败')
      }
      await fetchTabData('devices');
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveFixedOption = async () => {
    if (!editingFixedOption?.option_value.trim()) {
      setError('选项值不能为空');
      return;
    }
    setLoading(true);
    try {
      const isUpdate = Boolean(editingFixedOption.id)
      const url = isUpdate ? '/api/tooling/fixed-inventory-options/update' : '/api/tooling/fixed-inventory-options'
      const response = await fetchWithFallback(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ id: isUpdate ? String(editingFixedOption.id) : undefined, option_value: editingFixedOption.option_value.trim(), option_label: String(editingFixedOption.option_label || '').trim() || editingFixedOption.option_value.trim(), is_active: Boolean(editingFixedOption.is_active) })
      });
      if (!response.ok) throw new Error('保存失败');
      await response.json();
      await fetchTabData('fixedOptions');
      setEditingFixedOption(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteFixedOption = async (id: string) => {
    setLoading(true);
    try {
      const response = await fetchWithFallback('/api/tooling/fixed-inventory-options/delete', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ id }) });
      if (!response.ok) throw new Error('删除失败');
      await fetchTabData('fixedOptions');
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUnit = async (id: string) => {
    setLoading(true);
    try {
      const response = await fetchWithFallback(`/api/options/production-units/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('删除失败');
      await fetchTabData('units');
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    setLoading(true);
    try {
      const response = await fetchWithFallback(`/api/options/tooling-categories/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('删除失败');
      await fetchTabData('categories');
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteMaterial = async (id: string) => {
    setLoading(true);
    try {
      const response = await fetchWithFallback(`/api/materials/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || '删除失败');
      }
      await fetchTabData('materials');
    } catch (err: any) {
      if (err?.code === '23503') {
        setError('该材料正在被使用，无法删除');
      } else {
        setError(err instanceof Error ? err.message : '删除失败');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePartType = async (id: string) => {
    setLoading(true);
    try {
      const response = await fetchWithFallback(`/api/part-types/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('删除失败');
      await fetchTabData('partTypes');
    } catch (err: any) {
      if (err?.code === '23503') {
        setError('该料型正在被使用，无法删除');
      } else {
        setError(err instanceof Error ? err.message : '删除失败');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteMaterialSource = async (id: string) => {
    setLoading(true);
    try {
      const response = await fetchWithFallback(`/api/options/material-sources/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || '删除失败');
      }
      await fetchTabData('materialSources');
    } catch (err: any) {
      setError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePrice = async (materialId: string, priceId: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchWithFallback(`/api/materials/${materialId}/prices/${priceId}`, { method: 'DELETE' });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || '删除失败');
      }
      await fetchTabData('materials');
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setLoading(false);
    }
  };

  // 渲染表格的辅助函数
  const renderTable = (items: any[], editingItem: EditableItem | null, onEdit: (item: any) => void, onSave: () => void, onCancel: () => void, deleteHandler?: (id: any) => void) => (
    <Table
      rowKey={(row: any) => String(row.id)}
      pagination={false}
      dataSource={editingItem && !editingItem.id ? [{ ...editingItem, id: '__new__' }, ...items] : items}
      columns={[
        {
          title: '序号',
          key: 'index',
          width: 70,
          align: 'center',
          render: (_: any, __: any, index: number) => index + 1
        },
        {
          title: '名称',
          dataIndex: 'name',
          key: 'name',
          render: (_: any, item: any) => (
            (editingItem && String(editingItem.id || '__new__') === String(item.id || '')) ? (
              <input
                type="text"
                value={editingItem.name}
                onChange={(e) => {
                  if (activeTab === 'units') setEditingUnit({ ...editingItem, name: e.target.value });
                  else if (activeTab === 'categories') setEditingCategory({ ...editingItem, name: e.target.value });
                  else if (activeTab === 'materialSources') setEditingMaterialSource({ ...item, name: e.target.value });
                }}
                className="border border-gray-300 rounded px-2 py-1 w-full"
                placeholder="请输入名称"
              />
            ) : item.name
          )
        },
        {
          title: '操作',
          key: 'actions',
          width: 120,
          render: (_: any, item: any) => (
            (editingItem && String(editingItem.id || '__new__') === String(item.id || '')) ? (
              <div className="flex space-x-2">
                <button onClick={onSave} className="text-green-600 hover:text-green-900" disabled={loading}>
                  <Save className="w-4 h-4" />
                </button>
                <button onClick={onCancel} className="text-gray-600 hover:text-gray-900" disabled={loading}>
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex space-x-2">
                <button onClick={() => onEdit(item)} className="text-blue-600 hover:text-blue-900" disabled={loading || !!editingItem}>
                  <Edit2 className="w-4 h-4" />
                </button>
                <Popconfirm
                  title={`确定要删除"${item.name}"吗？`}
                  okText="确定"
                  cancelText="取消"
                  onConfirm={() => item.id && deleteHandler && deleteHandler(item.id)}
                >
                  <button className="text-red-600 hover:text-red-900" disabled={loading || !!editingItem}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </Popconfirm>
              </div>
            )
          )
        }
      ]}
      title={() => (
        <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
          <span>总数：{items.length}</span>
        </div>
      )}
    />
  );

  // 主组件渲染
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="bg-white rounded-lg shadow-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <Typography.Title level={2} className="mb-0">
              <DatabaseOutlined className="text-3xl text-indigo-500 mb-2 mr-2" /> 基础数据
            </Typography.Title>
            <Space>
              <Button icon={<ReloadOutlined />} onClick={() => fetchTabData(activeTab)} disabled={loading}>刷新</Button>
              <Button icon={<LeftOutlined />} onClick={() => navigate(-1)}>返回</Button>
            </Space>
          </div>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        <div className="px-6 py-4">
          {/* 标签页 */}
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              <button onClick={() => setActiveTab('units')} className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'units' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
                投产单位管理
              </button>
              <button onClick={() => setActiveTab('categories')} className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'categories' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
                工装类别管理
              </button>
              <button onClick={() => setActiveTab('materials')} className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'materials' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
                材料库管理
              </button>
              <button onClick={() => setActiveTab('partTypes')} className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'partTypes' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
                料型管理
              </button>
              <button onClick={() => setActiveTab('materialSources')} className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'materialSources' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
                材料来源管理
              </button>
              <button onClick={() => setActiveTab('devices')} className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'devices' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
                设备管理
              </button>
              <button onClick={() => setActiveTab('fixedOptions')} className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'fixedOptions' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
                维修选项管理
              </button>
            </nav>
          </div>

          {/* 内容区域 */}
          <div className="mt-6">
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-2 text-gray-500">加载中...</p>
              </div>
            ) : (
              <>
                {/* 投产单位 */}
                {activeTab === 'units' && (
                  <div>
                    <div className="mb-4 flex justify-end">
                      <button 
                        onClick={handleCreateUnit} 
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        disabled={loading || !!editingUnit}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        新增投产单位
                      </button>
                    </div>
                    {renderTable(productionUnits, editingUnit, (item) => setEditingUnit({ ...item }), handleSaveUnit, () => setEditingUnit(null), handleDeleteUnit)}
                  </div>
                )}

                {/* 工装类别 */}
                {activeTab === 'categories' && (
                  <div>
                    <div className="mb-4 flex justify-end">
                      <button 
                        onClick={handleCreateCategory} 
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        disabled={loading || !!editingCategory}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        新增工装类别
                      </button>
                    </div>
                    {renderTable(toolingCategories, editingCategory, (item) => setEditingCategory({ ...item }), handleSaveCategory, () => setEditingCategory(null), handleDeleteCategory)}
                  </div>
                )}

                {/* 材料管理 */}
                {activeTab === 'materials' && (
                  <div>
                    <div className="mb-4 flex justify-end space-x-2">
                      <Button icon={<DownloadOutlined />} onClick={handleDownloadMaterialTemplate} disabled={loading}>
                        下载模板
                      </Button>
                      <Button icon={<UploadOutlined />} onClick={() => setMaterialImportVisible(true)} disabled={loading}>
                        导入
                      </Button>
                      <button 
                        onClick={handleCreateMaterial} 
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        disabled={loading || !!editingMaterial}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        新增材料
                      </button>
                    </div>
                    <Table
                      rowKey={(row: any) => String(row.id)}
                      pagination={false}
                      dataSource={editingMaterial && !editingMaterial.id ? [{ ...editingMaterial, id: '__new__' }, ...materials] : materials}
                      columns={[
                        { title: '序号', key: 'index', width: 70, align: 'center', render: (_: any, __: any, index: number) => index + 1 },
                        {
                          title: '材料名称',
                          dataIndex: 'name',
                          key: 'name',
                          render: (_: any, material: any) => (
                            editingMaterial && String(editingMaterial.id || '__new__') === String(material.id || '')
                              ? <input type="text" value={editingMaterial.name} onChange={(e) => setEditingMaterial({ ...editingMaterial, name: e.target.value })} className="w-full border border-gray-300 rounded px-2 py-1" />
                              : material.name
                          )
                        },
                        {
                          title: '密度(g/cm³)',
                          dataIndex: 'density',
                          key: 'density',
                          render: (_: any, material: any) => (
                            editingMaterial && String(editingMaterial.id || '__new__') === String(material.id || '')
                              ? <input type="number" step="0.001" value={editingMaterial.density} onChange={(e) => setEditingMaterial({ ...editingMaterial, density: Number(e.target.value) })} className="w-full border border-gray-300 rounded px-2 py-1" />
                              : material.density
                          )
                        },
                        {
                          title: '单价(元/kg)',
                          dataIndex: 'unit_price',
                          key: 'unit_price',
                          render: (_: any, material: any) => (
                            editingMaterial && String(editingMaterial.id || '__new__') === String(material.id || '')
                              ? <input type="number" step="0.01" value={(editingMaterial as any).unit_price ?? ''} onChange={(e) => setEditingMaterial({ ...editingMaterial, unit_price: e.target.value })} className="w-full border border-gray-300 rounded px-2 py-1" />
                              : `¥${material.unit_price ? Number(material.unit_price).toFixed(2) : '0.00'}`
                          )
                        },
                        {
                          title: '操作',
                          key: 'actions',
                          width: 120,
                          render: (_: any, material: any) => (
                            editingMaterial && String(editingMaterial.id || '__new__') === String(material.id || '')
                              ? (
                                <div className="flex space-x-2">
                                  <button onClick={handleSaveMaterial} className="text-green-600 hover:text-green-900" disabled={loading}><Save className="w-4 h-4" /></button>
                                  <button onClick={() => setEditingMaterial(null)} className="text-gray-600 hover:text-gray-900" disabled={loading}><X className="w-4 h-4" /></button>
                                </div>
                              )
                              : (
                                <div className="flex space-x-2">
                                  <button onClick={() => handleEditMaterial(material)} className="text-blue-600 hover:text-blue-900" disabled={loading || !!editingMaterial}><Edit2 className="w-4 h-4" /></button>
                                  <Popconfirm title="确定要删除这个材料吗？" okText="确定" cancelText="取消" onConfirm={() => handleDeleteMaterial(material.id)}>
                                    <button className="text-red-600 hover:text-red-900" disabled={loading || !!editingMaterial}><Trash2 className="w-4 h-4" /></button>
                                  </Popconfirm>
                                </div>
                              )
                          )
                        }
                      ]}
                      title={() => (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
                          <span>总数：{materials.length}</span>
                        </div>
                      )}
                    />
                  </div>
                )}

                

                {/* 料型管理 */}
                {activeTab === 'partTypes' && (
                  <div>
                    <div className="mb-4 flex justify-end">
                      <button 
                        onClick={handleCreatePartType} 
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        disabled={loading || !!editingPartType}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        新增料型
                      </button>
                    </div>
                    <Table
                      rowKey={(row: any) => String(row.id)}
                      pagination={false}
                      dataSource={editingPartType && !editingPartType.id ? [{ ...editingPartType, id: '__new__' }, ...partTypes] : partTypes}
                      columns={[
                        { title: '序号', key: 'index', width: 70, align: 'center', render: (_: any, __: any, index: number) => index + 1 },
                        {
                          title: '名称',
                          dataIndex: 'name',
                          key: 'name',
                          render: (_: any, partType: any) => (
                            editingPartType && String(editingPartType.id || '__new__') === String(partType.id || '')
                              ? <input type="text" value={editingPartType.name} onChange={(e) => setEditingPartType({ ...editingPartType, name: e.target.value })} className="w-full border border-gray-300 rounded px-2 py-1" />
                              : partType.name
                          )
                        },
                        {
                          title: '体积公式',
                          dataIndex: 'volume_formula',
                          key: 'volume_formula',
                          render: (_: any, partType: any) => (
                            editingPartType && String(editingPartType.id || '__new__') === String(partType.id || '')
                              ? <input type="text" value={editingPartType.volume_formula || ''} onChange={(e) => setEditingPartType({ ...editingPartType, volume_formula: e.target.value })} className="w-full border border-gray-300 rounded px-2 py-1" />
                              : (partType.volume_formula || '-')
                          )
                        },
                        {
                          title: '操作',
                          key: 'actions',
                          width: 120,
                          render: (_: any, partType: any) => (
                            editingPartType && String(editingPartType.id || '__new__') === String(partType.id || '')
                              ? (
                                <div className="flex space-x-2">
                                  <button onClick={handleSavePartType} className="text-green-600 hover:text-green-900" disabled={loading}><Save className="w-4 h-4" /></button>
                                  <button onClick={() => setEditingPartType(null)} className="text-gray-600 hover:text-gray-900" disabled={loading}><X className="w-4 h-4" /></button>
                                </div>
                              )
                              : (
                                <div className="flex space-x-2">
                                  <button onClick={() => handleEditPartType(partType)} className="text-blue-600 hover:text-blue-900" disabled={loading || !!editingPartType}>
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                  <Popconfirm
                                    title={`确定要删除"${partType.name}"吗？`}
                                    okText="确定"
                                    cancelText="取消"
                                    onConfirm={() => handleDeletePartType(partType.id)}
                                  >
                                    <button className="text-red-600 hover:text-red-900" disabled={loading || !!editingPartType}>
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </Popconfirm>
                                </div>
                              )
                          )
                        }
                      ]}
                      title={() => (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
                          <span>总数：{partTypes.length}</span>
                        </div>
                      )}
                    />
                  </div>
                )}

                {/* 材料来源 */}
                {activeTab === 'materialSources' && (
                  <div>
                    <div className="mb-4 flex justify-end">
                      <button
                        onClick={handleCreateMaterialSource}
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        disabled={loading || !!editingMaterialSource}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        新增材料来源
                      </button>
                    </div>
                    {renderTable(materialSources, editingMaterialSource, (item) => setEditingMaterialSource({ ...item }), handleSaveMaterialSource, () => setEditingMaterialSource(null), handleDeleteMaterialSource)}
                  </div>
                )}

                {activeTab === 'devices' && (
                  <div>
                    <div className="mb-4 flex justify-end space-x-2">
                      <Button icon={<DownloadOutlined />} onClick={handleDownloadDeviceTemplate} disabled={loading}>
                        下载模板
                      </Button>
                      <Button icon={<ExportOutlined />} onClick={handleExportDevices} disabled={loading}>
                        导出
                      </Button>
                      <Button icon={<UploadOutlined />} onClick={() => setDeviceImportVisible(true)} disabled={loading}>
                        导入
                      </Button>
                      <button
                        onClick={handleCreateDevice}
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        disabled={loading || !!editingDevice}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        新增设备
                      </button>
                    </div>
                    <Table
                      rowKey={(row: any) => String(row.id)}
                      pagination={false}
                      dataSource={editingDevice && !editingDevice.id ? [{ ...editingDevice, id: '__new__' }, ...devices] : devices}
                      columns={[
                        { title: '序号', key: 'index', width: 70, align: 'center', render: (_: any, __: any, index: number) => index + 1 },
                        {
                          title: '设备编号',
                          dataIndex: 'device_no',
                          key: 'device_no',
                          render: (_: any, device: any) => (
                            editingDevice && String(editingDevice.id || '__new__') === String(device.id || '')
                              ? <input type="text" value={editingDevice.device_no} onChange={(e) => setEditingDevice({ ...editingDevice, device_no: e.target.value })} className="w-full border border-gray-300 rounded px-2 py-1" />
                              : device.device_no
                          )
                        },
                        {
                          title: '设备名称',
                          dataIndex: 'device_name',
                          key: 'device_name',
                          render: (_: any, device: any) => (
                            editingDevice && String(editingDevice.id || '__new__') === String(device.id || '')
                              ? <input type="text" value={editingDevice.device_name} onChange={(e) => setEditingDevice({ ...editingDevice, device_name: e.target.value })} className="w-full border border-gray-300 rounded px-2 py-1" />
                              : device.device_name
                          )
                        },
                        {
                          title: '最大辅助时间(分钟)',
                          dataIndex: 'max_aux_minutes',
                          key: 'max_aux_minutes',
                          render: (_: any, device: any) => (
                            editingDevice && String(editingDevice.id || '__new__') === String(device.id || '')
                              ? <input type="number" value={editingDevice.max_aux_minutes ?? ''} onChange={(e) => setEditingDevice({ ...editingDevice, max_aux_minutes: e.target.value ? Number(e.target.value) : null })} className="w-full border border-gray-300 rounded px-2 py-1" />
                              : (device.max_aux_minutes ?? '-')
                          )
                        },
                        {
                          title: '工序单价',
                          dataIndex: 'process_unit_price',
                          key: 'process_unit_price',
                          render: (_: any, device: any) => (
                            editingDevice && String(editingDevice.id || '__new__') === String(device.id || '')
                              ? <input type="number" value={editingDevice.process_unit_price ?? ''} onChange={(e) => setEditingDevice({ ...editingDevice, process_unit_price: e.target.value ? Number(e.target.value) : null })} className="w-full border border-gray-300 rounded px-2 py-1" />
                              : (device.process_unit_price ?? '-')
                          )
                        },
                        {
                          title: '操作',
                          key: 'actions',
                          width: 120,
                          render: (_: any, device: any) => (
                            editingDevice && String(editingDevice.id || '__new__') === String(device.id || '')
                              ? (
                                <div className="flex space-x-2">
                                  <button onClick={handleSaveDevice} className="text-green-600 hover:text-green-900" disabled={loading}><Save className="w-4 h-4" /></button>
                                  <button onClick={() => setEditingDevice(null)} className="text-gray-600 hover:text-gray-900" disabled={loading}><X className="w-4 h-4" /></button>
                                </div>
                              )
                              : (
                                <div className="flex space-x-2">
                                  <button onClick={() => setEditingDevice({ ...device })} className="text-blue-600 hover:text-blue-900" disabled={loading || !!editingDevice}>
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                  <Popconfirm title={`确定要删除"${device.device_name}"吗？`} okText="确定" cancelText="取消" onConfirm={() => handleDeleteDevice(device.id)}>
                                    <button className="text-red-600 hover:text-red-900" disabled={loading || !!editingDevice}>
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </Popconfirm>
                                </div>
                              )
                          )
                        }
                      ]}
                      title={() => (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
                          <span>总数：{devices.length}</span>
                        </div>
                      )}
                    />
                  </div>
                )}

                {activeTab === 'fixedOptions' && (
                  <div>
                    <div className="mb-4 flex justify-end">
                      <button
                        onClick={handleCreateFixedOption}
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        disabled={loading || !!editingFixedOption}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        新增维修选项
                      </button>
                    </div>
                    <Table
                      rowKey={(row: any) => String(row.id)}
                      pagination={false}
                      dataSource={editingFixedOption && !editingFixedOption.id ? [{ ...editingFixedOption, id: '__new__' }, ...fixedOptions] : fixedOptions}
                      columns={[
                        { title: '序号', key: 'index', width: 70, align: 'center', render: (_: any, __: any, index: number) => index + 1 },
                        {
                          title: '选项值',
                          dataIndex: 'option_value',
                          key: 'option_value',
                          render: (_: any, option: any) => (
                            editingFixedOption && String(editingFixedOption.id || '__new__') === String(option.id || '')
                              ? <input type="text" value={editingFixedOption.option_value} onChange={(e) => setEditingFixedOption({ ...editingFixedOption, option_value: e.target.value })} className="w-full border border-gray-300 rounded px-2 py-1" />
                              : option.option_value
                          )
                        },
                        {
                          title: '操作',
                          key: 'actions',
                          width: 120,
                          render: (_: any, option: any) => (
                            editingFixedOption && String(editingFixedOption.id || '__new__') === String(option.id || '')
                              ? (
                                <div className="flex space-x-2">
                                  <button onClick={handleSaveFixedOption} className="text-green-600 hover:text-green-900" disabled={loading}><Save className="w-4 h-4" /></button>
                                  <button onClick={() => setEditingFixedOption(null)} className="text-gray-600 hover:text-gray-900" disabled={loading}><X className="w-4 h-4" /></button>
                                </div>
                              )
                              : (
                                <div className="flex space-x-2">
                                  <button onClick={() => setEditingFixedOption({ ...option })} className="text-blue-600 hover:text-blue-900" disabled={loading || !!editingFixedOption}>
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                  <Popconfirm title={`确定要删除"${option.option_label}"吗？`} okText="确定" cancelText="取消" onConfirm={() => handleDeleteFixedOption(option.id)}>
                                    <button className="text-red-600 hover:text-red-900" disabled={loading || !!editingFixedOption}>
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </Popconfirm>
                                </div>
                              )
                          )
                        }
                      ]}
                      title={() => (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
                          <span>总数：{fixedOptions.length}</span>
                        </div>
                      )}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <input
        ref={deviceFileInputRef}
        type="file"
        accept=".xlsx,.xls,.xlsm"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleDeviceFileSelect(file)
        }}
      />

      <Modal
        title="导入设备"
        open={deviceImportVisible}
        onCancel={() => setDeviceImportVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setDeviceImportVisible(false)} disabled={deviceImporting}>
            取消
          </Button>,
          <Button key="choose" type="primary" onClick={() => deviceFileInputRef.current?.click()} loading={deviceImporting}>
            选择文件
          </Button>
        ]}
      >
        <div className="space-y-2">
          <div>请使用模板导入，字段包含：</div>
          <ul className="list-disc list-inside">
            <li>设备编号</li>
            <li>设备名称</li>
            <li>最大辅助时间(分钟)</li>
            <li>工序单价</li>
          </ul>
        </div>
      </Modal>

      <input
        ref={materialFileInputRef}
        type="file"
        accept=".xlsx,.xls,.xlsm"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleMaterialFileSelect(file)
        }}
      />

      <Modal
        title="导入材料库"
        open={materialImportVisible}
        onCancel={() => setMaterialImportVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setMaterialImportVisible(false)} disabled={materialImporting}>
            取消
          </Button>,
          <Button key="choose" type="primary" onClick={() => materialFileInputRef.current?.click()} loading={materialImporting}>
            选择文件
          </Button>
        ]}
      >
        <div className="space-y-2">
          <div>请使用模板导入，字段包含：</div>
          <ul className="list-disc list-inside">
            <li>材料名称</li>
            <li>密度</li>
            <li>单价</li>
          </ul>
        </div>
      </Modal>
    </div>
  );
}
