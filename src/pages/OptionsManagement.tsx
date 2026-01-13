import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Save, X, GripVertical } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Popconfirm, Modal, Button, Typography, Space } from 'antd';
import { DatabaseOutlined, ReloadOutlined, LeftOutlined } from '@ant-design/icons';
import { PartType } from '../types/tooling';
import { fetchWithFallback } from '../utils/api'

interface ProductionUnit {
  id: number;
  name: string;
  description: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface ToolingCategory {
  id: number;
  name: string;
  description: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface MaterialSource {
  id: number;
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
}

interface FixedOptionItem {
  id: string;
  option_value: string;
  option_label: string;
  is_active: boolean;
}

interface EditableItem {
  id: number | null;
  name: string;
  description: string;
  is_active: boolean;
}

export default function OptionsManagement() {
  const navigate = useNavigate();
  const [productionUnits, setProductionUnits] = useState<ProductionUnit[]>([]);
  const [toolingCategories, setToolingCategories] = useState<ToolingCategory[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [materialPrices, setMaterialPrices] = useState<Record<string, any[]>>({});
  const [partTypes, setPartTypes] = useState<PartType[]>([]);
  const [materialSources, setMaterialSources] = useState<MaterialSource[]>([]);
  const [activeTab, setActiveTab] = useState<'units' | 'categories' | 'materials' | 'partTypes' | 'materialSources' | 'devices' | 'fixedOptions'>('units');
  const [editingUnit, setEditingUnit] = useState<EditableItem | null>(null);
  const [editingCategory, setEditingCategory] = useState<EditableItem | null>(null);
  const [editingMaterial, setEditingMaterial] = useState<any | null>(null);
  const [editingPrice, setEditingPrice] = useState<any | null>(null);
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null);
  const [editingPartType, setEditingPartType] = useState<PartType | null>(null);
  const [editingMaterialSource, setEditingMaterialSource] = useState<MaterialSource | null>(null);
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [editingDevice, setEditingDevice] = useState<DeviceItem | null>(null);
  const [fixedOptions, setFixedOptions] = useState<FixedOptionItem[]>([]);
  const [editingFixedOption, setEditingFixedOption] = useState<FixedOptionItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draggedItem, setDraggedItem] = useState<any>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // 拖拽排序函数
  const handleDragStart = (e: React.DragEvent, item: any, index: number) => {
    setDraggedItem({ ...item, originalIndex: index });
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = async (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    setDragOverIndex(null);
    
    if (!draggedItem || draggedItem.originalIndex === dropIndex) {
      setDraggedItem(null);
      return;
    }

    try {
      setLoading(true);
      
      // 获取当前标签页的数据和API端点
      let items: any[] = [];
      let endpoint = '';
      let updateState: (items: any[]) => void = () => {};
      
      switch (activeTab) {
        case 'units':
          items = [...productionUnits];
          endpoint = '/api/options/production-units/reorder';
          updateState = setProductionUnits;
          break;
        case 'categories':
          items = [...toolingCategories];
          endpoint = '/api/options/tooling-categories/reorder';
          updateState = setToolingCategories;
          break;
        case 'materialSources':
          items = [...materialSources];
          endpoint = '/api/options/material-sources/reorder';
          updateState = setMaterialSources;
          break;
        case 'partTypes':
          items = [...partTypes];
          endpoint = '/api/part-types/reorder';
          updateState = setPartTypes;
          break;
        default:
          setDraggedItem(null);
          setLoading(false);
          return;
      }

      // 重新排序数组
      const draggedIndex = draggedItem.originalIndex;
      const newItems = [...items];
      const [removed] = newItems.splice(draggedIndex, 1);
      newItems.splice(dropIndex, 0, removed);
      
      // 更新本地状态
      updateState(newItems);
      
      // 发送重新排序请求到后端
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: draggedItem.id,
          newIndex: dropIndex,
          oldIndex: draggedIndex
        })
      });
      
      if (!response.ok) {
        // 如果后端更新失败，恢复原始状态
        updateState(items);
        throw new Error('排序更新失败');
      }
      
      // 重新获取数据以确保一致性
      await fetchTabData(activeTab);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : '排序更新失败');
    } finally {
      setDraggedItem(null);
      setLoading(false);
    }
  };

  // 获取单个页面的数据
  const fetchTabData = async (tab: string) => {
    setLoading(true);
    setError(null);
    console.log(`fetchTabData called for tab: ${tab}`);
    try {
      // 超时控制：每个请求最多等待10秒
      const TIMEOUT = 10000;

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

      const getArr = (obj: any) => obj && typeof obj === 'object' ? (Array.isArray(obj?.data) ? obj.data : (Array.isArray(obj?.items) ? obj.items : [])) : [];

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
          const normSources = getArr(materialSourcesData).map((x: any) => ({ id: String(x.id ?? x.source_id ?? Math.random().toString(36).slice(2)), name: String(x.name ?? x.source_name ?? ''), is_active: Boolean(x.is_active ?? true) }));
          setMaterialSources(normSources);
          break;
        case 'partTypes':
          const partTypesData = await createTimedFetch('/api/part-types', 'part_types');
          const normPartTypes = getArr(partTypesData).map((x: any) => ({ id: String(x.id ?? x.uuid ?? Math.random().toString(36).slice(2)), name: String(x.name ?? x.part_type_name ?? ''), description: x.description ?? '', volume_formula: x.volume_formula ?? '', is_active: Boolean(x.is_active ?? true) }));
          setPartTypes(normPartTypes);
          break;
        case 'devices':
          const devicesData = await createTimedFetch('/api/tooling/devices', 'devices');
          const devicesResult = getArr(devicesData);
          const normDevices = devicesResult.map((x: any) => ({ id: String(x.id ?? x.uuid ?? Math.random().toString(36).slice(2)), device_no: String(x.device_no ?? ''), device_name: String(x.device_name ?? ''), name: String(x.device_name ?? ''), is_active: Boolean(x.is_active ?? true), max_aux_minutes: x.max_aux_minutes ?? null }));
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
          // 异步加载每个材料的价格历史（不阻塞页面 loading）
          ;(async () => {
            const pricesMap: Record<string, any[]> = {};
            await Promise.allSettled(
              materialsArr.map(async (material: any) => {
                try {
                  const pricesRes = await fetchWithFallback(`/api/materials/${material.id}/prices`)
                  if (pricesRes.ok) {
                    const pricesJson = await pricesRes.json()
                    pricesMap[material.id] = Array.isArray(pricesJson?.data) ? pricesJson.data : (Array.isArray(pricesJson?.items) ? pricesJson.items : (Array.isArray(pricesJson) ? pricesJson : []))
                  }
                } catch (err) {
                  console.error(`获取材料 ${material.id} 的价格失败:`, err)
                }
              })
            )
            setMaterialPrices(pricesMap)
          })()
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
  const handleCreateMaterial = () => setEditingMaterial({ id: null, name: '', density: 7.850 });
  const handleCreatePartType = () => setEditingPartType({ id: '', name: '', description: '', volume_formula: '', created_at: '', updated_at: '' });
  const handleCreateMaterialSource = () => setEditingMaterialSource({ id: null, name: '', description: '', is_active: true, created_at: '', updated_at: '' });
  const handleCreateDevice = () => setEditingDevice({ id: '', device_no: '', device_name: '' });
  const handleCreateFixedOption = () => setEditingFixedOption({ id: '', option_value: '', option_label: '', is_active: true });

  const handleEditPartType = (partType: any) => setEditingPartType({ ...partType });

  const handleSaveUnit = async () => {
    if (!editingUnit?.name.trim()) {
      setError('单位名称不能为空');
      return;
    }
    setLoading(true);
    try {
      const url = editingUnit.id ? `/api/options/production-units/${editingUnit.id}` : '/api/options/production-units';
      const method = editingUnit.id ? 'PUT' : 'POST';
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingUnit.name.trim(), is_active: editingUnit.is_active })
      });
      if (!response.ok) throw new Error('保存失败');
      setEditingUnit(null);
      await fetchTabData('units');
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
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingCategory.name.trim(), is_active: editingCategory.is_active })
      });
      if (!response.ok) throw new Error('保存失败');
      setEditingCategory(null);
      await fetchTabData('categories');
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
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingMaterial.name.trim(), density: Number(editingMaterial.density) })
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || '保存失败');
      }
      setEditingMaterial(null);
      await fetchTabData('materials');
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
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingPartType.name.trim(), description: editingPartType.description?.trim() || null, volume_formula: editingPartType.volume_formula?.trim() || null })
      });
      if (!response.ok) throw new Error('保存失败');
      setEditingPartType(null);
      await fetchTabData('partTypes');
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
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingMaterialSource.name.trim(), description: editingMaterialSource.description?.trim() || '', is_active: editingMaterialSource.is_active })
      });
      if (!response.ok) throw new Error('保存失败');
      setEditingMaterialSource(null);
      await fetchTabData('materialSources');
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
      const url = editingDevice.id ? `/api/tooling/devices/${editingDevice.id}` : '/api/tooling/devices';
      const method = editingDevice.id ? 'PUT' : 'POST';
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_no: editingDevice.device_no.trim(), device_name: editingDevice.device_name.trim(), max_aux_minutes: editingDevice.max_aux_minutes ?? null })
      });
      if (!response.ok) throw new Error('保存失败');
      setEditingDevice(null);
      await fetchTabData('devices');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDevice = async (id: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/tooling/devices/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('删除失败');
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
      const url = editingFixedOption.id ? `/api/tooling/fixed-inventory-options/${editingFixedOption.id}` : '/api/tooling/fixed-inventory-options';
      const method = editingFixedOption.id ? 'PUT' : 'POST';
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ option_value: editingFixedOption.option_value.trim(), option_label: editingFixedOption.option_value.trim(), is_active: editingFixedOption.is_active })
      });
      if (!response.ok) throw new Error('保存失败');
      setEditingFixedOption(null);
      await fetchTabData('fixedOptions');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteFixedOption = async (id: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/tooling/fixed-inventory-options/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('删除失败');
      await fetchTabData('fixedOptions');
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUnit = async (id: number) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/options/production-units/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('删除失败');
      await fetchTabData('units');
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCategory = async (id: number) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/options/tooling-categories/${id}`, { method: 'DELETE' });
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
      const response = await fetch(`/api/materials/${id}`, { method: 'DELETE' });
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
      const response = await fetch(`/api/part-types/${id}`, { method: 'DELETE' });
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

  const handleDeleteMaterialSource = async (id: string | number) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/options/material-sources/${Number(id)}`, { method: 'DELETE' });
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

  // 计算当前价格
  const getCurrentPrice = (materialId: string) => {
    const prices = materialPrices[materialId] || [];
    const today = new Date().toISOString().split('T')[0];
    
    // 找到当前有效的价格（开始日期 <= 今天，且结束日期为空或 >= 今天）
    const currentPrice = prices.find(price => {
      const startDate = price.effective_start_date;
      const endDate = price.effective_end_date;
      return startDate <= today && (!endDate || endDate >= today);
    });
    
    return currentPrice ? currentPrice.unit_price : null;
  };
  const handleCreatePrice = (materialId: string) => {
    setSelectedMaterialId(materialId);
    setEditingPrice({ id: null, material_id: materialId, unit_price: '', effective_start_date: new Date().toISOString().split('T')[0], effective_end_date: '' });
  };

  const handleEditPrice = (price: any) => {
    setSelectedMaterialId(price.material_id);
    setEditingPrice({ 
      id: price.id, 
      material_id: price.material_id,
      unit_price: price.unit_price,
      effective_start_date: price.effective_start_date,
      effective_end_date: price.effective_end_date || ''
    });
  };

  const handleSavePrice = async () => {
    const unitPrice = Number(editingPrice?.unit_price);
    if (!editingPrice?.unit_price || isNaN(unitPrice) || unitPrice <= 0) {
      setError('请输入有效的单价');
      return;
    }
    if (!editingPrice?.effective_start_date) {
      setError('请输入生效开始日期');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const requestData = {
        unit_price: unitPrice,
        effective_start_date: editingPrice.effective_start_date,
        effective_end_date: editingPrice.effective_end_date || null
      };
      
      if (editingPrice.id) {
        const response = await fetch(`/api/materials/${editingPrice.material_id}/prices/${editingPrice.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestData)
        });
        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || '更新价格失败');
        }
      } else {
        const response = await fetch(`/api/materials/${editingPrice.material_id}/prices`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestData)
        });
        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || '创建价格失败');
        }
      }
      setEditingPrice(null);
      await fetchTabData('materials');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存价格失败');
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePrice = async (materialId: string, priceId: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/materials/${materialId}/prices/${priceId}`, { method: 'DELETE' });
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
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">排序</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">名称</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {items.map((item, index) => (
            <tr 
              key={item.id} 
              draggable={!editingItem}
              onDragStart={(e) => handleDragStart(e, item, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, index)}
              className={`${
                dragOverIndex === index ? 'bg-blue-50 border-blue-300' : ''
              } ${draggedItem?.id === item.id ? 'opacity-50' : ''} transition-colors duration-200`}
            >
              <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
                {!editingItem && (
                  <div className="flex items-center cursor-move">
                    <GripVertical className="w-4 h-4 text-gray-400 mr-2" />
                    <span className="font-medium">{index + 1}</span>
                  </div>
                )}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                {editingItem?.id === item.id ? (
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
                ) : (
                  item.name
                )}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                {editingItem?.id === item.id ? (
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={editingItem.is_active}
                      onChange={(e) => {
                      if (activeTab === 'units') setEditingUnit({ ...editingItem, is_active: e.target.checked });
                      else if (activeTab === 'categories') setEditingCategory({ ...editingItem, is_active: e.target.checked });
                      else if (activeTab === 'materialSources') setEditingMaterialSource({ ...item, is_active: e.target.checked });
                    }}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm">启用</span>
                  </label>
                ) : (
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                    item.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {item.is_active ? '启用' : '禁用'}
                  </span>
                )}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                {editingItem?.id === item.id ? (
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
                    <button onClick={() => onEdit(item)} className="text-blue-600 hover:text-blue-900" disabled={loading}>
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <Popconfirm
                      title={`确定要删除"${item.name}"吗？`}
                      okText="确定"
                      cancelText="取消"
                      onConfirm={() => item.id && deleteHandler && deleteHandler(item.id)}
                    >
                      <button className="text-red-600 hover:text-red-900" disabled={loading}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </Popconfirm>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
                {activeTab === 'units' && !editingUnit && (
                  <div>
                    {/* 新增按钮 */}
                    <div className="mb-4 flex justify-end">
                      <button 
                        onClick={handleCreateUnit} 
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        disabled={loading}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        新增投产单位
                      </button>
                    </div>
                    {renderTable(productionUnits, editingUnit, (item) => setEditingUnit({ ...item }), handleSaveUnit, () => setEditingUnit(null), handleDeleteUnit)}
                  </div>
                )}
                {activeTab === 'units' && editingUnit && (
                  <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">{editingUnit.id ? '编辑投产单位' : '新增投产单位'}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">名称 *</label>
                        <input type="text" value={editingUnit.name} onChange={(e) => setEditingUnit({ ...editingUnit, name: e.target.value })} className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="请输入投产单位名称" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">状态</label>
                        <label className="flex items-center">
                          <input type="checkbox" checked={editingUnit.is_active} onChange={(e) => setEditingUnit({ ...editingUnit, is_active: e.target.checked })} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                          <span className="ml-2 text-sm">启用</span>
                        </label>
                      </div>
                    </div>
                    <div className="mt-4 flex justify-end space-x-3">
                      <button onClick={() => setEditingUnit(null)} className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50" disabled={loading}>取消</button>
                      <button onClick={handleSaveUnit} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700" disabled={loading}>保存</button>
                    </div>
                  </div>
                )}

                {/* 工装类别 */}
                {activeTab === 'categories' && !editingCategory && (
                  <div>
                    {/* 新增按钮 */}
                    <div className="mb-4 flex justify-end">
                      <button 
                        onClick={handleCreateCategory} 
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        disabled={loading}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        新增工装类别
                      </button>
                    </div>
                    {renderTable(toolingCategories, editingCategory, (item) => setEditingCategory({ ...item }), handleSaveCategory, () => setEditingCategory(null), handleDeleteCategory)}
                  </div>
                )}
                {activeTab === 'categories' && editingCategory && (
                  <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">{editingCategory.id ? '编辑工装类别' : '新增工装类别'}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">名称 *</label>
                        <input type="text" value={editingCategory.name} onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })} className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="请输入工装类别名称" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">状态</label>
                        <label className="flex items-center">
                          <input type="checkbox" checked={editingCategory.is_active} onChange={(e) => setEditingCategory({ ...editingCategory, is_active: e.target.checked })} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                          <span className="ml-2 text-sm">启用</span>
                        </label>
                      </div>
                    </div>
                    <div className="mt-4 flex justify-end space-x-3">
                      <button onClick={() => setEditingCategory(null)} className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50" disabled={loading}>取消</button>
                      <button onClick={handleSaveCategory} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700" disabled={loading}>保存</button>
                    </div>
                  </div>
                )}

                {/* 材料管理 - 简化版本 */}
                {activeTab === 'materials' && !editingMaterial && (
                  <div className="space-y-4">
                    <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-blue-800 font-medium">共有 {materials.length} 种材料</p>
                    </div>
                    {materials.map((material, index) => {
                      const currentPrice = getCurrentPrice(material.id);
                      return (
                        <div key={material.id} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-4 flex-1">
                              <div className="flex-shrink-0 w-8 h-8 bg-blue-100 text-blue-800 rounded-full flex items-center justify-center font-semibold text-sm">
                                {index + 1}
                              </div>
                              <div className="flex items-center space-x-6 flex-1">
                                <h3 className="text-lg font-semibold text-gray-900 min-w-[80px]">{material.name}</h3>
                                <p className="text-sm text-gray-600">密度: {material.density} g/cm³</p>
                                <p className="text-sm text-gray-600">
                                  当前价格: 
                                  <span className={`font-medium ${currentPrice !== null ? 'text-green-600' : 'text-red-500'}`}>
                                    ¥{currentPrice !== null ? currentPrice.toFixed(2) : '0.00'} 元/kg
                                  </span>
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center space-x-2 ml-4">
                              <button onClick={() => setEditingMaterial(material)} className="text-blue-600 hover:text-blue-900 p-2" title="编辑材料">
                                <Edit2 className="w-5 h-5" />
                              </button>
                              <Popconfirm title="确定要删除这个材料吗？" okText="确定" cancelText="取消" onConfirm={() => handleDeleteMaterial(material.id)}>
                                <button className="text-red-600 hover:text-red-900 p-2" title="删除材料">
                                  <Trash2 className="w-5 h-5" />
                                </button>
                              </Popconfirm>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {activeTab === 'materials' && editingMaterial && (
                  <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">{editingMaterial.id ? '编辑材料' : '新增材料'}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">材料名称 *</label>
                        <input type="text" value={editingMaterial.name} onChange={(e) => setEditingMaterial({ ...editingMaterial, name: e.target.value })} className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="请输入材料名称" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">密度 (g/cm³) *</label>
                        <input type="number" step="0.001" value={editingMaterial.density} onChange={(e) => setEditingMaterial({ ...editingMaterial, density: parseFloat(e.target.value) })} className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="请输入密度" />
                      </div>
                    </div>
                    
                    {/* 价格历史管理 */}
                    <div className="mt-6">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-md font-medium text-gray-900">价格历史</h4>
                        <button onClick={() => handleCreatePrice(editingMaterial.id)} className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700" disabled={loading}>
                          <Plus className="w-4 h-4 mr-1" />
                          添加新价格
                        </button>
                      </div>
                      
                      {editingPrice && (
                        <div className="mb-4 p-3 bg-white rounded-lg border">
                          <h5 className="text-sm font-medium text-gray-900 mb-2">{editingPrice.id ? '编辑价格' : '新增价格'}</h5>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">单价 (元/kg) *</label>
                              <input type="number" step="0.01" value={editingPrice.unit_price} onChange={(e) => setEditingPrice({ ...editingPrice, unit_price: e.target.value })} className="w-full border border-gray-300 rounded px-2 py-1 text-sm" placeholder="请输入单价" />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">开始日期 *</label>
                              <input type="date" value={editingPrice.effective_start_date} onChange={(e) => setEditingPrice({ ...editingPrice, effective_start_date: e.target.value })} className="w-full border border-gray-300 rounded px-2 py-1 text-sm" />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">结束日期</label>
                              <input type="date" value={editingPrice.effective_end_date} onChange={(e) => setEditingPrice({ ...editingPrice, effective_end_date: e.target.value })} className="w-full border border-gray-300 rounded px-2 py-1 text-sm" />
                            </div>
                          </div>
                          <div className="mt-3 flex justify-end space-x-2">
                            <button onClick={() => setEditingPrice(null)} className="px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50" disabled={loading}>取消</button>
                            <button onClick={handleSavePrice} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700" disabled={loading}>保存</button>
                          </div>
                        </div>
                      )}
                      
                      <div className="space-y-2">
                        {(materialPrices[editingMaterial.id] || []).map((price: any) => (
                          <div key={price.id} className="flex items-center justify-between p-3 bg-white rounded-lg border">
                            <div>
                              <div className="text-sm font-medium text-gray-900">¥{Number(price.unit_price).toFixed(2)} 元/kg</div>
                              <div className="text-xs text-gray-500">
                                {price.effective_start_date} 至 {price.effective_end_date || '至今'}
                              </div>
                            </div>
                            <div className="flex items-center space-x-2">
                              <button onClick={() => handleEditPrice(price)} className="text-blue-600 hover:text-blue-900 text-sm" disabled={loading}>编辑</button>
                              <Popconfirm title="确定要删除这个价格记录吗？" okText="确定" cancelText="取消" onConfirm={() => handleDeletePrice(editingMaterial.id, price.id)}>
                                <button className="text-red-600 hover:text-red-900 text-sm" disabled={loading}>删除</button>
                              </Popconfirm>
                            </div>
                          </div>
                        ))}
                      </div>
                      
                      {!materialPrices[editingMaterial.id]?.length && (
                        <div className="text-center py-4 text-gray-500 text-sm">
                          暂无价格记录，点击上方按钮添加第一个价格
                        </div>
                      )}
                    </div>
                    
                    <div className="mt-6 flex justify-end space-x-3 pt-4 border-t">
                      <button onClick={() => setEditingMaterial(null)} className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50" disabled={loading}>取消</button>
                      <button onClick={handleSaveMaterial} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700" disabled={loading}>保存材料</button>
                    </div>
                  </div>
                )}

                {/* 料型管理 */}
                {activeTab === 'partTypes' && !editingPartType && (
                  <div>
                    {/* 新增按钮 */}
                    <div className="mb-4 flex justify-end">
                      <button 
                        onClick={handleCreatePartType} 
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        disabled={loading}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        新增料型
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">名称</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">描述</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">体积公式</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {partTypes.map((partType) => (
                            <tr key={partType.id}>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                {partType.name}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {partType.description || '-'}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {partType.volume_formula || '-'}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                  partType.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                }`}>
                                  {partType.is_active ? '启用' : '禁用'}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                <div className="flex space-x-2">
                                  <button onClick={() => handleEditPartType(partType)} className="text-blue-600 hover:text-blue-900" disabled={loading}>
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                  <Popconfirm
                                    title={`确定要删除"${partType.name}"吗？`}
                                    okText="确定"
                                    cancelText="取消"
                                    onConfirm={() => handleDeletePartType(partType.id)}
                                  >
                                    <button className="text-red-600 hover:text-red-900" disabled={loading}>
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </Popconfirm>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {activeTab === 'partTypes' && editingPartType && (
                  <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">{editingPartType.id ? '编辑料型' : '新增料型'}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">料型名称 *</label>
                        <input type="text" value={editingPartType.name} onChange={(e) => setEditingPartType({ ...editingPartType, name: e.target.value })} className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="请输入料型名称" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
                        <input type="text" value={editingPartType.description} onChange={(e) => setEditingPartType({ ...editingPartType, description: e.target.value })} className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="请输入描述" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">体积公式</label>
                        <input type="text" value={editingPartType.volume_formula} onChange={(e) => setEditingPartType({ ...editingPartType, volume_formula: e.target.value })} className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="请输入体积公式" />
                      </div>
                    </div>
                    <div className="mt-4 flex justify-end space-x-3">
                      <button onClick={() => setEditingPartType(null)} className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50" disabled={loading}>取消</button>
                      <button onClick={handleSavePartType} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700" disabled={loading}>保存</button>
                    </div>
                  </div>
                )}

                {/* 材料来源 */}
                {activeTab === 'materialSources' && !editingMaterialSource && (
                  <div>
                    {/* 新增按钮 */}
                    <div className="mb-4 flex justify-end">
                      <button 
                        onClick={handleCreateMaterialSource} 
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        disabled={loading}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        新增材料来源
                      </button>
                    </div>
                    {renderTable(materialSources, editingMaterialSource, (item) => setEditingMaterialSource({ ...item }), handleSaveMaterialSource, () => setEditingMaterialSource(null), handleDeleteMaterialSource)}
                  </div>
                )}
                {activeTab === 'materialSources' && editingMaterialSource && (
                  <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">{editingMaterialSource.id ? '编辑材料来源' : '新增材料来源'}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">材料来源名称 *</label>
                        <input type="text" value={editingMaterialSource.name} onChange={(e) => setEditingMaterialSource({ ...editingMaterialSource, name: e.target.value })} className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="请输入材料来源名称" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
                        <input type="text" value={editingMaterialSource.description} onChange={(e) => setEditingMaterialSource({ ...editingMaterialSource, description: e.target.value })} className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="请输入描述" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">状态</label>
                        <label className="flex items-center">
                          <input type="checkbox" checked={editingMaterialSource.is_active} onChange={(e) => setEditingMaterialSource({ ...editingMaterialSource, is_active: e.target.checked })} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                          <span className="ml-2 text-sm">启用</span>
                        </label>
                      </div>
                    </div>
                    <div className="mt-4 flex justify-end space-x-3">
                      <button onClick={() => setEditingMaterialSource(null)} className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50" disabled={loading}>取消</button>
                      <button onClick={handleSaveMaterialSource} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700" disabled={loading}>保存</button>
                    </div>
                  </div>
                )}

                {/* 设备管理 */}
                {activeTab === 'devices' && !editingDevice && (
                  <div>
                    {/* 新增按钮 */}
                    <div className="mb-4 flex justify-end">
                      <button 
                        onClick={handleCreateDevice} 
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        disabled={loading}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        新增设备
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">设备编号</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">设备名称</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">最大辅助时间(分钟)</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {devices.map((device) => (
                            <tr key={device.id}>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                {device.device_no}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {device.device_name}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {device.max_aux_minutes ?? '-'}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                <div className="flex space-x-2">
                                  <button onClick={() => setEditingDevice({ ...device })} className="text-blue-600 hover:text-blue-900" disabled={loading}>
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                  <Popconfirm
                                    title={`确定要删除"${device.device_name}"吗？`}
                                    okText="确定"
                                    cancelText="取消"
                                    onConfirm={() => handleDeleteDevice(device.id)}
                                  >
                                    <button className="text-red-600 hover:text-red-900" disabled={loading}>
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </Popconfirm>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {activeTab === 'devices' && editingDevice && (
                  <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">{editingDevice.id ? '编辑设备' : '新增设备'}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">设备编号 *</label>
                        <input type="text" value={editingDevice.device_no} onChange={(e) => setEditingDevice({ ...editingDevice, device_no: e.target.value })} className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="请输入设备编号" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">设备名称 *</label>
                        <input type="text" value={editingDevice.device_name} onChange={(e) => setEditingDevice({ ...editingDevice, device_name: e.target.value })} className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="请输入设备名称" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">最大辅助时间(分钟)</label>
                        <input type="number" value={editingDevice.max_aux_minutes ?? ''} onChange={(e) => setEditingDevice({ ...editingDevice, max_aux_minutes: e.target.value ? Number(e.target.value) : null })} className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="请输入最大辅助时间" />
                      </div>
                    </div>
                    <div className="mt-4 flex justify-end space-x-3">
                      <button onClick={() => setEditingDevice(null)} className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50" disabled={loading}>取消</button>
                      <button onClick={handleSaveDevice} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700" disabled={loading}>保存</button>
                    </div>
                  </div>
                )}

                {/* 维修选项管理 */}
                {activeTab === 'fixedOptions' && !editingFixedOption && (
                  <div>
                    {/* 新增按钮 */}
                    <div className="mb-4 flex justify-end">
                      <button 
                        onClick={handleCreateFixedOption} 
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        disabled={loading}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        新增维修选项
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">选项值</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">选项标签</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {fixedOptions.map((option) => (
                            <tr key={option.id}>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                {option.option_value}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {option.option_label}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${option.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                  {option.is_active ? '启用' : '禁用'}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                <div className="flex space-x-2">
                                  <button onClick={() => setEditingFixedOption({ ...option })} className="text-blue-600 hover:text-blue-900" disabled={loading}>
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                  <Popconfirm
                                    title={`确定要删除"${option.option_label}"吗？`}
                                    okText="确定"
                                    cancelText="取消"
                                    onConfirm={() => handleDeleteFixedOption(option.id)}
                                  >
                                    <button className="text-red-600 hover:text-red-900" disabled={loading}>
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </Popconfirm>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {activeTab === 'fixedOptions' && editingFixedOption && (
                  <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">{editingFixedOption.id ? '编辑维修选项' : '新增维修选项'}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">选项值 *</label>
                        <input type="text" value={editingFixedOption.option_value} onChange={(e) => setEditingFixedOption({ ...editingFixedOption, option_value: e.target.value })} className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="请输入选项值" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">状态</label>
                        <label className="flex items-center">
                          <input type="checkbox" checked={editingFixedOption.is_active} onChange={(e) => setEditingFixedOption({ ...editingFixedOption, is_active: e.target.checked })} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                          <span className="ml-2 text-sm">启用</span>
                        </label>
                      </div>
                    </div>
                    <div className="mt-4 flex justify-end space-x-3">
                      <button onClick={() => setEditingFixedOption(null)} className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50" disabled={loading}>取消</button>
                      <button onClick={handleSaveFixedOption} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700" disabled={loading}>保存</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
